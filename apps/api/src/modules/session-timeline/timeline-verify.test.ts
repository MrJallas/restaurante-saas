/**
 * Fatia M8 — testes do DIFF PURO da reconciliação SQL↔store. Alvo: a lógica
 * do veredito (missing por kind, store-only ws:* vs órfão, duplicação lógica
 * dos kinds que divergem de esquema). I/O (pg/Mongo) fica FORA — a prova viva
 * do script `verify-timeline.ts` é do auditor.
 */

import type { TimelineEntry } from '@restaurant/shared-types';
import { diffTimeline, isTapOnlyId, logicalKey, type StoreDoc } from './timeline-verify';

const SESSION_ID = '7cc9f73e-a45d-4dac-aa9e-40146a7b7d76';
const ORDER_ID = '33253a01-0aca-4881-8f0c-95fe368a50b8';
const OSH_PK = 'bd1d5688-705c-4f4f-8483-3dbe71e1684a';
const DELIVERY_PK = 'b00ad180-f1d4-4649-8966-dc6f85d6dd7a';

/** entry-verdade SQL mínima (só os campos que o diff lê). */
function sqlEntry(
  over: Partial<TimelineEntry> & Pick<TimelineEntry, 'id' | 'kind'>,
): TimelineEntry {
  return {
    at: '2026-07-04T16:02:56.321Z',
    sessionId: SESSION_ID,
    actor: { type: 'system', id: null, name: null },
    refs: {},
    payload: {},
    ...over,
  } as TimelineEntry;
}

describe('isTapOnlyId', () => {
  it('ids ws:* são tap-only legítimos', () => {
    expect(isTapOnlyId('ws:order:status:o1:ready:2026-07-04T16:02:56.321Z')).toBe(true);
    expect(isTapOnlyId('ws:order:claimed:o1:s1')).toBe(true);
    expect(isTapOnlyId('ws:session.flag_changed:s1:vip:st1')).toBe(true);
  });

  it('ids <fonte>:<pk> não são tap-only', () => {
    expect(isTapOnlyId(`osh:${OSH_PK}`)).toBe(false);
    expect(isTapOnlyId(`odel:${DELIVERY_PK}:claimed`)).toBe(false);
    expect(isTapOnlyId('flag:abc')).toBe(false);
    expect(isTapOnlyId('pay:xyz')).toBe(false);
  });
});

describe('logicalKey', () => {
  it('order.status_changed ancora em orderId + toStatus (tap e backfill batem)', () => {
    const tapKey = logicalKey({
      kind: 'order.status_changed',
      sessionId: SESSION_ID,
      refs: { orderId: ORDER_ID },
      payload: { toStatus: 'delivered' },
    });
    const backfillKey = logicalKey({
      kind: 'order.status_changed',
      sessionId: SESSION_ID,
      refs: { orderId: ORDER_ID },
      payload: { fromStatus: 'in_transit', toStatus: 'delivered' },
    });
    expect(tapKey).toBe(backfillKey);
    expect(tapKey).toBe(`order.status_changed|${ORDER_ID}|delivered`);
  });

  it('delivery.claimed ancora em orderId (deliveryId não está no id do tap)', () => {
    expect(
      logicalKey({ kind: 'delivery.claimed', sessionId: SESSION_ID, refs: { orderId: ORDER_ID } }),
    ).toBe(`delivery.claimed|${ORDER_ID}`);
  });

  it('kind que converge (payment.confirmed) → null (não participa de dup)', () => {
    expect(logicalKey({ kind: 'payment.confirmed', sessionId: SESSION_ID })).toBeNull();
  });

  it('order.status_changed sem toStatus → null (sem âncora não afirma dup)', () => {
    expect(
      logicalKey({
        kind: 'order.status_changed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
      }),
    ).toBeNull();
  });
});

describe('diffTimeline · MISSING_IN_STORE', () => {
  it('id-SQL ausente no store é reportado por kind', () => {
    const sql = [
      sqlEntry({ id: `pay:p1`, kind: 'payment.confirmed' }),
      sqlEntry({ id: `osh:${OSH_PK}`, kind: 'order.status_changed', refs: { orderId: ORDER_ID } }),
    ];
    const store: StoreDoc[] = [{ id: 'pay:p1', kind: 'payment.confirmed', sessionId: SESSION_ID }];
    const report = diffTimeline(sql, store);
    expect(report.missing.ids).toEqual([`osh:${OSH_PK}`]);
    expect(report.missing.byKind['order.status_changed']).toBe(1);
    expect(report.drift).toBe(true);
  });
});

describe('diffTimeline · STORE_ONLY', () => {
  it('ws:* NÃO conta como órfão — vai pro bucket esperado (tap-only)', () => {
    const sql: TimelineEntry[] = [];
    const store: StoreDoc[] = [
      {
        id: `ws:order:status:${ORDER_ID}:ready:2026-07-04T16:02:56.321Z`,
        kind: 'order.status_changed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
        payload: { toStatus: 'ready' },
      },
    ];
    const report = diffTimeline(sql, store);
    expect(report.storeOnly.expectedTapOnly).toHaveLength(1);
    expect(report.storeOnly.unexpectedOrphan).toHaveLength(0);
    // ws:* sozinho não é drift (é tap-only legítimo, sem par SQL).
    expect(report.drift).toBe(false);
  });

  it('id não-ws não-derivável do SQL é órfão real (drift)', () => {
    const sql: TimelineEntry[] = [];
    const store: StoreDoc[] = [
      { id: 'ord:orphan-pk', kind: 'order.created', sessionId: SESSION_ID },
    ];
    const report = diffTimeline(sql, store);
    expect(report.storeOnly.unexpectedOrphan).toEqual(['ord:orphan-pk']);
    expect(report.storeOnly.byKind['order.created']).toBe(1);
    expect(report.drift).toBe(true);
  });
});

