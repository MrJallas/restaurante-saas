/**
 * Fatia M5 da timeline — testes da MONTAGEM dos ctx/joins do backfill
 * (funções puras row-com-join → args dos mappers). Os mappers em si já são
 * cobertos por timeline-mappers.test.ts — aqui o alvo é o WIRING: cada
 * coluna joinada cai no campo de ctx certo, e rows sem âncora de sessão
 * (late_arrival/complaints/courtesies com sessão NULL) não geram entry.
 * I/O (pg/Mongo) fica fora — a prova viva do script é do auditor.
 */

import {
  BACKFILL_SOURCES,
  complaintRowToEntries,
  courtesyRowToEntries,
  lateArrivalRowToEntries,
  orderDeliveryRowToEntries,
  orderRowToEntries,
  orderStatusHistoryRowToEntries,
  paymentRowToEntries,
  pickLegacyResolvedName,
  sessionFlagRowToEntries,
  sessionParticipantRowToEntries,
  tableMergeRowToEntries,
  tableSessionRowToEntries,
  waiterCallRowToEntries,
} from './backfill-sources';

const STAFF_UUID = '320de62c-073f-4e50-9f68-f5e9064c8bab';
const CUSTOMER_UUID = '5ec9ccc0-e294-4d14-880b-95e842689a01';
const SESSION_ID = '7cc9f73e-a45d-4dac-aa9e-40146a7b7d76';

describe('pickLegacyResolvedName', () => {
  it('join de staff casou (label era UUID) → nome do staff', () => {
    expect(pickLegacyResolvedName(STAFF_UUID, 'Renata', 'Caleb')).toBe('Renata');
  });

  it("label 'customer' → nome resolvido via visit→customer", () => {
    expect(pickLegacyResolvedName('customer', null, 'Caleb')).toBe('Caleb');
  });

  it('labels de role/sistema → sem nome (mapper preserva o label em reason)', () => {
    expect(pickLegacyResolvedName('cozinha', null, 'Caleb')).toBeNull();
    expect(pickLegacyResolvedName('system:ttl-4h', null, null)).toBeNull();
    expect(pickLegacyResolvedName(null, null, null)).toBeNull();
  });
});

