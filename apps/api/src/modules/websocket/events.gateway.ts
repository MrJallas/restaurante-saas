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
import { DataSource } from 'typeorm';
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
  WsHostTableLiberated,
  WsHostSwapRequested,
  WsHostSwapStateChanged,
  WsHostVipFlagged,
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
    /**
     * Round 9 (B-NEW-26): tenant slug stamped at handshake from
     * `x-tenant-slug` header. Used by join:tenant and join:session
     * to reject cross-tenant room subscriptions even if the staff
     * key is valid.
     */
    staffTenantSlug?: string;
  };
}

@WebSocketGateway({
  cors: {
    // Round 10 (B-NEW-54): CORS_ORIGINS env honrada (igual main.ts:11-14).
    // Antes hardcoded localhost — em prod com domínio real, WS handshake
    // falhava em browsers que verificam Origin. Inconsistência interna
    // entre HTTP (env-driven) e WS (hardcoded) corrigida.
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
      : ['http://localhost:3003', 'http://localhost:3002'],
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Round 15 (P1-NEW-1 round14): valida que `customerId` pertence ao
   * tenant do staff. Antes `join:customer` staff-path entrava na room
   * sem checar — staff de tenant A com customerId de tenant B (UUID
   * vazado em logs/Mongo dump) recebia complaint.responded /
   * lgpd.request_fulfilled / late_arrival.* / staff_message.received
   * com PII alheia. Cache na chave `customer_tenant:<customerId>` (TTL
   * 5min) pra evitar lookup em DB a cada join.
   */
  private async validateCustomerInTenant(
    customerId: string,
    staffTenantSlug: string,
  ): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(customerId)) {
      return false;
    }

    const cached = await this.redis.get(`customer_tenant:${customerId}`);
    if (cached) {
      return cached === staffTenantSlug;
    }

    const restaurantRows = (await this.dataSource.query(
      `SELECT schema_name FROM public.restaurants
        WHERE slug = $1 AND is_active = true`,
      [staffTenantSlug],
    )) as Array<{ schema_name: string }>;
    if (!restaurantRows.length) return false;
    const schemaName = restaurantRows[0].schema_name;
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) return false;

    const customerRows = (await this.dataSource.query(
      `SELECT 1 FROM "${schemaName}".customers WHERE id = $1 LIMIT 1`,
      [customerId],
    )) as unknown[];

    if (customerRows.length) {
      await this.redis.set(
        `customer_tenant:${customerId}`,
        staffTenantSlug,
        300,
      );
      return true;
    }
    return false;
  }

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
        // Round 9 (B-NEW-36): staffId AGORA é OBRIGATÓRIO no handshake
        // staff (era opcional). Atacante que não passou x-staff-id
        // bypassava `client.data.staffId && ...` checks via
        // curto-circuito — agora rejeitamos a conexão direto.
        const staffId =
          (client.handshake.headers['x-staff-id'] as string) ??
          (client.handshake.auth?.staffId as string);
        const staffRole =
          (client.handshake.headers['x-staff-role'] as string) ??
          (client.handshake.auth?.staffRole as string);
        // Round 9 (B-NEW-26): tenantSlug carimbado do handshake header
        // pra cross-check em join:tenant / join:session. Antes a
        // gateway aceitava slug arbitrário do client em join:tenant.
        const tenantSlug =
          (client.handshake.headers['x-tenant-slug'] as string) ??
          (client.handshake.auth?.tenantSlug as string);

        if (!staffId) {
          this.logger.warn(
            `Staff WS connection without x-staff-id rejected: ${client.id}`,
          );
          client.emit('error', {
            message:
              'Staff WS handshake exige x-staff-id pra join:staff/manager rooms.',
          });
          client.disconnect(true);
          return;
        }
        // Round 14 (P1-NEW-1): x-tenant-slug agora é OBRIGATÓRIO no handshake
        // staff (era opcional, stamped só `if (tenantSlug)`). Como STAFF_API_KEY
        // é shared global, staff omitindo o slug curto-circuitava
        // `client.data.staffTenantSlug && ...` em join:tenant/session e
        // entrava em rooms de outros tenants recebendo eventos cross-tenant.
        if (!tenantSlug) {
          this.logger.warn(
            `Staff WS connection without x-tenant-slug rejected: ${client.id}`,
          );
          client.emit('error', {
            message:
              'Staff WS handshake exige x-tenant-slug pra cross-tenant isolation.',
          });
          client.disconnect(true);
          return;
        }
        client.data.staffId = staffId;
        if (staffRole) client.data.staffRole = staffRole;
        client.data.staffTenantSlug = tenantSlug;
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

  /**
   * Round 9 (B-NEW-26 + B-NEW-34 + B-NEW-36): WS auth hardening.
   *
   * Staff handshake passa a EXIGIR `x-staff-id` (não apenas
   * `x-staff-key` shared). `client.data.staffTenantSlug` é stamped
   * a partir do handshake header `x-tenant-slug` (não do client
   * via join:tenant body). Antes:
   *  - join:tenant aceitava slug arbitrário → staff de A entrava em
   *    `tenant:B` rooms (B-NEW-26).
   *  - join:session só checava session match pra customer; staff
   *    passava em qualquer sessionId (B-NEW-34).
   *  - join:staff/manager checavam `client.data.staffId &&` que era
   *    falsy quando handshake não passou (B-NEW-36).
   *
   * Agora:
   *  - handshake staff EXIGE `x-staff-id` non-empty E `x-tenant-slug`.
   *  - join:tenant rejeita se data.slug != client.data.staffTenantSlug.
   *  - join:session rejeita staff se sessionId não pertence ao tenant.
   *  - join:staff/manager rejeita se `client.data.staffId` ausente OU
   *    diferente de data.staffId.
   */
  @SubscribeMessage('join:tenant')
  handleJoinTenant(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { slug: string; role: string },
  ) {
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required for tenant rooms' });
      return;
    }

    // Round 9 (B-NEW-26): rejeita slug diferente do tenant carimbado
    // no handshake. Atacante não pode entrar em room de outro tenant.
    //
    // Round 14 (P1-NEW-1): handshake agora EXIGE x-tenant-slug, então
    // staffTenantSlug está sempre presente. O check anterior `&& ...`
    // curto-circuitava se faltasse — agora exigimos explicitamente.
    if (
      !client.data.staffTenantSlug ||
      client.data.staffTenantSlug !== data.slug
    ) {
      client.emit('error', { message: 'Tenant slug mismatch' });
      return;
    }

    const room = `tenant:${data.slug}:${data.role}`;
    client.join(room);
    client.join(`tenant:${data.slug}`);
    client.data.tenantSlug = data.slug;
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('join:session')
  async handleJoinSession(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    // Customer: cross-check próprio sessionId.
    if (
      client.data.authType === 'session' &&
      client.data.sessionId !== data.sessionId
    ) {
      client.emit('error', { message: 'Session mismatch' });
      return;
    }

    // Round 9 (B-NEW-34): staff path agora valida que a session pertence
    // ao próprio tenant. Antes staff de tenant A entrava em qualquer
    // session:<UUID> de qualquer tenant e recebia order/host events
    // alheios. Lookup por session_token Redis tem o sessionId mas não
    // tenant — usamos cache na chave `session:<sessionId>` que persiste
    // tableSession data com schema/slug.
    if (client.data.authType === 'staff') {
      const sessionData = await this.redis.get(`session:${data.sessionId}`);
      if (!sessionData) {
        client.emit('error', { message: 'Session inválida ou expirada.' });
        return;
      }
      try {
        const parsed = JSON.parse(sessionData) as { schemaName?: string };
        // Round 14 (P1-NEW-1): handshake garante staffTenantSlug presente,
        // então o check anterior `&& ...` virou `!staffTenantSlug ||` pra
        // não curto-circuitar caso futura regressão volte a stamping
        // condicional.
        if (
          !client.data.staffTenantSlug ||
          parsed.schemaName !== client.data.staffTenantSlug
        ) {
          client.emit('error', { message: 'Cross-tenant session join blocked.' });
          return;
        }
      } catch {
        client.emit('error', { message: 'Session payload corrompido.' });
        return;
      }
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
  async handleJoinCustomer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { customerId: string },
  ) {
    if (client.data.authType === 'staff') {
      // Round 15 (P1-NEW-1 round14): staff só entra em customer room
      // se o customer pertence ao tenant carimbado no handshake. Antes
      // staff de tenant A com UUID alheio (vazado em logs / Mongo dump
      // / migração) recebia complaint.responded / lgpd.request_fulfilled
      // / late_arrival.* / staff_message.received com PII de cliente
      // de outro tenant.
      if (!client.data.staffTenantSlug) {
        client.emit('error', { message: 'Tenant slug missing in handshake.' });
        return;
      }
      const ok = await this.validateCustomerInTenant(
        data.customerId,
        client.data.staffTenantSlug,
      );
      if (!ok) {
        client.emit('error', {
          message: 'Cross-tenant customer join blocked.',
        });
        return;
      }
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
    // Round 9 (B-NEW-36): exige staffId carimbado no handshake.
    // Antes o check `staffId && ...` curto-circuitava quando handshake
    // não passou x-staff-id, deixando atacante entrar em qualquer
    // staff:<id> room (inbox alheio em real-time).
    if (!client.data.staffId) {
      client.emit('error', { message: 'WS handshake exige x-staff-id pra join:staff.' });
      return;
    }
    if (client.data.staffId !== data.staffId) {
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
    // Round 9 (B-NEW-36): mesmo fix do join:staff — exige staffId
    // carimbado, rejeita se ausente OU mismatch.
    if (!client.data.staffId) {
      client.emit('error', { message: 'WS handshake exige x-staff-id pra join:manager.' });
      return;
    }
    if (client.data.staffId !== data.managerId) {
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
   * Read receipt for a previously delivered staff message.
   *
   * Round 8 (B-NEW-3 round 3 fix): antes era `this.server.emit(...)` global
   * — broadcast pra TODOS sockets (cross-tenant em deploy multi-tenant +
   * customers ouvindo outros eventos recebiam metadata da staff). Agora
   * scopado pra room `tenant:${slug}`. O slug é passado pelo caller
   * (`StaffMessagesService.markRead`) via parâmetro novo.
   */
  emitStaffMessageRead(slug: string, payload: WsStaffMessageRead['payload']) {
    this.server.to(`tenant:${slug}`).emit('staff_message.read', payload);
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

  // ───────────────────────────────────────────────────────────────────────
  // Host module emit helpers — staff-host (recepcionista) operations.
  // Routing: tenant dashboards (`tenant:<slug>`) so todos os apps de staff
  // (host home, manager dashboard, garcom map) recebem; quando aplicavel,
  // tambem pra `session:<id>` pra que o cliente na mesa veja a transicao.
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Routing: tenant dashboards (host home limpa o card, manager dashboard
   * decrementa contador) + sala da sessao fechada (clientes recebem o close
   * em tempo real, sem polling).
   */
  emitHostTableLiberated(
    slug: string,
    payload: WsHostTableLiberated['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('host.table_liberated', payload);
    this.server
      .to(`session:${payload.sessionId}`)
      .emit('host.table_liberated', payload);
  }

  /**
   * Routing: tenant dashboards + ambas as salas das sessoes envolvidas
   * (origem ja tem comanda aberta — recebe pra atualizar UI pra "movendo
   * pra mesa X"; destino pode estar livre, ainda assim emite pra uniformizar).
   */
  emitHostSwapRequested(
    slug: string,
    payload: WsHostSwapRequested['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('host.swap_requested', payload);
    this.server
      .to(`session:${payload.sessionId}`)
      .emit('host.swap_requested', payload);
  }

  /**
   * Routing: tenant dashboards + sessao envolvida (cliente ve "concluido"
   * ou "cancelado" sem polling). Estados intermediarios (in_progress)
   * ainda sao broadcast pra que UIs de monitoria vejam o progresso.
   */
  emitHostSwapStateChanged(
    slug: string,
    payload: WsHostSwapStateChanged['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('host.swap_state_changed', payload);
    this.server
      .to(`session:${payload.sessionId}`)
      .emit('host.swap_state_changed', payload);
  }

  /**
   * Routing: tenant dashboards (manager + waiter map flag VIP) + sala da
   * sessao (banner VIP no overlay do menu).
   */
  emitHostVipFlagged(
    slug: string,
    payload: WsHostVipFlagged['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('host.vip_flagged', payload);
    this.server
      .to(`session:${payload.sessionId}`)
      .emit('host.vip_flagged', payload);
  }
}
