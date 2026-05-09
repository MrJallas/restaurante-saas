import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';
import type {
  HostInboxItemDto,
  HostInboxKind,
  HostLiberateMode,
  HostSwapRequestDto,
  HostSwapStatus,
  HostTableDto,
  HostTableStatus,
  ReservationEntryDto,
  ReservationStatus,
  SessionFlag,
  WaitlistEntryDto,
  WaitlistStatus,
} from '@restaurant/shared-types';

interface TableRow {
  id: string;
  number: number;
  capacity: number;
  zone_name: string | null;
  active_session_id: string | null;
  active_session_started_at: string | null;
  participant_count: number | null;
  has_vip: boolean | null;
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

interface WaitlistRow {
  id: string;
  name: string;
  party: number;
  phone: string | null;
  cpf: string | null;
  note: string | null;
  status: WaitlistStatus;
  added_at: string;
  seated_at: string | null;
  left_at: string | null;
}

interface ReservationRow {
  id: string;
  name: string;
  party: number;
  phone: string | null;
  scheduled_at: string;
  table_id: string | null;
  table_number: number | null;
  status: ReservationStatus;
  arrived_at: string | null;
  cancelled_at: string | null;
  note: string | null;
}

const LIBERATE_MODES: HostLiberateMode[] = [
  'auto',
  'manual_paid',
  'manual_force',
];

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
 * para inbox usamos as tabelas `late_arrival_requests`, `complaints`,
 * `table_merge_requests`, `zone_pauses` ja existentes.
 */
@Injectable()
export class HostService {
  private readonly logger = new Logger(HostService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

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
         active_ts.has_vip                       AS has_vip
       FROM tables t
       LEFT JOIN zones z ON z.id = t.zone_id
       LEFT JOIN LATERAL (
         SELECT ts.id,
                ts.created_at,
                COALESCE(pc.cnt, 0)                              AS participant_count,
                ('vip' = ANY(COALESCE(ts.flags, '{}'::text[])))  AS has_vip
         FROM table_sessions ts
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
       WHERE t.is_active = TRUE
       ORDER BY t.sort_order ASC, number ASC`,
    )) as TableRow[];

    return rows.map((r) => this.mapTableRow(r));
  }

  // ─── Inbox ───

  async listInbox(limit = 30): Promise<HostInboxItemDto[]> {
    const items: HostInboxItemDto[] = [];

    // Late-arrival consumed (approved / rejected — nao mais pending).
    const lateArrival = (await this.tenantConn.query(
      `SELECT lar.id, lar.status, lar.decided_at, lar.requested_at,
              lar.table_session_id, lar.customer_id,
              c.name as customer_name,
              t.code as table_code
         FROM late_arrival_requests lar
         LEFT JOIN customers c ON c.id = lar.customer_id
         LEFT JOIN table_sessions ts ON ts.id = lar.table_session_id
         LEFT JOIN tables t ON t.id = ts.table_id
        WHERE lar.status IN ('approved', 'rejected', 'expired')
        ORDER BY COALESCE(lar.decided_at, lar.requested_at) DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      status: string;
      decided_at: string | null;
      requested_at: string;
      table_session_id: string | null;
      customer_id: string | null;
      customer_name: string | null;
      table_code: string | null;
    }>;
    for (const row of lateArrival) {
      items.push({
        id: `late_arrival:${row.id}`,
        kind: 'late_arrival_consumed' as HostInboxKind,
        refId: row.id,
        title: `Late-arrival ${row.status}`,
        subtitle: row.customer_name
          ? `${row.customer_name}${row.table_code ? ` · mesa ${row.table_code}` : ''}`
          : (row.table_code ?? undefined),
        at: row.decided_at ?? row.requested_at,
        context: {
          tableSessionId: row.table_session_id,
          customerName: row.customer_name,
          tableCode: row.table_code,
          status: row.status,
        },
      });
    }

    // Table-merge consumed.
    const mergeRequests = (await this.tenantConn.query(
      `SELECT id, status, decided_at, created_at,
              source_table_session_id, target_table_session_id
         FROM table_merge_requests
        WHERE status IN ('approved', 'rejected', 'expired')
        ORDER BY COALESCE(decided_at, created_at) DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      status: string;
      decided_at: string | null;
      created_at: string;
      source_table_session_id: string | null;
      target_table_session_id: string | null;
    }>;
    for (const row of mergeRequests) {
      items.push({
        id: `table_merge:${row.id}`,
        kind: 'merge_consumed' as HostInboxKind,
        refId: row.id,
        title: `Junção de mesa ${row.status}`,
        at: row.decided_at ?? row.created_at,
        context: {
          sourceTableSessionId: row.source_table_session_id,
          targetTableSessionId: row.target_table_session_id,
          status: row.status,
        },
      });
    }

    // Complaints (entram no inbox passivo do host pra ele saber o que ta
    // acontecendo no salao, mesmo nao sendo o resolvedor). `submitted_at`
    // eh o equivalente de "criado" no schema da migration 026.
    const complaints = (await this.tenantConn.query(
      `SELECT c.id, c.status, c.submitted_at, c.problem_type,
              cu.name as customer_name
         FROM complaints c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ORDER BY c.submitted_at DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      status: string;
      submitted_at: string;
      problem_type: string | null;
      customer_name: string | null;
    }>;
    for (const row of complaints) {
      items.push({
        id: `complaint:${row.id}`,
        kind: 'complaint' as HostInboxKind,
        refId: row.id,
        title: `Reclamação${row.problem_type ? ` · ${row.problem_type}` : ''}`,
        subtitle: row.customer_name ?? undefined,
        at: row.submitted_at,
        context: {
          status: row.status,
        },
      });
    }

    // Zone-pauses recentes.
    const zonePauses = (await this.tenantConn.query(
      `SELECT zp.id, zp.started_at, zp.ended_at, zp.waiter_id, zp.reason,
              s.name as waiter_name
         FROM zone_pauses zp
         LEFT JOIN staff s ON s.id = zp.waiter_id
        ORDER BY zp.started_at DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      started_at: string;
      ended_at: string | null;
      waiter_id: string;
      waiter_name: string | null;
      reason: string | null;
    }>;
    for (const row of zonePauses) {
      const ended = !!row.ended_at;
      items.push({
        id: `zone_pause:${row.id}:${ended ? 'ended' : 'started'}`,
        kind: (ended ? 'zone_pause_ended' : 'zone_pause_started') as HostInboxKind,
        refId: row.id,
        title: ended
          ? 'Pausa do garçom encerrada'
          : 'Pausa do garçom iniciada',
        subtitle: row.waiter_name ?? undefined,
        at: row.ended_at ?? row.started_at,
        context: {
          waiterId: row.waiter_id,
          reason: row.reason,
        },
      });
    }

    return items
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }

  // ─── Liberate ───

  async liberateTable(
    tableNumber: number,
    body: { mode: HostLiberateMode; reason?: string; staffId?: string },
    slug: string,
  ) {
    if (!LIBERATE_MODES.includes(body.mode)) {
      throw new HttpException(
        `Modo desconhecido: ${body.mode}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

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
        throw new HttpException(
          'Sem sessao ativa pra liberar.',
          HttpStatus.CONFLICT,
        );
      }
      return { ok: true as const, alreadyFree: true };
    }

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
      throw new HttpException(
        'Sessao ja foi fechada.',
        HttpStatus.CONFLICT,
      );
    }

    if (this.events) {
      this.events.emitHostTableLiberated(slug, {
        tableId: tableRow.id,
        tableNumber,
        sessionId: activeSession.id,
        mode: body.mode,
        by: { staffId: body.staffId ?? null },
        reason: body.reason ?? null,
        liberatedAt: new Date().toISOString(),
      });
    }

    return {
      ok: true as const,
      sessionId: activeSession.id,
      mode: body.mode,
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
  ): Promise<HostSwapRequestDto & { ok: true; sessionId: string }> {
    const fromRow = await this.findTableByNumber(body.fromTable);
    const toRow = await this.findTableByNumber(body.toTable);
    if (!fromRow) {
      throw new NotFoundException(`Mesa origem ${body.fromTable} nao encontrada.`);
    }
    if (!toRow) {
      throw new NotFoundException(`Mesa destino ${body.toTable} nao encontrada.`);
    }
    if (fromRow.id === toRow.id) {
      throw new HttpException(
        'Mesa origem e destino sao iguais.',
        HttpStatus.BAD_REQUEST,
      );
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
        throw new HttpException(
          'Mesa origem nao tem sessao ativa.',
          HttpStatus.CONFLICT,
        );
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
      throw new HttpException(
        'Mesa destino ja tem sessao ativa.',
        HttpStatus.CONFLICT,
      );
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
      this.events.emitHostSwapRequested(slug, {
        swapId: dto.id,
        sessionId: dto.sessionId,
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
  ): Promise<HostSwapRequestDto> {
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

    const setClause: string[] = [
      'status = $2',
      'updated_at = now()',
    ];
    const params: unknown[] = [id, body.status];
    if (body.status === 'completed') setClause.push('completed_at = now()');
    if (body.status === 'cancelled') setClause.push('cancelled_at = now()');
    if (body.reason) {
      setClause.push(`reason = COALESCE(NULLIF($${params.length + 1}, ''), reason)`);
      params.push(body.reason);
    }

    await this.tenantConn.query(
      `UPDATE table_swap_requests SET ${setClause.join(', ')} WHERE id = $1`,
      params,
    );

    // Effective move: quando status = completed, swap a sessao pra mesa
    // destino. Mantemos isso atomico no proprio update — sem isso,
    // completed seria so um carimbo sem efeito real.
    if (body.status === 'completed') {
      await this.tenantConn.query(
        `UPDATE table_sessions
            SET table_id = $2,
                updated_at = now()
          WHERE id = $1`,
        [existing.table_session_id, existing.to_table_id],
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
      this.events.emitHostSwapStateChanged(slug, {
        swapId: dto.id,
        sessionId: dto.sessionId,
        fromTableNumber: dto.fromTableNumber,
        toTableNumber: dto.toTableNumber,
        status: body.status,
        at: new Date().toISOString(),
        reason: body.reason ?? dto.reason ?? null,
      });
    }

    return dto;
  }

  async listSwapRequests(filter?: {
    status?: HostSwapStatus;
  }): Promise<HostSwapRequestDto[]> {
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
      throw new HttpException(
        'Sem sessao ativa pra marcar VIP.',
        HttpStatus.CONFLICT,
      );
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

    return {
      ok: true as const,
      sessionId: activeSession.id,
      flags,
    };
  }

  // ─── Waitlist ───

  async listWaitlist(): Promise<WaitlistEntryDto[]> {
    const rows = (await this.tenantConn.query(
      `SELECT id, name, party, phone, cpf, note, status,
              added_at, seated_at, left_at
         FROM waitlist_entries
        WHERE status = 'waiting'
        ORDER BY added_at ASC`,
    )) as WaitlistRow[];
    return rows.map((r) => this.mapWaitlistRow(r));
  }

  async addToWaitlist(body: {
    name: string;
    party: number;
    phone?: string;
    cpf?: string;
    note?: string;
  }): Promise<WaitlistEntryDto> {
    const inserted = unwrapRows<WaitlistRow>(
      await this.tenantConn.query(
        `INSERT INTO waitlist_entries (name, party, phone, cpf, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, party, phone, cpf, note, status,
                   added_at, seated_at, left_at`,
        [
          body.name,
          body.party,
          body.phone ?? null,
          body.cpf ?? null,
          body.note ?? null,
        ],
      ),
    )[0];
    return this.mapWaitlistRow(inserted);
  }

  async removeFromWaitlist(
    id: string,
    transition: 'seated' | 'left',
  ): Promise<{ ok: true }> {
    const tsCol = transition === 'seated' ? 'seated_at' : 'left_at';
    const updated = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE waitlist_entries
            SET status = $2,
                ${tsCol} = now(),
                updated_at = now()
          WHERE id = $1 AND status = 'waiting'
          RETURNING id`,
        [id, transition],
      ),
    );
    if (!updated.length) {
      throw new NotFoundException('Entrada da fila nao encontrada ou ja resolvida.');
    }
    return { ok: true as const };
  }

  // ─── Reservations ───

  async listReservations(): Promise<ReservationEntryDto[]> {
    const rows = (await this.tenantConn.query(
      `SELECT r.id, r.name, r.party, r.phone,
              r.scheduled_at, r.table_id,
              CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
              r.status, r.arrived_at, r.cancelled_at, r.note
         FROM reservations r
         LEFT JOIN tables t ON t.id = r.table_id
        WHERE r.scheduled_at::date = CURRENT_DATE
           OR r.status IN ('awaited', 'arrived')
        ORDER BY r.scheduled_at ASC`,
    )) as ReservationRow[];
    return rows.map((r) => this.mapReservationRow(r));
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
    let scheduledAt: string;
    if (/^\d{2}:\d{2}$/.test(body.when)) {
      // "HH:MM" -> hoje as HH:MM no fuso do servidor.
      const [hh, mm] = body.when.split(':').map((n) => parseInt(n, 10));
      const today = new Date();
      today.setHours(hh, mm, 0, 0);
      scheduledAt = today.toISOString();
    } else {
      const parsed = new Date(body.when);
      if (Number.isNaN(parsed.getTime())) {
        throw new HttpException(
          'when invalido (use HH:MM ou ISO 8601).',
          HttpStatus.BAD_REQUEST,
        );
      }
      scheduledAt = parsed.toISOString();
    }

    let tableId: string | null = null;
    if (body.table != null) {
      const t = await this.findTableByNumber(body.table);
      if (!t) {
        throw new NotFoundException(`Mesa ${body.table} nao encontrada.`);
      }
      tableId = t.id;
    }

    const inserted = unwrapRows<ReservationRow>(
      await this.tenantConn.query(
        `INSERT INTO reservations
           (name, party, phone, scheduled_at, table_id, note, created_by_staff_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, party, phone, scheduled_at, table_id, status,
                   arrived_at, cancelled_at, note,
                   (SELECT CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT)
                      FROM tables WHERE id = table_id) AS table_number`,
        [
          body.name,
          body.party,
          body.phone ?? null,
          scheduledAt,
          tableId,
          body.note ?? null,
          body.staffId ?? null,
        ],
      ),
    )[0];

    return this.mapReservationRow(inserted);
  }

  async updateReservation(
    id: string,
    body: {
      status?: 'arrived' | 'cancelled' | 'no_show';
      table?: number;
      note?: string;
    },
  ): Promise<ReservationEntryDto> {
    const existing = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `SELECT id FROM reservations WHERE id = $1`,
        [id],
      ),
    )[0];
    if (!existing) {
      throw new NotFoundException('Reserva nao encontrada.');
    }

    const setClause: string[] = ['updated_at = now()'];
    const params: unknown[] = [id];
    if (body.status) {
      setClause.push(`status = $${params.length + 1}`);
      params.push(body.status);
      if (body.status === 'arrived') setClause.push('arrived_at = now()');
      if (body.status === 'cancelled') setClause.push('cancelled_at = now()');
    }
    if (body.note != null) {
      setClause.push(`note = $${params.length + 1}`);
      params.push(body.note);
    }
    if (body.table != null) {
      const t = await this.findTableByNumber(body.table);
      if (!t) {
        throw new NotFoundException(`Mesa ${body.table} nao encontrada.`);
      }
      setClause.push(`table_id = $${params.length + 1}`);
      params.push(t.id);
    }

    await this.tenantConn.query(
      `UPDATE reservations SET ${setClause.join(', ')} WHERE id = $1`,
      params,
    );

    const refreshed = unwrapRows<ReservationRow>(
      await this.tenantConn.query(
        `SELECT r.id, r.name, r.party, r.phone, r.scheduled_at, r.table_id,
                CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
                r.status, r.arrived_at, r.cancelled_at, r.note
           FROM reservations r
           LEFT JOIN tables t ON t.id = r.table_id
          WHERE r.id = $1`,
        [id],
      ),
    )[0];
    return this.mapReservationRow(refreshed);
  }

  // ─── helpers privados ───

  private async findTableByNumber(
    number: number,
  ): Promise<{ id: string } | null> {
    // O FE conversa em "table number" (int), o DB persiste `code` (text). O
    // padrao convencionado pelo seed eh `code = "<number>"` (ex: "12") ou
    // "M12" — extraimos so os digitos pra comparar.
    const rows = (await this.tenantConn.query(
      `SELECT id
         FROM tables
        WHERE CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT) = $1
        LIMIT 1`,
      [number],
    )) as Array<{ id: string }>;
    return rows[0] ?? null;
  }

  private mapTableRow(row: TableRow): HostTableDto {
    let status: HostTableStatus;
    if (!row.active_session_id) {
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
    };
  }

  private mapSwapRow(row: SwapRow): HostSwapRequestDto {
    return {
      id: row.id,
      sessionId: row.table_session_id,
      fromTableNumber: row.from_table_number,
      toTableNumber: row.to_table_number,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
    };
  }

  private mapWaitlistRow(row: WaitlistRow): WaitlistEntryDto {
    const added = new Date(row.added_at).getTime();
    const waitMin = Math.max(0, Math.floor((Date.now() - added) / 60_000));
    return {
      id: row.id,
      name: row.name,
      party: row.party,
      phone: row.phone ?? undefined,
      cpf: row.cpf ?? undefined,
      added_at: row.added_at,
      wait_minutes: waitMin,
      note: row.note,
      status: row.status,
    };
  }

  private mapReservationRow(row: ReservationRow): ReservationEntryDto {
    const d = new Date(row.scheduled_at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      id: row.id,
      name: row.name,
      party: row.party,
      phone: row.phone ?? undefined,
      when: `${hh}:${mm}`,
      table: row.table_number,
      status: row.status,
      note: row.note,
    };
  }
}
