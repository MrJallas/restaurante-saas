import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class WaiterCallsService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async createCall(tableSessionId: string, slug: string) {
    // Check for existing pending call from this session
    const existing = (await this.tenantConn.query(
      `SELECT id FROM waiter_calls
       WHERE table_session_id = $1 AND status = 'pending'`,
      [tableSessionId],
    )) as { id: string }[];

    if (existing.length > 0) {
      throw new BadRequestException('Ja existe um chamado pendente para esta mesa.');
    }

    // Get table info for the notification
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

    // Create the call
    const rows = (await this.tenantConn.query(
      `INSERT INTO waiter_calls (table_session_id, status)
       VALUES ($1, 'pending')
       RETURNING id, status, created_at`,
      [tableSessionId],
    )) as { id: string; status: string; created_at: string }[];

    const call = rows[0];

    // Emit WebSocket event to all waiters
    this.eventsGateway.emitWaiterCall(slug, {
      callId: call.id,
      tableLabel: tableInfo.label,
      tableCode: tableInfo.code,
    });

    return {
      callId: call.id,
      status: call.status,
      createdAt: call.created_at,
    };
  }

  async acknowledgeCall(callId: string, slug: string, sessionId: string) {
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
      `UPDATE waiter_calls SET status = 'acknowledged', acknowledged_at = now()
       WHERE id = $1`,
      [callId],
    );

    // Notify customer that waiter is coming
    this.eventsGateway.emitWaiterCallAcknowledged(slug, callId, rows[0].table_session_id);

    return { callId, status: 'acknowledged' };
  }

  async resolveCall(callId: string) {
    await this.tenantConn.query(
      `UPDATE waiter_calls SET status = 'resolved'
       WHERE id = $1 AND status = 'acknowledged'`,
      [callId],
    );
    return { callId, status: 'resolved' };
  }

  async getPendingCalls() {
    return this.tenantConn.query(
      `SELECT wc.id, wc.status, wc.created_at,
              t.label as table_label, t.code as table_code
       FROM waiter_calls wc
       JOIN table_sessions ts ON ts.id = wc.table_session_id
       JOIN tables t ON t.id = ts.table_id
       WHERE wc.status = 'pending'
       ORDER BY wc.created_at ASC`,
    );
  }
}
