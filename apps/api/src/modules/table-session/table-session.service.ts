import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { RedisService } from '../../infra/redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import { safeJsonParse } from '../../common/utils/safe-json';
import { sessionAuthToken, storeSessionAuth } from '../../common/auth/session-auth-token';
import { QrCodeService } from './qr-code.service';
import { ScanVerificationService } from '../scan-verification/scan-verification.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import type { CustomerLocationSignal } from '@restaurant/shared-types';

interface SessionData {
  sessionId: string;
  tableId: string;
  tableCode: string;
  tableLabel: string;
  schemaName: string;
  /**
   * Round 16 (B-NEW-65): customerId carimbado no session payload após
   * welcome/identify pra que `join:customer` customer-side WS handshake
   * consiga validar `client.data.customerId === data.customerId`.
   * Antes era undefined → join sempre rejeitado → late_arrival popup
   * sempre fallback REST.
   */
  customerId?: string;
}

const SESSION_TTL_SECONDS = 4 * 60 * 60; // 4 hours

/**
 * Stable 6-tone palette for multi-person attribution on a shared table.
 * Order matches `session_participants.color_index`; assignment is per
 * session, so the first person to scan the QR is 0 and stays 0 even if
 * others leave and rejoin. Hex values align with the monochromatic brand
 * tokens in apps/web-customer/src/app/globals.css.
 */
export const PARTICIPANT_COLORS = [
  '#0a0a0a', // ink
  '#2f7d4f', // success
  '#c43a3a', // danger
  '#b07a1f', // ocre
  '#3f6ca7', // muted blue
  '#7a3ea8', // muted purple
] as const;

/**
 * Lifecycle de `session_participants.status` (migrations 017 + 080).
 *
 * `rejected` e `cancelled` são estados DIFERENTES e a diferença é de produto:
 * `rejected` é o HOST recusando (barra o re-scan até a sessão fechar) e
 * `cancelled` é o próprio solicitante desistindo (pode pedir entrada de novo).
 * Antes da migration 080 o cancelamento gravava 'rejected' e o cliente que
 * desistiu era acusado de ter sido recusado pelo host no scan seguinte.
 */
export type ParticipantStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface TableParticipantRow {
  customerId: string;
  name: string;
  initial: string;
  color: string;
  status: ParticipantStatus;
  isHost: boolean;
  requestedAt: string | null;
}

@Injectable()
export class TableSessionService {
  private readonly logger = new Logger(TableSessionService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    private readonly qrCodeService: QrCodeService,
    @Optional() private readonly scanVerification?: ScanVerificationService,
    @Optional() private readonly eventsGateway?: EventsGateway,
    @Optional() private readonly audit?: SecurityAuditService,
  ) {}

