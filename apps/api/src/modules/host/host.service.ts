import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { RedisService } from '../../infra/redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import { AlertsService } from '../alerts/alerts.service';
import { HostInboxService } from './host-inbox.service';
import { HostWaitlistService } from './host-waitlist.service';
import { HostReservationsService } from './host-reservations.service';
import { invalidateSessionAuthById } from '../../common/auth/session-auth-token';
import type {
  HostInboxItemDto,
  HostLiberateMode,
  HostSwapRequestDto,
  HostSwapStatus,
  HostTableDto,
  HostTableStatus,
  ReservationEntryDto,
  SessionFlag,
  WaitlistEntryDto,
} from '@restaurant/shared-types';

interface TableRow {
  id: string;
  number: number;
  capacity: number;
  zone_name: string | null;
  active_session_id: string | null;
  active_session_started_at: string | null;
  participant_count: number | null;
  staff_party_override: number | null;
  staff_note: string | null;
  has_vip: boolean | null;
  host_customer_id: string | null;
  host_customer_name: string | null;
  open_release_id: string | null;
  open_release_expires_at: string | null;
}

interface SwapRow {
  id: string;
  table_session_id: string;
  from_table_id: string;
  from_table_number: number;
  to_table_id: string;
  to_table_number: number;
  status: HostSwapStatus;
  reason: string | null;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

const LIBERATE_MODES: HostLiberateMode[] = ['auto', 'manual_paid', 'manual_force'];

/**
 * [SEGURANÇA A07] Shape do swap devolvido ao STAFF — igual ao
 * `HostSwapRequestDto` MENOS `sessionId`. O `sessionId` era o
 * `table_sessions.id`, que É o `x-session-token` do cliente: expô-lo pro
 * staff permitia forjar a sessão do cliente. O staff opera a mesa por número
 * + status, então o token nunca precisa sair no payload.
 */
type HostSwapDto = Omit<HostSwapRequestDto, 'sessionId'>;

/**
 * Staff-host service · backbone do modulo da recepcionista. Cobre:
 *  - Mapa: GET /host/tables (status agregado por mesa)
 *  - Inbox: GET /host/inbox (notificacoes passivas dos outros modulos)
 *  - Liberate: POST /host/tables/:id/liberate (3 modos)
 *  - Swap: POST/PATCH /host/swap-requests (3 estados terminais)
 *  - VIP via TableMenu: POST /host/tables/:id/vip
 *  - Waitlist & Reservations: CRUD basico
 *
 * O modulo nao reimplementa nada que ja esteja em outro service — para VIP
 * a fonte de verdade continua sendo `session_flags`/`table_sessions.flags`,
 * para inbox usamos as tabelas `complaints`, `table_merge_requests` e
 * `zone_pauses` ja existentes.
 */
@Injectable()
export class HostService {
  private readonly logger = new Logger(HostService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly waitlist: HostWaitlistService,
    private readonly inbox: HostInboxService,
    private readonly reservations: HostReservationsService,
    private readonly redis: RedisService,
    @Optional() private readonly events?: EventsGateway,
    @Optional() private readonly alerts?: AlertsService,
  ) {}

  // ─── Pedido de assistência da recepção (customer-side) ───

  /**
   * Cliente pediu a RECEPÇÃO na mesa — disparado pelo card de junção de
   * mesas no assistente ("Chamar recepcionista", que antes abria o sheet
   * do GARÇOM — bug dos vídeos 2026-06-10). Persiste um alert visível pro
   * papel host (kind contém 'host' → ROLE_ALERT_PATTERNS) e emite WS
   * `host.assist_requested` no room tenant:slug:host.
   */
  async requestAssist(
    tableSessionId: string,
    reason?: string | null,
  ): Promise<{ ok: true; tableLabel: string | null }> {
    const rows = (await this.tenantConn.query(
      `SELECT t.label, t.code
         FROM table_sessions ts
         JOIN tables t ON t.id = ts.table_id
        WHERE ts.id = $1`,
      [tableSessionId],
    )) as Array<{ label: string | null; code: string | null }>;
    if (!rows.length) {
      throw new BadRequestException('Sessão de mesa não encontrada.');
    }
    const { label, code } = rows[0];

    if (this.alerts) {
      await this.alerts.create({
        sev: 'atenção',
        // ATENÇÃO (string mágica compartilhada): este kind é consultado
        // pela query do inbox em HostInboxService.listInbox(). Se renomear
        // aqui, renomeie lá — comentário espelhado nos dois lados.
        kind: 'host_assist_table',
        title: `${label ?? code ?? 'Mesa'} pediu a recepção`,
        sub: reason ?? 'Cliente pediu ajuda da recepção pelo assistente.',
        // Pedido presencial perde validade rápido — expira sozinho em 30min.
        ttlAt: new Date(Date.now() + 30 * 60 * 1000),
        // Dedup por sessão (mig 069): double-tap com guard liberado no finally
        // ou timeout+retry do api() (15s) não deve gerar N alertas idênticos no
        // inbox da recepção. Passar a sessão liga o ON CONFLICT DO NOTHING no
        // alerts.create — 1 alerta ativo por sessão; retry reusa o existente.
        tableSessionId,
      });
    }
    this.events?.emitHostAssistRequested(this.tenantConn.getTenantSlug() ?? '', {
      tableLabel: label,
      tableCode: code,
      tableSessionId,
      reason: reason ?? null,
    });
    return { ok: true, tableLabel: label };
  }

