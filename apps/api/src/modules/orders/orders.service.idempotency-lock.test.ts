import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { OrdersService } from './orders.service';
import { BillingService } from '../billing/billing.service';
import { ConsumptionSummaryService } from './consumption-summary.service';
import { KdsQueryService } from './kds-query.service';
import { OrderDeliveryService } from './order-delivery.service';
import { CustomerBillQueryService } from './customer-bill-query.service';
import { EtaDecoratorService } from './eta-decorator.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';

function serviceWithInflight(payload: Record<string, unknown>) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('o.idempotency_key')) return [];
    throw new Error('DB não pode ser acessado sem adquirir o lock de idempotência');
  });
  const transaction = jest.fn();
  const conn = {
    query,
    transaction,
  } as unknown as TenantConnectionProvider;
  const redis = {
    setNX: jest.fn(async () => false),
    get: jest.fn(async () => JSON.stringify(payload)),
    compareAndDelete: jest.fn(async () => false),
  } as unknown as RedisService;
  const billing = new BillingService(conn);
  const consumption = new ConsumptionSummaryService(conn);

  return {
    query,
    transaction,
    redis,
    service: new OrdersService(
      conn,
      redis,
      billing,
      consumption,
      new KdsQueryService(conn),
      new OrderDeliveryService(conn, consumption),
      new CustomerBillQueryService(conn, billing),
      new EtaDecoratorService(conn),
    ),
  };
}

async function create(service: OrdersService) {
  return service.createOrder(
    SESSION,
    null,
    'table',
    [{ menuItemId: ITEM, quantity: 1 }],
    undefined,
    'tenant',
    null,
    IDEMPOTENCY_KEY,
  );
}

function expectedFingerprint(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        visitId: null,
        billingMode: 'table',
        notes: null,
        defaultCustomerId: null,
        items: [
          {
            menuItemId: ITEM,
            quantity: 1,
            notes: null,
            extraIds: [],
            customerId: null,
            size: null,
          },
        ],
      }),
    )
    .digest('hex');
}

function durableRow(fingerprint = expectedFingerprint()) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'pending_confirmation',
    billing_mode: 'table' as const,
    total_cents: 1_500,
    created_at: '2026-07-11T00:00:00.000Z',
    auto_confirm_at: '2026-07-11T00:00:15.000Z',
    idempotency_fingerprint: fingerprint,
    item_count: 1,
  };
}

function instantiate(conn: TenantConnectionProvider, redis: RedisService): OrdersService {
  const billing = new BillingService(conn);
  const consumption = new ConsumptionSummaryService(conn);
  return new OrdersService(
    conn,
    redis,
    billing,
    consumption,
    new KdsQueryService(conn),
    new OrderDeliveryService(conn, consumption),
    new CustomerBillQueryService(conn, billing),
    new EtaDecoratorService(conn),
  );
}