describe('tableSessionRowToEntries', () => {
  it('host_name → session.opened; closed_by UUID + join → session.closed com nome', () => {
    const entries = tableSessionRowToEntries({
      id: SESSION_ID,
      closed_by: STAFF_UUID,
      created_at: '2026-07-04T11:16:04.632Z',
      closed_at: '2026-07-04T16:59:30.004Z',
      host_customer_id: CUSTOMER_UUID,
      host_name: 'Caleb',
      closed_by_name: 'Renata',
    });
    expect(entries[0].actor).toEqual({ type: 'customer', id: CUSTOMER_UUID, name: 'Caleb' });
    expect(entries[1].actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
  });

  it("closed_by label ('system:ttl-4h') → nome NÃO vaza pro actor system", () => {
    const entries = tableSessionRowToEntries({
      id: SESSION_ID,
      closed_by: 'system:ttl-4h',
      created_at: '2026-07-04T11:16:04.632Z',
      closed_at: '2026-07-04T16:59:30.004Z',
      host_customer_id: null,
      host_name: null,
      closed_by_name: null,
    });
    expect(entries[1].actor).toEqual({ type: 'system', id: null, name: null });
    expect(entries[1].payload.reason).toBe('system:ttl-4h');
  });
});

describe('sessionParticipantRowToEntries', () => {
  it('customer_name e approved_by_name (FK de customers) caem nos ctx certos', () => {
    const entries = sessionParticipantRowToEntries({
      id: '4716762f-d333-45fd-86b9-bf3f506b9021',
      table_session_id: SESSION_ID,
      customer_id: CUSTOMER_UUID,
      joined_at: '2026-07-04T11:16:04.632Z',
      approved_at: '2026-07-04T11:17:00.000Z',
      approved_by: '76e0565a-9f80-4c89-b008-4ae0be07d095',
      customer_name: 'Caleb',
      approved_by_name: 'Ana',
    });
    expect(entries[0].actor.name).toBe('Caleb');
    expect(entries[1].actor.name).toBe('Ana');
  });
});

describe('orderRowToEntries', () => {
  const base = {
    id: '33253a01-0aca-4881-8f0c-95fe368a50b8',
    table_session_id: SESSION_ID,
    billing_mode: 'table',
    total_cents: 10000,
    created_at: '2026-07-04T11:16:04.632Z',
  };

  it('created_by UUID de staff → resolvedName = staff_name do join', () => {
    const [entry] = orderRowToEntries({
      ...base,
      created_by: STAFF_UUID,
      staff_name: 'Renata',
      customer_name: null,
    });
    expect(entry.actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
  });

  it("created_by 'customer' → resolvedName via visit→customer", () => {
    const [entry] = orderRowToEntries({
      ...base,
      created_by: 'customer',
      staff_name: null,
      customer_name: 'Caleb',
    });
    expect(entry.actor).toEqual({ type: 'customer', id: null, name: 'Caleb' });
  });

  it("created_by 'qa' (label real) → sem nome, label preservado em reason", () => {
    const [entry] = orderRowToEntries({
      ...base,
      created_by: 'qa',
      staff_name: null,
      customer_name: 'Caleb',
    });
    expect(entry.actor).toEqual({ type: 'system', id: null, name: null });
    expect(entry.payload.reason).toBe('qa');
  });
});

describe('orderStatusHistoryRowToEntries', () => {
  it('sessionId vem do join com orders; resolvedName do join de staff', () => {
    const [entry] = orderStatusHistoryRowToEntries({
      id: 'bd1d5688-705c-4f4f-8483-3dbe71e1684a',
      order_id: '33253a01-0aca-4881-8f0c-95fe368a50b8',
      from_status: 'in_transit',
      to_status: 'delivered',
      changed_by: STAFF_UUID,
      created_at: '2026-07-04T16:02:56.321Z',
      session_id: SESSION_ID,
      staff_name: 'Renata',
      customer_name: null,
    });
    expect(entry.sessionId).toBe(SESSION_ID);
    expect(entry.actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
  });
});

describe('orderDeliveryRowToEntries', () => {
  it('called_by_name e claimed_by_name caem nas fases certas', () => {
    const entries = orderDeliveryRowToEntries({
      id: 'b00ad180-f1d4-4649-8966-dc6f85d6dd7a',
      order_id: 'f58f47f9-27c0-484f-90a7-90959084ecb9',
      claimed_by: STAFF_UUID,
      claimed_at: '2026-07-04T17:08:00.000Z',
      delivered_at: '2026-07-04T17:12:30.500Z',
      created_at: '2026-07-04T17:06:51.935Z',
      called_by: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
      called_at: '2026-07-04T17:06:51.935Z',
      target_waiter_id: null,
      session_id: SESSION_ID,
      called_by_name: 'Cozinha Chefe',
      claimed_by_name: 'Marcos',
    });
    expect(entries.map((e) => [e.kind, e.sessionId, e.actor.name])).toEqual([
      ['delivery.called', SESSION_ID, 'Cozinha Chefe'],
      ['delivery.claimed', SESSION_ID, 'Marcos'],
      ['delivery.delivered', SESSION_ID, 'Marcos'],
    ]);
  });
});

describe('waiterCallRowToEntries', () => {
  it('customer_name e acknowledged_by_name wired', () => {
    const entries = waiterCallRowToEntries({
      id: 'f0e8d6a5-c1b6-4c65-a63a-ef2825f24628',
      table_session_id: SESSION_ID,
      acknowledged_by: STAFF_UUID,
      acknowledged_at: '2026-07-04T04:26:10.000Z',
      created_at: '2026-07-04T04:25:41.568Z',
      reason: 'ask_bill',
      customer_id: CUSTOMER_UUID,
      eta_minutes: 5,
      customer_name: 'Caleb',
      acknowledged_by_name: 'Marcos',
    });
    expect(entries[0].actor).toEqual({ type: 'customer', id: CUSTOMER_UUID, name: 'Caleb' });
    expect(entries[1].actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Marcos' });
  });
});

describe('paymentRowToEntries', () => {
  const base = {
    id: '6f49c169-9dfe-47bc-b0b4-b899244d1b42',
    table_session_id: SESSION_ID,
    amount_cents: 9780,
    method: 'pix',
    paid_at: '2026-05-09T03:06:38.526Z',
    created_at: '2026-05-09T03:06:38.474Z',
    split_mode: 'equal',
    visit_customer_id: CUSTOMER_UUID,
    customer_name: 'Caleb',
  };

  it('confirmed → 1 entry com customer resolvido via visit→customer', () => {
    const entries = paymentRowToEntries({ ...base, status: 'confirmed' });
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toEqual({ type: 'customer', id: CUSTOMER_UUID, name: 'Caleb' });
  });

  it('não-confirmado → [] (timeline só registra o ATO de pagar)', () => {
    expect(paymentRowToEntries({ ...base, status: 'pending', paid_at: null })).toEqual([]);
  });
});

describe('lateArrivalRowToEntries', () => {
  const base = {
    id: 'a6b6b452-93ab-4613-b13d-e5ae923f2d34',
    table_session_id: SESSION_ID,
    customer_id: CUSTOMER_UUID,
    requested_at: '2026-05-15T20:45:24.790Z',
    expected_arrival_at: '2026-05-15T21:15:24.789Z',
    status: 'approved',
    approved_by_staff_id: STAFF_UUID,
    approved_by_customer_id: null,
    decided_at: '2026-05-15T20:46:30.012Z',
    message: null,
    created_at: '2026-05-15T20:45:24.790Z',
    requester_name: 'Ana',
    decider_staff_name: 'Renata',
    decider_customer_name: null,
  };

  it('table_session_id NULL (coluna nullable) → [] — sem âncora não entra', () => {
    expect(lateArrivalRowToEntries({ ...base, table_session_id: null })).toEqual([]);
  });

  it('deciderName prioriza staff (mesma ordem do mapper)', () => {
    const entries = lateArrivalRowToEntries(base);
    expect(entries[0].actor.name).toBe('Ana');
    expect(entries[1].actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
  });

  it('decisão de customer (host) → decider_customer_name', () => {
    const entries = lateArrivalRowToEntries({
      ...base,
      status: 'rejected',
      approved_by_staff_id: null,
      approved_by_customer_id: CUSTOMER_UUID,
      decider_staff_name: null,
      decider_customer_name: 'Caleb',
    });
    expect(entries[1].actor).toEqual({ type: 'customer', id: CUSTOMER_UUID, name: 'Caleb' });
  });
});

describe('tableMergeRowToEntries', () => {
  it('requester_name e decider_name wired', () => {
    const entries = tableMergeRowToEntries({
      id: 'e6cf1294-7664-4c58-877f-83fe6cb1b829',
      source_table_session_id: SESSION_ID,
      target_table_session_id: 'ca630d43-8d4a-4102-b5aa-15fecf6e3b6b',
      requesting_customer_id: CUSTOMER_UUID,
      decided_by_customer_id: '76e0565a-9f80-4c89-b008-4ae0be07d095',
      status: 'approved',
      message: null,
      decided_at: '2026-07-04T04:26:06.777Z',
      created_at: '2026-07-04T04:26:06.777Z',
      requester_name: 'Caleb',
      decider_name: 'Bia',
    });
    expect(entries[0].sessionId).toBe(SESSION_ID);
    expect(entries[0].actor.name).toBe('Caleb');
    expect(entries[1].actor.name).toBe('Bia');
  });
});

describe('complaintRowToEntries', () => {
  const base = {
    id: 'c5af1c2b-efbb-4deb-9008-9c24dbea1bcc',
    order_id: 'a05eeadb-42f1-4b60-8b7a-7e3cc51a37ad',
    customer_id: CUSTOMER_UUID,
    rating: 1,
    text: 'Veio frio',
    assigned_manager_id: STAFF_UUID,
    submitted_at: '2026-07-04T02:39:03.193Z',
    closed_at: null,
    created_at: '2026-07-04T02:39:03.193Z',
    problem_type: 'comida-fria',
    resolved_at: '2026-07-04T03:00:00.000Z',
    session_id: SESSION_ID,
    customer_name: 'Caleb',
    manager_name: 'Renata',
  };

  it('session_id do COALESCE(visit, order) ancora as duas fases', () => {
    const entries = complaintRowToEntries(base);
    expect(entries.map((e) => e.sessionId)).toEqual([SESSION_ID, SESSION_ID]);
    expect(entries[0].actor.name).toBe('Caleb');
    expect(entries[1].actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
  });

  it('sem visit E sem order (session_id NULL) → [] — sem âncora não entra', () => {
    expect(complaintRowToEntries({ ...base, session_id: null })).toEqual([]);
  });
});

describe('courtesyRowToEntries', () => {
  const base = {
    id: '8ddcbe59-54d0-474f-b3eb-52f320f9aa72',
    table_session_id: SESSION_ID,
    table_number: 92,
    type: 'Sobremesa',
    item: 'Quindim',
    status: 'pendente',
    manager_staff_id: STAFF_UUID,
    notes: null,
    created_at: '2026-05-28T19:33:26.512Z',
    manager_name: 'Renata',
  };

  it('manager_name wired no actor', () => {
    const entries = courtesyRowToEntries(base);
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
  });

  it('table_session_id NULL (ON DELETE SET NULL) → []', () => {
    expect(courtesyRowToEntries({ ...base, table_session_id: null })).toEqual([]);
  });
});

describe('sessionFlagRowToEntries', () => {
  const base = {
    id: '49410638-2b80-40eb-baef-98e6e6260eb4',
    table_session_id: SESSION_ID,
    flag: 'vip',
    set_by_staff_id: STAFF_UUID,
    set_by_customer_id: null,
    metadata: null,
    cleared_at: '2026-06-09T03:29:06.870Z',
    cleared_by_staff_id: STAFF_UUID,
    set_by_staff_name: 'Renata',
    set_by_customer_name: null,
    cleared_by_name: 'Renata',
    created_at: '2026-06-09T03:24:59.924Z',
  };

  it('set por staff → setByName do staff; cleared_by_name no clear', () => {
    const entries = sessionFlagRowToEntries(base);
    expect(entries[0].actor).toEqual({ type: 'staff', id: STAFF_UUID, name: 'Renata' });
    expect(entries[1].actor.name).toBe('Renata');
  });

  it('set por customer → setByName do customer', () => {
    const entries = sessionFlagRowToEntries({
      ...base,
      set_by_staff_id: null,
      set_by_customer_id: CUSTOMER_UUID,
      set_by_staff_name: null,
      set_by_customer_name: 'Caleb',
      cleared_at: null,
      cleared_by_staff_id: null,
      cleared_by_name: null,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toEqual({ type: 'customer', id: CUSTOMER_UUID, name: 'Caleb' });
  });
});

describe('BACKFILL_SOURCES (registro)', () => {
  it('cobre as 12 fontes SQL do M1, sem tabela repetida', () => {
    const tables = BACKFILL_SOURCES.map((s) => s.table);
    expect(tables).toEqual([
      'table_sessions',
      'session_participants',
      'orders',
      'order_status_history',
      'order_deliveries',
      'waiter_calls',
      'payments',
      'late_arrival_requests',
      'table_merge_requests',
      'complaints',
      'courtesies',
      'session_flags',
    ]);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it('todo baseSql seleciona da própria tabela e todo sessionWhere é parametrizado ($1)', () => {
    for (const source of BACKFILL_SOURCES) {
      expect(source.baseSql).toContain(`FROM ${source.table}`);
      expect(source.sessionWhere).toContain('$1');
      expect(source.sessionWhere.startsWith('WHERE ')).toBe(true);
    }
  });
});
