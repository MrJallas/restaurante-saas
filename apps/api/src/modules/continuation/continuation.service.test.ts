/**
 * Matriz de contexto do assistente (prompt 100 §2 + §7, unit/integration):
 * derivação de kind com CONSUMO 1x por evento, hierarquia que pula kinds
 * consumidos, re-liberação por evento novo, hint que não fura a regra e
 * fallback do AI service que NÃO queima o consumo.
 *
 * Fakes: TenantConnectionProvider roteado por substring de SQL, Redis em
 * memória, `fetch` global mockado fazendo eco do kind pedido (mesmo shape
 * do ai-service /continuation).
 */

import { ContinuationService } from './continuation.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';

interface FakeDbState {
  complaint?: { complaint_id: string; manager_name: string | null } | null;
  payment?: { payment_id: string; order_id: string | null } | null;
  activeOrder?: { id: string } | null;
  waiterCall?: { id: string; age_sec: number } | null;
  menuEvent?: { event_type: string; item_name: string | null } | null;
  hasPriorEvents?: boolean;
  latestOrderId?: string | null;
}

function fakeTenantConn(state: FakeDbState): TenantConnectionProvider {
  const query = async (sql: string): Promise<unknown[]> => {
    if (sql.includes('FROM table_sessions ts')) {
      return [{ table_label: 'Mesa 7' }];
    }
    if (sql.includes('FROM customers')) {
      return [{ name: 'Ana' }];
    }
    if (sql.includes('FROM complaints c')) {
      return state.complaint ? [state.complaint] : [];
    }
    if (sql.includes('ROUND(AVG')) {
      return [{ avg_min: 3 }];
    }
    // ANTES dos branches de payments/orders/waiter_calls: a query de
    // "prior events" é um UNION ALL que contém todos esses FROMs.
    if (sql.includes('UNION ALL')) {
      return state.hasPriorEvents ? [{ ok: 1 }] : [];
    }
    if (sql.includes('FROM payments p')) {
      return state.payment ? [state.payment] : [];
    }
    if (sql.includes("INTERVAL '30 minutes'")) {
      return state.activeOrder ? [state.activeOrder] : [];
    }
    if (sql.includes('FROM order_items')) {
      return [{ quantity: 2, name: 'Risoto' }];
    }
    if (sql.includes('FROM waiter_calls')) {
      return state.waiterCall ? [state.waiterCall] : [];
    }
    if (sql.includes('FROM customer_events')) {
      return state.menuEvent ? [state.menuEvent] : [];
    }
    if (sql.includes('FROM orders')) {
      // latestOrderIdForSession + last-order do voltou_sem_acao.
      return state.latestOrderId ? [{ id: state.latestOrderId }] : [];
    }
    throw new Error(`fakeTenantConn: SQL não roteado:\n${sql}`);
  };
  return {
    query,
    getTenantSlug: () => 'restaurant_dev',
  } as unknown as TenantConnectionProvider;
}

function fakeRedis(): RedisService {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as RedisService;
}

/** Mock do ai-service: eco do kind pedido (ou first_time quando null). */
function mockAiFetch(opts: { fail?: boolean } = {}) {
  return jest.fn(async (_url: unknown, init?: { body?: string }) => {
    if (opts.fail) {
      return { ok: false, status: 503 } as Response;
    }
    const body = JSON.parse((init?.body as string) ?? '{}') as { kind?: string | null };
    return {
      ok: true,
      json: async () => ({
        message: body.kind ? { kind: body.kind } : null,
        rendered: `mensagem contextual (${body.kind ?? 'first_time'})`,
        chips: [{ id: 'x', label: 'Chip', action: 'send', payload: 'oi' }],
        subtitle: null,
        primary_cta: null,
      }),
    } as unknown as Response;
  });
}

