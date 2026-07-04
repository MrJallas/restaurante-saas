/**
 * CHARACTERIZATION (FASE 2 · entrega): congela as invariantes do fluxo de
 * entrega extraído do orders.service, ANTES de mover. As 4 famílias:
 *
 * 1. RE-CALL — o ON CONFLICT preserva o target_waiter_id ORIGINAL; quando o
 *    resolve fresco diverge, o payload busca o NOME do garçom persistido
 *    (id de A com nome de A — nunca id-A/nome-B, achado de code-review).
 * 2. DEGRADAÇÃO DO RESOLVE — a query por turno (timezone do settings) pode
 *    falhar com timezone não-IANA; degrada pro fallback simples por nome em
 *    vez de derrubar o call-waiter do tenant inteiro.
 * 3. CORRIDA DO CLAIM — INSERT ... ON CONFLICT DO NOTHING perde a corrida
 *    pro call-waiter da TV → re-lê a row vencedora e claima; claim de outro
 *    staff → BadRequest (nunca 23505 cru → 500).
 * 4. IDEMPOTÊNCIA DO DELIVERED — pedido já entregue retorna alreadyDelivered
 *    SEM re-side-effects (sem consumption, sem rating re-agendado, sem
 *    re-emitir order:status pro cliente).
 */

import { BadRequestException } from '@nestjs/common';
import { OrderDeliveryService } from './order-delivery.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { ConsumptionSummaryService } from './consumption-summary.service';
import type { EventsGateway } from '../websocket/events.gateway';

const ORDER = 'aaaaaaa5-0000-4000-8000-000000000001';
const STAFF_ANA = 'bbbbbbb5-0000-4000-8000-00000000000a';
const STAFF_BRUNO = 'bbbbbbb5-0000-4000-8000-00000000000b';
const STAFF_CALLER = 'bbbbbbb5-0000-4000-8000-00000000000c';

type Row = Record<string, unknown>;
type Handler = { match: (sql: string) => boolean; rows: Row[] | ((calls: number) => Row[]) };

function fakeConn(handlers: Handler[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const counts = new Map<Handler, number>();
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });
    for (const h of handlers) {
      if (h.match(s)) {
        const n = (counts.get(h) ?? 0) + 1;
        counts.set(h, n);
        return typeof h.rows === 'function' ? h.rows(n) : h.rows;
      }
    }
    throw new Error(`fake delivery: SQL não roteado: ${s.slice(0, 120)}`);
  };
  const conn = {
    query,
    transaction: async <T>(cb: (tx: { query: typeof query }) => Promise<T>) => cb({ query }),
  } as unknown as TenantConnectionProvider;
  return { calls, conn };
}

function fakeGateway() {
  const emitted: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string) =>
    (...args: unknown[]) =>
      emitted.push({ method, args });
  const gw = {
    emitOrderHandoffCalled: record('emitOrderHandoffCalled'),
    emitOrderStatusUpdate: record('emitOrderStatusUpdate'),
    emitOrderClaimed: record('emitOrderClaimed'),
    emitToSession: record('emitToSession'),
  } as unknown as EventsGateway;
  return { emitted, gw };
}

function fakeConsumption() {
  const updates: string[] = [];
  const svc = {
    updateForDeliveredOrder: async (id: string) => {
      updates.push(id);
    },
  } as unknown as ConsumptionSummaryService;
  return { updates, svc };
}

const readyOrderLookup: Handler = {
  match: (s) => s.includes('t.code AS table_code'),
  rows: [
    {
      id: ORDER,
      status: 'ready',
      table_session_id: 'sess-1',
      table_label: 'Mesa 7',
      table_code: 'M7',
      zone_name: 'Salão',
    },
  ],
};