  // ─── Mapa de mesas ───

  async listTables(): Promise<HostTableDto[]> {
    // Agrega capacity da mesa, zona, ultima session ativa, # de
    // participantes ativos e has_vip — em uma query.
    const rows = (await this.tenantConn.query(
      `SELECT
         t.id,
         CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS number,
         t.capacity,
         z.name                                  AS zone_name,
         active_ts.id                            AS active_session_id,
         active_ts.created_at                    AS active_session_started_at,
         active_ts.participant_count             AS participant_count,
         active_ts.staff_party_override          AS staff_party_override,
         active_ts.staff_note                    AS staff_note,
         active_ts.has_vip                       AS has_vip,
         active_ts.host_customer_id              AS host_customer_id,
         active_ts.host_customer_name            AS host_customer_name,
         open_release.id                         AS open_release_id,
         open_release.expires_at                 AS open_release_expires_at
       FROM tables t
       LEFT JOIN zones z ON z.id = t.zone_id
       LEFT JOIN LATERAL (
         SELECT ts.id,
                ts.created_at,
                ts.staff_party_override,
                ts.staff_note,
                COALESCE(ts.staff_party_override, pc.cnt, 0)      AS participant_count,
                ('vip' = ANY(COALESCE(ts.flags, '{}'::text[])))  AS has_vip,
                ts.host_customer_id                              AS host_customer_id,
                hc.name                                          AS host_customer_name
         FROM table_sessions ts
         LEFT JOIN customers hc ON hc.id = ts.host_customer_id
         LEFT JOIN (
           SELECT table_session_id, COUNT(*)::int AS cnt
             FROM session_participants
            WHERE left_at IS NULL
            GROUP BY table_session_id
         ) pc ON pc.table_session_id = ts.id
         WHERE ts.table_id = t.id AND ts.status = 'active'
         ORDER BY ts.created_at DESC
         LIMIT 1
       ) active_ts ON TRUE
       LEFT JOIN LATERAL (
         SELECT id, expires_at
           FROM table_qr_releases r
          WHERE r.table_id = t.id
            AND r.consumed_at IS NULL
            AND r.expires_at > now()
          ORDER BY r.created_at DESC
          LIMIT 1
       ) open_release ON TRUE
       WHERE t.is_active = TRUE
       ORDER BY t.sort_order ASC, number ASC`,
    )) as TableRow[];

    return rows.map((r) => this.mapTableRow(r));
  }

  // ─── Inbox (delegate → HostInboxService) ───

  async listInbox(limit?: number): Promise<HostInboxItemDto[]> {
    return this.inbox.listInbox(limit);
  }

  // ─── Liberate ───

