/**
 * Fatia M1 da timeline de sessão (decisão Caleb 2026-07-04): CONTRATO +
 * MAPPERS puros row→TimelineEntry, agnósticos ao event-store (Mongo entra
 * em M2+). Fixtures copiadas de rows REAIS do banco dev
 * (restaurant_dev.*, coletadas 2026-07-04) — inclusive o zoológico
 * completo de labels legacy em `changed_by` / `closed_by` / `created_by`
 * (VARCHAR misturando UUID de staff, 'system', 'customer' e labels
 * compostos tipo 'scan_verification:rejected' e 'system:ttl-4h').
 *
 * Lição do bug do inbox: o driver pg devolve timestamps como `Date`, mas
 * fixtures/JSON trafegam string — todo mapper aceita `Date | string`.
 */

import { TIMELINE_KINDS } from './timeline-kinds';
import type { TimelineEntry } from '@restaurant/shared-types';

import {
  actorFromLegacyLabel,
  compareTimelineEntries,
  mapComplaint,
  mapCourtesy,
  mapOrderCreated,
  mapOrderDelivery,
  mapOrderStatusHistory,
  mapPayment,
  mapSessionFlag,
  mapSessionParticipant,
  mapTableMergeRequest,
  mapTableSession,
  mapWaiterCall,
  WIRE_EVENT_TO_TIMELINE_KIND,
} from './timeline-mappers';

const STAFF_UUID = '320de62c-073f-4e50-9f68-f5e9064c8bab';
const SESSION_ID = '7cc9f73e-a45d-4dac-aa9e-40146a7b7d76';

// ─── actorFromLegacyLabel — o gotcha central ───────────────────────────────

describe('actorFromLegacyLabel', () => {
  it('UUID → staff com id (name só quando o caller resolveu)', () => {
    expect(actorFromLegacyLabel(STAFF_UUID)).toEqual({
      actor: { type: 'staff', id: STAFF_UUID, name: null },
    });
    expect(actorFromLegacyLabel(STAFF_UUID, 'Renata')).toEqual({
      actor: { type: 'staff', id: STAFF_UUID, name: 'Renata' },
    });
  });

  it('null/undefined/vazio → system sem reason', () => {
    for (const label of [null, undefined, '']) {
      expect(actorFromLegacyLabel(label)).toEqual({
        actor: { type: 'system', id: null, name: null },
      });
    }
  });

  // Valores REAIS de restaurant_dev.order_status_history.changed_by +
  // orders.created_by (SELECT DISTINCT em 2026-07-04). Cada um coberto.
  const CUSTOMER_LABELS = ['customer'];
  const STAFF_ROLE_LABELS = ['cozinha', 'kitchen', 'garcom', 'waiter', 'staff'];
  const SYSTEM_LABELS = [
    'system',
    'qa',
    'race-test',
    'night-e2e',
    'e2e-kitchen',
    'e2e-assistente-context',
  ];

  it.each(CUSTOMER_LABELS)("'%s' → customer sem id", (label) => {
    expect(actorFromLegacyLabel(label)).toEqual({
      actor: { type: 'customer', id: null, name: null },
    });
  });

  it.each(STAFF_ROLE_LABELS)("'%s' (role label) → staff sem id, label preservado", (label) => {
    expect(actorFromLegacyLabel(label)).toEqual({
      actor: { type: 'staff', id: null, name: null },
      reason: label,
    });
  });

  it.each(SYSTEM_LABELS)("'%s' → system com o label cru em reason", (label) => {
    expect(actorFromLegacyLabel(label)).toEqual({
      actor: { type: 'system', id: null, name: null },
      reason: label,
    });
  });

  // Valores REAIS de restaurant_dev.table_sessions.closed_by.
  const CLOSED_BY_SYSTEM_LABELS = [
    'system:ttl-4h',
    'scan_verification:rejected',
    'scan_verification:expired',
    'preflight',
    'preflight-cleanup-pre-wave2',
    'codex:test-reset',
    'codex-local-reset',
    'codex-lan-location-test-reset',
    'codex-qr-validation-reset',
    'manual-test-reset',
    'subagent-F-reset',
  ];

  it.each(CLOSED_BY_SYSTEM_LABELS)("'%s' (closed_by real) → system com reason", (label) => {
    expect(actorFromLegacyLabel(label)).toEqual({
      actor: { type: 'system', id: null, name: null },
      reason: label,
    });
  });

  it("'staff:manual_force' → staff sem id, label em reason", () => {
    expect(actorFromLegacyLabel('staff:manual_force')).toEqual({
      actor: { type: 'staff', id: null, name: null },
      reason: 'staff:manual_force',
    });
  });
});