describe('OrderDeliveryService — characterization (extraído do orders.service)', () => {
  it('re-call: ON CONFLICT preserva target original e o NOME sai do persistido (nunca id-A/nome-B)', async () => {
    const { conn } = fakeConn([
      readyOrderLookup,
      // resolve fresco: waiter_calls recente aponta pro BRUNO
      {
        match: (s) => s.includes('wc.acknowledged_by'),
        rows: [{ id: STAFF_BRUNO, name: 'Bruno' }],
      },
      // upsert preservou o target ORIGINAL (ANA) via COALESCE
      {
        match: (s) => s.startsWith('INSERT INTO order_deliveries (order_id, status, called_by'),
        rows: [
          { id: 'del-1', status: 'pending', called_at: '2026-07-04', target_waiter_id: STAFF_ANA },
        ],
      },
      // lookup do nome do garçom PERSISTIDO
      { match: (s) => s.startsWith('SELECT name FROM staff WHERE id ='), rows: [{ name: 'Ana' }] },
    ]);
    const { emitted, gw } = fakeGateway();

    const svc = new OrderDeliveryService(conn, fakeConsumption().svc, gw);
    const out = await svc.callWaiterForOrder(ORDER, 'restaurant_dev', STAFF_CALLER);

    expect(out.targetWaiterId).toBe(STAFF_ANA);
    expect(out.targetWaiterName).toBe('Ana'); // não 'Bruno'
    const handoff = emitted.find((e) => e.method === 'emitOrderHandoffCalled')!;
    expect(handoff.args[1]).toMatchObject({ targetWaiterId: STAFF_ANA, targetWaiterName: 'Ana' });
  });

  it('resolve degrada: query por turno falha (timezone) → fallback simples por nome', async () => {
    const { conn } = fakeConn([
      readyOrderLookup,
      { match: (s) => s.includes('wc.acknowledged_by'), rows: [] }, // sem chamado prévio
      {
        match: (s) => s.includes('WITH local_now'),
        rows: () => {
          throw new Error('invalid time zone "Horário de Brasília"');
        },
      },
      {
        match: (s) => s.includes("role = 'waiter'") && s.includes('ORDER BY name ASC'),
        rows: [{ id: STAFF_ANA, name: 'Ana' }],
      },
      {
        match: (s) => s.startsWith('INSERT INTO order_deliveries (order_id, status, called_by'),
        rows: [
          { id: 'del-2', status: 'pending', called_at: '2026-07-04', target_waiter_id: STAFF_ANA },
        ],
      },
    ]);
    const { gw } = fakeGateway();

    const svc = new OrderDeliveryService(conn, fakeConsumption().svc, gw);
    const out = await svc.callWaiterForOrder(ORDER, 'restaurant_dev', null);

    expect(out.targetWaiterId).toBe(STAFF_ANA);
    expect(out.targetWaiterName).toBe('Ana');
  });

  it('claim perde a corrida do INSERT → re-lê a row vencedora e claima nela', async () => {
    const txOrderLookup: Handler = {
      match: (s) => s.includes('t.label AS table_label FROM') && !s.includes('table_code'),
      rows: [{ id: ORDER, status: 'ready', table_session_id: 'sess-1', table_label: 'Mesa 7' }],
    };
    const { calls, conn } = fakeConn([
      txOrderLookup,
      // 1ª leitura: nenhuma delivery; 2ª (raced): a row da TV venceu
      {
        match: (s) => s.startsWith('SELECT id, status, claimed_by FROM order_deliveries'),
        rows: (n) => (n === 1 ? [] : [{ id: 'del-tv', status: 'pending', claimed_by: null }]),
      },
      // INSERT DO NOTHING perdeu a corrida → RETURNING vazio
      {
        match: (s) => s.startsWith('INSERT INTO order_deliveries (order_id, status, claimed_by'),
        rows: [],
      },
      {
        match: (s) => s.startsWith('UPDATE order_deliveries SET status = '),
        rows: [{ id: 'del-tv', status: 'claimed', claimed_by: STAFF_ANA }],
      },
      { match: (s) => s.startsWith('UPDATE orders SET status = '), rows: [] },
      { match: (s) => s.startsWith('INSERT INTO order_status_history'), rows: [] },
    ]);
    const { emitted, gw } = fakeGateway();

    const svc = new OrderDeliveryService(conn, fakeConsumption().svc, gw);
    const out = await svc.markOrderInTransit(ORDER, 'restaurant_dev', STAFF_ANA);

    expect(out).toMatchObject({ orderId: ORDER, deliveryId: 'del-tv', status: 'in_transit' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE orders SET status ='))).toBe(true);
    expect(emitted.map((e) => e.method)).toEqual(
      expect.arrayContaining(['emitOrderClaimed', 'emitOrderStatusUpdate', 'emitToSession']),
    );
  });

  it('claim de pedido já claimado por OUTRO staff → BadRequest', async () => {
    const { conn } = fakeConn([
      {
        match: (s) => s.includes('t.label AS table_label FROM') && !s.includes('table_code'),
        rows: [{ id: ORDER, status: 'ready', table_session_id: 'sess-1', table_label: 'Mesa 7' }],
      },
      {
        match: (s) => s.startsWith('SELECT id, status, claimed_by FROM order_deliveries'),
        rows: [{ id: 'del-3', status: 'claimed', claimed_by: STAFF_BRUNO }],
      },
    ]);
    const svc = new OrderDeliveryService(conn, fakeConsumption().svc, fakeGateway().gw);
    await expect(svc.markOrderInTransit(ORDER, 'restaurant_dev', STAFF_ANA)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('delivered é idempotente: já entregue → alreadyDelivered SEM re-side-effects', async () => {
    const ratingCalls: unknown[] = [];
    const { calls, conn } = fakeConn([
      {
        match: (s) => s.includes('t.label AS table_label FROM') && !s.includes('table_code'),
        rows: [
          { id: ORDER, status: 'delivered', table_session_id: 'sess-1', table_label: 'Mesa 7' },
        ],
      },
    ]);
    const consumption = fakeConsumption();
    const { emitted, gw } = fakeGateway();
    const ratings = {
      schedulePromptForDelivered: async (p: unknown) => {
        ratingCalls.push(p);
      },
    };

    const svc = new OrderDeliveryService(conn, consumption.svc, gw, ratings as never);
    const out = await svc.markOrderDeliveredByWaiter(ORDER, 'restaurant_dev', STAFF_ANA);

    expect(out.alreadyDelivered).toBe(true);
    expect(consumption.updates).toEqual([]); // consumption NÃO roda de novo
    expect(ratingCalls).toEqual([]); // rating NÃO re-agendado
    expect(emitted).toEqual([]); // nenhum evento re-emitido
    expect(calls.filter((c) => c.sql.startsWith('UPDATE'))).toEqual([]); // nenhuma escrita
  });
});

describe('OrderDeliveryService — roteamento por ZONA prioritária (decisão 2026-07-04)', () => {
  // Cadeia nova: ZONA (atribuídos hoje, em turno, sem pausa; round-robin
  // por last_called) → último-que-atendeu → turno → simples. O teste
  // unitário fixa a ORDEM da cadeia e os retornos; os filtros de
  // pausa/turno/work_date vivem no SQL e são provados vivos (psql seed).
  const upsertDelivery = (targetId: string) => ({
    match: (s: string) => s.startsWith('INSERT INTO order_deliveries (order_id, status, called_by'),
    rows: [{ id: 'del-z', status: 'pending', called_at: '2026-07-04', target_waiter_id: targetId }],
  });

  it('zona VENCE o último-que-atendeu: garçom da zona é o alvo e waiter_calls nem é consultado', async () => {
    const { calls, conn } = fakeConn([
      readyOrderLookup,
      {
        match: (s) => s.includes('waiter_zone_assignments'),
        rows: [{ id: STAFF_ANA, name: 'Ana' }],
      },
      // waiter_calls (Bruno) existe mas NÃO deve ser alcançado
      {
        match: (s) => s.includes('wc.acknowledged_by'),
        rows: [{ id: STAFF_BRUNO, name: 'Bruno' }],
      },
      upsertDelivery(STAFF_ANA),
    ]);
    const svc = new OrderDeliveryService(conn, fakeConsumption().svc, fakeGateway().gw);
    const out = await svc.callWaiterForOrder(ORDER, 'restaurant_dev', null);

    expect(out.targetWaiterId).toBe(STAFF_ANA);
    expect(out.targetWaiterName).toBe('Ana');
    expect(calls.some((c) => c.sql.includes('wc.acknowledged_by'))).toBe(false);
  });

  it('zona sem elegível (vazia/pausado/fora de turno) → cai no último-que-atendeu', async () => {
    const { conn } = fakeConn([
      readyOrderLookup,
      { match: (s) => s.includes('waiter_zone_assignments'), rows: [] },
      {
        match: (s) => s.includes('wc.acknowledged_by'),
        rows: [{ id: STAFF_BRUNO, name: 'Bruno' }],
      },
      upsertDelivery(STAFF_BRUNO),
    ]);
    const svc = new OrderDeliveryService(conn, fakeConsumption().svc, fakeGateway().gw);
    const out = await svc.callWaiterForOrder(ORDER, 'restaurant_dev', null);

    expect(out.targetWaiterId).toBe(STAFF_BRUNO);
    expect(out.targetWaiterName).toBe('Bruno');
  });

  it('query de zona explodindo (tenant sem migration 060) degrada pro fluxo antigo sem 500', async () => {
    const { conn } = fakeConn([
      readyOrderLookup,
      {
        match: (s) => s.includes('waiter_zone_assignments'),
        rows: () => {
          throw new Error('relation "waiter_zone_assignments" does not exist');
        },
      },
      {
        match: (s) => s.includes('wc.acknowledged_by'),
        rows: [{ id: STAFF_BRUNO, name: 'Bruno' }],
      },
      upsertDelivery(STAFF_BRUNO),
    ]);
    const svc = new OrderDeliveryService(conn, fakeConsumption().svc, fakeGateway().gw);
    const out = await svc.callWaiterForOrder(ORDER, 'restaurant_dev', null);
    expect(out.targetWaiterId).toBe(STAFF_BRUNO);
  });
});
