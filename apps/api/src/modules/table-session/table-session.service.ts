import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import { QrCodeService } from './qr-code.service';

interface SessionData {
  sessionId: string;
  tableId: string;
  tableCode: string;
  tableLabel: string;
  schemaName: string;
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

export interface TableParticipantRow {
  customerId: string;
  name: string;
  initial: string;
  color: string;
  status: 'pending' | 'approved' | 'rejected';
  isHost: boolean;
}

@Injectable()
export class TableSessionService {
  private readonly logger = new Logger(TableSessionService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    private readonly qrCodeService: QrCodeService,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  async initSession(
    tableCode: string,
    hmacSignature: string,
    timestamp: string,
    schemaName: string,
  ): Promise<SessionData> {
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
      throw new HttpException('QR Code invalido ou expirado.', HttpStatus.UNAUTHORIZED);
    }

    // 3. Reusa sessao ativa da mesa quando existe (dentro do TTL). Sem
    // isso, cada scan do mesmo QR criava uma nova table_session, fazendo
    // (a) replay do mesmo (hmac+ts) gerar table_sessions infinitas (DoS
    // de linhas), (b) usuarios na MESMA mesa fisica entrarem em sessoes
    // diferentes — nunca veriam o pedido um do outro. Comanda compartilhada
    // exige sessao por mesa, nao por scan. Multi-user e diferenciado via
    // `session_participants` (visit_id + customer_id).
    const activeRows = (await this.tenantConn.query(
      `SELECT id FROM table_sessions
       WHERE table_id = $1
         AND status = 'active'
         AND created_at > NOW() - INTERVAL '4 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [table.id],
    )) as { id: string }[];

    let sessionId: string;
    let isNewSession: boolean;

    if (activeRows.length > 0) {
      sessionId = activeRows[0].id;
      isNewSession = false;
    } else {
      const sessionToken = uuidv4();
      const result = (await this.tenantConn.query(
        `INSERT INTO table_sessions (table_id, session_token, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [table.id, sessionToken],
      )) as { id: string }[];
      sessionId = result[0].id;
      isNewSession = true;
    }

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

    await this.redis.set(
      `session:${sessionId}`,
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
      await this.redis.rpush(
        `welcome_pool:${sessionId}`,
        ...indices.map(String),
      );
    }
    // Sempre refresca TTL do pool — sessao reusada pode estar com TTL
    // baixo se o ultimo scan foi 3h59 atras.
    await this.redis.expire(`welcome_pool:${sessionId}`, SESSION_TTL_SECONDS);

    return { ...sessionData, sessionId };
  }

  async getSessionFromToken(sessionToken: string): Promise<SessionData | null> {
    const data = await this.redis.get(`session:${sessionToken}`);
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }

  /**
   * Register a customer as present at the table. Idempotent — re-entry by
   * the same customer resets `left_at` and keeps their original color so
   * avatars stay stable across reconnects. Returns the participant's color
   * so the caller can pass it straight back to the client.
   *
   * Host-of-the-table flow (migration 017): primeiro customer a entrar
   * na sessao vira host (`table_sessions.host_customer_id`) e e
   * automaticamente approved. Demais entram com status='pending' e
   * aguardam aprovacao do host. Sem isso, qualquer um que escaneava o
   * QR (incluindo gente fora do estabelecimento) entrava direto.
   */
  async upsertParticipant(
    tableSessionId: string,
    customerId: string,
    visitId?: string | null,
  ): Promise<TableParticipantRow> {
    // Le sessao + status existente do participant em uma queries (UPSERT
    // atomico evita color_index duplicado em scans concorrentes — antes
    // dois scans simultaneos liam o mesmo COUNT e colidiam, ON CONFLICT
    // descartava silenciosamente um INSERT, deixando customer sem
    // registro nem cor).
    const sessionRows = (await this.tenantConn.query(
      `SELECT host_customer_id FROM table_sessions WHERE id = $1`,
      [tableSessionId],
    )) as { host_customer_id: string | null }[];
    if (!sessionRows.length) {
      throw new NotFoundException('Sessao nao encontrada.');
    }
    const currentHostId = sessionRows[0].host_customer_id;

    const existing = (await this.tenantConn.query(
      `SELECT color_index, status FROM session_participants
       WHERE table_session_id = $1 AND customer_id = $2`,
      [tableSessionId, customerId],
    )) as { color_index: number; status: string }[];

    let colorIndex: number;
    let status: 'pending' | 'approved' | 'rejected';

    if (existing.length > 0) {
      colorIndex = existing[0].color_index;
      status = existing[0].status as 'pending' | 'approved' | 'rejected';
      await this.tenantConn.query(
        `UPDATE session_participants
         SET visit_id = COALESCE($3, visit_id), left_at = NULL
         WHERE table_session_id = $1 AND customer_id = $2`,
        [tableSessionId, customerId, visitId ?? null],
      );
    } else {
      const isFirst = !currentHostId;
      // Define status de entrada: primeiro vira host approved; demais
      // ficam pending aguardando aprovacao.
      status = isFirst ? 'approved' : 'pending';

      // Insert atomico via SELECT inline, sem read separado de COUNT —
      // resolve race condition de color_index encontrada pelo bug-hunt.
      let inserted: { color_index: number; status: string }[];
      try {
        inserted = (await this.tenantConn.query(
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
          [tableSessionId, customerId, visitId ?? null, status, PARTICIPANT_COLORS.length],
        )) as { color_index: number; status: string }[];
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr.code === '23505') {
          inserted = [];
        } else {
          throw err;
        }
      }

      if (inserted.length > 0) {
        colorIndex = inserted[0].color_index;
        status = inserted[0].status as 'pending' | 'approved' | 'rejected';
      } else {
        const refresh = (await this.tenantConn.query(
          `SELECT color_index, status FROM session_participants
           WHERE table_session_id = $1 AND customer_id = $2 AND left_at IS NULL`,
          [tableSessionId, customerId],
        )) as { color_index: number; status: string }[];
        colorIndex = refresh[0]?.color_index ?? 0;
        status = (refresh[0]?.status as 'pending' | 'approved' | 'rejected') ?? 'pending';
      }

      // Se virou host, marca na sessao. UPDATE condicional em
      // host_customer_id IS NULL pra evitar overwrite em race.
      if (isFirst) {
        await this.tenantConn.query(
          `UPDATE table_sessions
           SET host_customer_id = $2
           WHERE id = $1 AND host_customer_id IS NULL`,
          [tableSessionId, customerId],
        );
      } else if (this.eventsGateway && currentHostId) {
        // Notifica host de novo pedido pendente (ele vai ver modal).
        // Emite pra sala da sessao — host esta nela.
        const customerRows = (await this.tenantConn.query(
          `SELECT name FROM customers WHERE id = $1`,
          [customerId],
        )) as { name: string }[];
        this.eventsGateway.emitToSession(tableSessionId, 'participant:join_request', {
          customerId,
          name: customerRows[0]?.name ?? '',
          requestedAt: new Date().toISOString(),
        });
      }
    }

    const customers = (await this.tenantConn.query(
      `SELECT name FROM customers WHERE id = $1`,
      [customerId],
    )) as { name: string }[];
    const name = customers[0]?.name ?? '';

    // Re-le hostId pra incluir no retorno (pode ter virado este customer).
    const finalHost = (await this.tenantConn.query(
      `SELECT host_customer_id FROM table_sessions WHERE id = $1`,
      [tableSessionId],
    )) as { host_customer_id: string | null }[];

    return {
      customerId,
      name,
      initial: (name.trim().charAt(0) || '?').toUpperCase(),
      color: PARTICIPANT_COLORS[colorIndex],
      status,
      isHost: finalHost[0]?.host_customer_id === customerId,
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
      throw new ForbiddenException(
        'Apenas o host da mesa pode aprovar ou rejeitar entradas.',
      );
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    const tsCol = decision === 'approve' ? 'approved_at' : 'rejected_at';
    const approvedBy = decision === 'approve' ? requesterCustomerId : null;

    await this.tenantConn.query(
      `UPDATE session_participants
       SET status = $3,
           ${tsCol} = now(),
           approved_by = COALESCE($4, approved_by)
       WHERE table_session_id = $1 AND customer_id = $2`,
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
   * Serve the avatar strip (SM3, SP1) with one row per active participant.
   * Filters out anyone who has left the table. Order is insertion order so
   * colors are visually stable.
   */
  async getParticipants(tableSessionId: string): Promise<TableParticipantRow[]> {
    const sessionRows = (await this.tenantConn.query(
      `SELECT host_customer_id FROM table_sessions WHERE id = $1`,
      [tableSessionId],
    )) as { host_customer_id: string | null }[];
    const hostId = sessionRows[0]?.host_customer_id ?? null;

    const rows = (await this.tenantConn.query(
      `SELECT sp.customer_id, sp.color_index, sp.status, c.name
       FROM session_participants sp
       JOIN customers c ON c.id = sp.customer_id
       WHERE sp.table_session_id = $1 AND sp.left_at IS NULL
       ORDER BY sp.joined_at ASC`,
      [tableSessionId],
    )) as {
      customer_id: string;
      color_index: number;
      status: string;
      name: string;
    }[];

    return rows.map((r) => ({
      customerId: r.customer_id,
      name: r.name,
      initial: (r.name.trim().charAt(0) || '?').toUpperCase(),
      color:
        PARTICIPANT_COLORS[r.color_index % PARTICIPANT_COLORS.length] ??
        PARTICIPANT_COLORS[0],
      status: r.status as 'pending' | 'approved' | 'rejected',
      isHost: r.customer_id === hostId,
    }));
  }
}
