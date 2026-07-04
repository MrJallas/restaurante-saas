/**
 * P1 da auditoria 2026-07-03: cliente cancelava pedido em QUALQUER estágio
 * via `PATCH /:orderId/status`. O `cancelOrder` dedicado bloqueia após
 * `pending_confirmation` (janela de 15s), mas o branch session do
 * `updateStatus` só validava o DESTINO (`cancelled`) + ownership — a
 * ORIGEM ficava por conta do VALID_TRANSITIONS, que permite `cancelled`
 * de received/in_progress/ready/in_transit. Burlava os 15s.
 *
 * Regra fixada: caller `session` só cancela de `pending_confirmation`/
 * `open` (mesma regra do cancelOrder); staff continua livre; repeat de
 * cancel já cancelado continua idempotente.
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { EtaDecoratorService } from './eta-decorator.service';
import { BillingService } from '../billing/billing.service';
import { ConsumptionSummaryService } from './consumption-summary.service';
import { KdsQueryService } from './kds-query.service';
import { OrderDeliveryService } from './order-delivery.service';
import { CustomerBillQueryService } from './customer-bill-query.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const ORDER = 'aaaaaaa2-0000-4000-8000-000000000001';
const SESSION = 'bbbbbbb2-0000-4000-8000-000000000001';
const OTHER_SESSION = 'ccccccc2-0000-4000-8000-000000000001';

/** Fake mínimo: uma order com status mutável + CAS real no UPDATE. */
function fakeOrdersDb(initialStatus: string) {
  const state = { status: initialStatus, history: [] as string[] };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, status, table_session_id FROM orders')) {
      return [{ id: ORDER, status: state.status, table_session_id: SESSION }];
    }
    if (s.startsWith('UPDATE orders SET status')) {
      const [newStatus, , expected] = [params[0], params[1], params[2]];
      if (state.status !== expected) return [];
      state.status = newStatus as string;
      return [{ id: ORDER }];
    }
    if (s.startsWith('SELECT status FROM orders')) {
      return [{ status: state.status }];
    }
    if (s.startsWith('INSERT INTO order_status_history')) {
      state.history.push(`${params[1]}->${params[2]}`);
      return [];
    }
    throw new Error(`fake orders: SQL não roteado: ${s}`);
  };

  return {
    state,
    conn: { query } as unknown as TenantConnectionProvider,
  };
}

function makeService(initialStatus: string) {
  const db = fakeOrdersDb(initialStatus);
  const service = new OrdersService(
    db.conn,
    {} as unknown as RedisService,
    new BillingService(db.conn),
    new ConsumptionSummaryService(db.conn),
    new KdsQueryService(db.conn),
    new OrderDeliveryService(db.conn, new ConsumptionSummaryService(db.conn)),
    new CustomerBillQueryService(db.conn, new BillingService(db.conn)),
    new EtaDecoratorService(db.conn),
  );
  return { service, db };
}

const sessionActor = { actorType: 'session' as const, sessionTableId: SESSION };

describe('OrdersService.updateStatus — cancelamento do cliente respeita a janela', () => {
  it.each(['received', 'in_progress', 'ready', 'in_transit'])(
    'session NÃO cancela pedido em %s via PATCH /status',
    async (status) => {
      const { service, db } = makeService(status);
      await expect(
        service.updateStatus(ORDER, 'cancelled', 'customer', 'restaurant_dev', sessionActor),
      ).rejects.toThrow(BadRequestException);
      expect(db.state.status).toBe(status); // pedido intacto
      expect(db.state.history).toHaveLength(0);
    },
  );

  it('session cancela em pending_confirmation (janela de 15s preservada)', async () => {
    const { service, db } = makeService('pending_confirmation');
    const result = await service.updateStatus(
      ORDER,
      'cancelled',
      'customer',
      'restaurant_dev',
      sessionActor,
    );
    expect(result.newStatus).toBe('cancelled');
    expect(db.state.status).toBe('cancelled');
  });

  it('repeat de cancel já cancelado segue idempotente pro session', async () => {
    const { service } = makeService('cancelled');
    const result = await service.updateStatus(
      ORDER,
      'cancelled',
      'customer',
      'restaurant_dev',
      sessionActor,
    );
    expect(result).toEqual({ orderId: ORDER, previousStatus: 'cancelled', newStatus: 'cancelled' });
  });

  it('staff continua cancelando em received (fluxo de operação preservado)', async () => {
    const { service, db } = makeService('received');
    const result = await service.updateStatus(ORDER, 'cancelled', 'staff-1', 'restaurant_dev', {
      actorType: 'staff',
      sessionTableId: null,
    });
    expect(result.newStatus).toBe('cancelled');
    expect(db.state.status).toBe('cancelled');
  });

  it('session de OUTRA mesa segue bloqueado (ownership preservado)', async () => {
    const { service } = makeService('pending_confirmation');
    await expect(
      service.updateStatus(ORDER, 'cancelled', 'customer', 'restaurant_dev', {
        actorType: 'session',
        sessionTableId: OTHER_SESSION,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('session tentando outro destino que não cancelled segue proibido', async () => {
    const { service } = makeService('ready');
    await expect(
      service.updateStatus(ORDER, 'delivered', 'customer', 'restaurant_dev', sessionActor),
    ).rejects.toThrow(ForbiddenException);
  });
});
