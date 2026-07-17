import { AiServiceClient } from './ai-service.client';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('AiServiceClient customer tool delegation', () => {
  it('keeps the table-session id separate from the A07 bearer token', async () => {
    const requests: RequestInit[] = [];
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init || {});
      return {
        ok: true,
        json: async () => ({
          response: 'ok',
          tokens_in: 1,
          tokens_out: 1,
          model: 'test',
          provider: 'test',
          latency_ms: 1,
          estimated_cost_cents: 0,
        }),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new AiServiceClient();
    await client.chat('chame o garçom', [], {}, undefined, {
      tenantId: 'luna',
      customerId: 'customer-id',
      sessionId: 'table-session-resource-id',
      sessionToken: 'hmac-bearer-token',
    });

    const init = requests[0];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.sessionId).toBe('table-session-resource-id');
    expect(body.sessionToken).toBe('hmac-bearer-token');
  });
});
