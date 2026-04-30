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

    // If there's already an active call for this table, reuse it so the
    // customer can change their mind (different reason) without having to
    // cancel first. A call that's already acknowledged is locked — the
    // waiter is on their way and changing intent would be confusing.
    const existing = (await this.tenantConn.query(
      `SELECT id, status, reason FROM waiter_calls
       WHERE table_session_id = $1 AND status IN ('pending', 'acknowledged')
       ORDER BY created_at DESC
       LIMIT 1`,
      [tableSessionId],
    )) as { id: string; status: string; reason: string }[];

    if (existing.length > 0) {
      const current = existing[0];
      if (current.status === 'acknowledged') {
        throw new BadRequestException(
          'O garcom ja foi avisado. Aguarde ou fale direto com ele.',
        );
      }
      // Pending: update reason if it changed, then return.
      if (current.reason !== reason) {
        await this.tenantConn.query(
          `UPDATE waiter_calls SET reason = $2 WHERE id = $1`,
          [current.id, reason],
        );
        this.eventsGateway.emitWaiterCall(slug, {
          callId: current.id,
          tableLabel: tableInfo.label,
          tableCode: tableInfo.code,
          reason,
        });
      }
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
    staffName?: string,
    etaMinutes?: number,
  ) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id FROM waiter_calls WHERE id = $1`,
      [callId],
    )) as { id: string; status: string; table_session_id: string }[];

    if (!rows.length) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    if (rows[0].status !== 'pending') {
      throw new BadRequestException('Chamado ja foi atendido.');
    }

    await this.tenantConn.query(
      `UPDATE waiter_calls
       SET status = 'acknowledged',
           acknowledged_at = now(),
           assigned_waiter_name = COALESCE($2, assigned_waiter_name),
           eta_minutes = COALESCE($3, eta_minutes)
       WHERE id = $1`,
      [callId, staffName ?? null, etaMinutes ?? null],
    );

    this.eventsGateway.emitWaiterCallAcknowledged(
      slug,
      callId,
      rows[0].table_session_id,
    );

    return {
      callId,
      status: 'acknowledged',
      waiterName: staffName,
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
    if (call.status !== 'pending') {
      throw new BadRequestException(
        'O garcom ja foi avisado e nao pode mais ser cancelado.',
      );
    }

    await this.tenantConn.query(
      `UPDATE waiter_calls SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1`,
      [callId],
    );

    return { callId, status: 'cancelled' };
  }

  async getPendingCalls() {
    return this.tenantConn.query(
      `SELECT wc.id, wc.status, wc.reason, wc.created_at,
              wc.assigned_waiter_name, wc.eta_minutes,
              t.label as table_label, t.code as table_code
       FROM waiter_calls wc
       JOIN table_sessions ts ON ts.id = wc.table_session_id
       JOIN tables t ON t.id = ts.table_id
       WHERE wc.status = 'pending'
       ORDER BY wc.created_at ASC`,
    );
  }
}
