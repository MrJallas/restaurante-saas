/**
 * M4 (timeline) — contrato do tap (wireName, payload, slug) → TimelineEntry.
 *
 * O que este arquivo fixa, por família mapeável no WIRE_EVENT_TO_TIMELINE_KIND:
 *  - id determinístico DO PAYLOAD (regras documentadas no service): onde o
 *    payload carrega o pk da row de origem, o id CONVERGE com o do mapper SQL
 *    do M1 (`wcall:`, `la:`, `merge:`, `comp:`, `court:`, `pay:`, `odel:`,
 *    `sess:`) — um backfill futuro upserta no MESMO doc; onde não carrega,
 *    prefixo `ws:` + chaves naturais do payload.
 *  - at = timestamp do ATO vindo do payload (timestamp/occurredAt/decidedAt/
 *    confirmedAt/createdAt/liberatedAt — M2/M3 garantem), fallback now().
 *  - actor derivado dos campos server-side do M2 (changedBy/acknowledgedBy/
 *    decidedByCustomerId/calledBy/by...); ausente → system {id:null,name:null}.
 *  - sessionId = âncora do payload (tableSessionId | originSessionId |
 *    sessionId conforme família); SEM âncora → no-op (entrada sem âncora não
 *    entra).
 *  - LGPD: payload da entry SÓ com campos estruturados — texto livre
 *    (description/visitContext/notes/reason-livre) NUNCA é copiado.
 *  - Fire-and-forget: record() é sync (void), nunca explode nem com Mongo off.
 */

import { TimelineTapService } from './timeline-tap.service';
import { TimelineStoreService } from './timeline-store.service';
import type { TimelineEntry } from '@restaurant/shared-types';
import type { MongoService } from '../../infra/mongo/mongo.service';

const SLUG = 'resto_dev';

function makeTap() {
  const recorded: Array<{ entry: TimelineEntry; tenantId: string }> = [];
  const store = {
    record: jest.fn(async (entry: TimelineEntry, tenantId: string) => {
      recorded.push({ entry, tenantId });
    }),
  } as unknown as TimelineStoreService;
  const tap = new TimelineTapService(store);
  return { tap, recorded };
}

/** O tap é fire-and-forget — drena a microtask queue antes de asserir. */
const flush = () => new Promise(process.nextTick);

async function tapOne(wire: string, payload: object): Promise<TimelineEntry> {
  const { tap, recorded } = makeTap();
  tap.record(wire as never, payload, SLUG);
  await flush();
  expect(recorded).toHaveLength(1);
  expect(recorded[0].tenantId).toBe(SLUG);
  return recorded[0].entry;
}

async function tapNone(wire: string, payload: object): Promise<void> {
  const { tap, recorded } = makeTap();
  tap.record(wire as never, payload, SLUG);
  await flush();
  expect(recorded).toHaveLength(0);
}