  async liberateTable(
    tableNumber: number,
    body: {
      mode: HostLiberateMode;
      reason?: string;
      staffId?: string;
      partySize?: number;
      reservationId?: string;
      waitlistId?: string;
    },
    slug: string,
  ) {
    if (!LIBERATE_MODES.includes(body.mode)) {
      throw new HttpException(`Modo desconhecido: ${body.mode}.`, HttpStatus.BAD_REQUEST);
    }
    if (body.reservationId && body.waitlistId) {
      throw new BadRequestException('Informe apenas reservationId ou waitlistId.');
    }

    if (body.reservationId || body.waitlistId) {
      return this.liberateFromArrivalSource(tableNumber, body, slug);
    }

    // Bug 1: o stepper "QUANTAS PESSOAS?" do ScreenHostTableLiberate escolhe
    // o tamanho do PRÓXIMO grupo que vai ocupar a mesa liberada. Esse valor
    // precisa chegar e ser usado (não ser descartado no client). Validamos,
    // persistimos na release e devolvemos no payload; ao consumir o QR esse
    // valor vira `table_sessions.staff_party_override`.
    const partySize =
      body.partySize != null && Number.isInteger(body.partySize) && body.partySize >= 1
        ? body.partySize
        : null;

    const tableRow = await this.findTableByNumber(tableNumber);
    if (!tableRow) {
      throw new NotFoundException(`Mesa ${tableNumber} nao encontrada.`);
    }

    // Sessao ativa e nullable: em modo `auto` aceitamos liberar mesa que ja
    // esta sem sessao (no-op). Em modos manuais exigimos sessao pra
    // descrever o close.
    const activeSession = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `SELECT id FROM table_sessions
          WHERE table_id = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [tableRow.id],
      ),
    )[0];

    if (!activeSession) {
      if (body.mode !== 'auto') {
        throw new HttpException('Sem sessao ativa pra liberar.', HttpStatus.CONFLICT);
      }
    } else {
      const closedBy = body.mode === 'auto' ? 'system' : `staff:${body.mode}`;
      const updated = unwrapRows<{ id: string }>(
        await this.tenantConn.query(
          `UPDATE table_sessions
              SET status     = 'closed',
                  closed_at  = now(),
                  closed_by  = $2,
                  updated_at = now()
            WHERE id = $1 AND status = 'active'
            RETURNING id`,
          [activeSession.id, closedBy],
        ),
      );
      if (!updated.length) {
        throw new HttpException('Sessao ja foi fechada.', HttpStatus.CONFLICT);
      }

      // A04: invalida a chave Redis IMEDIATAMENTE — sem isso o cookie/
      // x-session-token do cliente seguia válido no TTL de 4h e criava
      // orders/payments numa conta já liquidada. O SessionGuard também
      // revalida `status` no banco (defense-in-depth), mas apagar aqui mata
      // o token na hora sem esperar a próxima checagem.
      await invalidateSessionAuthById(this.redis, activeSession.id).catch((err) => {
        this.logger.warn(
          `Falha ao invalidar chave Redis da sessão ${activeSession.id}: ${(err as Error).message}`,
        );
      });
    }

    const release = unwrapRows<{ id: string; expires_at: string }>(
      await this.tenantConn.query(
        `INSERT INTO table_qr_releases
           (table_id, released_by_staff_id, reason, expires_at, party_size)
         VALUES ($1, $2, $3, now() + interval '15 minutes', $4)
         RETURNING id, expires_at`,
        [tableRow.id, body.staffId ?? null, body.reason ?? null, partySize],
      ),
    )[0];

    if (this.events) {
      this.events.emitHostTableLiberated(slug, {
        tableId: tableRow.id,
        tableNumber,
        sessionId: activeSession?.id ?? '',
        mode: body.mode,
        by: { staffId: body.staffId ?? null },
        reason: body.reason ?? null,
        liberatedAt: new Date().toISOString(),
      });
    }

    // A07: NÃO devolvemos `sessionId` (= token do cliente) pro staff. O staff
    // opera a mesa por número + status; o token só serviria pra forjar a
    // sessão do cliente. `partySize` volta pra confirmar o round-trip do
    // stepper (Bug 1).
    return {
      ok: true as const,
      releaseId: release?.id ?? null,
      releaseExpiresAt: release?.expires_at ?? null,
      mode: body.mode,
      partySize,
    };
  }

  /**
   * Confirma reserva/fila e cria a liberação QR na MESMA transação. Antes a
   * UI marcava a origem como seated/arrived e só depois navegava para outro
   * POST; abandonar ou falhar nesse intervalo deixava pessoas "sentadas" sem
   * mesa. O lock da origem também impede dois operadores de sentarem o mesmo
   * grupo simultaneamente.
   */
  private async liberateFromArrivalSource(
    tableNumber: number,
    body: {
      mode: HostLiberateMode;
      reason?: string;
      staffId?: string;
      partySize?: number;
      reservationId?: string;
      waitlistId?: string;
    },
    slug: string,
  ) {
    const tableRow = await this.findTableByNumber(tableNumber);
    if (!tableRow) {
      throw new NotFoundException(`Mesa ${tableNumber} nao encontrada.`);
    }

    const result = await this.tenantConn.transaction(async (tx) => {
      const lockedTables = (await tx.query(
        `SELECT id, capacity
           FROM tables
          WHERE id = $1
          FOR UPDATE`,
        [tableRow.id],
      )) as Array<{ id: string; capacity: number }>;
      const lockedTable = lockedTables[0];
      if (!lockedTable) {
        throw new NotFoundException(`Mesa ${tableNumber} nao encontrada.`);
      }

      let partySize: number;
      if (body.reservationId) {
        const rows = (await tx.query(
          `SELECT id, party, status, table_id
             FROM reservations
            WHERE id = $1
            FOR UPDATE`,
          [body.reservationId],
        )) as Array<{ id: string; party: number; status: string; table_id: string | null }>;
        const reservation = rows[0];
        if (!reservation) throw new NotFoundException('Reserva nao encontrada.');
        if (reservation.status === 'cancelled' || reservation.status === 'no_show') {
          throw new HttpException('Reserva nao esta disponivel para sentar.', HttpStatus.CONFLICT);
        }
        if (reservation.table_id && reservation.table_id !== lockedTable.id) {
          throw new HttpException('Reserva ja foi vinculada a outra mesa.', HttpStatus.CONFLICT);
        }
        partySize = reservation.party;
      } else {
        const rows = (await tx.query(
          `SELECT id, party, status, table_id
             FROM waitlist_entries
            WHERE id = $1
            FOR UPDATE`,
          [body.waitlistId],
        )) as Array<{ id: string; party: number; status: string; table_id: string | null }>;
        const entry = rows[0];
        if (!entry) throw new NotFoundException('Entrada da fila nao encontrada.');
        if (entry.status !== 'waiting') {
          throw new HttpException('Entrada da fila ja foi resolvida.', HttpStatus.CONFLICT);
        }
        partySize = entry.party;
      }

      if (body.partySize != null && body.partySize !== partySize) {
        throw new BadRequestException('O tamanho do grupo nao confere com a reserva ou fila.');
      }
      if (partySize > lockedTable.capacity) {
        throw new HttpException(
          `Mesa ${tableNumber} comporta ${lockedTable.capacity} pessoa(s), mas o grupo tem ${partySize}.`,
          HttpStatus.CONFLICT,
        );
      }

      const activeRows = (await tx.query(
        `SELECT id
           FROM table_sessions
          WHERE table_id = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [lockedTable.id],
      )) as Array<{ id: string }>;
      const activeSessionId = activeRows[0]?.id ?? null;
      if (activeSessionId) {
        const closedBy = body.mode === 'auto' ? 'system' : `staff:${body.mode}`;
        await tx.query(
          `UPDATE table_sessions
              SET status = 'closed', closed_at = now(), closed_by = $2, updated_at = now()
            WHERE id = $1 AND status = 'active'`,
          [activeSessionId, closedBy],
        );
      } else if (body.mode !== 'auto') {
        throw new HttpException('Sem sessao ativa pra liberar.', HttpStatus.CONFLICT);
      }