describe('diffTimeline · DUPLICAÇÃO LÓGICA', () => {
  it('osh:<pk> + ws:order:status do MESMO orderId/status → 1 dup detectada', () => {
    const sql = [
      sqlEntry({
        id: `osh:${OSH_PK}`,
        kind: 'order.status_changed',
        refs: { orderId: ORDER_ID },
        payload: { toStatus: 'ready' },
      }),
    ];
    const store: StoreDoc[] = [
      // lado backfill (convergiu com o SQL — está no store)
      {
        id: `osh:${OSH_PK}`,
        kind: 'order.status_changed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
        payload: { toStatus: 'ready' },
      },
      // lado tap live (esquema ws, mesmo ato lógico)
      {
        id: `ws:order:status:${ORDER_ID}:ready:2026-07-04T16:02:56.321Z`,
        kind: 'order.status_changed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
        payload: { toStatus: 'ready' },
      },
    ];
    const report = diffTimeline(sql, store);
    expect(report.dupLogica.count).toBe(1);
    expect(report.dupLogica.byKind['order.status_changed']).toBe(1);
    expect(report.dupLogica.pairs[0]).toMatchObject({
      kind: 'order.status_changed',
      sqlId: `osh:${OSH_PK}`,
      wsId: `ws:order:status:${ORDER_ID}:ready:2026-07-04T16:02:56.321Z`,
    });
    expect(report.drift).toBe(true);
  });

  it('só o lado ws presente (sem par SQL no store) → NÃO é dup', () => {
    const store: StoreDoc[] = [
      {
        id: `ws:order:status:${ORDER_ID}:ready:2026-07-04T16:02:56.321Z`,
        kind: 'order.status_changed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
        payload: { toStatus: 'ready' },
      },
    ];
    const report = diffTimeline([], store);
    expect(report.dupLogica.count).toBe(0);
  });

  it('delivery.claimed: odel:<pk>:claimed + ws:order:claimed do mesmo orderId → dup', () => {
    const store: StoreDoc[] = [
      {
        id: `odel:${DELIVERY_PK}:claimed`,
        kind: 'delivery.claimed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID, deliveryId: DELIVERY_PK },
      },
      {
        id: `ws:order:claimed:${ORDER_ID}:staff-1`,
        kind: 'delivery.claimed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
      },
    ];
    const report = diffTimeline([], store);
    expect(report.dupLogica.count).toBe(1);
    expect(report.dupLogica.byKind['delivery.claimed']).toBe(1);
  });
});

describe('diffTimeline · store íntegro', () => {
  it('todo id-SQL presente, sem órfão, sem dup → veredito limpo', () => {
    const sql = [
      sqlEntry({ id: 'pay:p1', kind: 'payment.confirmed' }),
      sqlEntry({ id: 'sess:s1:opened', kind: 'session.opened' }),
      sqlEntry({ id: `osh:${OSH_PK}`, kind: 'order.status_changed', refs: { orderId: ORDER_ID } }),
    ];
    const store: StoreDoc[] = [
      { id: 'pay:p1', kind: 'payment.confirmed', sessionId: SESSION_ID },
      { id: 'sess:s1:opened', kind: 'session.opened', sessionId: SESSION_ID },
      {
        id: `osh:${OSH_PK}`,
        kind: 'order.status_changed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
        payload: { toStatus: 'ready' },
      },
    ];
    const report = diffTimeline(sql, store);
    expect(report.missing.ids).toHaveLength(0);
    expect(report.storeOnly.unexpectedOrphan).toHaveLength(0);
    expect(report.dupLogica.count).toBe(0);
    expect(report.drift).toBe(false);
    expect(report.sqlTotal).toBe(3);
    expect(report.storeTotal).toBe(3);
  });

  it('store com ws:* tap-only legítimos + SQL convergido → ainda íntegro', () => {
    const sql = [sqlEntry({ id: 'pay:p1', kind: 'payment.confirmed' })];
    const store: StoreDoc[] = [
      { id: 'pay:p1', kind: 'payment.confirmed', sessionId: SESSION_ID },
      // ws:* tap-only SEM par SQL — legítimo (backfill nunca rodou nessa row)
      {
        id: `ws:order:status:${ORDER_ID}:preparing:2026-07-04T16:00:00.000Z`,
        kind: 'order.status_changed',
        sessionId: SESSION_ID,
        refs: { orderId: ORDER_ID },
        payload: { toStatus: 'preparing' },
      },
    ];
    const report = diffTimeline(sql, store);
    expect(report.storeOnly.expectedTapOnly).toHaveLength(1);
    expect(report.drift).toBe(false);
  });
});