describe('OrdersService.createOrder — lock de idempotência', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('após o prazo de espera retorna conflito retryable e jamais segue sem lock', async () => {
    const { service, transaction } = serviceWithInflight({ inflight: true });

    const result = create(service).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(3_100);

    await expect(result).resolves.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({
        error_code: 'ORDER_IDEMPOTENCY_IN_PROGRESS',
        retryable: true,
      }),
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejeita reutilização da mesma chave com fingerprint de payload divergente', async () => {
    const { service, transaction } = serviceWithInflight({
      inflight: true,
      fingerprint: 'fingerprint-de-outro-payload',
    });

    const result = create(service).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(3_100);

    await expect(result).resolves.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({
        error_code: 'ORDER_IDEMPOTENCY_KEY_REUSED',
        retryable: false,
      }),
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('aguarda o owner e devolve o resultado cacheado sem criar outro pedido', async () => {
    const { service, redis, transaction } = serviceWithInflight({ inflight: true });
    const orderId = '44444444-4444-4444-8444-444444444444';
    (redis.get as jest.Mock)
      .mockResolvedValueOnce(JSON.stringify({ inflight: true }))
      .mockResolvedValueOnce(JSON.stringify({ orderId }));
    jest.spyOn(service, 'getOrderById').mockResolvedValue({
      id: orderId,
      status: 'pending_confirmation',
      billingMode: 'table',
      totalCents: 1_500,
      notes: null,
      visitId: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
      autoConfirmAt: '2026-07-11T00:00:15.000Z',
      etaMinutesMin: 10,
      etaMinutesMax: 15,
      queueAhead: 0,
      items: [],
    });

    const result = create(service);
    await jest.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toMatchObject({
      id: orderId,
      orderId,
      idempotent: true,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('libera somente a própria sentinela quando uma falha pré-commit permite retry', async () => {
    let stored: string | null = null;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('o.idempotency_key')) return [];
      throw new Error('falha transitória do banco');
    });
    const conn = {
      query,
      transaction: jest.fn(),
    } as unknown as TenantConnectionProvider;
    const redis = {
      setNX: jest.fn(async (_key: string, value: string) => {
        if (stored !== null) return false;
        stored = value;
        return true;
      }),
      get: jest.fn(async () => stored),
      compareAndDelete: jest.fn(async (_key: string, expected: string) => {
        if (stored !== expected) return false;
        stored = null;
        return true;
      }),
    } as unknown as RedisService;
    const service = new OrdersService(
      conn,
      redis,
      new BillingService(conn),
      new ConsumptionSummaryService(conn),
      new KdsQueryService(conn),
      new OrderDeliveryService(conn, new ConsumptionSummaryService(conn)),
      new CustomerBillQueryService(conn, new BillingService(conn)),
      new EtaDecoratorService(conn),
    );

    await expect(create(service)).rejects.toThrow('falha transitória do banco');
    expect(stored).toBeNull();
    expect(redis.compareAndDelete).toHaveBeenCalledWith(
      `order_idem:${SESSION}:${IDEMPOTENCY_KEY}`,
      expect.stringMatching(/"lockOwner":"[0-9a-f-]{36}"/),
    );

    // A mesma chave consegue adquirir o lock de novo imediatamente; não fica
    // presa no ORDER_IDEMPOTENCY_IN_PROGRESS até o TTL de cinco minutos.
    await expect(create(service)).rejects.toThrow('falha transitória do banco');
    expect(redis.setNX).toHaveBeenCalledTimes(2);
    expect((redis.setNX as jest.Mock).mock.results[1].value).resolves.toBe(true);
  });
});

describe('OrdersService.createOrder — idempotência durável', () => {
  it('commit não vira 500 quando o SET do cache falha e o retry recupera o pedido do banco', async () => {
    let persisted: ReturnType<typeof durableRow> | null = null;
    let orderInsert:
      | {
          sql: string;
          params: unknown[];
        }
      | undefined;

    const query = jest.fn(async (sql: string) => {
      if (sql.includes('o.idempotency_key')) return persisted ? [persisted] : [];
      if (sql.includes('FROM menu_items')) {
        return [{ id: ITEM, price_cents: 1_500, name: 'Prato', sizes: null }];
      }
      throw new Error(`query inesperada no fake: ${sql}`);
    });

    const txQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO orders')) {
        orderInsert = { sql, params };
        return [
          {
            id: durableRow().id,
            status: 'pending_confirmation',
            created_at: durableRow().created_at,
            auto_confirm_at: durableRow().auto_confirm_at,
          },
        ];
      }
      if (sql.includes('INSERT INTO order_items')) {
        return [{ id: '55555555-5555-4555-8555-555555555555' }];
      }
      return [];
    });
    const transaction = jest.fn(
      async (work: (tx: { query: typeof txQuery }) => Promise<unknown>) => {
        const result = await work({ query: txQuery });
        persisted = durableRow(String(orderInsert?.params[7]));
        return result;
      },
    );
    const conn = { query, transaction } as unknown as TenantConnectionProvider;
    const redis = {
      setNX: jest.fn(async () => true),
      get: jest.fn(async () => null),
      set: jest.fn(async () => {
        throw new Error('Redis indisponível após o COMMIT');
      }),
      compareAndDelete: jest.fn(async () => false),
    } as unknown as RedisService;
    const service = instantiate(conn, redis);
    const warn = jest.spyOn(
      (service as unknown as { ordersLogger: { warn: (message: string) => void } }).ordersLogger,
      'warn',
    );

    await expect(create(service)).resolves.toMatchObject({
      id: durableRow().id,
      orderId: durableRow().id,
      status: 'pending_confirmation',
    });
    expect(orderInsert?.sql).toContain('idempotency_key, idempotency_fingerprint');
    expect(orderInsert?.params[6]).toBe(IDEMPOTENCY_KEY);
    expect(orderInsert?.params[7]).toBe(expectedFingerprint());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('comitado'));
    expect(transaction).toHaveBeenCalledTimes(1);

    // O Redis continua falhando e a sentinela antiga poderia estar presa, mas
    // a leitura durável acontece antes do SETNX: nenhum segundo INSERT.
    await expect(create(service)).resolves.toMatchObject({
      id: durableRow().id,
      orderId: durableRow().id,
      idempotent: true,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(redis.setNX).toHaveBeenCalledTimes(1);
  });

  it('rejeita no pre-check durável a mesma chave com fingerprint divergente', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('o.idempotency_key')) return [durableRow('f'.repeat(64))];
      throw new Error(`query inesperada no fake: ${sql}`);
    });
    const transaction = jest.fn();
    const conn = { query, transaction } as unknown as TenantConnectionProvider;
    const redis = {
      setNX: jest.fn(),
      compareAndDelete: jest.fn(),
    } as unknown as RedisService;

    await expect(create(instantiate(conn, redis))).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({
        error_code: 'ORDER_IDEMPOTENCY_KEY_REUSED',
        retryable: false,
      }),
    });
    expect(redis.setNX).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('converge na row vencedora quando a UNIQUE resolve uma corrida pós-lease', async () => {
    let durableReads = 0;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('o.idempotency_key')) {
        durableReads += 1;
        return durableReads === 1 ? [] : [durableRow()];
      }
      if (sql.includes('FROM menu_items')) {
        return [{ id: ITEM, price_cents: 1_500, name: 'Prato', sizes: null }];
      }
      throw new Error(`query inesperada no fake: ${sql}`);
    });
    const uniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      {
        code: '23505',
        constraint: 'orders_table_session_idempotency_key_unique',
      },
    );
    const transaction = jest.fn(async () => {
      throw uniqueViolation;
    });
    const conn = { query, transaction } as unknown as TenantConnectionProvider;
    const redis = {
      setNX: jest.fn(async () => true),
      set: jest.fn(async () => undefined),
      compareAndDelete: jest.fn(async () => false),
    } as unknown as RedisService;

    await expect(create(instantiate(conn, redis))).resolves.toMatchObject({
      id: durableRow().id,
      orderId: durableRow().id,
      idempotent: true,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(durableReads).toBe(2);
    expect(redis.set).toHaveBeenCalledWith(
      `order_idem:${SESSION}:${IDEMPOTENCY_KEY}`,
      JSON.stringify({ orderId: durableRow().id, fingerprint: expectedFingerprint() }),
      300,
    );
  });

  it('continua seguro quando o Redis nem consegue adquirir o lock', async () => {
    let inserted = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('o.idempotency_key')) return [];
      if (sql.includes('FROM menu_items')) {
        return [{ id: ITEM, price_cents: 1_500, name: 'Prato', sizes: null }];
      }
      throw new Error(`query inesperada no fake: ${sql}`);
    });
    const txQuery = jest.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO orders')) {
        inserted = true;
        return [
          {
            id: durableRow().id,
            status: 'pending_confirmation',
            created_at: durableRow().created_at,
            auto_confirm_at: durableRow().auto_confirm_at,
          },
        ];
      }
      if (sql.includes('INSERT INTO order_items')) {
        return [{ id: '55555555-5555-4555-8555-555555555555' }];
      }
      return [];
    });
    const transaction = jest.fn(async (work: (tx: { query: typeof txQuery }) => Promise<unknown>) =>
      work({ query: txQuery }),
    );
    const conn = { query, transaction } as unknown as TenantConnectionProvider;
    const redis = {
      setNX: jest.fn(async () => {
        throw new Error('Redis fora');
      }),
      set: jest.fn(async () => undefined),
      compareAndDelete: jest.fn(async () => false),
    } as unknown as RedisService;

    await expect(create(instantiate(conn, redis))).resolves.toMatchObject({
      id: durableRow().id,
    });
    expect(inserted).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
