import { ConflictException } from '@nestjs/common';
import { LgpdService } from './lgpd.service';
import type { TenantConnectionProvider, TenantTx } from '../tenant/tenant-connection.provider';
import type { ChatHistoryService } from '../chat-history/chat-history.service';
import type { CustomerStaffMessagesService } from '../customer-staff-messages/customer-staff-messages.service';
import type { EventsGateway } from '../websocket/events.gateway';
import type { RedisService } from '../../infra/redis/redis.service';

const TENANT = 'restaurant_dev';
const EVENT_SLUG = 'demo';
const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const PROTOCOL = 'LGPD-2026-07-11-0001';
const CANONICAL_CPF = '12345678901';
const VICTIM_CPF = '98765432100';
const OLD_RECOGNITION_TOKEN = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_A = '44444444-4444-4444-8444-444444444444';
const ATTEMPT_B = '55555555-5555-4555-8555-555555555555';

type RequestStatus = 'pending' | 'in_progress' | 'fulfilled';

function row(
  status: RequestStatus = 'pending',
  options: { attemptToken?: string; leaseExpiresAt?: string } = {},
) {
  return {
    id: REQUEST,
    customer_id: status === 'fulfilled' ? null : CUSTOMER,
    customer_cpf: status === 'fulfilled' ? null : CANONICAL_CPF,
    customer_email: status === 'fulfilled' ? null : 'cliente@example.com',
    kind: 'erasure',
    status,
    protocol_number: PROTOCOL,
    requested_at: '2026-07-11T00:00:00.000Z',
    fulfilled_at: status === 'fulfilled' ? '2026-07-11T00:00:01.000Z' : null,
    notes: null,
    processing_attempt_token: status === 'in_progress' ? (options.attemptToken ?? ATTEMPT_A) : null,
    processing_lease_expires_at:
      status === 'in_progress'
        ? (options.leaseExpiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString())
        : null,
  };
}

function fakeTenant(options: { failPostgresStore?: string; failRetryTransition?: boolean } = {}) {
  const queries: string[] = [];
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let current = row();
  let failRetryTransition = options.failRetryTransition === true;

  const query = jest.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    queries.push(sql);
    calls.push({ sql, params });
    if (
      (sql.includes('SELECT id, cpf') || sql.includes('SELECT cpf')) &&
      sql.includes('FROM customers')
    ) {
      return [{ id: CUSTOMER, cpf: CANONICAL_CPF, recognition_token: OLD_RECOGNITION_TOKEN }];
    }
    if (sql.includes('INSERT INTO lgpd_requests')) return [current];
    if (sql.includes('lgpd:claim')) {
      const leaseExpired =
        current.status === 'in_progress' &&
        (!current.processing_lease_expires_at ||
          new Date(current.processing_lease_expires_at).getTime() <= Date.now());
      if (current.status !== 'pending' && !leaseExpired) return [];
      current = row('in_progress', {
        attemptToken: String(params[1]),
        leaseExpiresAt: new Date(Date.now() + Number(params[2]) * 1000).toISOString(),
      });
      return [current];
    }
    if (
      sql.includes('SELECT id, kind, status') ||
      (sql.includes('SELECT * FROM lgpd_requests') && sql.includes('WHERE id = $1'))
    ) {
      return [current];
    }
    if (options.failPostgresStore && sql.includes(`lgpd:${options.failPostgresStore}`)) {
      throw new Error(`forced postgres failure: ${options.failPostgresStore}`);
    }
    if (sql.includes('lgpd:verify')) {
      return [
        {
          assistant_messages_remaining: 0,
          customer_links_remaining: 0,
          lgpd_cpf_remaining: 0,
          customer_pii_remaining: 0,
        },
      ];
    }
    if (sql.includes("SET status = 'fulfilled'")) {
      if (current.status !== 'in_progress' || current.processing_attempt_token !== params[2]) {
        return [];
      }
      current = row('fulfilled');
      return [current];
    }
    if (sql.includes('erasure_retry_required')) {
      if (failRetryTransition) throw new Error('forced retry transition failure');
      if (current.status !== 'in_progress' || current.processing_attempt_token !== params[2]) {
        return [];
      }
      current = row('pending');
      return [current];
    }
    // Cada mutation CTE devolve confirmação/count mesmo quando não havia rows.
    return [{ count: 0 }];
  });

  const tenant = {
    query,
    transaction: async <T>(work: (tx: TenantTx) => Promise<T>) => work({ query }),
  } as unknown as TenantConnectionProvider;
  return {
    tenant,
    query,
    queries,
    calls,
    getCurrent: () => current,
    setCurrent: (
      next: RequestStatus,
      rowOptions: { attemptToken?: string; leaseExpiresAt?: string } = {},
    ) => {
      current = row(next, rowOptions);
    },
    setFailRetryTransition: (value: boolean) => {
      failRetryTransition = value;
    },
  };
}

