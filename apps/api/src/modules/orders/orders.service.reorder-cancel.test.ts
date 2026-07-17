/**
 * P1 (re-scan): "Cancelar pedido de reordem" do gerente era PLACEBO —
 * o onCancel só resetava state React, sem backend. A cozinha continuava
 * vendo/beepando o priority push que o gerente achava ter retraído.
 *
 * Estes testes fixam a RETRAÇÃO REAL: cancelKitchenReorderRequest escreve
 * status='cancelled' (migration 053) SÓ enquanto pending, emite WS de
 * retração pra cozinha parar de mostrar/beepar, e é no-op idempotente se
 * a cozinha já respondeu (accepted/next) — não clobber de request fechado.
 */

import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { EtaDecoratorService } from './eta-decorator.service';
import { BillingService } from '../billing/billing.service';
import { ConsumptionSummaryService } from './consumption-summary.service';
import { KdsQueryService } from './kds-query.service';
import { OrderDeliveryService } from './order-delivery.service';
import { CustomerBillQueryService } from './customer-bill-query.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import type { EventsGateway } from '../websocket/events.gateway';

const REQUEST_ID = 'ccccccc3-0000-4000-8000-000000000001';
const ORDER_A = 'aaaaaaa3-0000-4000-8000-000000000001';
const ORDER_B = 'aaaaaaa3-0000-4000-8000-000000000002';
const STAFF = 'ddddddd3-0000-4000-8000-000000000001';
const SLUG = 'restaurant_dev';

interface FakeRequestRow {
  id: string;
  order_ids: string[];
  reason: string | null;
  requested_by_staff_id: string | null;
  status: string;
  response: 'accept' | 'next' | null;
  protected_order_ids: string[];
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
}

function fakeReorderDb(initialStatus: string) {
  const row: FakeRequestRow = {
    id: REQUEST_ID,
    order_ids: [ORDER_A, ORDER_B],
    reason: 'Mesa 4 atrasada',
    requested_by_staff_id: STAFF,
    status: initialStatus,
    response: null,
    protected_order_ids: [],
    response_note: null,
    created_at: new Date().toISOString(),
    responded_at: null,
  };
  const calls: { updateCancelled: number } = { updateCancelled: 0 };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    // FOR UPDATE lock read inside the cancel transaction.
    if (s.startsWith('SELECT id, order_ids, status FROM kitchen_reorder_requests')) {
      if (params[0] !== REQUEST_ID) return [];
      return [{ id: row.id, order_ids: row.order_ids, status: row.status }];
    }
    // The cancel UPDATE — only fires the transition while pending.
    if (s.startsWith("UPDATE kitchen_reorder_requests SET status = 'cancelled'")) {
      calls.updateCancelled += 1;
      row.status = 'cancelled';
      row.response_note = 'Gerente cancelou o pedido de reordenacao.';
      return [];
    }
    // Hydration read (getKitchenReorderRequest).
    if (s.startsWith('SELECT kr.id, kr.order_ids')) {
      if (params[0] !== REQUEST_ID) return [];
      return [
        {
          id: row.id,
          order_ids: row.order_ids,
          reason: row.reason,
          requested_by_staff_id: row.requested_by_staff_id,
          requested_by_name: 'Gerente',
          status: row.status,
          response: row.response,
          protected_order_ids: row.protected_order_ids,
          response_note: row.response_note,
          created_at: row.created_at,
          responded_at: row.responded_at,
        },
      ];
    }
    throw new Error(`fake reorder db: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    // cancel roda dentro de uma transação — o fake só executa o callback.
    transaction: async <T>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> =>
      fn({ query }),
  } as unknown as TenantConnectionProvider;

  return { row, calls, conn };
}

function makeService(initialStatus: string) {
  const db = fakeReorderDb(initialStatus);
  const emitKitchenPriorityCancel = jest.fn();
  const gateway = { emitKitchenPriorityCancel } as unknown as EventsGateway;
  // getKitchenQueue é chamado pela hidratação — evita tocar no DB real.
  const kdsQuery = {
    getKitchenQueue: jest.fn().mockResolvedValue([]),
  } as unknown as KdsQueryService;
  const service = new OrdersService(
    db.conn,
    {} as unknown as RedisService,
    new BillingService(db.conn),
    new ConsumptionSummaryService(db.conn),
    kdsQuery,
    new OrderDeliveryService(db.conn, new ConsumptionSummaryService(db.conn)),
    new CustomerBillQueryService(db.conn, new BillingService(db.conn)),
    new EtaDecoratorService(db.conn),
    gateway,
  );
  // sweepAutoConfirmThrottled é chamado por getKitchenQueue no service; no-op.
  jest
    .spyOn(
      service as unknown as { sweepAutoConfirmThrottled: () => Promise<void> },
      'sweepAutoConfirmThrottled',
    )
    .mockResolvedValue(undefined);
  return { service, db, emitKitchenPriorityCancel };
}

describe('cancelKitchenReorderRequest — retração real (não placebo)', () => {
  it('escreve status=cancelled quando pending e emite WS de retração pra cozinha', async () => {
    const { service, db, emitKitchenPriorityCancel } = makeService('pending');

    const result = await service.cancelKitchenReorderRequest(REQUEST_ID, STAFF, SLUG);

    expect(db.calls.updateCancelled).toBe(1);
    expect(db.row.status).toBe('cancelled');
    expect(result.status).toBe('cancelled');

    // A cozinha precisa parar de mostrar/beepar o push — WS de retração
    // com o requestId cancelado.
    expect(emitKitchenPriorityCancel).toHaveBeenCalledTimes(1);
    expect(emitKitchenPriorityCancel).toHaveBeenCalledWith(
      SLUG,
      expect.objectContaining({ requestId: REQUEST_ID }),
    );
  });

  it('é no-op idempotente quando a cozinha já respondeu (accepted) — não clobber', async () => {
    const { service, db, emitKitchenPriorityCancel } = makeService('accepted');

    const result = await service.cancelKitchenReorderRequest(REQUEST_ID, STAFF, SLUG);

    // Não sobrescreve um request já respondido.
    expect(db.calls.updateCancelled).toBe(0);
    expect(db.row.status).toBe('accepted');
    expect(result.status).toBe('accepted');
    // Sem retração falsa: a cozinha já agiu.
    expect(emitKitchenPriorityCancel).not.toHaveBeenCalled();
  });

  it('404 quando o request não existe', async () => {
    const { service } = makeService('pending');
    await expect(
      service.cancelKitchenReorderRequest('eeeeeee3-0000-4000-8000-000000000009', STAFF, SLUG),
    ).rejects.toThrow(NotFoundException);
  });
});
