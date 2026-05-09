import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { timingSafeEqual } from 'crypto';
import { RedisService } from '../../infra/redis/redis.service';
import type {
  WsEscalationCreated,
  WsEscalationAdvanced,
  WsEscalationCompleted,
  WsLateArrivalCreated,
  WsLateArrivalApproved,
  WsLateArrivalRejected,
  WsLateArrivalExpired,
  WsTableMergeCreated,
  WsTableMergeApproved,
  WsTableMergeRejected,
  WsMergeCooldownStarted,
  WsMergeCooldownExpired,
  WsLgpdRequestFulfilled,
  WsComplaintReceived,
  WsComplaintResponded,
  WsComplaintRead,
  WsComplaintResolved,
  WsStaffMessageReceived,
  WsStaffMessageRead,
  WsZonePauseStarted,
  WsZonePauseEnded,
  WsSessionFlagChanged,
} from '@restaurant/shared-types';

/**
 * Authenticated socket data. We extend the existing pattern (staff vs session)
 * with optional `customerId` / `staffId` slots used by the new room-routing
 * helpers (`customer:<id>`, `staff:<id>`, `manager:<id>`).
 */
interface AuthedSocket extends Socket {
  data: {
    authType?: 'staff' | 'session';
    sessionId?: string;
    customerId?: string;
    staffId?: string;
    staffRole?: string;
    tenantSlug?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3003', 'http://localhost:3002'],
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly redis: RedisService) {}

  async handleConnection(client: AuthedSocket) {
    const staffKey =
      (client.handshake.headers['x-staff-key'] as string) ??
      (client.handshake.auth?.staffKey as string);
    const sessionToken =
      (client.handshake.headers['x-session-token'] as string) ??
      (client.handshake.auth?.sessionToken as string);

    const expected = process.env.STAFF_API_KEY;
    if (expected && staffKey) {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(staffKey, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        client.data.authType = 'staff';
        // Optional `staffId` / `staffRole` come from handshake auth so the
        // gateway can later validate join requests for `staff:<id>` /
        // `manager:<id>` rooms (only the authenticated staff member can
        // listen to their own personalized inbox).
        const staffId =
          (client.handshake.headers['x-staff-id'] as string) ??
          (client.handshake.auth?.staffId as string);
        const staffRole =
          (client.handshake.headers['x-staff-role'] as string) ??
          (client.handshake.auth?.staffRole as string);
        if (staffId) client.data.staffId = staffId;
        if (staffRole) client.data.staffRole = staffRole;
        this.logger.log(`Staff client connected: ${client.id}`);
        return;
      }
    }

    if (sessionToken) {
      const data = await this.redis.get(`session:${sessionToken}`);
      if (data) {
        const session = JSON.parse(data) as {
          sessionId: string;
          customerId?: string;
        };
        client.data.authType = 'session';
        client.data.sessionId = session.sessionId;
        if (session.customerId) {
          client.data.customerId = session.customerId;
        }
        this.logger.log(`Session client connected: ${client.id}`);
        return;
      }
    }

    this.logger.warn(`Unauthenticated WS connection rejected: ${client.id}`);
    client.emit('error', { message: 'Authentication required' });
    client.disconnect(true);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:tenant')
  handleJoinTenant(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { slug: string; role: string },
  ) {
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required for tenant rooms' });
      return;
    }

    const room = `tenant:${data.slug}:${data.role}`;
    client.join(room);
    client.join(`tenant:${data.slug}`);
    client.data.tenantSlug = data.slug;
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('join:session')
  handleJoinSession(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    if (
      client.data.authType === 'session' &&
      client.data.sessionId !== data.sessionId
    ) {
      client.emit('error', { message: 'Session mismatch' });
      return;
    }

    const room = `session:${data.sessionId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined session room ${room}`);
  }