function mongoStore(confirmed: boolean, available = true) {
  return {
    deleteAllForCustomer: jest.fn(async () => ({
      mongoAvailable: available,
      confirmed,
      deletedCount: confirmed ? 2 : 0,
      threadsDeleted: confirmed ? 1 : 0,
      messagesRemaining: confirmed ? 0 : 1,
      threadsRemaining: confirmed ? 0 : 1,
    })),
  };
}

function staffMongoStore(confirmed: boolean, available = true) {
  return {
    deleteAll: jest.fn(async () => ({
      mongoAvailable: available,
      confirmed,
      deletedCount: confirmed ? 2 : 0,
      threadsMarked: confirmed ? 1 : 0,
      messagesRemaining: confirmed ? 0 : 1,
      threadsRemaining: confirmed ? 0 : 1,
    })),
  };
}

function service(options: {
  chatConfirmed: boolean;
  staffConfirmed: boolean;
  mongoAvailable?: boolean;
  failPostgresStore?: string;
}) {
  const db = fakeTenant({ failPostgresStore: options.failPostgresStore });
  const chat = mongoStore(options.chatConfirmed, options.mongoAvailable ?? true);
  const staff = staffMongoStore(options.staffConfirmed, options.mongoAvailable ?? true);
  const events = { emitLgpdFulfilled: jest.fn(), disconnectCustomer: jest.fn() };
  const redis = { del: jest.fn(async () => undefined) };
  return {
    db,
    chat,
    staff,
    events,
    redis,
    service: new LgpdService(
      db.tenant,
      chat as unknown as ChatHistoryService,
      staff as unknown as CustomerStaffMessagesService,
      events as unknown as EventsGateway,
      redis as unknown as RedisService,
    ),
  };
}

const input = {
  kind: 'erasure' as const,
  customerId: CUSTOMER,
  customerCpf: CANONICAL_CPF,
  customerEmail: 'cliente@example.com',
  protocolNumber: PROTOCOL,
};