describe('TimelineTapService — uma entrada correta por família mapeável', () => {
  it('order:status → order.status_changed · id ws:order:status:<orderId>:<status>:<at> · actor de changedBy', async () => {
    const entry = await tapOne('order:status', {
      orderId: 'o-1',
      status: 'preparing',
      tableLabel: 'Mesa 7',
      tableSessionId: 'ts-1',
      changedBy: { type: 'staff', id: 'staff-7' },
      timestamp: '2026-07-04T12:00:00.000Z',
    });
    expect(entry).toEqual({
      id: 'ws:order:status:o-1:preparing:2026-07-04T12:00:00.000Z',
      kind: 'order.status_changed',
      at: '2026-07-04T12:00:00.000Z',
      sessionId: 'ts-1',
      actor: { type: 'staff', id: 'staff-7', name: null },
      refs: { orderId: 'o-1' },
      payload: { toStatus: 'preparing' },
    });
  });

  it('order:status SEM changedBy → actor system', async () => {
    const entry = await tapOne('order:status', {
      orderId: 'o-2',
      status: 'ready',
      tableSessionId: 'ts-1',
      timestamp: '2026-07-04T12:01:00.000Z',
    });
    expect(entry.actor).toEqual({ type: 'system', id: null, name: null });
  });

  it('order:status COM historyId → id osh:<historyId> (CONVERGE com backfill M5)', async () => {
    const entry = await tapOne('order:status', {
      orderId: 'o-1b',
      status: 'preparing',
      tableSessionId: 'ts-1',
      changedBy: { type: 'staff', id: 'staff-7' },
      historyId: 'osh-42',
      timestamp: '2026-07-04T12:00:30.000Z',
    });
    // pk natural presente → id da row de order_status_history (mesmo do M1
    // `osh:<pk>`), NÃO o fallback ws:*. O resto do shape é intocado.
    expect(entry.id).toBe('osh:osh-42');
    expect(entry.kind).toBe('order.status_changed');
    expect(entry.at).toBe('2026-07-04T12:00:30.000Z');
    expect(entry.sessionId).toBe('ts-1');
    expect(entry.actor).toEqual({ type: 'staff', id: 'staff-7', name: null });
    expect(entry.refs).toEqual({ orderId: 'o-1b' });
    expect(entry.payload).toEqual({ toStatus: 'preparing' });
  });

  it('order:status SEM historyId → fallback ws:order:status:<orderId>:<status>:<at> (caminho KDS sem osh)', async () => {
    const entry = await tapOne('order:status', {
      orderId: 'o-1c',
      status: 'ready',
      tableSessionId: 'ts-1',
      timestamp: '2026-07-04T12:00:45.000Z',
    });
    expect(entry.id).toBe('ws:order:status:o-1c:ready:2026-07-04T12:00:45.000Z');
  });

  it('order:handoff_called → delivery.called · id odel:<deliveryId>:called (converge com M1) · calledBy null → system', async () => {
    const entry = await tapOne('order:handoff_called', {
      orderId: 'o-3',
      deliveryId: 'del-3',
      tableLabel: 'Mesa 4',
      tableCode: 'M4',
      targetWaiterId: 'w-1',
      tableSessionId: 'ts-3',
      calledBy: null,
      timestamp: '2026-07-04T12:02:00.000Z',
    });
    expect(entry).toEqual({
      id: 'odel:del-3:called',
      kind: 'delivery.called',
      at: '2026-07-04T12:02:00.000Z',
      sessionId: 'ts-3',
      actor: { type: 'system', id: null, name: null },
      refs: { orderId: 'o-3', deliveryId: 'del-3' },
      payload: { targetWaiterId: 'w-1' },
    });
  });

  it('order:claimed → delivery.claimed · id ws:order:claimed:<orderId>:<claimedBy> · actor staff claimedBy', async () => {
    const entry = await tapOne('order:claimed', {
      orderId: 'o-4',
      claimedBy: 'staff-9',
      tableSessionId: 'ts-4',
      tableLabel: 'Mesa 2',
      timestamp: '2026-07-04T12:03:00.000Z',
    });
    expect(entry).toEqual({
      id: 'ws:order:claimed:o-4:staff-9',
      kind: 'delivery.claimed',
      at: '2026-07-04T12:03:00.000Z',
      sessionId: 'ts-4',
      actor: { type: 'staff', id: 'staff-9', name: null },
      refs: { orderId: 'o-4' },
      payload: {},
    });
  });

  it('order:claimed COM deliveryId → id odel:<deliveryId>:claimed (CONVERGE com backfill M5)', async () => {
    const entry = await tapOne('order:claimed', {
      orderId: 'o-4b',
      claimedBy: 'staff-9',
      tableSessionId: 'ts-4',
      tableLabel: 'Mesa 2',
      deliveryId: 'del-77',
      timestamp: '2026-07-04T12:03:30.000Z',
    });
    // pk natural presente → id da row de order_deliveries (mesmo do M1
    // `odel:<pk>:claimed`), NÃO o fallback ws:*.
    expect(entry.id).toBe('odel:del-77:claimed');
    expect(entry.kind).toBe('delivery.claimed');
    expect(entry.at).toBe('2026-07-04T12:03:30.000Z');
    expect(entry.sessionId).toBe('ts-4');
    expect(entry.actor).toEqual({ type: 'staff', id: 'staff-9', name: null });
    expect(entry.refs).toEqual({ orderId: 'o-4b' });
    expect(entry.payload).toEqual({});
  });

  it('order:claimed SEM deliveryId → fallback ws:order:claimed:<orderId>:<claimedBy>', async () => {
    const entry = await tapOne('order:claimed', {
      orderId: 'o-4c',
      claimedBy: 'staff-9',
      tableSessionId: 'ts-4',
      timestamp: '2026-07-04T12:03:45.000Z',
    });
    expect(entry.id).toBe('ws:order:claimed:o-4c:staff-9');
  });

  it('waiter:call → waiter.called · id wcall:<callId> (M1) · actor customer (id null = chamada anônima)', async () => {
    const entry = await tapOne('waiter:call', {
      callId: 'call-1',
      tableLabel: 'Mesa 5',
      tableCode: 'M5',
      reason: 'ask_bill',
      tableSessionId: 'ts-5',
      customerId: null,
      timestamp: '2026-07-04T12:04:00.000Z',
    });
    expect(entry).toEqual({
      id: 'wcall:call-1',
      kind: 'waiter.called',
      at: '2026-07-04T12:04:00.000Z',
      sessionId: 'ts-5',
      actor: { type: 'customer', id: null, name: null },
      refs: { callId: 'call-1' },
      payload: { reason: 'ask_bill' },
    });
  });

  it('waiter:acknowledged → waiter.acknowledged · id wcall:<callId>:acknowledged (M1) · actor staff com nome', async () => {
    const entry = await tapOne('waiter:acknowledged', {
      callId: 'call-2',
      tableSessionId: 'ts-6',
      acknowledgedBy: { id: 'staff-3', name: 'Rui' },
      etaMinutes: 5,
      timestamp: '2026-07-04T12:05:00.000Z',
    });
    expect(entry).toEqual({
      id: 'wcall:call-2:acknowledged',
      kind: 'waiter.acknowledged',
      at: '2026-07-04T12:05:00.000Z',
      sessionId: 'ts-6',
      actor: { type: 'staff', id: 'staff-3', name: 'Rui' },
      refs: { callId: 'call-2' },
      payload: { etaMinutes: 5 },
    });
  });

  it('table_merge.created → merge.requested · id merge:<requestId> (M1) · sessionId = originSessionId · actor customer com originHostName', async () => {
    const entry = await tapOne('table_merge.created', {
      requestId: 'merge-1',
      originSessionId: 'ts-a',
      targetSessionId: 'ts-b',
      originTableNumber: 1,
      targetTableNumber: 2,
      originHostName: 'Ana',
      targetHostName: 'Léo',
      originPartySize: 2,
      targetPartySize: 4,
      expiresAt: '2026-07-04T12:15:00.000Z',
      createdAt: '2026-07-04T12:09:00.000Z',
    });
    expect(entry).toEqual({
      id: 'merge:merge-1',
      kind: 'merge.requested',
      at: '2026-07-04T12:09:00.000Z',
      sessionId: 'ts-a',
      actor: { type: 'customer', id: null, name: 'Ana' },
      refs: { requestId: 'merge-1' },
      payload: { targetSessionId: 'ts-b' },
    });
  });

  it('table_merge.approved consumado → id merge:<requestId>:approved (M1) · at = decidedAt · actor customer', async () => {
    const entry = await tapOne('table_merge.approved', {
      requestId: 'merge-2',
      side: 'both',
      status: 'approved',
      originSessionId: 'ts-a',
      targetSessionId: 'ts-b',
      decidedAt: '2026-07-04T12:10:00.000Z',
      decidedByCustomerId: 'cust-host-b',
    });
    expect(entry).toEqual({
      id: 'merge:merge-2:approved',
      kind: 'merge.approved',
      at: '2026-07-04T12:10:00.000Z',
      sessionId: 'ts-a',
      actor: { type: 'customer', id: 'cust-host-b', name: null },
      refs: { requestId: 'merge-2' },
      payload: { targetSessionId: 'ts-b' },
    });
  });

  it('table_merge.approved PARCIAL (status pending, 1 lado só) → no-op (o ato "merge aprovado" ainda não aconteceu)', async () => {
    await tapNone('table_merge.approved', {
      requestId: 'merge-2',
      side: 'a',
      status: 'pending',
      originSessionId: 'ts-a',
      targetSessionId: 'ts-b',
      decidedAt: '2026-07-04T12:10:00.000Z',
      decidedByCustomerId: 'cust-host-a',
    });
  });

  it('table_merge.rejected timeout → id merge:<requestId>:rejected (M1) · rejectedBy estruturado · actor system', async () => {
    const entry = await tapOne('table_merge.rejected', {
      requestId: 'merge-3',
      rejectedBy: 'timeout',
      originSessionId: 'ts-a',
      targetSessionId: 'ts-b',
      decidedAt: '2026-07-04T12:11:00.000Z',
    });
    expect(entry).toEqual({
      id: 'merge:merge-3:rejected',
      kind: 'merge.rejected',
      at: '2026-07-04T12:11:00.000Z',
      sessionId: 'ts-a',
      actor: { type: 'system', id: null, name: null },
      refs: { requestId: 'merge-3' },
      payload: { targetSessionId: 'ts-b', rejectedBy: 'timeout' },
    });
  });

  it('complaint.received → id comp:<complaintId> (M1) · description (texto livre) NÃO copiada (LGPD), só rating/problemType', async () => {
    const entry = await tapOne('complaint.received', {
      complaintId: 'comp-1',
      tableSessionId: 'ts-9',
      tableNumber: 9,
      customerId: 'cust-11',
      customerName: 'João',
      problemType: 'comida_fria',
      rating: 2,
      description: 'o prato chegou gelado e o garçom foi grosso',
      createdAt: '2026-07-04T12:12:00.000Z',
    });
    expect(entry).toEqual({
      id: 'comp:comp-1',
      kind: 'complaint.received',
      at: '2026-07-04T12:12:00.000Z',
      sessionId: 'ts-9',
      actor: { type: 'customer', id: 'cust-11', name: 'João' },
      refs: {},
      payload: { rating: 2, problemType: 'comida_fria' },
    });
  });

  it('complaint.resolved → no-op HOJE: o wire M2 não carrega tableSessionId (entrada sem âncora não entra)', async () => {
    await tapNone('complaint.resolved', {
      complaintId: 'comp-1',
      resolvedAt: '2026-07-04T12:13:00.000Z',
      resolvedBy: 'staff-1',
    });
  });

  it('courtesy.created → id court:<id> (M1) · actor staff pelo managerName · notes (texto livre) NÃO copiadas (LGPD)', async () => {
    const entry = await tapOne('courtesy.created', {
      id: 'court-1',
      tableSessionId: 'ts-10',
      tableNumber: 10,
      type: 'sobremesa',
      item: 'Petit gâteau',
      status: 'pendente',
      managerName: 'Renata',
      notes: 'cliente reclamou da demora, cortesia pra compensar',
      createdAt: '2026-07-04T12:14:00.000Z',
      respondedAt: null,
    });
    expect(entry).toEqual({
      id: 'court:court-1',
      kind: 'courtesy.created',
      at: '2026-07-04T12:14:00.000Z',
      sessionId: 'ts-10',
      actor: { type: 'staff', id: null, name: 'Renata' },
      refs: {},
      payload: { type: 'sobremesa', item: 'Petit gâteau', status: 'pendente', tableNumber: 10 },
    });
  });

  it('session.flag_changed → id determinístico de sessionId+flags+staff · payload.flags · at fallback now (wire sem timestamp)', async () => {
    const before = Date.now();
    const entry = await tapOne('session.flag_changed', {
      sessionId: 'ts-11',
      tableNumber: 11,
      flags: ['vip', 'allergy'],
      by: { staffId: 'staff-5', name: 'Marcos' },
    });
    expect(entry.id).toBe('ws:session.flag_changed:ts-11:allergy,vip:staff-5');
    expect(entry.kind).toBe('session.flag_changed');
    expect(entry.sessionId).toBe('ts-11');
    expect(entry.actor).toEqual({ type: 'staff', id: 'staff-5', name: 'Marcos' });
    expect(entry.refs).toEqual({});
    expect(entry.payload).toEqual({ flags: ['vip', 'allergy'], tableNumber: 11 });
    // Fallback now(): ISO válido dentro da janela do teste.
    expect(new Date(entry.at).toISOString()).toBe(entry.at);
    expect(Date.parse(entry.at)).toBeGreaterThanOrEqual(before);
  });

  it('host.table_liberated → session.closed · id sess:<sessionId>:closed (M1) · at = liberatedAt · reason (texto livre) NÃO copiado', async () => {
    const entry = await tapOne('host.table_liberated', {
      tableId: 'tb-1',
      tableNumber: 12,
      sessionId: 'ts-12',
      mode: 'manual_force',
      by: { staffId: 'staff-8', name: 'Carla' },
      reason: 'mesa abandonada, cliente saiu sem avisar',
      liberatedAt: '2026-07-04T12:16:00.000Z',
    });
    expect(entry).toEqual({
      id: 'sess:ts-12:closed',
      kind: 'session.closed',
      at: '2026-07-04T12:16:00.000Z',
      sessionId: 'ts-12',
      actor: { type: 'staff', id: 'staff-8', name: 'Carla' },
      refs: {},
      payload: { mode: 'manual_force' },
    });
  });

  it('host.table_liberated mode auto (by.staffId null) → actor system', async () => {
    const entry = await tapOne('host.table_liberated', {
      tableId: 'tb-2',
      tableNumber: 13,
      sessionId: 'ts-13',
      mode: 'auto',
      by: { staffId: null },
      liberatedAt: '2026-07-04T12:17:00.000Z',
    });
    expect(entry.actor).toEqual({ type: 'system', id: null, name: null });
  });

  it('payment.confirmed → payment.confirmed · id pay:<paymentId> (M1) · at = confirmedAt · actor customer', async () => {
    const entry = await tapOne('payment.confirmed', {
      paymentId: 'pay-1',
      tableSessionId: 'ts-14',
      amountCents: 12345,
      method: 'pix',
      splitMode: 'equal',
      visitId: 'visit-3',
      customerId: 'cust-14',
      confirmedAt: '2026-07-04T12:18:00.000Z',
      timestamp: '2026-07-04T12:18:00.500Z',
    });
    expect(entry).toEqual({
      id: 'pay:pay-1',
      kind: 'payment.confirmed',
      at: '2026-07-04T12:18:00.000Z',
      sessionId: 'ts-14',
      actor: { type: 'customer', id: 'cust-14', name: null },
      refs: { paymentId: 'pay-1' },
      payload: { amountCents: 12345, method: 'pix', splitMode: 'equal', visitId: 'visit-3' },
    });
  });
});