// ─── order_status_history ──────────────────────────────────────────────────

describe('mapOrderStatusHistory', () => {
  // Row real (última do banco dev).
  const row = {
    id: 'bd1d5688-705c-4f4f-8483-3dbe71e1684a',
    order_id: '33253a01-0aca-4881-8f0c-95fe368a50b8',
    from_status: 'in_transit',
    to_status: 'delivered',
    changed_by: STAFF_UUID,
    created_at: new Date('2026-07-04T16:02:56.321Z'),
  };

  it('mapeia transição com actor staff (changed_by UUID)', () => {
    expect(mapOrderStatusHistory(row, { sessionId: SESSION_ID })).toEqual({
      id: 'osh:bd1d5688-705c-4f4f-8483-3dbe71e1684a',
      kind: 'order.status_changed',
      at: '2026-07-04T16:02:56.321Z',
      sessionId: SESSION_ID,
      actor: { type: 'staff', id: STAFF_UUID, name: null },
      refs: { orderId: '33253a01-0aca-4881-8f0c-95fe368a50b8' },
      payload: { fromStatus: 'in_transit', toStatus: 'delivered' },
    });
  });

  it('resolvedName preenche actor.name sem sujar o payload', () => {
    const entry = mapOrderStatusHistory(row, { sessionId: SESSION_ID, resolvedName: 'Renata' });
    expect(entry.actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
    expect(entry.payload).toEqual({ fromStatus: 'in_transit', toStatus: 'delivered' });
  });

  it('aceita timestamp string estilo pg (lição do inbox) e from_status null', () => {
    const entry = mapOrderStatusHistory(
      {
        ...row,
        from_status: null,
        to_status: 'received',
        changed_by: 'customer',
        created_at: '2026-07-04 16:02:56.321034+00',
      },
      { sessionId: SESSION_ID },
    );
    expect(entry.at).toBe('2026-07-04T16:02:56.321Z');
    expect(entry.actor).toEqual({ type: 'customer', id: null, name: null });
    expect(entry.payload).toEqual({ fromStatus: null, toStatus: 'received' });
  });

  it("changed_by 'cozinha' (label real) → staff sem id + reason no payload", () => {
    const entry = mapOrderStatusHistory(
      { ...row, changed_by: 'cozinha' },
      { sessionId: SESSION_ID },
    );
    expect(entry.actor).toEqual({ type: 'staff', id: null, name: null });
    expect(entry.payload.reason).toBe('cozinha');
  });
});

// ─── orders (order.created) ────────────────────────────────────────────────

describe('mapOrderCreated', () => {
  // Row real (orders, última do banco dev — created_by 'qa').
  const row = {
    id: '33253a01-0aca-4881-8f0c-95fe368a50b8',
    table_session_id: SESSION_ID,
    visit_id: null,
    billing_mode: 'table',
    status: 'delivered',
    total_cents: 10000,
    created_by: 'qa',
    created_at: new Date('2026-07-04T11:16:04.632Z'),
  };

  it('mapeia criação do pedido com totalCents e o label legacy em reason', () => {
    expect(mapOrderCreated(row)).toEqual({
      id: 'ord:33253a01-0aca-4881-8f0c-95fe368a50b8',
      kind: 'order.created',
      at: '2026-07-04T11:16:04.632Z',
      sessionId: SESSION_ID,
      actor: { type: 'system', id: null, name: null },
      refs: { orderId: '33253a01-0aca-4881-8f0c-95fe368a50b8' },
      payload: { totalCents: 10000, billingMode: 'table', reason: 'qa' },
    });
  });

  it("created_by 'customer' (144 rows reais) → actor customer", () => {
    const entry = mapOrderCreated({ ...row, created_by: 'customer' });
    expect(entry.actor).toEqual({ type: 'customer', id: null, name: null });
    expect(entry.payload).toEqual({ totalCents: 10000, billingMode: 'table' });
  });
});

// ─── order_deliveries ──────────────────────────────────────────────────────

describe('mapOrderDelivery', () => {
  // Row real: chamada de entrega pendente — called_at setado, called_by NULL
  // (o serviço só grava called_by em chamadas manuais), claimed/delivered nulos.
  const pendingRow = {
    id: 'b00ad180-f1d4-4649-8966-dc6f85d6dd7a',
    order_id: 'f58f47f9-27c0-484f-90a7-90959084ecb9',
    claimed_by: null,
    claimed_at: null,
    delivered_at: null,
    status: 'pending',
    created_at: new Date('2026-07-04T17:06:51.935Z'),
    called_by: null,
    called_at: new Date('2026-07-04T17:06:51.935Z'),
    target_waiter_id: STAFF_UUID,
  };

  it('row só com called_at → apenas delivery.called (actor system se called_by null)', () => {
    expect(mapOrderDelivery(pendingRow, { sessionId: SESSION_ID })).toEqual([
      {
        id: 'odel:b00ad180-f1d4-4649-8966-dc6f85d6dd7a:called',
        kind: 'delivery.called',
        at: '2026-07-04T17:06:51.935Z',
        sessionId: SESSION_ID,
        actor: { type: 'system', id: null, name: null },
        refs: {
          orderId: 'f58f47f9-27c0-484f-90a7-90959084ecb9',
          deliveryId: 'b00ad180-f1d4-4649-8966-dc6f85d6dd7a',
        },
        payload: { targetWaiterId: STAFF_UUID },
      },
    ]);
  });

  it('row completa → called + claimed + delivered, cada fase com seu at e actor', () => {
    const fullRow = {
      ...pendingRow,
      called_by: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
      claimed_by: STAFF_UUID,
      claimed_at: '2026-07-04 17:08:00.000+00',
      delivered_at: '2026-07-04 17:12:30.500+00',
      status: 'delivered',
    };
    const entries = mapOrderDelivery(fullRow, {
      sessionId: SESSION_ID,
      claimedByName: 'Marcos',
    });
    expect(entries.map((e) => e.kind)).toEqual([
      'delivery.called',
      'delivery.claimed',
      'delivery.delivered',
    ]);
    expect(entries[0].actor).toEqual({
      type: 'staff',
      id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
      name: null,
    });
    expect(entries[1]).toMatchObject({
      id: 'odel:b00ad180-f1d4-4649-8966-dc6f85d6dd7a:claimed',
      at: '2026-07-04T17:08:00.000Z',
      actor: { type: 'staff', id: STAFF_UUID, name: 'Marcos' },
    });
    expect(entries[2]).toMatchObject({
      id: 'odel:b00ad180-f1d4-4649-8966-dc6f85d6dd7a:delivered',
      at: '2026-07-04T17:12:30.500Z',
      actor: { type: 'staff', id: STAFF_UUID, name: 'Marcos' },
    });
  });
});

// ─── waiter_calls ──────────────────────────────────────────────────────────

describe('mapWaiterCall', () => {
  // Row real: chamado pendente, customer_id NULL (chamada anônima da mesa).
  const pendingRow = {
    id: 'f0e8d6a5-c1b6-4c65-a63a-ef2825f24628',
    table_session_id: 'cb101972-218d-455f-88cf-fd368df814a8',
    status: 'pending',
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: new Date('2026-07-04T04:25:41.568Z'),
    reason: 'ask_bill',
    customer_id: null,
    visit_id: null,
    resolved_at: null,
    cancelled_at: null,
    assigned_waiter_name: null,
    eta_minutes: null,
  };

  it('chamado pendente → só waiter.called, actor customer mesmo sem id', () => {
    expect(mapWaiterCall(pendingRow)).toEqual([
      {
        id: 'wcall:f0e8d6a5-c1b6-4c65-a63a-ef2825f24628',
        kind: 'waiter.called',
        at: '2026-07-04T04:25:41.568Z',
        sessionId: 'cb101972-218d-455f-88cf-fd368df814a8',
        actor: { type: 'customer', id: null, name: null },
        refs: { callId: 'f0e8d6a5-c1b6-4c65-a63a-ef2825f24628' },
        payload: { reason: 'ask_bill' },
      },
    ]);
  });

  it('acknowledged_at → segundo entry waiter.acknowledged com actor staff', () => {
    const entries = mapWaiterCall(
      {
        ...pendingRow,
        status: 'resolved',
        customer_id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
        acknowledged_by: STAFF_UUID,
        acknowledged_at: '2026-07-04 04:26:10.000+00',
        eta_minutes: 5,
      },
      { customerName: 'Caleb', acknowledgedByName: 'Marcos' },
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].actor).toEqual({
      type: 'customer',
      id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
      name: 'Caleb',
    });
    expect(entries[1]).toMatchObject({
      id: 'wcall:f0e8d6a5-c1b6-4c65-a63a-ef2825f24628:acknowledged',
      kind: 'waiter.acknowledged',
      at: '2026-07-04T04:26:10.000Z',
      actor: { type: 'staff', id: STAFF_UUID, name: 'Marcos' },
      refs: { callId: 'f0e8d6a5-c1b6-4c65-a63a-ef2825f24628' },
      payload: { etaMinutes: 5 },
    });
  });
});