describe('LgpdService — fulfillment honesto e retryable', () => {
  it('Mongo offline mantém pending/retryable e nunca emite fulfilled', async () => {
    const ctx = service({
      chatConfirmed: false,
      staffConfirmed: false,
      mongoAvailable: false,
    });

    const result = await ctx.service.createRequest(input, TENANT, EVENT_SLUG);

    expect(result).toMatchObject({ status: 'pending', executedAt: null, retryable: true });
    expect(ctx.db.queries.some((sql) => sql.includes("SET status = 'fulfilled'"))).toBe(false);
    expect(ctx.events.emitLgpdFulfilled).not.toHaveBeenCalled();
  });

  it('deleção Mongo parcial mantém pending mesmo se uma store confirmou', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: false });

    const result = await ctx.service.createRequest(input, TENANT, EVENT_SLUG);

    expect(result).toMatchObject({ status: 'pending', retryable: true });
    expect(ctx.staff.deleteAll).toHaveBeenCalledWith(CUSTOMER, TENANT);
    expect(ctx.events.emitLgpdFulfilled).not.toHaveBeenCalled();
  });

  it('falha Postgres após Mongo mantém request pendente para retry', async () => {
    const ctx = service({
      chatConfirmed: true,
      staffConfirmed: true,
      failPostgresStore: 'complaints',
    });

    const result = await ctx.service.createRequest(input, TENANT, EVENT_SLUG);

    expect(result).toMatchObject({ status: 'pending', retryable: true });
    expect(ctx.events.emitLgpdFulfilled).not.toHaveBeenCalled();
  });

  it('só fulfilled após Mongo confirmado, Postgres anonimizado e verificação zerada', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });

    const result = await ctx.service.createRequest(input, TENANT, EVENT_SLUG);

    expect(result).toMatchObject({
      protocolNumber: PROTOCOL,
      status: 'fulfilled',
      retryable: false,
    });
    for (const store of [
      'assistant_messages',
      'feedbacks',
      'order_ratings',
      'complaints',
      'customer_events',
      'customers',
      'lgpd_requests',
      'verify',
    ]) {
      expect(ctx.db.queries.some((sql) => sql.includes(`lgpd:${store}`))).toBe(true);
    }
    expect(ctx.events.emitLgpdFulfilled).toHaveBeenCalledWith(
      EVENT_SLUG,
      CUSTOMER,
      PROTOCOL,
      REQUEST,
    );
    expect(ctx.redis.del).toHaveBeenCalledWith(
      `recognition_customer:${TENANT}:${OLD_RECOGNITION_TOKEN}`,
    );
    expect(ctx.events.disconnectCustomer).toHaveBeenCalledWith(CUSTOMER);
    expect(ctx.events.emitLgpdFulfilled.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.events.disconnectCustomer.mock.invocationCallOrder[0],
    );
    const fulfilledCas = ctx.db.calls.find((call) => call.sql.includes("SET status = 'fulfilled'"));
    expect(fulfilledCas?.sql).toContain('processing_attempt_token = NULL');
    expect(fulfilledCas?.sql).toContain('AND processing_attempt_token = $3');
  });

  it('falha best-effort no cache não desfaz fulfillment nem impede desconexão', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });
    ctx.redis.del.mockRejectedValueOnce(new Error('redis offline'));

    const result = await ctx.service.createRequest(input, TENANT, EVENT_SLUG);

    expect(result).toMatchObject({ status: 'fulfilled', retryable: false });
    expect(ctx.events.disconnectCustomer).toHaveBeenCalledWith(CUSTOMER);
    expect(ctx.db.getCurrent().status).toBe('fulfilled');
  });

  it('retry reexecuta a mesma request pending e preserva o protocolo', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });

    const result = await ctx.service.retryRequest(REQUEST, TENANT, EVENT_SLUG);

    expect(result).toMatchObject({ protocolNumber: PROTOCOL, status: 'fulfilled' });
    expect(ctx.chat.deleteAllForCustomer).toHaveBeenCalledWith(CUSTOMER, TENANT);
  });

  it('reivindica retry por CAS: dois retries concorrentes executam stores uma vez só', async () => {
    const db = fakeTenant();
    let releaseChat!: () => void;
    let signalChatStarted!: () => void;
    const chatStarted = new Promise<void>((resolve) => {
      signalChatStarted = resolve;
    });
    const chatRelease = new Promise<void>((resolve) => {
      releaseChat = resolve;
    });
    const chat = {
      deleteAllForCustomer: jest.fn(async () => {
        signalChatStarted();
        await chatRelease;
        return {
          mongoAvailable: true,
          confirmed: true,
          deletedCount: 1,
          messagesRemaining: 0,
          threadsRemaining: 0,
        };
      }),
    };
    const staff = staffMongoStore(true);
    const tested = new LgpdService(
      db.tenant,
      chat as unknown as ChatHistoryService,
      staff as unknown as CustomerStaffMessagesService,
    );

    const winningRetry = tested.retryRequest(REQUEST, TENANT, EVENT_SLUG);
    await chatStarted;

    await expect(tested.retryRequest(REQUEST, TENANT, EVENT_SLUG)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(chat.deleteAllForCustomer).toHaveBeenCalledTimes(1);
    expect(staff.deleteAll).toHaveBeenCalledTimes(1);

    releaseChat();
    await expect(winningRetry).resolves.toMatchObject({ status: 'fulfilled' });
    expect(db.getCurrent().status).toBe('fulfilled');
  });

  it('retoma atomicamente uma execução in_progress cujo lease expirou', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });
    ctx.db.setCurrent('in_progress', {
      attemptToken: ATTEMPT_A,
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const result = await ctx.service.retryRequest(REQUEST, TENANT, EVENT_SLUG);

    expect(result).toMatchObject({ status: 'fulfilled', protocolNumber: PROTOCOL });
    const claim = ctx.db.calls.find((call) => call.sql.includes('lgpd:claim'));
    expect(claim?.sql).toContain('processing_lease_expires_at <= now()');
    expect(claim?.params[1]).not.toBe(ATTEMPT_A);
    expect(ctx.db.getCurrent().status).toBe('fulfilled');
  });

  it('lease ativa não pode ser roubada por outro retry', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });
    ctx.db.setCurrent('in_progress', {
      attemptToken: ATTEMPT_A,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(ctx.service.retryRequest(REQUEST, TENANT, EVENT_SLUG)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.chat.deleteAllForCustomer).not.toHaveBeenCalled();
  });

  it('falha ao registrar pending continua recuperável depois do lease', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });
    ctx.db.setCurrent('in_progress', {
      attemptToken: ATTEMPT_A,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    ctx.db.setFailRetryTransition(true);
    const ownedAttempt = ctx.db.getCurrent();

    const afterFailedTransition = await (
      ctx.service as unknown as {
        markRetryRequired(
          original: Record<string, unknown>,
          code: string,
          details: unknown,
        ): Promise<Record<string, unknown>>;
      }
    ).markRetryRequired(ownedAttempt, 'FORCED_FAILURE', {});

    expect(afterFailedTransition.status).toBe('in_progress');
    expect(ctx.db.getCurrent().status).toBe('in_progress');

    // Simula passagem do tempo/processo reiniciado. A falha anterior não
    // precisa ter conseguido gravar pending: o claim retoma pela lease.
    ctx.db.setFailRetryTransition(false);
    ctx.db.setCurrent('in_progress', {
      attemptToken: ATTEMPT_A,
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    await expect(ctx.service.retryRequest(REQUEST, TENANT, EVENT_SLUG)).resolves.toMatchObject({
      status: 'fulfilled',
    });
  });

  it('falha tardia não consegue regredir uma request fulfilled para pending', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });
    ctx.db.setCurrent('fulfilled');
    const staleExecution = row('in_progress');

    const result = await (
      ctx.service as unknown as {
        markRetryRequired(
          original: Record<string, unknown>,
          code: string,
          details: unknown,
        ): Promise<Record<string, unknown>>;
      }
    ).markRetryRequired(staleExecution, 'LATE_FAILURE', { source: 'older-retry' });

    expect(result.status).toBe('fulfilled');
    expect(ctx.db.getCurrent().status).toBe('fulfilled');
    const transition = ctx.db.calls.find((call) => call.sql.includes('erasure_retry_required'));
    expect(transition?.sql).toContain("AND status = 'in_progress'");
    expect(transition?.sql).toContain('AND processing_attempt_token = $3');
  });

  it('tentativa antiga não devolve para pending uma lease assumida por outra execução', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });
    ctx.db.setCurrent('in_progress', {
      attemptToken: ATTEMPT_B,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const staleExecution = row('in_progress', {
      attemptToken: ATTEMPT_A,
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const result = await (
      ctx.service as unknown as {
        markRetryRequired(
          original: Record<string, unknown>,
          code: string,
          details: unknown,
        ): Promise<Record<string, unknown>>;
      }
    ).markRetryRequired(staleExecution, 'STALE_FAILURE', {});

    expect(result.status).toBe('in_progress');
    expect(result.processing_attempt_token).toBe(ATTEMPT_B);
    expect(ctx.db.getCurrent().processing_attempt_token).toBe(ATTEMPT_B);
  });

  it('usa CPF canônico de A e o scrub não alcança request ligada à vítima B', async () => {
    const ctx = service({ chatConfirmed: true, staffConfirmed: true });

    await ctx.service.createCustomerRequest(
      {
        kind: 'erasure',
        customerId: CUSTOMER,
        protocolNumber: PROTOCOL,
      },
      TENANT,
      EVENT_SLUG,
    );

    const insert = ctx.db.calls.find((call) => call.sql.includes('INSERT INTO lgpd_requests'));
    expect(insert?.params).toEqual([CUSTOMER, CANONICAL_CPF, null, 'erasure', PROTOCOL, null]);
    const scrub = ctx.db.calls.find((call) => call.sql.includes('lgpd:lgpd_requests_scrub'));
    expect(scrub?.params).toEqual([CUSTOMER, CANONICAL_CPF]);
    expect(scrub?.params).not.toContain(VICTIM_CPF);
    expect(scrub?.sql).toContain('customer_id IS NULL');
  });
});