function makeService(state: FakeDbState, redis = fakeRedis()) {
  return new ContinuationService(fakeTenantConn(state), redis);
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('Matriz de contexto consumível (prompt 100 §7)', () => {
  it('fez pedido → 1ª entrada mostra abriu_pedido; 2ª entrada (veio do cardápio) mostra viu_cardapio com eyebrow cobrindo o pedido', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      activeOrder: { id: 'order-1' },
      menuEvent: { event_type: 'menu_viewed', item_name: 'Risoto' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = makeService(state);

    const first = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(first.kind).toBe('abriu_pedido');

    const second = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    // Consumido: pula pro contexto de navegação (cardápio recente).
    // O ai-service mapeia viu_cardapio→viu_menu; o eco devolve viu_menu.
    expect(second.kind).toBe('viu_menu');
  });

  it('2ª entrada SEM cardápio recente cai em voltou_sem_acao', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      activeOrder: { id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = makeService(state);

    const first = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(first.kind).toBe('abriu_pedido');

    const second = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(second.kind).toBe('voltou_sem_acao');
  });

  it('novo pedido (2º, id novo) re-libera a mensagem de pedido', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      activeOrder: { id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const redis = fakeRedis();
    const service = makeService(state, redis);

    await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    // Segundo pedido entra na sessão — evento NOVO.
    state.activeOrder = { id: 'order-2' };
    state.latestOrderId = 'order-2';
    const after = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(after.kind).toBe('abriu_pedido');
  });

  it('home NÃO consome: várias visitas à home mantêm o contexto; assistente continua com direito ao 1x', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      activeOrder: { id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = makeService(state);

    for (let i = 0; i < 2; i += 1) {
      const home = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
        surface: 'home',
      });
      expect(home.kind).toBe('abriu_pedido');
    }
    const assistente = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(assistente.kind).toBe('abriu_pedido');
    const again = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(again.kind).toBe('voltou_sem_acao');
  });

  it('hierarquia entre consumíveis: reclamação > pedido; consumir a reclamação revela o pedido', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      complaint: { complaint_id: 'comp-1', manager_name: 'Renata' },
      activeOrder: { id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = makeService(state);

    const first = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(first.kind).toBe('pos_reclamacao');

    const second = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(second.kind).toBe('abriu_pedido');

    const third = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(third.kind).toBe('voltou_sem_acao');
  });

  it('pagou (payment row) é consumível 1x', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      payment: { payment_id: 'pay-1', order_id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = makeService(state);

    expect(
      (await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
        surface: 'assistente',
      })).kind,
    ).toBe('pagou');
    expect(
      (await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
        surface: 'assistente',
      })).kind,
    ).toBe('voltou_sem_acao');
  });

  it('chamou_garcom (waiter_call) é consumível 1x', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      waiterCall: { id: 'call-1', age_sec: 90 },
      hasPriorEvents: true,
      latestOrderId: null,
    };
    const service = makeService(state);

    expect(
      (await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
        surface: 'assistente',
      })).kind,
    ).toBe('chamou_garcom');
    expect(
      (await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
        surface: 'assistente',
      })).kind,
    ).toBe('voltou_sem_acao');
  });

  it('clientKindHint não fura o consumo: hint de abriu_pedido consumido cai pro próximo contexto', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      activeOrder: { id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = makeService(state);

    await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    const hinted = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
      clientKindHint: 'abriu_pedido',
    });
    expect(hinted.kind).toBe('voltou_sem_acao');
  });

  it('fallback do AI service NÃO consome — o cliente ainda não viu a mensagem do evento', async () => {
    const state: FakeDbState = {
      activeOrder: { id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = makeService(state);

    global.fetch = mockAiFetch({ fail: true }) as unknown as typeof fetch;
    const failed = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(failed.kind).toBe('first_time'); // FALLBACK_RESPONSE

    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const recovered = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
      surface: 'assistente',
    });
    expect(recovered.kind).toBe('abriu_pedido');
  });

  it('sem Redis injetado, degrada sem consumo (mensagem repete, nada quebra)', async () => {
    global.fetch = mockAiFetch() as unknown as typeof fetch;
    const state: FakeDbState = {
      activeOrder: { id: 'order-1' },
      hasPriorEvents: true,
      latestOrderId: 'order-1',
    };
    const service = new ContinuationService(fakeTenantConn(state));

    for (let i = 0; i < 2; i += 1) {
      const res = await service.getContinuation(SESSION, CUSTOMER, 'restaurant_dev', {
        surface: 'assistente',
      });
      expect(res.kind).toBe('abriu_pedido');
    }
  });
});