// ─── payments ──────────────────────────────────────────────────────────────

describe('mapPayment', () => {
  // Row real: pix confirmado com split equal.
  const confirmedRow = {
    id: '6f49c169-9dfe-47bc-b0b4-b899244d1b42',
    table_session_id: '43cbaf65-26e6-4bc5-a8c2-6b33203dd986',
    visit_id: '964f4deb-e8a0-4115-ac9d-376431cbb387',
    amount_cents: 9780,
    status: 'confirmed',
    method: 'pix',
    paid_at: new Date('2026-05-09T03:06:38.526Z'),
    created_at: new Date('2026-05-09T03:06:38.474Z'),
    cancelled_at: null,
    split_mode: 'equal',
  };

  it('status confirmed → payment.confirmed com at = paid_at (não created_at)', () => {
    expect(mapPayment(confirmedRow)).toEqual({
      id: 'pay:6f49c169-9dfe-47bc-b0b4-b899244d1b42',
      kind: 'payment.confirmed',
      at: '2026-05-09T03:06:38.526Z',
      sessionId: '43cbaf65-26e6-4bc5-a8c2-6b33203dd986',
      actor: { type: 'customer', id: null, name: null },
      refs: { paymentId: '6f49c169-9dfe-47bc-b0b4-b899244d1b42' },
      payload: { amountCents: 9780, method: 'pix', splitMode: 'equal' },
    });
  });

  it('customer resolvido via ctx (payments não tem customer_id — só visit_id)', () => {
    const entry = mapPayment(confirmedRow, {
      customerId: '5ec9ccc0-e294-4d14-880b-95e842689a01',
      customerName: 'Caleb',
    });
    expect(entry?.actor).toEqual({
      type: 'customer',
      id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
      name: 'Caleb',
    });
  });

  it.each(['pending', 'cancelled', 'expired', 'failed', 'refunded'])(
    'status %s (não-confirmado) → null — timeline só registra o ATO de pagar',
    (status) => {
      expect(mapPayment({ ...confirmedRow, status, paid_at: null })).toBeNull();
    },
  );
});

