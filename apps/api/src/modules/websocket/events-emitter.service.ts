/**
 * EventsEmitterService — extração 2026-07-04 (fix/framework-bugfixes).
 *
 * Os 48 helpers emit* do EventsGateway movidos VERBATIM (mesmos corpos,
 * mesmas rooms, mesmos wire names, mesmos comentários de routing). Única
 * dependência: o Server do socket.io, recebido via bindServer() no
 * afterInit do gateway — o @WebSocketServer() continua populando o
 * gateway; aqui só guardamos a referência.
 *
 * O EventsGateway permanece como FACADE com delegates de 1 linha —
 * waiter-calls.service e jobs/ttl-tick.service injetam EventsGateway sem
 * @Optional, então o token DI e a superfície pública não mudam.
 *
 * Comportamento congelado por events-emitter.characterization.test.ts
 * (verde antes E depois da extração, sem edição no teste).
 */
import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type {
  WsEscalationCreated,
  WsEscalationAdvanced,
  WsEscalationCompleted,
  WsLateArrivalCreated,
  WsLateArrivalApproved,
  WsLateArrivalRejected,
  WsLateArrivalExpired,
  WsScanVerificationCreated,
  WsScanVerificationEscalated,
  WsScanVerificationResolved,
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
  WsCourtesyCreated,
  WsCourtesyUpdated,
  WsPaymentConfirmed,
  WsOrderStatus,
  WsOrderClaimed,
  WsWaiterAcknowledged,
  WsZonePauseStarted,
  WsZonePauseEnded,
  WsSessionFlagChanged,
  WsHostTableLiberated,
  WsHostSwapRequested,
  WsHostSwapStateChanged,
  WsHostVipFlagged,
} from '@restaurant/shared-types';

@Injectable()
export class EventsEmitterService {
  private server!: Server;

  /** Chamado pelo EventsGateway.afterInit com o Server real do socket.io. */
  bindServer(server: Server) {
    this.server = server;
  }

  // --- Existing emit helpers (orders + waiter calls) ---