      if (body.reservationId) {
        await tx.query(
          `UPDATE reservations
              SET status = 'arrived',
                  arrived_at = COALESCE(arrived_at, now()),
                  table_id = $2,
                  updated_at = now()
            WHERE id = $1`,
          [body.reservationId, lockedTable.id],
        );
      } else {
        await tx.query(
          `UPDATE waitlist_entries
              SET status = 'seated',
                  seated_at = now(),
                  table_id = $2,
                  resolved_by_staff_id = $3,
                  updated_at = now()
            WHERE id = $1`,
          [body.waitlistId, lockedTable.id, body.staffId ?? null],
        );
      }

      // Só a release mais recente da mesa deve poder ser consumida.
      await tx.query(
        `UPDATE table_qr_releases
            SET expires_at = now(), updated_at = now()
          WHERE table_id = $1
            AND consumed_at IS NULL
            AND expires_at > now()`,
        [lockedTable.id],
      );

      const releases = (await tx.query(
        `INSERT INTO table_qr_releases
           (table_id, released_by_staff_id, reason, expires_at, party_size,
            reservation_id, waitlist_entry_id)
         VALUES ($1, $2, $3, now() + interval '15 minutes', $4, $5, $6)
         RETURNING id, expires_at`,
        [
          lockedTable.id,
          body.staffId ?? null,
          body.reason ?? null,
          partySize,
          body.reservationId ?? null,
          body.waitlistId ?? null,
        ],
      )) as Array<{ id: string; expires_at: string }>;