// ─── session_participants ──────────────────────────────────────────────────

describe('mapSessionParticipant', () => {
  // Row real: participante approved SEM approved_at/approved_by (host
  // auto-aprova o próprio join) → só o entry de joined.
  const autoApprovedRow = {
    id: '4716762f-d333-45fd-86b9-bf3f506b9021',
    table_session_id: SESSION_ID,
    customer_id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
    visit_id: '90f5d2d9-9343-48ba-8da1-e9f7993c65e3',
    joined_at: new Date('2026-07-04T11:16:04.632Z'),
    left_at: null,
    status: 'approved',
    approved_at: null,
    approved_by: null,
    rejected_at: null,
  };

  it('sem approved_at → só participant.joined (actor customer)', () => {
    expect(mapSessionParticipant(autoApprovedRow, { customerName: 'Caleb' })).toEqual([
      {
        id: 'part:4716762f-d333-45fd-86b9-bf3f506b9021',
        kind: 'participant.joined',
        at: '2026-07-04T11:16:04.632Z',
        sessionId: SESSION_ID,
        actor: {
          type: 'customer',
          id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
          name: 'Caleb',
        },
        refs: {},
        payload: {},
      },
    ]);
  });

  it('approved_at + approved_by → segundo entry participant.approved (actor staff)', () => {
    const entries = mapSessionParticipant({
      ...autoApprovedRow,
      approved_at: '2026-07-04 11:17:00.000+00',
      approved_by: STAFF_UUID,
    });
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      id: 'part:4716762f-d333-45fd-86b9-bf3f506b9021:approved',
      kind: 'participant.approved',
      at: '2026-07-04T11:17:00.000Z',
      actor: { type: 'staff', id: STAFF_UUID, name: null },
    });
  });
});