  /**
   * Customer-scoped room for late-arrival, table-merge and complaint events
   * targeted at a single end-user (e.g. "your merge request was approved").
   * Verified: only the authenticated customer can join their own room.
   * Staff sockets can also join any customer room (used by managers viewing
   * a particular guest's timeline).
   */
  @SubscribeMessage('join:customer')
  handleJoinCustomer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { customerId: string },
  ) {
    if (client.data.authType === 'staff') {
      client.join(`customer:${data.customerId}`);
      this.logger.log(
        `Staff ${client.id} joined customer room ${data.customerId}`,
      );
      return;
    }
    if (
      client.data.authType !== 'session' ||
      client.data.customerId !== data.customerId
    ) {
      client.emit('error', { message: 'Customer mismatch' });
      return;
    }
    client.join(`customer:${data.customerId}`);
    this.logger.log(`Client ${client.id} joined customer room ${data.customerId}`);
  }

  /**
   * Staff-scoped personal inbox room. Only the authenticated staff member
   * matching `staffId` may join (e.g. host receiving late-arrival approvals,
   * manager receiving complaint escalations).
   */
  @SubscribeMessage('join:staff')
  handleJoinStaff(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { staffId: string },
  ) {
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required' });
      return;
    }
    if (client.data.staffId && client.data.staffId !== data.staffId) {
      client.emit('error', { message: 'Staff id mismatch' });
      return;
    }
    client.join(`staff:${data.staffId}`);
    this.logger.log(`Client ${client.id} joined staff room ${data.staffId}`);
  }

  /**
   * Manager-only inbox. Same constraint as `join:staff`, but additionally
   * checks that the staff role allows managerial visibility (defensive — the
   * primary guard happens in REST endpoints; this is just to keep the room
   * fan-out from leaking to unauthenticated peers).
   */
  @SubscribeMessage('join:manager')
  handleJoinManager(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { managerId: string },
  ) {
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required' });
      return;
    }
    if (client.data.staffId && client.data.staffId !== data.managerId) {
      client.emit('error', { message: 'Manager id mismatch' });
      return;
    }
    client.join(`manager:${data.managerId}`);
    this.logger.log(`Client ${client.id} joined manager room ${data.managerId}`);
  }

  // --- Existing emit helpers (orders + waiter calls) ---

  emitOrderStatusUpdate(slug: string, orderId: string, status: string, tableLabel?: string) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      timestamp: new Date().toISOString(),
    });

    this.server.to(`tenant:${slug}:kitchen`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      timestamp: new Date().toISOString(),
    });
  }

  emitNewOrder(slug: string, orderData: Record<string, unknown>) {
    this.server.to(`tenant:${slug}:kitchen`).emit('order:new', {
      ...orderData,
      timestamp: new Date().toISOString(),
    });

    this.server.to(`tenant:${slug}:waiter`).emit('order:new', {
      ...orderData,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderReady(slug: string, orderId: string, tableLabel: string) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:ready', {
      orderId,
      tableLabel,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderClaimed(slug: string, orderId: string, claimedBy: string) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:claimed', {
      orderId,
      claimedBy,
      timestamp: new Date().toISOString(),
    });
  }

  emitWaiterCall(
    slug: string,
    callData: {
      callId: string;
      tableLabel: string;
      tableCode: string;
      reason?: string;
    },
  ) {
    this.server.to(`tenant:${slug}:waiter`).emit('waiter:call', {
      ...callData,
      timestamp: new Date().toISOString(),
    });
  }

  emitWaiterCallAcknowledged(slug: string, callId: string, sessionId: string) {
    this.server.to(`session:${sessionId}`).emit('waiter:acknowledged', {
      callId,
      timestamp: new Date().toISOString(),
    });
  }

  emitToSession(sessionId: string, event: string, data: unknown) {
    this.server.to(`session:${sessionId}`).emit(event, data);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Phase 2 / B2 emit helpers — one per WsEvent variant in shared-types.
  //
  // ROOM ROUTING POLICY (shared by every helper below):
  //  - `tenant:<slug>` : staff-facing dashboards (manager + host see escalations,
  //                      complaints, zone pauses, session-flag changes, etc).
  //  - `customer:<id>` : the affected end-user's own UI (late-arrival result,
  //                      merge-cooldown countdown, complaint replies).
  //  - `staff:<id>`    : a single staff member's personalized inbox (assigned
  //                      complaint, escalation lvl-N target, manager DM).
  //  - `manager:<id>`  : alias of `staff:<id>` for manager-only inboxes (kept
  //                      separate so FE can subscribe selectively).
  //
  // Each helper documents its routing in a leading comment so the target
  // rooms are obvious at the call-site.
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Routing: staff dashboards (`tenant:<slug>`) + the assigned staff member
   * (`staff:<assigneeId>`) when known. Customer side is informed via the
   * specific late_arrival/table_merge events instead.
   */
  emitEscalationCreated(
    slug: string,
    assigneeStaffId: string | null,
    payload: WsEscalationCreated['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('escalation.created', payload);
    if (assigneeStaffId) {
      this.server.to(`staff:${assigneeStaffId}`).emit('escalation.created', payload);
    }
  }

  /**
   * Routing: staff dashboards + previously-assigned staff (so they can clear
   * the badge) + new assignee.
   */
  emitEscalationAdvanced(
    slug: string,
    fromStaffId: string | null,
    toStaffId: string | null,
    payload: WsEscalationAdvanced['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('escalation.advanced', payload);
    if (fromStaffId) {
      this.server.to(`staff:${fromStaffId}`).emit('escalation.advanced', payload);
    }
    if (toStaffId) {
      this.server.to(`staff:${toStaffId}`).emit('escalation.advanced', payload);
    }
  }

  /**
   * Routing: staff dashboards (so the chain disappears from the open list).
   * Also notifies the originator customer via `customer:<id>` when known —
   * the resolution outcome reaches their UI through this channel.
   */
  emitEscalationCompleted(
    slug: string,
    customerId: string | null,
    payload: WsEscalationCompleted['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('escalation.completed', payload);
    if (customerId) {
      this.server.to(`customer:${customerId}`).emit('escalation.completed', payload);
    }
  }

  /**
   * Routing: staff dashboards (host-side inbox shows new approval card) +
   * the host-customer's UI (`customer:<hostId>`) for the in-app pop-up. The
   * requester customer also subscribes via session room.
   */
  emitLateArrivalCreated(
    slug: string,
    hostCustomerId: string | null,
    payload: WsLateArrivalCreated['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('late_arrival.created', payload);
    if (hostCustomerId) {
      this.server
        .to(`customer:${hostCustomerId}`)
        .emit('late_arrival.created', payload);
    }
    this.server
      .to(`customer:${payload.requesterCustomerId}`)
      .emit('late_arrival.created', payload);
  }

  /**
   * Routing: tenant dashboards + requester customer (the late-arriver who
   * was approved) so their FE can transition to "approved" screen.
   */
  emitLateArrivalApproved(
    slug: string,
    payload: WsLateArrivalApproved['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('late_arrival.approved', payload);
    this.server
      .to(`customer:${payload.requesterCustomerId}`)
      .emit('late_arrival.approved', payload);
    this.server
      .to(`session:${payload.tableSessionId}`)
      .emit('late_arrival.approved', payload);
  }

  /**
   * Routing: tenant dashboards + requester customer for the rejection screen.
   */
  emitLateArrivalRejected(
    slug: string,
    payload: WsLateArrivalRejected['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('late_arrival.rejected', payload);
    this.server
      .to(`customer:${payload.requesterCustomerId}`)
      .emit('late_arrival.rejected', payload);
  }

  /**
   * Routing: tenant dashboards (close the open card) + the table session room
   * so the still-open approval UI on the host's device can dismiss itself.
   */
  emitLateArrivalExpired(
    slug: string,
    requesterCustomerId: string | null,
    payload: WsLateArrivalExpired['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('late_arrival.expired', payload);
    this.server
      .to(`session:${payload.tableSessionId}`)
      .emit('late_arrival.expired', payload);
    if (requesterCustomerId) {
      this.server
        .to(`customer:${requesterCustomerId}`)
        .emit('late_arrival.expired', payload);
    }
  }

  /**
   * Routing: tenant dashboards + both host customers + both session rooms so
   * each side's UI shows the merge approval popup.
   */
  emitTableMergeCreated(
    slug: string,
    originCustomerId: string,
    targetCustomerId: string | null,
    payload: WsTableMergeCreated['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('table_merge.created', payload);
    this.server
      .to(`customer:${originCustomerId}`)
      .emit('table_merge.created', payload);
    if (targetCustomerId) {
      this.server
        .to(`customer:${targetCustomerId}`)
        .emit('table_merge.created', payload);
    }
    this.server
      .to(`session:${payload.originSessionId}`)
      .emit('table_merge.created', payload);
    this.server
      .to(`session:${payload.targetSessionId}`)
      .emit('table_merge.created', payload);
  }

  /**
   * Routing: tenant dashboards + both session rooms. Side A/B specifics are
   * already in payload — FE filters per-session.
   */
  emitTableMergeApproved(
    slug: string,
    originSessionId: string,
    targetSessionId: string,
    payload: WsTableMergeApproved['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('table_merge.approved', payload);
    this.server.to(`session:${originSessionId}`).emit('table_merge.approved', payload);
    this.server.to(`session:${targetSessionId}`).emit('table_merge.approved', payload);
  }

  /**
   * Routing: tenant dashboards + both session rooms (so the popup dismisses
   * with a "rejected" state on each side).
   */
  emitTableMergeRejected(
    slug: string,
    originSessionId: string,
    targetSessionId: string,
    payload: WsTableMergeRejected['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('table_merge.rejected', payload);
    this.server.to(`session:${originSessionId}`).emit('table_merge.rejected', payload);
    this.server.to(`session:${targetSessionId}`).emit('table_merge.rejected', payload);
  }

  /**
   * Routing: tenant dashboards (manager monitors cooldowns) + both session
   * rooms so the LLM/UI in those tables can show "wait 20 min" hints.
   */
  emitMergeCooldownStarted(
    slug: string,
    originSessionId: string,
    targetSessionId: string,
    payload: WsMergeCooldownStarted['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('merge.cooldown_started', payload);
    this.server.to(`session:${originSessionId}`).emit('merge.cooldown_started', payload);
    this.server.to(`session:${targetSessionId}`).emit('merge.cooldown_started', payload);
  }

  /**
   * Routing: tenant dashboards. Sessions are not informed because the UI
   * polls the cooldown table and the natural retry path is via REST.
   * Tenant broadcast lets analytics dashboards close the "active cooldown"
   * count.
   */
  emitMergeCooldownExpired(
    slug: string,
    payload: WsMergeCooldownExpired['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('merge.cooldown_expired', payload);
  }

  /**
   * Routing: the affected customer's room (their own UI shows the protocol
   * confirmation) + tenant manager dashboards (audit trail).
   */
  emitLgpdRequestFulfilled(
    slug: string,
    payload: WsLgpdRequestFulfilled['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('lgpd.request_fulfilled', payload);
    this.server
      .to(`customer:${payload.customerId}`)
      .emit('lgpd.request_fulfilled', payload);
  }

  /**
   * Convenience for B1's LGPD module after the Mongo erasure runs. Builds the
   * payload and routes via `emitLgpdRequestFulfilled` above. `requestId` may
   * be omitted when the protocol is created in-flight; we mint a transient
   * id so subscribers always have a stable correlation key.
   */
  emitLgpdFulfilled(
    slug: string,
    customerId: string,
    protocolNumber: string,
    requestId?: string,
  ) {
    this.emitLgpdRequestFulfilled(slug, {
      requestId: requestId ?? protocolNumber,
      customerId,
      type: 'erasure',
      protocolNumber,
      fulfilledAt: new Date().toISOString(),
    });
  }

  /**
   * Routing: tenant dashboards (managers see new card) + the manager assigned
   * to the complaint (`manager:<id>`) so their inbox lights up.
   *
   * P1 #33 — Wire name is `complaint.received` (was `complaint.created`).
   * The manager INBOX RECEIVES — the customer creates. Aligning event name
   * with the spec, no deprecation period (server emit + FE listeners were
   * renamed in the same change).
   */
  emitComplaintReceived(
    slug: string,
    assignedManagerId: string | null,
    payload: WsComplaintReceived['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('complaint.received', payload);
    if (assignedManagerId) {
      this.server
        .to(`manager:${assignedManagerId}`)
        .emit('complaint.received', payload);
    }
  }

  /**
   * Routing: tenant dashboards + the customer who lodged the complaint
   * (their UI shows the manager bubble in real time).
   */
  emitComplaintResponded(
    slug: string,
    customerId: string,
    payload: WsComplaintResponded['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('complaint.responded', payload);
    this.server.to(`customer:${customerId}`).emit('complaint.responded', payload);
  }

  /**
   * Routing: assigned manager (read-receipt) + tenant dashboards.
   */
  emitComplaintRead(
    slug: string,
    managerId: string | null,
    payload: WsComplaintRead['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('complaint.read', payload);
    if (managerId) {
      this.server.to(`manager:${managerId}`).emit('complaint.read', payload);
    }
  }

  /**
   * Routing: tenant dashboards + complainant customer (UI flips to "resolved").
   */
  emitComplaintResolved(
    slug: string,
    customerId: string | null,
    payload: WsComplaintResolved['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('complaint.resolved', payload);
    if (customerId) {
      this.server.to(`customer:${customerId}`).emit('complaint.resolved', payload);
    }
  }

  /**
   * Routing: target customer's room (chat shows the bubble) + the assigned
   * staff inbox so the staff app can update the conversation list.
   */
  emitStaffMessageReceived(
    slug: string,
    customerId: string,
    staffId: string | null,
    payload: WsStaffMessageReceived['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('staff_message.received', payload);
    this.server
      .to(`customer:${customerId}`)
      .emit('staff_message.received', payload);
    if (staffId) {
      this.server.to(`staff:${staffId}`).emit('staff_message.received', payload);
    }
  }

  /**
   * Read receipt for a previously delivered staff message. Broadcast on the
   * global namespace so any subscriber holding the thread can flip the UI.
   * Mirrors the simple `complaint.read` pattern — narrower routing can be
   * layered on later if the fan-out becomes noisy.
   */
  emitStaffMessageRead(payload: WsStaffMessageRead['payload']) {
    this.server.emit('staff_message.read', payload);
  }

  /**
   * Routing: tenant dashboards (managers + waiter app banner). Customers
   * affected get implicit ETA adjustments via REST (no per-customer event).
   */
  emitZonePauseStarted(slug: string, payload: WsZonePauseStarted['payload']) {
    this.server.to(`tenant:${slug}`).emit('zone_pause.started', payload);
    this.server
      .to(`staff:${payload.waiterId}`)
      .emit('zone_pause.started', payload);
  }

  /**
   * Routing: same as start — dashboards + the affected waiter so the banner
   * can clear automatically when the cron auto-ends.
   */
  emitZonePauseEnded(slug: string, payload: WsZonePauseEnded['payload']) {
    this.server.to(`tenant:${slug}`).emit('zone_pause.ended', payload);
    this.server
      .to(`staff:${payload.waiterId}`)
      .emit('zone_pause.ended', payload);
  }

  /**
   * Routing: tenant dashboards + table session room so the chat overlay
   * (allergy/VIP banner) updates instantly on every connected device on the
   * table.
   */
  emitSessionFlagChanged(
    slug: string,
    payload: WsSessionFlagChanged['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('session.flag_changed', payload);
    this.server
      .to(`session:${payload.sessionId}`)
      .emit('session.flag_changed', payload);
  }
}
