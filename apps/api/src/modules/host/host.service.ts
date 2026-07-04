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
import { EventsGateway } from '../websocket/events.gateway';
import { AlertsService } from '../alerts/alerts.service';
import { HostInboxService } from './host-inbox.service';
import { HostWaitlistService } from './host-waitlist.service';
import type {
  HostInboxItemDto,
  HostLiberateMode,
  HostSwapRequestDto,
  HostSwapStatus,
  HostTableDto,
  HostTableStatus,
  ReservationEntryDto,
  ReservationStatus,
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

const LIBERATE_MODES: HostLiberateMode[] = ['auto', 'manual_paid', 'manual_force'];

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
    private readonly waitlist: HostWaitlistService,
    private readonly inbox: HostInboxService,
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
    body: { mode: HostLiberateMode; reason?: string; staffId?: string },
    slug: string,
  ) {
    if (!LIBERATE_MODES.includes(body.mode)) {
      throw new HttpException(`Modo desconhecido: ${body.mode}.`, HttpStatus.BAD_REQUEST);
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
    }

    const release = unwrapRows<{ id: string; expires_at: string }>(
      await this.tenantConn.query(
        `INSERT INTO table_qr_releases
           (table_id, released_by_staff_id, reason, expires_at)
         VALUES ($1, $2, $3, now() + interval '15 minutes')
         RETURNING id, expires_at`,
        [tableRow.id, body.staffId ?? null, body.reason ?? null],
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

    return {
      ok: true as const,
      sessionId: activeSession?.id ?? null,
      releaseId: release?.id ?? null,
      releaseExpiresAt: release?.expires_at ?? null,
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

    const setClause: string[] = ['status = $2', 'updated_at = now()'];
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

  async listSwapRequests(filter?: { status?: HostSwapStatus }): Promise<HostSwapRequestDto[]> {
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

    return {
      ok: true as const,
      sessionId: activeSession.id,
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
        throw new HttpException('when invalido (use HH:MM ou ISO 8601).', HttpStatus.BAD_REQUEST);
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
      await this.tenantConn.query(`SELECT id FROM reservations WHERE id = $1`, [id]),
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

  private async findTableByNumber(number: number): Promise<{ id: string } | null> {
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