// ─── table_merge_requests ──────────────────────────────────────────────────

describe('mapTableMergeRequest', () => {
  // Row real: staff override aprovado no MESMO instante do create
  // (created_at == decided_at) e sem decided_by_customer_id.
  const approvedRow = {
    id: 'e6cf1294-7664-4c58-877f-83fe6cb1b829',
    source_table_session_id: 'cb101972-218d-455f-88cf-fd368df814a8',
    target_table_session_id: 'ca630d43-8d4a-4102-b5aa-15fecf6e3b6b',
    requesting_customer_id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
    target_customer_id: null,
    decided_by_customer_id: null,
    status: 'approved',
    message: 'STAFF OVERRIDE · validacao 1D schema real',
    decided_at: new Date('2026-07-04T04:26:06.777Z'),
    created_at: new Date('2026-07-04T04:26:06.777Z'),
  };

  it('requested + approved; decisão sem customer → actor system', () => {
    const entries = mapTableMergeRequest(approvedRow);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: 'merge:e6cf1294-7664-4c58-877f-83fe6cb1b829',
      kind: 'merge.requested',
      at: '2026-07-04T04:26:06.777Z',
      sessionId: 'cb101972-218d-455f-88cf-fd368df814a8',
      actor: {
        type: 'customer',
        id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
        name: null,
      },
      refs: { requestId: 'e6cf1294-7664-4c58-877f-83fe6cb1b829' },
      payload: {
        targetSessionId: 'ca630d43-8d4a-4102-b5aa-15fecf6e3b6b',
        message: 'STAFF OVERRIDE · validacao 1D schema real',
      },
    });
    expect(entries[1]).toMatchObject({
      id: 'merge:e6cf1294-7664-4c58-877f-83fe6cb1b829:approved',
      kind: 'merge.approved',
      at: '2026-07-04T04:26:06.777Z',
      actor: { type: 'system', id: null, name: null },
    });
  });

  it('approved decidido por customer → actor customer', () => {
    const entries = mapTableMergeRequest(
      { ...approvedRow, decided_by_customer_id: '76e0565a-9f80-4c89-b008-4ae0be07d095' },
      { deciderName: 'Bia' },
    );
    expect(entries[1].actor).toEqual({
      type: 'customer',
      id: '76e0565a-9f80-4c89-b008-4ae0be07d095',
      name: 'Bia',
    });
  });

  it('expired → merge.rejected com reason expired', () => {
    const entries = mapTableMergeRequest({ ...approvedRow, status: 'expired' });
    expect(entries[1]).toMatchObject({
      kind: 'merge.rejected',
      payload: { reason: 'expired' },
    });
  });

  it('rejected → merge.rejected sem reason de expiração', () => {
    const entries = mapTableMergeRequest({
      ...approvedRow,
      status: 'rejected',
      decided_by_customer_id: '76e0565a-9f80-4c89-b008-4ae0be07d095',
    });
    expect(entries[1].kind).toBe('merge.rejected');
    expect(entries[1].payload.reason).toBeUndefined();
  });
});

// ─── complaints ────────────────────────────────────────────────────────────

