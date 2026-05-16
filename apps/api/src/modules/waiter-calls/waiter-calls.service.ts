import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

/** Whitelist kept in-sync with WaiterCallReason in packages/shared-types. */
const VALID_REASONS = new Set([
  'bring_menu',
  'place_order',
  'serve_drink',
  'ask_bill',
  'other',
]);

const ACTIVE_STATUSES = ['pending', 'acknowledged', 'accepted', 'enroute'];

export interface CreateWaiterCallOptions {
  reason?: string;
  customerId?: string | null;
  visitId?: string | null;
}

@Injectable()
export class WaiterCallsService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async createCall(
    tableSessionId: string,
    slug: string,
    options: CreateWaiterCallOptions = {},
  ) {
    const reason = options.reason ?? 'other';
    if (!VALID_REASONS.has(reason)) {
      throw new BadRequestException(`Motivo invalido: ${reason}.`);
    }

    const sessions = (await this.tenantConn.query(
      `SELECT ts.id, t.label, t.code
       FROM table_sessions ts
       JOIN tables t ON t.id = ts.table_id
       WHERE ts.id = $1`,
      [tableSessionId],
    )) as { id: string; label: string; code: string }[];

    if (!sessions.length) {
      throw new BadRequestException('Sessao nao encontrada.');
    }

    const tableInfo = sessions[0];

    // If there's already an active call for this table, return it instead of
    // opening another one. The customer UI shows the "Aguardando garçom"
    // state until the call is cancelled or resolved.
    const existing = (await this.tenantConn.query(
      `SELECT id, status, reason FROM waiter_calls
       WHERE table_session_id = $1 AND status = ANY($2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [tableSessionId, ACTIVE_STATUSES],
    )) as { id: string; status: string; reason: string }[];

    if (existing.length > 0) {
      const current = existing[0];
      const refreshed = (await this.tenantConn.query(
        `SELECT id, status, reason, created_at, assigned_waiter_name, eta_minutes
         FROM waiter_calls WHERE id = $1`,
        [current.id],
      )) as {
        id: string;
        status: string;
        reason: string;
        created_at: string;
        assigned_waiter_name: string | null;
        eta_minutes: number | null;
      }[];
      const r = refreshed[0];
      return {
        callId: r.id,
        status: r.status,
        reason: r.reason,
        createdAt: r.created_at,
        waiterName: r.assigned_waiter_name ?? undefined,
        etaMinutes: r.eta_minutes ?? undefined,
      };
    }

    const rows = (await this.tenantConn.query(
      `INSERT INTO waiter_calls (table_session_id, status, reason, customer_id, visit_id)
       VALUES ($1, 'pending', $2, $3, $4)
       RETURNING id, status, reason, created_at, assigned_waiter_name, eta_minutes`,
      [
        tableSessionId,
        reason,
        options.customerId ?? null,
        options.visitId ?? null,
      ],
    )) as {
      id: string;
      status: string;
      reason: string;
      created_at: string;
      assigned_waiter_name: string | null;
      eta_minutes: number | null;
    }[];

    const call = rows[0];

    this.eventsGateway.emitWaiterCall(slug, {
      callId: call.id,
      tableLabel: tableInfo.label,
      tableCode: tableInfo.code,
      reason: call.reason,
    });

    return {
      callId: call.id,
      status: call.status,
      reason: call.reason,
      createdAt: call.created_at,
      waiterName: call.assigned_waiter_name ?? undefined,
      etaMinutes: call.eta_minutes ?? undefined,
    };
  }

  /**
   * Customer-facing polling endpoint. Returns the status + the waiter's name
   * and ETA once the staff app has acknowledged the call.
   */
  async getActiveCall(tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, reason, created_at, acknowledged_at, resolved_at,
              cancelled_at, assigned_waiter_name, eta_minutes
       FROM waiter_calls
       WHERE table_session_id = $1 AND status = ANY($2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [tableSessionId, ACTIVE_STATUSES],
    )) as Array<{
      id: string;
      status: string;
      reason: string;
      created_at: string;
      acknowledged_at: string | null;
      resolved_at: string | null;
      cancelled_at: string | null;
      assigned_waiter_name: string | null;
      eta_minutes: number | null;
    }>;

    if (!rows.length) return null;
    const call = rows[0];
    return {
      callId: call.id,
      status: call.status,
      reason: call.reason,
      createdAt: call.created_at,
      acknowledgedAt: call.acknowledged_at,
      resolvedAt: call.resolved_at,
      cancelledAt: call.cancelled_at,
      waiterName: call.assigned_waiter_name ?? undefined,
      etaMinutes: call.eta_minutes ?? undefined,
    };
  }

  async getCall(callId: string, tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, reason, created_at, acknowledged_at, resolved_at,
              cancelled_at, assigned_waiter_name, eta_minutes, table_session_id
       FROM waiter_calls WHERE id = $1`,
      [callId],
    )) as Array<{
      id: string;
      status: string;
      reason: string;
      created_at: string;
      acknowledged_at: string | null;
      resolved_at: string | null;
      cancelled_at: string | null;
      assigned_waiter_name: string | null;
      eta_minutes: number | null;
      table_session_id: string;
    }>;

    if (!rows.length) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    const call = rows[0];
    // Scope check — don't let a customer peek at another table's calls.
    if (call.table_session_id !== tableSessionId) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    return {
      callId: call.id,
      status: call.status,
      reason: call.reason,
      createdAt: call.created_at,
      acknowledgedAt: call.acknowledged_at,
      resolvedAt: call.resolved_at,
      cancelledAt: call.cancelled_at,
      waiterName: call.assigned_waiter_name ?? undefined,
      etaMinutes: call.eta_minutes ?? undefined,
    };
  }

  async acknowledgeCall(
    callId: string,
    slug: string,
    staffId: string,
    staffName?: string,
    etaMinutes?: number,
  ) {
    const staffRows = (await this.tenantConn.query(
      `SELECT name FROM staff WHERE id = $1 AND is_active = true`,
      [staffId],
    )) as Array<{ name: string }>;
    const effectiveStaffName = staffName ?? staffRows[0]?.name ?? null;

    // Round 5 (B-NEW-14): UPDATE atômico em vez de SELECT-then-UPDATE.
    // Antes: 2 garçons clicando "atender" simultaneamente passavam pelo
    // SELECT (status=pending), ambos UPDATE — segundo sobrescrevia
    // assigned_waiter_name do primeiro, e o WS event acknowledged disparava
    // 2x (mesmo padrão errado de B-NEW-1 round 3 em complaints).
    //
    // Agora: WHERE id=$1 AND status='pending' garante que só 1 UPDATE
    // efetivamente flipa o status. RETURNING expõe se a row foi tocada.
    // 0 rows = "ja foi atendido" (segundo garçom no race) ou "callId
    // inexistente" (NotFoundException distinta).
    const updated = (await this.tenantConn.query(
      `UPDATE waiter_calls
       SET status = 'acknowledged',
           acknowledged_at = now(),
           acknowledged_by = $2,
           assigned_waiter_name = COALESCE($3, assigned_waiter_name),
           eta_minutes = COALESCE($4, eta_minutes)
       WHERE id = $1 AND status = 'pending'
       RETURNING id, table_session_id`,
      [callId, staffId, effectiveStaffName, etaMinutes ?? null],
    )) as { id: string; table_session_id: string }[];

    if (!updated.length) {
      // Distinguir "não existe" de "já atendido" pra UX correta.
      const probe = (await this.tenantConn.query(
        `SELECT status FROM waiter_calls WHERE id = $1`,
        [callId],
      )) as { status: string }[];
      if (!probe.length) {
        throw new NotFoundException('Chamado nao encontrado.');
      }
      throw new BadRequestException('Chamado ja foi atendido.');
    }

    this.eventsGateway.emitWaiterCallAcknowledged(
      slug,
      callId,
      updated[0].table_session_id,
    );

    return {
      callId,
      status: 'acknowledged',
      waiterName: effectiveStaffName ?? undefined,
      etaMinutes,
    };
  }

  async resolveCall(callId: string) {
    await this.tenantConn.query(
      `UPDATE waiter_calls
       SET status = 'resolved', resolved_at = now()
       WHERE id = $1 AND status IN ('pending', 'acknowledged')`,
      [callId],
    );
    return { callId, status: 'resolved' };
  }

  /**
   * Customer cancels their own pending call (SW2 "Cancelar chamado"). A
   * call that's already acknowledged cannot be cancelled — the waiter is
   * already on their way.
   */
  async cancelCall(callId: string, tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id FROM waiter_calls WHERE id = $1`,
      [callId],
    )) as { id: string; status: string; table_session_id: string }[];

    if (!rows.length) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    const call = rows[0];
    if (call.table_session_id !== tableSessionId) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    if (call.status === 'cancelled') {
      return { callId, status: 'cancelled' };
    }
    if (!ACTIVE_STATUSES.includes(call.status)) {
      return { callId, status: call.status };
    }

    await this.tenantConn.query(
      `UPDATE waiter_calls SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1`,
      [callId],
    );

    return { callId, status: 'cancelled' };
  }

  async getPendingCalls() {
    // `ts.flags` is required by `priorityOf()` (see
    // apps/api/src/modules/vip/priority.util.ts and
    // docs/features/vip-customer.md). Migration 031 added
    // `table_sessions.flags text[]`.
    return this.tenantConn.query(
      `SELECT wc.id, wc.status, wc.reason, wc.created_at,
              wc.assigned_waiter_name, wc.eta_minutes,
              t.label as table_label, t.code as table_code,
              COALESCE(ts.flags, '{}') as flags
       FROM waiter_calls wc
       JOIN table_sessions ts ON ts.id = wc.table_session_id
       JOIN tables t ON t.id = ts.table_id
       WHERE wc.status = 'pending'
       ORDER BY wc.created_at ASC`,
    );
  }
}