  /**
   * M2 (timeline): `extra` é o "payload object" aditivo — campos novos e
   * OPCIONAIS (tableSessionId/changedBy) nascem nos CALLERS e são
   * repassados aqui. Rooms e wire name intocados.
   */
  emitOrderStatusUpdate(
    slug: string,
    orderId: string,
    status: string,
    tableLabel?: string,
    extra?: Pick<WsOrderStatus['payload'], 'tableSessionId' | 'changedBy'>,
  ) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      ...extra,
      timestamp: new Date().toISOString(),
    });

    this.server.to(`tenant:${slug}:kitchen`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      ...extra,
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

  /** M2 (timeline): `extra` aditivo — tableSessionId/tableLabel nascem no caller. */
  emitOrderClaimed(
    slug: string,
    orderId: string,
    claimedBy: string,
    extra?: Pick<WsOrderClaimed['payload'], 'tableSessionId' | 'tableLabel'>,
  ) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:claimed', {
      orderId,
      claimedBy,
      ...extra,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderHandoffCalled(
    slug: string,
    data: {
      orderId: string;
      deliveryId: string;
      tableLabel: string;
      tableCode: string;
      zoneName?: string | null;
      targetWaiterId: string | null;
      targetWaiterName?: string | null;
      /** M2 (timeline): sessão dona do pedido (aditivo, opcional). */
      tableSessionId?: string;
      /** M2 (timeline): staff que chamou — null quando estação/TV. */
      calledBy?: string | null;
    },
  ) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    };
    this.server.to(`tenant:${slug}:kitchen`).emit('order:handoff_called', payload);
    if (data.targetWaiterId) {
      this.server.to(`staff:${data.targetWaiterId}`).emit('order:handoff_called', payload);
    } else {
      this.server.to(`tenant:${slug}:waiter`).emit('order:handoff_called', payload);
    }
  }

  emitKitchenReorder(
    slug: string,
    data: { orderIds: string[]; reason?: string | null; requestedBy?: string | null },
  ) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    };
    this.server.to(`tenant:${slug}:kitchen`).emit('kitchen:reorder', payload);
    this.server.to(`tenant:${slug}:manager`).emit('kitchen:reorder', payload);
  }

  emitKitchenPriorityRequest(
    slug: string,
    data: {
      requestId: string;
      orderIds: string[];
      reason?: string | null;
      requestedBy?: string | null;
    },
  ) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    };
    this.server.to(`tenant:${slug}:kitchen`).emit('kitchen:priority_request', payload);
    this.server.to(`tenant:${slug}:manager`).emit('kitchen:priority_request', payload);
  }

  emitKitchenPriorityResponse(
    slug: string,
    data: {
      requestId: string;
      orderIds: string[];
      status: 'accepted' | 'next';
      protectedOrderIds?: string[];
      respondedBy?: string | null;
    },
  ) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    };
    this.server.to(`tenant:${slug}:kitchen`).emit('kitchen:priority_response', payload);
    this.server.to(`tenant:${slug}:manager`).emit('kitchen:priority_response', payload);
  }

  /**
   * Cliente pediu a RECEPÇÃO na mesa (ex.: ajuda com junção de mesas pelo
   * assistente). Room do papel host — garçom não é o destinatário aqui
   * (code-review dos vídeos 2026-06-10: o botão "Chamar recepcionista"
   * abria o sheet de garçom).
   */
  emitHostAssistRequested(
    slug: string,
    data: {
      tableLabel: string | null;
      tableCode: string | null;
      tableSessionId: string;
      reason?: string | null;
    },
  ) {
    this.server.to(`tenant:${slug}:host`).emit('host.assist_requested', {
      ...data,
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
      /** M2 (timeline): sessão que abriu o chamado (aditivo, opcional). */
      tableSessionId?: string;
      /** M2 (timeline): customer resolvido server-side — null se anônimo. */
      customerId?: string | null;
    },
  ) {
    this.server.to(`tenant:${slug}:waiter`).emit('waiter:call', {
      ...callData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * M2 (timeline): payload agora carrega `tableSessionId` (o próprio
   * `sessionId` que sempre chegou do caller como room key) + `extra`
   * aditivo (acknowledgedBy/etaMinutes — antes só iam pro response REST).
   */
  emitWaiterCallAcknowledged(
    slug: string,
    callId: string,
    sessionId: string,
    extra?: Pick<WsWaiterAcknowledged['payload'], 'acknowledgedBy' | 'etaMinutes'>,
  ) {
    this.server.to(`session:${sessionId}`).emit('waiter:acknowledged', {
      callId,
      tableSessionId: sessionId,
      ...extra,
      timestamp: new Date().toISOString(),
    });
    this.server.to(`tenant:${slug}:waiter`).emit('waiter:acknowledged', {
      callId,
      tableSessionId: sessionId,
      ...extra,
      timestamp: new Date().toISOString(),
    });
  }

  emitToSession(sessionId: string, event: string, data: unknown) {
    this.server.to(`session:${sessionId}`).emit(event, data);
  }

  /**
   * Generic single-customer emitter (`customer:<id>` room). Usado quando o
   * evento é PRIVADO do destinatário — ex.: resposta do gerente no
   * assistente (decisão Caleb 2026-06-11: `assistant.staff_message_received`
   * NÃO vai mais pro session room, só o cliente que abriu a conversa vê).
   */
  emitToCustomer(customerId: string, event: string, data: unknown) {
    this.server.to(`customer:${customerId}`).emit(event, data);
  }

  /**
   * Generic tenant-room emitter — every staff dashboard joined to
   * `tenant:<slug>` receives the event. Used by features that don't have
   * a specific room-routing helper (`emitCustomerStaffMessage`, etc.) and
   * want a fanout to "all staff for this restaurant".
   *
   * Distinct from `emitToSession` (single table's customer-side socket)
   * and the per-role helpers (`tenant:<slug>:waiter`, `:kitchen`).
   */
  emitToTenant(slug: string, event: string, data: unknown) {
    this.server.to(`tenant:${slug}`).emit(event, data);
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
      this.server.to(`customer:${hostCustomerId}`).emit('late_arrival.created', payload);
    }
    this.server.to(`customer:${payload.requesterCustomerId}`).emit('late_arrival.created', payload);
  }

  /**
   * Routing: tenant dashboards + requester customer (the late-arriver who
   * was approved) so their FE can transition to "approved" screen.
   */
  emitLateArrivalApproved(slug: string, payload: WsLateArrivalApproved['payload']) {
    this.server.to(`tenant:${slug}`).emit('late_arrival.approved', payload);
    this.server
      .to(`customer:${payload.requesterCustomerId}`)
      .emit('late_arrival.approved', payload);
    this.server.to(`session:${payload.tableSessionId}`).emit('late_arrival.approved', payload);
  }

  /**
   * Routing: tenant dashboards + requester customer for the rejection screen.
   */
  emitLateArrivalRejected(slug: string, payload: WsLateArrivalRejected['payload']) {
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
    this.server.to(`session:${payload.tableSessionId}`).emit('late_arrival.expired', payload);
    if (requesterCustomerId) {
      this.server.to(`customer:${requesterCustomerId}`).emit('late_arrival.expired', payload);
    }
  }

  /**
   * Routing: all staff dashboards + host room first. Customer stays in the
   * table session waiting screen until a resolved event/participant decision.
   */
  emitScanVerificationCreated(slug: string, payload: WsScanVerificationCreated['payload']) {
    this.server.to(`tenant:${slug}`).emit('scan_verification.created', payload);
    this.server.to(`tenant:${slug}:host`).emit('scan_verification.created', payload);
  }

  /**
   * Routing: staff dashboards and the newly responsible role room.
   */
  emitScanVerificationEscalated(
    slug: string,
    assigneeRole: 'host' | 'manager' | 'waiter',
    payload: WsScanVerificationEscalated['payload'],
  ) {
    this.server.to(`tenant:${slug}`).emit('scan_verification.escalated', payload);
    this.server.to(`tenant:${slug}:${assigneeRole}`).emit('scan_verification.escalated', payload);
  }

  /**
   * Routing: staff dashboards + requester customer + table session room.
   */
  emitScanVerificationResolved(slug: string, payload: WsScanVerificationResolved['payload']) {
    this.server.to(`tenant:${slug}`).emit('scan_verification.resolved', payload);
    this.server
      .to(`customer:${payload.requesterCustomerId}`)
      .emit('scan_verification.resolved', payload);
    this.server.to(`session:${payload.tableSessionId}`).emit('scan_verification.resolved', payload);
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
    this.server.to(`customer:${originCustomerId}`).emit('table_merge.created', payload);
    if (targetCustomerId) {
      this.server.to(`customer:${targetCustomerId}`).emit('table_merge.created', payload);
    }
    this.server.to(`session:${payload.originSessionId}`).emit('table_merge.created', payload);
    this.server.to(`session:${payload.targetSessionId}`).emit('table_merge.created', payload);
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
  emitMergeCooldownExpired(slug: string, payload: WsMergeCooldownExpired['payload']) {
    this.server.to(`tenant:${slug}`).emit('merge.cooldown_expired', payload);
  }

  /**
   * Routing: the affected customer's room (their own UI shows the protocol
   * confirmation) + tenant manager dashboards (audit trail).
   */
  emitLgpdRequestFulfilled(slug: string, payload: WsLgpdRequestFulfilled['payload']) {
    this.server.to(`tenant:${slug}`).emit('lgpd.request_fulfilled', payload);
    this.server.to(`customer:${payload.customerId}`).emit('lgpd.request_fulfilled', payload);
  }

  /**
   * Convenience for B1's LGPD module after the Mongo erasure runs. Builds the
   * payload and routes via `emitLgpdRequestFulfilled` above. `requestId` may
   * be omitted when the protocol is created in-flight; we mint a transient
   * id so subscribers always have a stable correlation key.
   */
  emitLgpdFulfilled(slug: string, customerId: string, protocolNumber: string, requestId?: string) {
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
      this.server.to(`manager:${assignedManagerId}`).emit('complaint.received', payload);
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
  emitComplaintRead(slug: string, managerId: string | null, payload: WsComplaintRead['payload']) {
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
    this.server.to(`customer:${customerId}`).emit('staff_message.received', payload);
    if (staffId) {
      this.server.to(`staff:${staffId}`).emit('staff_message.received', payload);
    }
  }

  /**
   * Staff-to-staff thread routing. A reply sent with only `threadId` has no
   * single `recipientStaffId`, so route it to every active participant room.
   * Socket.IO de-duplicates sockets that are present in more than one room.
   */
  emitStaffThreadMessageReceived(
    _slug: string,
    staffIds: string[],
    payload: WsStaffMessageReceived['payload'],
  ) {
    const rooms = Array.from(new Set(staffIds.filter(Boolean))).map((id) => `staff:${id}`);
    this.server.to(rooms).emit('staff_message.received', payload);
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
   * Routing: the table session gets the customer-facing card immediately;
   * tenant dashboards get the same payload so manager/waiter views can refresh
   * their status without polling.
   */
  emitCourtesyCreated(slug: string, payload: WsCourtesyCreated['payload']) {
    this.server.to(`tenant:${slug}`).emit('courtesy.created', payload);
    this.server.to(`session:${payload.tableSessionId}`).emit('courtesy.created', payload);
  }

  /**
   * Routing: customer tabs/devices update the pending card after accept/deny,
   * and staff dashboards receive the status transition.
   */
  emitCourtesyUpdated(slug: string, payload: WsCourtesyUpdated['payload']) {
    this.server.to(`tenant:${slug}`).emit('courtesy.updated', payload);
    this.server.to(`session:${payload.tableSessionId}`).emit('courtesy.updated', payload);
  }

  /**
   * M3 (timeline): pagamento transicionou pra 'confirmed' (paid_at gravado)
   * — primeiro evento WS da família payments (antes não emitia nada).
   *
   * Routing (mesmo padrão courtesy/session-flag da família financeira):
   *  - `tenant:<slug>`  : staff dashboards (manager/host fecham o card de
   *                       conta em aberto sem polling);
   *  - `session:<id>`   : todos os devices da mesa transicionam pra tela
   *                       de pago em tempo real.
   * Payload passthrough — nasce completo no caller (payments.service
   * .confirmPayment, APÓS o UPDATE commitar), incluindo confirmedAt
   * (paid_at) e timestamp.
   */
  emitPaymentConfirmed(slug: string, payload: WsPaymentConfirmed['payload']) {
    this.server.to(`tenant:${slug}`).emit('payment.confirmed', payload);
    this.server.to(`session:${payload.tableSessionId}`).emit('payment.confirmed', payload);
  }

  /**
   * Routing: tenant dashboards (managers + waiter app banner). Customers
   * affected get implicit ETA adjustments via REST (no per-customer event).
   */
  emitZonePauseStarted(slug: string, payload: WsZonePauseStarted['payload']) {
    this.server.to(`tenant:${slug}`).emit('zone_pause.started', payload);
    this.server.to(`staff:${payload.waiterId}`).emit('zone_pause.started', payload);
  }

  /**
   * Routing: same as start — dashboards + the affected waiter so the banner
   * can clear automatically when the cron auto-ends.
   */
  emitZonePauseEnded(slug: string, payload: WsZonePauseEnded['payload']) {
    this.server.to(`tenant:${slug}`).emit('zone_pause.ended', payload);
    this.server.to(`staff:${payload.waiterId}`).emit('zone_pause.ended', payload);
  }

  /**
   * Routing: tenant dashboards + table session room so the chat overlay
   * (allergy/VIP banner) updates instantly on every connected device on the
   * table.
   */
  emitSessionFlagChanged(slug: string, payload: WsSessionFlagChanged['payload']) {
    this.server.to(`tenant:${slug}`).emit('session.flag_changed', payload);
    this.server.to(`session:${payload.sessionId}`).emit('session.flag_changed', payload);
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
  emitHostTableLiberated(slug: string, payload: WsHostTableLiberated['payload']) {
    this.server.to(`tenant:${slug}`).emit('host.table_liberated', payload);
    this.server.to(`session:${payload.sessionId}`).emit('host.table_liberated', payload);
  }

  /**
   * Routing: tenant dashboards + ambas as salas das sessoes envolvidas
   * (origem ja tem comanda aberta — recebe pra atualizar UI pra "movendo
   * pra mesa X"; destino pode estar livre, ainda assim emite pra uniformizar).
   */
  emitHostSwapRequested(slug: string, payload: WsHostSwapRequested['payload']) {
    this.server.to(`tenant:${slug}`).emit('host.swap_requested', payload);
    this.server.to(`session:${payload.sessionId}`).emit('host.swap_requested', payload);
  }

  /**
   * Routing: tenant dashboards + sessao envolvida (cliente ve "concluido"
   * ou "cancelado" sem polling). Estados intermediarios (in_progress)
   * ainda sao broadcast pra que UIs de monitoria vejam o progresso.
   */
  emitHostSwapStateChanged(slug: string, payload: WsHostSwapStateChanged['payload']) {
    this.server.to(`tenant:${slug}`).emit('host.swap_state_changed', payload);
    this.server.to(`session:${payload.sessionId}`).emit('host.swap_state_changed', payload);
  }

  /**
   * Routing: tenant dashboards (manager + waiter map flag VIP) + sala da
   * sessao (banner VIP no overlay do menu).
   */
  emitHostVipFlagged(slug: string, payload: WsHostVipFlagged['payload']) {
    this.server.to(`tenant:${slug}`).emit('host.vip_flagged', payload);
    this.server.to(`session:${payload.sessionId}`).emit('host.vip_flagged', payload);
  }

  /**
   * Round 18 (Onda 4 batch 2): broadcast pra dashboards de manager
   * quando um alerta novo é inserido na tabela `alerts` (migration
   * 045). O emit é sempre tenant-scoped para evitar vazamento
   * cross-tenant em sockets staff/customer de outros restaurantes.
   *
   * Payload: o row do alerta serializado. Inclui `actions` JSONB ja
   * parsed pro FE renderizar botoes inline sem segundo fetch.
   */
  emitAlertCreated(slug: string, alert: Record<string, unknown>) {
    this.server.to(`tenant:${slug}:manager`).emit('alert.created', alert);
  }
}