describe('mapComplaint', () => {
  // Row real: reclamação pending_review (rating 1, sem resolução).
  const pendingRow = {
    id: 'c5af1c2b-efbb-4deb-9008-9c24dbea1bcc',
    order_id: 'a05eeadb-42f1-4b60-8b7a-7e3cc51a37ad',
    customer_id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
    visit_id: '7ce45aba-9769-4405-a0a5-812f5991d373',
    rating: 1,
    text: 'Veio frio e demorou demais',
    status: 'pending_review',
    assigned_manager_id: null,
    submitted_at: new Date('2026-07-04T02:39:03.193Z'),
    closed_at: null,
    created_at: new Date('2026-07-04T02:39:03.193Z'),
    problem_type: null,
    resolved_at: null,
  };

  it('pending → só complaint.received (actor customer, refs.orderId)', () => {
    expect(mapComplaint(pendingRow, { sessionId: SESSION_ID, customerName: 'Caleb' })).toEqual([
      {
        id: 'comp:c5af1c2b-efbb-4deb-9008-9c24dbea1bcc',
        kind: 'complaint.received',
        at: '2026-07-04T02:39:03.193Z',
        sessionId: SESSION_ID,
        actor: {
          type: 'customer',
          id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
          name: 'Caleb',
        },
        refs: { orderId: 'a05eeadb-42f1-4b60-8b7a-7e3cc51a37ad' },
        payload: { rating: 1, problemType: null, text: 'Veio frio e demorou demais' },
      },
    ]);
  });

  it('resolved_at → complaint.resolved com actor = manager designado', () => {
    const entries = mapComplaint(
      {
        ...pendingRow,
        status: 'closed',
        assigned_manager_id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
        resolved_at: '2026-07-04 03:00:00.000+00',
      },
      { sessionId: SESSION_ID, managerName: 'Renata' },
    );
    expect(entries[1]).toMatchObject({
      id: 'comp:c5af1c2b-efbb-4deb-9008-9c24dbea1bcc:resolved',
      kind: 'complaint.resolved',
      at: '2026-07-04T03:00:00.000Z',
      actor: {
        type: 'staff',
        id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
        name: 'Renata',
      },
    });
  });

  it('closed_at sem resolved_at (rows legacy) também fecha a reclamação', () => {
    const entries = mapComplaint(
      { ...pendingRow, status: 'closed', closed_at: new Date('2026-07-04T04:00:00.000Z') },
      { sessionId: SESSION_ID },
    );
    expect(entries[1]).toMatchObject({
      kind: 'complaint.resolved',
      at: '2026-07-04T04:00:00.000Z',
      actor: { type: 'system', id: null, name: null },
    });
  });
});

// ─── courtesies ────────────────────────────────────────────────────────────

describe('mapCourtesy', () => {
  // Row real: cortesia Sobremesa pendente criada pela gerente.
  const row = {
    id: '8ddcbe59-54d0-474f-b3eb-52f320f9aa72',
    table_session_id: '7ad0c4d5-7382-4ee1-92f5-fc2ba8dc3a7c',
    table_number: 92,
    type: 'Sobremesa',
    item: 'Quindim Histórico QA',
    status: 'pendente',
    manager_staff_id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
    notes: 'Histórico fica no Mongo',
    created_at: new Date('2026-05-28T19:33:26.512Z'),
  };

  it('mapeia courtesy.created com actor = manager', () => {
    expect(mapCourtesy(row, { managerName: 'Renata' })).toEqual({
      id: 'court:8ddcbe59-54d0-474f-b3eb-52f320f9aa72',
      kind: 'courtesy.created',
      at: '2026-05-28T19:33:26.512Z',
      sessionId: '7ad0c4d5-7382-4ee1-92f5-fc2ba8dc3a7c',
      actor: {
        type: 'staff',
        id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
        name: 'Renata',
      },
      refs: {},
      payload: {
        type: 'Sobremesa',
        item: 'Quindim Histórico QA',
        status: 'pendente',
        tableNumber: 92,
        notes: 'Histórico fica no Mongo',
      },
    });
  });
});

// ─── table_sessions ────────────────────────────────────────────────────────