  async initSession(
    tableCode: string,
    hmacSignature: string,
    timestamp: string,
    schemaName: string,
    accessToken?: string | null,
  ): Promise<SessionData & { token: string }> {
    // 1. Busca mesa pelo code
    const tables = await this.tenantConn.query(
      'SELECT id, code, label, qr_hmac_secret, is_active FROM tables WHERE code = $1',
      [tableCode],
    );

    if (!tables || !(tables as unknown[]).length) {
      throw new HttpException('Mesa nao encontrada.', HttpStatus.NOT_FOUND);
    }

    const table = (tables as Record<string, unknown>[])[0];

    if (!table.is_active) {
      throw new HttpException('Mesa inativa.', HttpStatus.FORBIDDEN);
    }

    // 2. Valida HMAC
    const isValid = this.qrCodeService.validateHmac(
      tableCode,
      hmacSignature,
      timestamp,
      table.qr_hmac_secret as string,
    );

    if (!isValid) {
      await this.logQrInitRejected(schemaName, table, 'qr_hmac_invalid_or_expired');
      throw new HttpException('QR Code invalido ou expirado.', HttpStatus.UNAUTHORIZED);
    }

    if (!accessToken) {
      await this.logQrInitRejected(schemaName, table, 'qr_access_token_missing');
      throw new HttpException(
        'Token do QR Code ausente. Escaneie novamente o codigo fisico da mesa.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const accessTokenValidation = this.qrCodeService.validateDailyAccessTokenDetailed(
      tableCode,
      accessToken,
      table.qr_hmac_secret as string,
    );
    if (!accessTokenValidation.valid) {
      await this.logQrInitRejected(
        schemaName,
        table,
        accessTokenValidation.reason === 'expired'
          ? 'qr_access_token_expired'
          : 'qr_access_token_invalid',
      );
      throw new HttpException(
        'Token do QR Code expirado. Escaneie novamente o codigo fisico da mesa.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 3. Reusa sessao ativa da mesa quando existe (dentro do TTL). Sem
    // isso, cada scan do mesmo QR criava uma nova table_session, fazendo
    // (a) replay do mesmo (hmac+ts) gerar table_sessions infinitas (DoS
    // de linhas), (b) usuarios na MESMA mesa fisica entrarem em sessoes
    // diferentes — nunca veriam o pedido um do outro. Comanda compartilhada
    // exige sessao por mesa, nao por scan. Multi-user e diferenciado via
    // `session_participants` (visit_id + customer_id).
    const { sessionId, isNewSession } = await this.tenantConn.transaction(async (tx) => {
      await tx.query(`SELECT id FROM tables WHERE id = $1 FOR UPDATE`, [table.id]);

      // O reuse tem que casar EXATAMENTE o escopo da UNIQUE parcial
      // `table_sessions(table_id) WHERE status='active'` (migration 064):
      // no máximo 1 sessão ATIVA por mesa, sem bound de idade. O bound de 4h
      // que existia aqui era só heurística de "sessão velha" — e divergia da
      // constraint: num jantar-longo (sessão de 5h com pedido recente, ainda
      // ativa) o reuse com filtro de 4h NÃO achava a sessão e caía no INSERT
      // abaixo, que colidia com a UNIQUE parcial → 23505 → 500 no próximo scan.
      // Sessões genuinamente velhas SEM atividade já são fechadas pelo
      // `sweepStaleSessions` (ttl-tick.service.ts), que mede ATIVIDADE
      // (GREATEST do último pedido/chamado/pagamento), não idade — então
      // remover o bound aqui não ressuscita zumbi nenhuma.
      const activeRows = (await tx.query(
        `SELECT id FROM table_sessions
           WHERE table_id = $1
             AND status = 'active'
           ORDER BY created_at DESC
           LIMIT 1`,
        [table.id],
      )) as { id: string }[];

      if (activeRows.length > 0) {
        return { sessionId: activeRows[0].id, isNewSession: false };
      }

      // Round 6 (B-NEW-18): session_token coluna dropped na migration
      // 039 — nunca foi lida (cookie+header carregam table_sessions.id).
      const result = (await tx.query(
        `INSERT INTO table_sessions (table_id, status)
           VALUES ($1, 'active')
           RETURNING id`,
        [table.id],
      )) as { id: string }[];
      return { sessionId: result[0].id, isNewSession: true };
    });

    // 4. Salva (ou refresca) no Redis usando o sessionId (DB id) — mesmo
    // valor que vai pro cookie e pro header x-session-token. SET com TTL
    // re-emite a chave em cada scan; uma sessao com trafego ativo nunca
    // expira em 4h.
    const sessionData: SessionData = {
      sessionId,
      tableId: table.id as string,
      tableCode: table.code as string,
      tableLabel: table.label as string,
      schemaName,
    };

    // A07: grava sob `session:<token>` (token = HMAC do sessionId), NÃO sob o id
    // cru. O id passa a ser um identificador inócuo; a credencial é o token.
    const token = await storeSessionAuth(
      this.redis,
      sessionId,
      JSON.stringify(sessionData),
      SESSION_TTL_SECONDS,
    );

    // 5. Welcome pool e por sessao — so gera no primeiro scan. Em scans
    // subsequentes mantemos o pool original pra que indices ja consumidos
    // (LPOP) nao se repitam quando outro usuario chega.
    if (isNewSession) {
      const indices = Array.from({ length: 30 }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      await this.redis.rpush(`welcome_pool:${sessionId}`, ...indices.map(String));
    }
    // Sempre refresca TTL do pool — sessao reusada pode estar com TTL
    // baixo se o ultimo scan foi 3h59 atras.
    await this.redis.expire(`welcome_pool:${sessionId}`, SESSION_TTL_SECONDS);

    return { ...sessionData, sessionId, token };
  }

  async getSessionFromToken(sessionToken: string): Promise<SessionData | null> {
    const data = await this.redis.get(`session:${sessionToken}`);
    if (!data) return null;
    // Round 16 (B-NEW-53): safeJsonParse — payload corrompido cai em null,
    // caller trata como cache miss em vez de propagar SyntaxError.
    return safeJsonParse<SessionData>(data);
  }

  /**
   * Round 16 (B-NEW-65): grava customerId no payload Redis após welcome /
   * identify, refrescando TTL. Idempotente — sobrescreve se já tiver.
   * Caller customer-side `join:customer` valida via
   * `client.data.customerId === data.customerId` no WS gateway.
   */
  async attachCustomerToSession(sessionId: string, customerId: string): Promise<void> {
    // A07: a sessão vive sob `session:<token>` (token = HMAC do id). Lê pelo
    // token e escreve de volta na MESMA chave. Fallback pra `session:<id>`
    // legada (sessões pré-split) — escreve onde leu pra não perder o attach.
    const tokenKey = `session:${sessionAuthToken(sessionId)}`;
    const legacyKey = `session:${sessionId}`;
    let key = tokenKey;
    let data = await this.redis.get(tokenKey);
    if (data == null) {
      key = legacyKey;
      data = await this.redis.get(legacyKey);
    }
    if (!data) return; // sessão expirou — silenciosamente no-op
    const parsed = safeJsonParse<SessionData>(data);
    if (!parsed) return;
    await this.redis.set(key, JSON.stringify({ ...parsed, customerId }), SESSION_TTL_SECONDS);
  }

  /**
   * Register a customer as present at the table. Idempotent — um re-scan de
   * quem ainda está ATIVO na mesa (`left_at IS NULL`) reaproveita a row e
   * preserva a cor, então os avatares não pulam entre reconexões. Returns the
   * participant's color so the caller can pass it straight back to the client.
   *
   * Host-of-the-table flow (migration 017): primeiro customer a entrar
   * na sessao vira host (`table_sessions.host_customer_id`) e e
   * automaticamente approved. Demais entram com status='pending' e
   * aguardam aprovacao do host. Sem isso, qualquer um que escaneava o
   * QR (incluindo gente fora do estabelecimento) entrava direto.
   *
   * Quem SAIU (`left_at` carimbado) não é reaproveitado: a row morta fica como
   * histórico e o scan cai no ramo de INSERT, que decide de novo. Lá vale a
   * separação da migration 080 — quem CANCELOU o próprio pedido vira 'pending'
   * outra vez (o host recebe o pedido de novo), quem o HOST RECUSOU continua
   * barrado enquanto a table_session viver.
   */
  async upsertParticipant(
    tableSessionId: string,
    customerId: string,
    visitId?: string | null,
    options?: {
      location?: CustomerLocationSignal | null;
      slug?: string;
    },
  ): Promise<TableParticipantRow> {
    // Le sessao + status existente do participant em uma queries (UPSERT
    // atomico evita color_index duplicado em scans concorrentes — antes
    // dois scans simultaneos liam o mesmo COUNT e colidiam, ON CONFLICT
    // descartava silenciosamente um INSERT, deixando customer sem
    // registro nem cor).
    const sessionRows = (await this.tenantConn.query(
      `SELECT host_customer_id, table_id FROM table_sessions WHERE id = $1`,
      [tableSessionId],
    )) as { host_customer_id: string | null; table_id: string }[];
    if (!sessionRows.length) {
      throw new NotFoundException('Sessao nao encontrada.');
    }
    let currentHostId = sessionRows[0].host_customer_id;
    const tableId = sessionRows[0].table_id;

    // `AND left_at IS NULL` alinha esta query com as duas irmãs (o
    // `racedExisting` dentro da transação e o `refresh` pós-conflito). Sem ele,
    // quem SAIU da mesa era reencontrado aqui, tinha o status morto preservado e
    // era ressuscitado pelo `SET left_at = NULL` abaixo — foi assim que o
    // cliente que cancelou o próprio pedido voltava barrado como se o host o
    // tivesse recusado. Quem saiu (cancelou ou foi recusado) não é participante
    // ativo; o caminho correto é o ramo de INSERT, que decide de novo.
    const existing = (await this.tenantConn.query(
      `SELECT color_index, status FROM session_participants
       WHERE table_session_id = $1 AND customer_id = $2 AND left_at IS NULL`,
      [tableSessionId, customerId],
    )) as { color_index: number; status: string }[];

    let colorIndex: number;
    let status: ParticipantStatus;

    if (existing.length > 0) {
      colorIndex = existing[0].color_index;
      status = existing[0].status as ParticipantStatus;
      // O UPDATE também precisa do `left_at IS NULL`: um mesmo (session,
      // customer) pode ter várias rows históricas (a que saiu + a ativa), e sem
      // o filtro este `SET left_at = NULL` ressuscitaria as antigas junto,
      // deixando duas rows ativas e estourando 23505 na UNIQUE parcial
      // `session_participants_active_unique`.
      await this.tenantConn.query(
        `UPDATE session_participants
         SET visit_id = COALESCE($3, visit_id)
         WHERE table_session_id = $1 AND customer_id = $2 AND left_at IS NULL`,
        [tableSessionId, customerId, visitId ?? null],
      );
    } else {
      const insertedParticipant = await this.tenantConn.transaction(async (tx) => {
        // Lock held across release consumption, color assignment and host
        // update. This serializes concurrent first scans of the same table.
        await tx.query(`SELECT id FROM table_sessions WHERE id = $1 FOR UPDATE`, [tableSessionId]);

        const lockedSession = (await tx.query(
          `SELECT host_customer_id FROM table_sessions WHERE id = $1`,
          [tableSessionId],
        )) as { host_customer_id: string | null }[];
        const lockedHostId = lockedSession[0]?.host_customer_id ?? null;

        const racedExisting = (await tx.query(
          `SELECT color_index, status FROM session_participants
           WHERE table_session_id = $1 AND customer_id = $2 AND left_at IS NULL`,
          [tableSessionId, customerId],
        )) as { color_index: number; status: string }[];
        if (racedExisting.length > 0) {
          await tx.query(
            `UPDATE session_participants
             SET visit_id = COALESCE($3, visit_id)
             WHERE table_session_id = $1 AND customer_id = $2 AND left_at IS NULL`,
            [tableSessionId, customerId, visitId ?? null],
          );
          return {
            colorIndex: racedExisting[0].color_index,
            status: racedExisting[0].status as ParticipantStatus,
            currentHostId: lockedHostId,
          };
        }

        // Recusa do host é escopada à table_session e vale até a sessão fechar:
        // o `AND left_at IS NULL` acima deixaria o REJEITADO reentrar como
        // 'pending' e torrar a paciência do host a cada scan. Este SELECT roda
        // sob o mesmo `FOR UPDATE` da sessão (nenhum scan concorrente escapa
        // pela janela entre checar e inserir) e ignora `left_at` de propósito —
        // não importa se a row recusada continua no roster ou já saiu, a recusa
        // persiste. 'cancelled' não entra aqui: quem desistiu pode pedir de novo.
        const hostRejected = (await tx.query(
          `SELECT color_index FROM session_participants
           WHERE table_session_id = $1 AND customer_id = $2 AND status = 'rejected'
           ORDER BY joined_at DESC
           LIMIT 1`,
          [tableSessionId, customerId],
        )) as { color_index: number }[];
        if (hostRejected.length > 0) {
          return {
            colorIndex: hostRejected[0].color_index,
            status: 'rejected' as ParticipantStatus,
            currentHostId: lockedHostId,
          };
        }

        const isFirst = !lockedHostId;
        const consumedRelease = isFirst
          ? (unwrapRows<{ id: string; party_size: number | null }>(
              await tx.query(
                `UPDATE table_qr_releases
                    SET consumed_at = now(),
                        consumed_by_session_id = $2,
                        consumed_by_customer_id = $3,
                        updated_at = now()
                  WHERE id = (
                    SELECT id
                      FROM table_qr_releases
                     WHERE table_id = $1
                       AND consumed_at IS NULL
                       AND expires_at > now()
                     ORDER BY created_at DESC
                     LIMIT 1
                  )
                  RETURNING id, party_size`,
                [tableId, tableSessionId, customerId],
              ),
            )[0] ?? null)
          : null;
        if (consumedRelease?.party_size) {
          await tx.query(
            `UPDATE table_sessions
                SET staff_party_override = $2, updated_at = now()
              WHERE id = $1`,
            [tableSessionId, consumedRelease.party_size],
          );
        }
        const nextStatus: 'pending' | 'approved' =
          isFirst && consumedRelease ? 'approved' : 'pending';

        let inserted: { color_index: number; status: string }[];
        try {
          inserted = (await tx.query(
            `INSERT INTO session_participants
               (table_session_id, customer_id, visit_id, color_index, status, approved_at, approved_by)
             SELECT $1::uuid, $2::uuid, $3::uuid,
                    (SELECT COUNT(*)::int FROM session_participants
                      WHERE table_session_id = $1::uuid) % $5::int,
                    $4::varchar,
                    CASE WHEN $4::varchar = 'approved' THEN now() ELSE NULL END,
                    CASE WHEN $4::varchar = 'approved' THEN $2::uuid ELSE NULL END
             ON CONFLICT (table_session_id, customer_id) WHERE left_at IS NULL DO NOTHING
             RETURNING color_index, status`,
            [tableSessionId, customerId, visitId ?? null, nextStatus, PARTICIPANT_COLORS.length],
          )) as { color_index: number; status: string }[];
        } catch (err: unknown) {
          const pgErr = err as { code?: string };
          if (pgErr.code === '23505') {
            inserted = [];
          } else {
            throw err;
          }
        }

        if (!inserted.length) {
          const refresh = (await tx.query(
            `SELECT color_index, status FROM session_participants
             WHERE table_session_id = $1 AND customer_id = $2 AND left_at IS NULL`,
            [tableSessionId, customerId],
          )) as { color_index: number; status: string }[];
          return {
            colorIndex: refresh[0]?.color_index ?? 0,
            status: (refresh[0]?.status as ParticipantStatus) ?? 'pending',
            currentHostId: lockedHostId,
          };
        }

        if (isFirst && inserted[0].status === 'approved') {
          await tx.query(
            `UPDATE table_sessions
             SET host_customer_id = $2
             WHERE id = $1 AND host_customer_id IS NULL`,
            [tableSessionId, customerId],
          );
        }

        return {
          colorIndex: inserted[0].color_index,
          status: inserted[0].status as ParticipantStatus,
          currentHostId: lockedHostId,
        };
      });

      colorIndex = insertedParticipant.colorIndex;
      status = insertedParticipant.status;
      currentHostId = insertedParticipant.currentHostId;

      if (this.eventsGateway && currentHostId && status === 'pending') {
        // Notifica host de novo pedido pendente (ele vai ver modal).
        // Emite pra sala da sessao — host esta nela.
        //
        // `status === 'pending'` porque nem todo caminho deste ramo cria um
        // pedido: o re-scan de quem o host JÁ RECUSOU sai antes do INSERT com
        // status='rejected', e sem esse filtro cada scan dele reabriria o modal
        // do host — exatamente a insistência que a recusa existe pra cortar.
        const customerRows = (await this.tenantConn.query(
          `SELECT name FROM customers WHERE id = $1`,
          [customerId],
        )) as { name: string }[];
        this.eventsGateway.emitToSession(tableSessionId, 'participant:join_request', {
          customerId,
          name: customerRows[0]?.name ?? '',
          tableSessionId,
          requestedAt: new Date().toISOString(),
        });
      }
    }

    // Re-le hostId antes de escolher o proximo fluxo. Em scans concorrentes,
    // outro customer pode ter virado host entre o primeiro SELECT e este ponto.
    const finalHost = (await this.tenantConn.query(
      `SELECT host_customer_id FROM table_sessions WHERE id = $1`,
      [tableSessionId],
    )) as { host_customer_id: string | null }[];
    const finalHostId = finalHost[0]?.host_customer_id ?? null;

    if (!finalHostId && status === 'pending' && this.scanVerification) {
      await this.scanVerification.ensureForParticipant({
        tableSessionId,
        tableId,
        customerId,
        visitId: visitId ?? null,
        location: options?.location ?? null,
        slug: options?.slug ?? this.tenantConn.getTenantSlug(),
      });
    } else if (
      finalHostId &&
      finalHostId !== customerId &&
      status === 'pending' &&
      this.eventsGateway &&
      !currentHostId
    ) {
      const customerRows = (await this.tenantConn.query(
        `SELECT name FROM customers WHERE id = $1`,
        [customerId],
      )) as { name: string }[];
      this.eventsGateway.emitToSession(tableSessionId, 'participant:join_request', {
        customerId,
        name: customerRows[0]?.name ?? '',
        tableSessionId,
        requestedAt: new Date().toISOString(),
      });
    }

    const customers = (await this.tenantConn.query(`SELECT name FROM customers WHERE id = $1`, [
      customerId,
    ])) as { name: string }[];
    const name = customers[0]?.name ?? '';

    return {
      customerId,
      name,
      initial: (name.trim().charAt(0) || '?').toUpperCase(),
      color: PARTICIPANT_COLORS[colorIndex],
      status,
      isHost: finalHostId === customerId,
      requestedAt: status === 'pending' ? new Date().toISOString() : null,
    };
  }

  /**
   * Host aprova/rejeita um participant pendente. Throws ForbiddenException
   * se o caller nao for o host. Idempotente: aprovar quem ja esta
   * approved retorna OK sem efeito.
   */
  async decideJoinRequest(
    tableSessionId: string,
    requesterCustomerId: string,
    targetCustomerId: string,
    decision: 'approve' | 'reject',
  ): Promise<{ status: 'approved' | 'rejected' }> {
    const sessionRows = (await this.tenantConn.query(
      `SELECT host_customer_id FROM table_sessions WHERE id = $1`,
      [tableSessionId],
    )) as { host_customer_id: string | null }[];
    if (!sessionRows.length) {
      throw new NotFoundException('Sessao nao encontrada.');
    }
    if (sessionRows[0].host_customer_id !== requesterCustomerId) {
      throw new ForbiddenException('Apenas o host da mesa pode aprovar ou rejeitar entradas.');
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    const tsCol = decision === 'approve' ? 'approved_at' : 'rejected_at';
    const approvedBy = decision === 'approve' ? requesterCustomerId : null;

    // Round 5 (P2-X7-4): CAS com `status = 'pending'` — só decide quem ainda
    // está pendente. Sob N approves concorrentes, só 1 flipa pending→approved
    // (os outros casam 0 linhas); e re-decidir alguém já decidido vira no-op
    // (idempotente), em vez de reverter approved↔rejected.
    await this.tenantConn.query(
      `UPDATE session_participants
       SET status = $3,
           ${tsCol} = now(),
           approved_by = COALESCE($4, approved_by)
       WHERE table_session_id = $1 AND customer_id = $2 AND status = 'pending'`,
      [tableSessionId, targetCustomerId, newStatus, approvedBy],
    );

    if (this.eventsGateway) {
      this.eventsGateway.emitToSession(tableSessionId, 'participant:decision', {
        customerId: targetCustomerId,
        status: newStatus,
        decidedAt: new Date().toISOString(),
      });
    }

    return { status: newStatus };
  }

  /**
   * P1 (re-scan mega-loop): B cancela o PRÓPRIO pedido de join enquanto ainda
   * pende (System A / host-approval). Antes o único escape do FE era um
   * router.back() no-op — a row 'pending' + left_at IS NULL sobrevivia PRA
   * SEMPRE (System A não tem TTL), deixando B travado em "Aguardando host" e
   * poluindo a lista de pendentes do host.
   *
   * Soft-leave da própria row via CAS em status='pending' (idempotente — só
   * cancela quem ainda pende; approved/rejected/já-saído casa 0 linhas). Marca
   * status='cancelled' + left_at pra a row sumir do roster (getParticipants
   * filtra left_at IS NULL) e o índice `session_participants_active_unique`
   * liberar B pra reentrar depois. Emite participant:decision(cancelled) pro
   * room da session pra o host tirar B dos pendentes ao vivo.
   *
   * Migration 080: o status gravado é 'cancelled', NÃO 'rejected'. Eram o mesmo
   * valor, e o re-scan de B então o acusava de ter sido recusado pelo host. A
   * distinção é o que deixa `upsertParticipant` liberar quem desistiu e barrar
   * quem o host recusou.
   *
   * NÃO precisa de host: quem chama é o próprio B (customerId do cookie via
   * controller). Retorna { cancelled } pro caller distinguir cancelou-de-fato
   * de no-op (já decidido / sem row).
   */
  async cancelOwnPendingJoin(
    tableSessionId: string,
    callerCustomerId: string,
  ): Promise<{ cancelled: boolean }> {
    const rows = unwrapRows<{ customer_id: string }>(
      await this.tenantConn.query(
        `UPDATE session_participants
            SET status = 'cancelled',
                left_at = now()
          WHERE table_session_id = $1
            AND customer_id = $2
            AND status = 'pending'
            AND left_at IS NULL
        RETURNING customer_id`,
        [tableSessionId, callerCustomerId],
      ),
    );

    const cancelled = rows.length > 0;
    if (cancelled && this.eventsGateway) {
      this.eventsGateway.emitToSession(tableSessionId, 'participant:decision', {
        customerId: callerCustomerId,
        status: 'cancelled',
        decidedAt: new Date().toISOString(),
      });
    }
    return { cancelled };
  }

  /**
   * Serve the avatar strip (SM3, SP1) with one row per active participant.
   * Filters out anyone who has left the table. Order is insertion order so
   * colors are visually stable.
   */
  async getParticipants(tableSessionId: string): Promise<TableParticipantRow[]> {
    const rows = (await this.tenantConn.query(
      `SELECT sp.customer_id, sp.color_index, sp.status, sp.joined_at, c.name, ts.host_customer_id
       FROM table_sessions ts
       JOIN session_participants sp ON sp.table_session_id = ts.id
       JOIN customers c ON c.id = sp.customer_id
       WHERE ts.id = $1 AND sp.left_at IS NULL
       ORDER BY sp.joined_at ASC`,
      [tableSessionId],
    )) as {
      customer_id: string;
      color_index: number;
      status: string;
      joined_at: string | Date | null;
      name: string;
      host_customer_id: string | null;
    }[];

    return rows.map((r) => ({
      customerId: r.customer_id,
      name: r.name,
      initial: (r.name.trim().charAt(0) || '?').toUpperCase(),
      color: PARTICIPANT_COLORS[r.color_index % PARTICIPANT_COLORS.length] ?? PARTICIPANT_COLORS[0],
      status: r.status as ParticipantStatus,
      isHost: r.customer_id === r.host_customer_id,
      requestedAt: r.joined_at ? new Date(r.joined_at).toISOString() : null,
    }));
  }

  private async consumeOpenRelease(
    tableId: string,
    tableSessionId: string,
    customerId: string,
  ): Promise<string | null> {
    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE table_qr_releases
            SET consumed_at = now(),
                consumed_by_session_id = $2,
                consumed_by_customer_id = $3,
                updated_at = now()
          WHERE id = (
            SELECT id
              FROM table_qr_releases
             WHERE table_id = $1
               AND consumed_at IS NULL
               AND expires_at > now()
             ORDER BY created_at DESC
             LIMIT 1
          )
          RETURNING id`,
        [tableId, tableSessionId, customerId],
      ),
    );
    return rows[0]?.id ?? null;
  }

  private async logQrInitRejected(
    schemaName: string,
    table: Record<string, unknown>,
    eventType: string,
  ): Promise<void> {
    if (!this.audit) return;
    const event = {
      tenantId: schemaName,
      tableId: table.id as string,
      tableCode: table.code as string,
      eventType,
      metadata: {
        tableLabel: table.label,
      },
    };
    await Promise.all([this.audit.log('qr_scan_events', event), this.audit.logAudit(event)]).catch(
      (err) => this.logger.warn(`QR init rejection log failed: ${(err as Error).message}`),
    );
  }
}