      return {
        activeSessionId,
        tableId: lockedTable.id,
        partySize,
        releaseId: releases[0]?.id ?? null,
        releaseExpiresAt: releases[0]?.expires_at ?? null,
      };
    });

    if (result.activeSessionId) {
      await invalidateSessionAuthById(this.redis, result.activeSessionId).catch((err) => {
        this.logger.warn(
          `Falha ao invalidar chave Redis da sessão ${result.activeSessionId}: ${(err as Error).message}`,
        );
      });
    }

    this.events?.emitHostTableLiberated(slug, {
      tableId: result.tableId,
      tableNumber,
      sessionId: result.activeSessionId ?? '',
      mode: body.mode,
      by: { staffId: body.staffId ?? null },
      reason: body.reason ?? null,
      liberatedAt: new Date().toISOString(),
    });

    return {
      ok: true as const,
      releaseId: result.releaseId,
      releaseExpiresAt: result.releaseExpiresAt,
      mode: body.mode,
      partySize: result.partySize,
      source: body.reservationId ? ('reservation' as const) : ('waitlist' as const),
    };
  }

  // ─── Swap ───

  async createSwapRequest(
    body: {
      fromTable: number;
      toTable: number;
      sessionId?: string;
      reason?: string;
      staffId?: string;
    },
    slug: string,
  ): Promise<HostSwapDto & { ok: true }> {
    const fromRow = await this.findTableByNumber(body.fromTable);
    const toRow = await this.findTableByNumber(body.toTable);
    if (!fromRow) {
      throw new NotFoundException(`Mesa origem ${body.fromTable} nao encontrada.`);
    }
    if (!toRow) {
      throw new NotFoundException(`Mesa destino ${body.toTable} nao encontrada.`);
    }
    if (fromRow.id === toRow.id) {
      throw new HttpException('Mesa origem e destino sao iguais.', HttpStatus.BAD_REQUEST);
    }

    let sessionId = body.sessionId;
    if (!sessionId) {
      const active = unwrapRows<{ id: string }>(
        await this.tenantConn.query(
          `SELECT id FROM table_sessions
            WHERE table_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1`,
          [fromRow.id],
        ),
      )[0];
      if (!active) {
        throw new HttpException('Mesa origem nao tem sessao ativa.', HttpStatus.CONFLICT);
      }
      sessionId = active.id;
    }

    // Confirma destino livre (sem sessao ativa).
    const targetActive = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `SELECT id FROM table_sessions
          WHERE table_id = $1 AND status = 'active' LIMIT 1`,
        [toRow.id],
      ),
    )[0];
    if (targetActive) {
      throw new HttpException('Mesa destino ja tem sessao ativa.', HttpStatus.CONFLICT);
    }

    const inserted = unwrapRows<SwapRow>(
      await this.tenantConn.query(
        `INSERT INTO table_swap_requests
           (table_session_id, from_table_id, to_table_id,
            requested_by_staff_id, reason)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, table_session_id, from_table_id, to_table_id,
                   status, reason, created_at, completed_at, cancelled_at,
                   (SELECT CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT)
                      FROM tables WHERE id = from_table_id) AS from_table_number,
                   (SELECT CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT)
                      FROM tables WHERE id = to_table_id)   AS to_table_number`,
        [sessionId, fromRow.id, toRow.id, body.staffId ?? null, body.reason ?? null],
      ),
    )[0];

    const dto = this.mapSwapRow(inserted);

    if (this.events) {
      // A07: o WS emit interno usa o token cru direto da row — nunca via DTO
      // (que já não o carrega). O room WS é server-side/staff-infra, não o
      // payload HTTP do staff.
      this.events.emitHostSwapRequested(slug, {
        swapId: dto.id,
        sessionId: inserted.table_session_id,
        fromTableId: fromRow.id,
        fromTableNumber: dto.fromTableNumber,
        toTableId: toRow.id,
        toTableNumber: dto.toTableNumber,
        requestedBy: body.staffId ?? null,
        createdAt: dto.createdAt,
      });
    }

    return { ok: true as const, ...dto };
  }

  async updateSwapRequest(
    id: string,
    body: {
      status: 'in_progress' | 'completed' | 'cancelled';
      reason?: string;
      staffId?: string;
    },
    slug: string,
  ): Promise<HostSwapDto> {
    const existing = unwrapRows<SwapRow>(
      await this.tenantConn.query(
        `SELECT sr.id, sr.table_session_id, sr.from_table_id, sr.to_table_id,
                sr.status, sr.reason, sr.created_at, sr.completed_at, sr.cancelled_at,
                CAST(NULLIF(regexp_replace(ft.code, '[^0-9]', '', 'g'), '') AS INT) AS from_table_number,
                CAST(NULLIF(regexp_replace(tt.code, '[^0-9]', '', 'g'), '') AS INT) AS to_table_number
           FROM table_swap_requests sr
           JOIN tables ft ON ft.id = sr.from_table_id
           JOIN tables tt ON tt.id = sr.to_table_id
          WHERE sr.id = $1
          LIMIT 1`,
        [id],
      ),
    )[0];
    if (!existing) {
      throw new NotFoundException('Swap request nao encontrado.');
    }

    // Transicoes validas:
    //   requested -> in_progress | cancelled
    //   in_progress -> completed | cancelled
    //   completed/cancelled sao terminais.
    const valid: Record<HostSwapStatus, string[]> = {
      requested: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    if (!valid[existing.status].includes(body.status)) {
      throw new HttpException(
        `Transicao ${existing.status} -> ${body.status} invalida.`,
        HttpStatus.CONFLICT,
      );
    }

    const setClause: string[] = ['status = $2', 'updated_at = now()'];
    const params: unknown[] = [id, body.status];
    if (body.status === 'completed') setClause.push('completed_at = now()');
    if (body.status === 'cancelled') setClause.push('cancelled_at = now()');
    if (body.reason) {
      setClause.push(`reason = COALESCE(NULLIF($${params.length + 1}, ''), reason)`);
      params.push(body.reason);
    }

    // Effective move: quando status = completed, swap a sessao pra mesa
    // destino. O destino-livre foi checado na CRIACAO do swap, mas entre
    // criar e completar o cliente pode escanear a mesa destino e abrir uma
    // 2a sessao ativa nela (S2). Sem re-check + guard aqui, o move criaria
    // S1 + S2 ativas na MESMA mesa (P1-O, data-integrity). Por isso o
    // complete roda numa transacao: (a) re-carimba o swap, (b) RE-CONFIRMA
    // que o destino segue sem sessao ativa, (c) move so a sessao de origem
    // que AINDA esta ativa (`AND status = 'active'`). Se o destino ocupou no
    // meio, aborta com BadRequest e o rollback mantem o swap in_progress —
    // nunca 2 ativas na mesma mesa.
    if (body.status === 'completed') {
      await this.tenantConn.transaction(async (tx) => {
        await tx.query(
          `UPDATE table_swap_requests SET ${setClause.join(', ')} WHERE id = $1`,
          params,
        );

        // Lock da linha da mesa destino: serializa contra um scan concorrente
        // (que faz `SELECT ... FROM tables ... FOR UPDATE` antes de inserir a
        // sessao). Se o scan chegar primeiro, vemos a sessao ativa dele; se
        // chegarmos primeiro, ele espera o commit e ve a sessao movida.
        await tx.query(`SELECT id FROM tables WHERE id = $1 FOR UPDATE`, [existing.to_table_id]);

        const targetActive = (await tx.query(
          `SELECT id FROM table_sessions
             WHERE table_id = $1 AND status = 'active' LIMIT 1`,
          [existing.to_table_id],
        )) as Array<{ id: string }>;
        if (targetActive.length > 0) {
          throw new BadRequestException(
            'Mesa destino ocupou-se durante o swap, refaça a solicitação.',
          );
        }

        // unwrapRows: pg via TypeORM devolve UPDATE...RETURNING como tupla
        // [rows, rowCount] — cast cru fazia `moved.length` ser sempre 2 e o
        // guard abaixo (0 linhas = origem inativa) era dead code em prod, com
        // o swap carimbado 'completed' sem mover nada (falso-sucesso + audit
        // mentiroso). Mesmo footgun de tupla do OOM/table-merge.
        const moved = unwrapRows<{ id: string }>(
          await tx.query(
            `UPDATE table_sessions
              SET table_id = $2,
                  updated_at = now()
            WHERE id = $1 AND status = 'active'
            RETURNING id`,
            [existing.table_session_id, existing.to_table_id],
          ),
        );
        if (moved.length === 0) {
          // A sessao de origem nao esta mais ativa (encerrada/movida antes do
          // complete) — sem move a fazer; aborta sem carimbar o swap.
          throw new BadRequestException(
            'Sessão de origem não está mais ativa, refaça a solicitação.',
          );
        }
      });
    } else {
      await this.tenantConn.query(
        `UPDATE table_swap_requests SET ${setClause.join(', ')} WHERE id = $1`,
        params,
      );
    }

    const refreshed = unwrapRows<SwapRow>(
      await this.tenantConn.query(
        `SELECT sr.id, sr.table_session_id, sr.from_table_id, sr.to_table_id,
                sr.status, sr.reason, sr.created_at, sr.completed_at, sr.cancelled_at,
                CAST(NULLIF(regexp_replace(ft.code, '[^0-9]', '', 'g'), '') AS INT) AS from_table_number,
                CAST(NULLIF(regexp_replace(tt.code, '[^0-9]', '', 'g'), '') AS INT) AS to_table_number
           FROM table_swap_requests sr
           JOIN tables ft ON ft.id = sr.from_table_id
           JOIN tables tt ON tt.id = sr.to_table_id
          WHERE sr.id = $1
          LIMIT 1`,
        [id],
      ),
    )[0];

    const dto = this.mapSwapRow(refreshed);

    if (this.events) {
      // A07: token cru da row pro WS interno; o DTO HTTP já não o expõe.
      this.events.emitHostSwapStateChanged(slug, {
        swapId: dto.id,
        sessionId: refreshed.table_session_id,
        fromTableNumber: dto.fromTableNumber,
        toTableNumber: dto.toTableNumber,
        status: body.status,
        at: new Date().toISOString(),
        reason: body.reason ?? dto.reason ?? null,
      });
    }

    return dto;
  }

  async listSwapRequests(filter?: { status?: HostSwapStatus }): Promise<HostSwapDto[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter?.status) {
      where.push(`sr.status = $${params.length + 1}`);
      params.push(filter.status);
    }
    const sql = `SELECT sr.id, sr.table_session_id, sr.from_table_id, sr.to_table_id,
                        sr.status, sr.reason, sr.created_at, sr.completed_at, sr.cancelled_at,
                        CAST(NULLIF(regexp_replace(ft.code, '[^0-9]', '', 'g'), '') AS INT) AS from_table_number,
                        CAST(NULLIF(regexp_replace(tt.code, '[^0-9]', '', 'g'), '') AS INT) AS to_table_number
                   FROM table_swap_requests sr
                   JOIN tables ft ON ft.id = sr.from_table_id
                   JOIN tables tt ON tt.id = sr.to_table_id
                  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY sr.created_at DESC
                  LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as SwapRow[];
    return rows.map((r) => this.mapSwapRow(r));
  }

  // ─── VIP via TableMenu ───

  async toggleVip(
    tableNumber: number,
    body: { flag: boolean; reason?: string; staffId?: string },
    slug: string,
  ) {
    const tableRow = await this.findTableByNumber(tableNumber);
    if (!tableRow) {
      throw new NotFoundException(`Mesa ${tableNumber} nao encontrada.`);
    }
    const activeSession = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `SELECT id FROM table_sessions
          WHERE table_id = $1 AND status = 'active'
          ORDER BY created_at DESC LIMIT 1`,
        [tableRow.id],
      ),
    )[0];
    if (!activeSession) {
      throw new HttpException('Sem sessao ativa pra marcar VIP.', HttpStatus.CONFLICT);
    }

    if (body.flag) {
      // Add: usa o mesmo padrao de session_flags do VipService pra manter o
      // audit trail consistente.
      await this.tenantConn.query(
        `INSERT INTO session_flags
           (table_session_id, flag, set_by_staff_id, metadata)
         VALUES ($1, 'vip', $2, $3::jsonb)
         ON CONFLICT (table_session_id, flag) WHERE cleared_at IS NULL DO NOTHING`,
        [
          activeSession.id,
          body.staffId ?? null,
          JSON.stringify({ reason: body.reason ?? null, source: 'host' }),
        ],
      );
      await this.tenantConn.query(
        `UPDATE table_sessions
            SET flags = (
              SELECT ARRAY(
                SELECT DISTINCT unnest(COALESCE(flags, '{}') || ARRAY['vip'::text])
              )
            ),
            updated_at = now()
          WHERE id = $1`,
        [activeSession.id],
      );
    } else {
      await this.tenantConn.query(
        `UPDATE session_flags
            SET cleared_at = now(),
                cleared_by_staff_id = COALESCE($2, cleared_by_staff_id),
                updated_at = now()
          WHERE table_session_id = $1 AND flag = 'vip' AND cleared_at IS NULL`,
        [activeSession.id, body.staffId ?? null],
      );
      await this.tenantConn.query(
        `UPDATE table_sessions
            SET flags = array_remove(COALESCE(flags, '{}'), 'vip'::text),
                updated_at = now()
          WHERE id = $1`,
        [activeSession.id],
      );
    }

    const flagsRows = (await this.tenantConn.query(
      `SELECT flag FROM session_flags
        WHERE table_session_id = $1 AND cleared_at IS NULL`,
      [activeSession.id],
    )) as Array<{ flag: string }>;
    const flags = flagsRows.map((r) => r.flag) as SessionFlag[];

    if (this.events) {
      // Emite os dois eventos: o host-specific e o session.flag_changed pra
      // compatibilidade com FE existente.
      this.events.emitHostVipFlagged(slug, {
        sessionId: activeSession.id,
        tableId: tableRow.id,
        tableNumber,
        flag: body.flag,
        reason: body.reason ?? null,
        by: { staffId: body.staffId ?? null },
        at: new Date().toISOString(),
      });
      this.events.emitSessionFlagChanged(slug, {
        sessionId: activeSession.id,
        tableNumber,
        flags,
        by: { staffId: body.staffId ?? '', name: '' },
      });
    }

    // A07: NÃO devolvemos `sessionId` (= token do cliente) pro staff — mesmo
    // corte de swap/liberate. O FE do TableMenu só usa `flags`; os WS emits
    // acima seguem com o token cru (infra interna), nunca no payload HTTP.
    return {
      ok: true as const,
      flags,
    };
  }

  async updateTableSessionMeta(
    tableNumber: number,
    body: { sessionId?: string; party?: number; note?: string; staffId?: string },
    _slug: string,
  ): Promise<HostTableDto> {
    if (body.party == null && body.note == null) {
      throw new HttpException(
        'Informe pessoas ou observacao pra atualizar a mesa.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      body.party != null &&
      (!Number.isInteger(body.party) || body.party < 1 || body.party > 99)
    ) {
      throw new HttpException(
        'A quantidade de pessoas deve ficar entre 1 e 99.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const tableRow = await this.findTableByNumber(tableNumber);
    if (!tableRow) {
      throw new NotFoundException(`Mesa ${tableNumber} nao encontrada.`);
    }

    const activeSession = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `SELECT id FROM table_sessions
          WHERE table_id = $1 AND status = 'active'
          ORDER BY created_at DESC LIMIT 1`,
        [tableRow.id],
      ),
    )[0];
    if (!activeSession) {
      throw new HttpException('Sem sessao ativa pra atualizar a mesa.', HttpStatus.CONFLICT);
    }
    if (body.sessionId && body.sessionId !== activeSession.id) {
      throw new HttpException(
        'A sessao informada nao corresponde a mesa ativa.',
        HttpStatus.CONFLICT,
      );
    }

    const setClause: string[] = ['updated_at = now()'];
    const params: unknown[] = [activeSession.id];
    if (body.party != null) {
      setClause.push(`staff_party_override = $${params.length + 1}`);
      params.push(body.party);
    }
    if (body.note != null) {
      setClause.push(`staff_note = NULLIF($${params.length + 1}, '')`);
      params.push(body.note.trim());
    }
    setClause.push(`staff_meta_updated_by = $${params.length + 1}`);
    params.push(body.staffId ?? null);
    setClause.push('staff_meta_updated_at = now()');

    await this.tenantConn.query(
      `UPDATE table_sessions
          SET ${setClause.join(', ')}
        WHERE id = $1 AND status = 'active'`,
      params,
    );

    const table = (await this.listTables()).find((row) => row.number === tableNumber);
    if (!table) {
      throw new NotFoundException(`Mesa ${tableNumber} nao encontrada apos atualizar.`);
    }
    return table;
  }

  // ─── Waitlist (delegates → HostWaitlistService) ───

  async listWaitlist(): Promise<WaitlistEntryDto[]> {
    return this.waitlist.listWaitlist();
  }

  async addToWaitlist(body: {
    name: string;
    party: number;
    phone?: string;
    cpf?: string;
    note?: string;
  }): Promise<WaitlistEntryDto> {
    return this.waitlist.addToWaitlist(body);
  }

  async removeFromWaitlist(id: string, transition: 'seated' | 'left'): Promise<{ ok: true }> {
    return this.waitlist.removeFromWaitlist(id, transition);
  }

  // ─── Reservations (delegates → HostReservationsService) ───

  async listReservations(): Promise<ReservationEntryDto[]> {
    return this.reservations.listReservations();
  }

  async createReservation(body: {
    name: string;
    party: number;
    phone?: string;
    when: string;
    table?: number;
    note?: string;
    staffId?: string;
  }): Promise<ReservationEntryDto> {
    return this.reservations.createReservation(body);
  }

  async updateReservation(
    id: string,
    body: {
      status?: 'arrived' | 'cancelled' | 'no_show';
      table?: number;
      note?: string;
    },
  ): Promise<ReservationEntryDto> {
    return this.reservations.updateReservation(id, body);
  }

  // ─── helpers privados ───

  private async findTableByNumber(number: number): Promise<{ id: string } | null> {
    // O FE conversa em "table number" (int), o DB persiste `code` (text). O
    // padrao convencionado pelo seed eh `code = "<number>"` (ex: "12") ou
    // "M12" — comparamos primeiro o code EXATO ("<number>"), e so caimos no
    // match por digitos (regexp_replace) quando o exato nao existe.
    //
    // Antes: `... regexp_replace(code, '[^0-9]', '') = $1 LIMIT 1` sem ORDER
    // BY. Como 'M01' e 'D1' colapsam ambos pro numero 1, o LIMIT 1 pegava uma
    // mesa ARBITRARIA sob colisao de digitos — liberate/vip/swap/reserva
    // agiam na mesa errada. Agora a resolucao e deterministica: exato vence, e
    // colisao de digitos (>1 candidato, sem exato) e REJEITADA como ambigua em
    // vez de resolvida ao acaso. O caminho feliz nao-ambiguo (code '7' →
    // numero 7; unico 'M12' → numero 12) permanece identico.
    const rows = (await this.tenantConn.query(
      `SELECT id, code
         FROM tables
        WHERE code = $2
           OR CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT) = $1
        ORDER BY id ASC`,
      [number, String(number)],
    )) as Array<{ id: string; code: string }>;

    if (rows.length === 0) return null;

    // Match exato do code ("<number>") vence sempre — deterministico e imune a
    // colisao de digitos.
    const exact = rows.find((r) => r.code === String(number));
    if (exact) return { id: exact.id };

    // Sem exato: todos os candidatos sao match-por-digito. Se houver mais de um,
    // a resolucao seria arbitraria (o bug antigo) — rejeitamos como ambigua.
    if (rows.length > 1) {
      throw new BadRequestException(
        `Codigo de mesa ambiguo para o numero ${number}: ${rows
          .map((r) => r.code)
          .join(', ')}. Use o codigo exato da mesa.`,
      );
    }

    return { id: rows[0].id };
  }

  private mapTableRow(row: TableRow): HostTableDto {
    let status: HostTableStatus;
    if (!row.active_session_id && row.open_release_id) {
      status = 'liberada';
    } else if (!row.active_session_id) {
      status = 'livre';
    } else if (row.has_vip) {
      status = 'alerta';
    } else {
      status = 'ocupada';
    }
    return {
      number: row.number,
      capacity: row.capacity,
      sector: row.zone_name ?? 'Salão',
      status,
      seats: row.participant_count ?? undefined,
      since: row.active_session_started_at ?? undefined,
      waiter_initial: null,
      party: row.participant_count ?? undefined,
      observation: row.staff_note ?? null,
      active_session_id: row.active_session_id,
      customer_id: row.host_customer_id,
      customer_name: row.host_customer_name,
    };
  }

  /**
   * [SEGURANÇA A07] O DTO devolvido ao STAFF NÃO carrega `sessionId`
   * (= `table_sessions.id` = `x-session-token` do cliente). Expor o token
   * pro staff permitiria forjar a sessão do cliente (session hijack). O
   * staff opera a mesa por número + status, nunca pelo token. O
   * `table_session_id` cru fica disponível separado (`row.table_session_id`)
   * só pros WS emits internos — nunca no payload HTTP.
   */
  private mapSwapRow(row: SwapRow): HostSwapDto {
    return {
      id: row.id,
      fromTableNumber: row.from_table_number,
      toTableNumber: row.to_table_number,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
    };
  }
}