describe('TimelineTapService — guardas transversais', () => {
  it('wire sem kind no WIRE_EVENT_TO_TIMELINE_KIND (ex.: order:new) → no-op', async () => {
    await tapNone('order:new', { orderId: 'o-9', tableSessionId: 'ts-1' });
  });

  it('payload SEM âncora de sessão (order:status sem tableSessionId) → no-op', async () => {
    await tapNone('order:status', {
      orderId: 'o-9',
      status: 'ready',
      timestamp: '2026-07-04T12:19:00.000Z',
    });
  });

  it('id estável: MESMO evento 2x → MESMO id (o unique {id:1} do store colapsa num doc)', async () => {
    const { tap, recorded } = makeTap();
    const payload = {
      paymentId: 'pay-2',
      tableSessionId: 'ts-15',
      amountCents: 990,
      confirmedAt: '2026-07-04T12:20:00.000Z',
      timestamp: '2026-07-04T12:20:00.100Z',
    };
    tap.record('payment.confirmed', payload, SLUG);
    tap.record('payment.confirmed', { ...payload }, SLUG);
    await flush();
    expect(recorded).toHaveLength(2);
    expect(recorded[0].entry.id).toBe(recorded[1].entry.id);
    expect(recorded[0].entry).toEqual(recorded[1].entry);
  });

  it('Mongo off (store real com tryDb null) → record não explode', async () => {
    const mongo = { tryDb: () => null } as unknown as MongoService;
    const tap = new TimelineTapService(new TimelineStoreService(mongo));
    expect(() =>
      tap.record(
        'payment.confirmed',
        {
          paymentId: 'pay-3',
          tableSessionId: 'ts-16',
          amountCents: 100,
          confirmedAt: '2026-07-04T12:21:00.000Z',
          timestamp: '2026-07-04T12:21:00.000Z',
        },
        SLUG,
      ),
    ).not.toThrow();
    await flush();
  });

  it('store rejeitando (defensivo) → record não explode nem gera unhandled rejection', async () => {
    const store = {
      record: jest.fn(async () => {
        throw new Error('mongo caiu no meio');
      }),
    } as unknown as TimelineStoreService;
    const tap = new TimelineTapService(store);
    expect(() =>
      tap.record(
        'payment.confirmed',
        {
          paymentId: 'pay-4',
          tableSessionId: 'ts-17',
          amountCents: 100,
          confirmedAt: '2026-07-04T12:22:00.000Z',
          timestamp: '2026-07-04T12:22:00.000Z',
        },
        SLUG,
      ),
    ).not.toThrow();
    await flush();
  });
});
