/**
 * CHARACTERIZATION (FASE 2 · 2A): fixa o comportamento ATUAL do
 * updateStatus antes de extrair a máquina de estados (OrderStateMachine).
 * Estes testes NÃO julgam o comportamento — eles o congelam, inclusive
 * mensagens de erro exatas, pra provar que a extração preserva tudo.
 * Regra do plano: characterization antes de QUALQUER decomposição.
 */

import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { BillingService } from '../billing/billing.service';
import { ConsumptionSummaryService } from './consumption-summary.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const ORDER = 'aaaaaaa3-0000-4000-8000-000000000001';
const SESSION = 'bbbbbbb3-0000-4000-8000-000000000001';

function fakeOrdersDb(initialStatus: string) {
  const state = { status: initialStatus, history: [] as string[] };
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, status, table_session_id FROM orders')) {
      return [{ id: ORDER, status: state.status, table_session_id: SESSION }];
    }
    if (s.startsWith('UPDATE orders SET status')) {
      if (state.status !== params[2]) return [];
      state.status = params[0] as string;
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
  return { state, conn: { query } as unknown as TenantConnectionProvider };
}

function makeService(initialStatus: string) {
  const db = fakeOrdersDb(initialStatus);
  const service = new OrdersService(
    db.conn,
    {} as unknown as RedisService,
    new BillingService(db.conn),
    new ConsumptionSummaryService(db.conn),
  );
  return { service, db };
}

const staffActor = { actorType: 'staff' as const, sessionTableId: null };

describe('updateStatus — characterization da matriz de transições (staff)', () => {
  // Caminho canônico (sem delivered — efeitos colaterais ficam fora do
  // escopo da extração e são cobertos pelos E2E de KDS/entrega).
  it.each([
    ['pending_confirmation', 'received'],
    ['pending_confirmation', 'cancelled'],
    ['received', 'in_progress'],
    ['received', 'cancelled'],
    ['in_progress', 'ready'],
    ['in_progress', 'cancelled'],
    ['ready', 'in_transit'],
    ['ready', 'cancelled'],
    ['in_transit', 'cancelled'],
    // legacy
    ['open', 'confirmed'],
    ['open', 'received'],
    ['confirmed', 'preparing'],
    ['confirmed', 'in_progress'],
    ['preparing', 'ready'],
  ])('permite %s → %s e grava history', async (from, to) => {
    const { service, db } = makeService(from);
    const result = await service.updateStatus(ORDER, to, 'staff-1', 'restaurant_dev', staffActor);
    expect(result).toEqual({ orderId: ORDER, previousStatus: from, newStatus: to });
    expect(db.state.status).toBe(to);
    expect(db.state.history).toEqual([`${from}->${to}`]);
  });

  it.each([
    ['pending_confirmation', 'ready'],
    ['received', 'delivered'],
    ['received', 'in_transit'],
    ['in_progress', 'delivered'],
    ['delivered', 'cancelled'],
    ['cancelled', 'received'],
    ['in_transit', 'ready'],
  ])('rejeita %s → %s com a mensagem canônica', async (from, to) => {
    const { service, db } = makeService(from);
    await expect(
      service.updateStatus(ORDER, to, 'staff-1', 'restaurant_dev', staffActor),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateStatus(ORDER, to, 'staff-1', 'restaurant_dev', staffActor),
    ).rejects.toThrow(/Transicao invalida: .* -> .*\. Permitidos:/);
    expect(db.state.status).toBe(from);
    expect(db.state.history).toHaveLength(0);
  });

  it('repeat do mesmo status é idempotente (sem history duplicado)', async () => {
    const { service, db } = makeService('ready');
    const result = await service.updateStatus(
      ORDER,
      'ready',
      'staff-1',
      'restaurant_dev',
      staffActor,
    );
    expect(result).toEqual({ orderId: ORDER, previousStatus: 'ready', newStatus: 'ready' });
    expect(db.state.history).toHaveLength(0);
  });

  it('perdedor da corrida CAS re-lê e retorna idempotente', async () => {
    const { service, db } = makeService('received');
    // Simula corrida: o UPDATE CAS falha porque o status mudou por baixo.
    const originalQuery = (
      db.conn as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown[]> }
    ).query;
    let flipped = false;
    (db.conn as unknown as { query: typeof originalQuery }).query = async (s, p) => {
      if (!flipped && s.replace(/\s+/g, ' ').startsWith('UPDATE orders SET status')) {
        flipped = true;
        db.state.status = 'in_progress'; // concorrente venceu
      }
      return originalQuery(s, p);
    };
    const result = await service.updateStatus(
      ORDER,
      'in_progress',
      'staff-1',
      'restaurant_dev',
      staffActor,
    );
    expect(result).toEqual({
      orderId: ORDER,
      previousStatus: 'received',
      newStatus: 'in_progress',
    });
    expect(db.state.history).toHaveLength(0); // perdedor não grava history
  });

  it('actor ausente (chamadas internas) segue caminho staff', async () => {
    const { service, db } = makeService('received');
    const result = await service.updateStatus(ORDER, 'in_progress', 'system');
    expect(result.newStatus).toBe('in_progress');
    expect(db.state.status).toBe('in_progress');
  });
});