describe('mapTableSession', () => {
  // Row real: sessão fechada pelo TTL de 4h ('system:ttl-4h').
  const closedRow = {
    id: SESSION_ID,
    table_id: '859461eb-1591-426d-a28d-2be4ac35b560',
    status: 'closed',
    closed_by: 'system:ttl-4h',
    created_at: new Date('2026-07-04T11:16:04.632Z'),
    closed_at: new Date('2026-07-04T16:59:30.004Z'),
    host_customer_id: null,
  };

  it('fechada → opened + closed; label composto vira payload.reason', () => {
    const entries = mapTableSession(closedRow);
    expect(entries).toEqual([
      {
        id: `sess:${SESSION_ID}:opened`,
        kind: 'session.opened',
        at: '2026-07-04T11:16:04.632Z',
        sessionId: SESSION_ID,
        actor: { type: 'system', id: null, name: null },
        refs: {},
        payload: {},
      },
      {
        id: `sess:${SESSION_ID}:closed`,
        kind: 'session.closed',
        at: '2026-07-04T16:59:30.004Z',
        sessionId: SESSION_ID,
        actor: { type: 'system', id: null, name: null },
        refs: {},
        payload: { reason: 'system:ttl-4h' },
      },
    ]);
  });

  it('host_customer_id → session.opened com actor customer (host)', () => {
    const entries = mapTableSession(
      {
        ...closedRow,
        host_customer_id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
        closed_at: null,
        closed_by: null,
        status: 'active',
      },
      { hostName: 'Caleb' },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toEqual({
      type: 'customer',
      id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
      name: 'Caleb',
    });
  });

  it("closed_by 'staff:manual_force' (real) → actor staff sem id + reason", () => {
    const entries = mapTableSession({ ...closedRow, closed_by: 'staff:manual_force' });
    expect(entries[1].actor).toEqual({ type: 'staff', id: null, name: null });
    expect(entries[1].payload.reason).toBe('staff:manual_force');
  });

  it('closed_at sem closed_by (593 rows reais) → actor system sem reason', () => {
    const entries = mapTableSession({ ...closedRow, closed_by: null });
    expect(entries[1].actor).toEqual({ type: 'system', id: null, name: null });
    expect(entries[1].payload.reason).toBeUndefined();
  });
});

// ─── session_flags ─────────────────────────────────────────────────────────

describe('mapSessionFlag', () => {
  // Row real: flag vip setada e depois limpa pela mesma staff.
  const row = {
    id: '49410638-2b80-40eb-baef-98e6e6260eb4',
    table_session_id: '2bd7285d-8a81-45b6-8de7-22478c5b79b4',
    flag: 'vip',
    set_by_staff_id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
    set_by_customer_id: null,
    metadata: { reason: 'screenshot validation' },
    cleared_at: new Date('2026-06-09T03:29:06.870Z'),
    cleared_by_staff_id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
    created_at: new Date('2026-06-09T03:24:59.924Z'),
  };

  it('set + clear → dois session.flag_changed (cleared true no segundo)', () => {
    const entries = mapSessionFlag(row, { setByName: 'Renata' });
    expect(entries).toEqual([
      {
        id: 'flag:49410638-2b80-40eb-baef-98e6e6260eb4',
        kind: 'session.flag_changed',
        at: '2026-06-09T03:24:59.924Z',
        sessionId: '2bd7285d-8a81-45b6-8de7-22478c5b79b4',
        actor: {
          type: 'staff',
          id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
          name: 'Renata',
        },
        refs: {},
        payload: { flag: 'vip', cleared: false, metadata: { reason: 'screenshot validation' } },
      },
      {
        id: 'flag:49410638-2b80-40eb-baef-98e6e6260eb4:cleared',
        kind: 'session.flag_changed',
        at: '2026-06-09T03:29:06.870Z',
        sessionId: '2bd7285d-8a81-45b6-8de7-22478c5b79b4',
        actor: {
          type: 'staff',
          id: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
          name: null,
        },
        refs: {},
        payload: { flag: 'vip', cleared: true },
      },
    ]);
  });

  it('flag ativa (cleared_at null) → um entry; set_by_customer_id → actor customer', () => {
    const entries = mapSessionFlag({
      ...row,
      cleared_at: null,
      cleared_by_staff_id: null,
      set_by_staff_id: null,
      set_by_customer_id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toEqual({
      type: 'customer',
      id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
      name: null,
    });
  });
});

// ─── comparator (desempate determinístico) ─────────────────────────────────

describe('compareTimelineEntries', () => {
  const base: TimelineEntry = {
    id: 'osh:aaa',
    kind: 'order.status_changed',
    at: '2026-07-04T12:00:00.000Z',
    sessionId: SESSION_ID,
    actor: { type: 'system', id: null, name: null },
    refs: {},
    payload: {},
  };

  it('ordena por at ASC primeiro', () => {
    const earlier = { ...base, at: '2026-07-04T11:59:59.999Z' };
    expect(compareTimelineEntries(earlier, base)).toBeLessThan(0);
    expect(compareTimelineEntries(base, earlier)).toBeGreaterThan(0);
  });

  it('timestamps IGUAIS → desempata pela prioridade causal do kind', () => {
    const opened: TimelineEntry = { ...base, id: 'sess:x:opened', kind: 'session.opened' };
    const closed: TimelineEntry = { ...base, id: 'sess:x:closed', kind: 'session.closed' };
    const payment: TimelineEntry = { ...base, id: 'pay:x', kind: 'payment.confirmed' };
    // sessão abre antes do pedido; pagamento antes do fechamento; fechamento por último
    expect(compareTimelineEntries(opened, base)).toBeLessThan(0);
    expect(compareTimelineEntries(base, payment)).toBeLessThan(0);
    expect(compareTimelineEntries(payment, closed)).toBeLessThan(0);
  });

  it('at e kind IGUAIS → desempata por id ASC (estável entre execuções)', () => {
    const a = { ...base, id: 'osh:aaa' };
    const b = { ...base, id: 'osh:bbb' };
    expect(compareTimelineEntries(a, b)).toBeLessThan(0);
    expect(compareTimelineEntries(b, a)).toBeGreaterThan(0);
    expect(compareTimelineEntries(a, { ...a })).toBe(0);
  });

  it('caso real: merge staff-override tem created_at == decided_at — requested vem antes', () => {
    const [requested, approved] = mapTableMergeRequest({
      id: 'e6cf1294-7664-4c58-877f-83fe6cb1b829',
      source_table_session_id: 'cb101972-218d-455f-88cf-fd368df814a8',
      target_table_session_id: 'ca630d43-8d4a-4102-b5aa-15fecf6e3b6b',
      requesting_customer_id: '5ec9ccc0-e294-4d14-880b-95e842689a01',
      target_customer_id: null,
      decided_by_customer_id: null,
      status: 'approved',
      message: null,
      decided_at: new Date('2026-07-04T04:26:06.777Z'),
      created_at: new Date('2026-07-04T04:26:06.777Z'),
    });
    expect([approved, requested].sort(compareTimelineEntries)).toEqual([requested, approved]);
  });
});

// ─── tabela wire→kind ──────────────────────────────────────────────────────

describe('WIRE_EVENT_TO_TIMELINE_KIND', () => {
  it('todo valor da tabela é um TimelineKind do enum fechado', () => {
    for (const kind of Object.values(WIRE_EVENT_TO_TIMELINE_KIND)) {
      expect(TIMELINE_KINDS).toContain(kind);
    }
  });

  it('mapeia os wire names existentes pros kinds da timeline', () => {
    expect(WIRE_EVENT_TO_TIMELINE_KIND['order:status']).toBe('order.status_changed');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['order:handoff_called']).toBe('delivery.called');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['order:claimed']).toBe('delivery.claimed');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['waiter:call']).toBe('waiter.called');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['waiter:acknowledged']).toBe('waiter.acknowledged');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['table_merge.created']).toBe('merge.requested');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['table_merge.approved']).toBe('merge.approved');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['table_merge.rejected']).toBe('merge.rejected');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['complaint.received']).toBe('complaint.received');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['complaint.resolved']).toBe('complaint.resolved');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['courtesy.created']).toBe('courtesy.created');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['session.flag_changed']).toBe('session.flag_changed');
    expect(WIRE_EVENT_TO_TIMELINE_KIND['host.table_liberated']).toBe('session.closed');
    // M4: wire nascido no M3 (payments não emitia nada quando a tabela foi
    // escrita no M1) — entrou junto com o tap.
    expect(WIRE_EVENT_TO_TIMELINE_KIND['payment.confirmed']).toBe('payment.confirmed');
  });
});
