import { EventsGateway } from './events.gateway';
import { EventsEmitterService } from './events-emitter.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { DataSource } from 'typeorm';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const SCHEMA = 'restaurant_dev';

function socket() {
  return {
    handshake: { headers: { cookie: `recognition_token=${TOKEN}` } },
  };
}

function gateway(rows: Array<{ id: string }>) {
  const redis = {
    get: jest.fn(async () => CUSTOMER),
    del: jest.fn(async () => undefined),
  };
  const dataSource = { query: jest.fn(async () => rows) };
  const instance = new EventsGateway(
    redis as unknown as RedisService,
    dataSource as unknown as DataSource,
    new EventsEmitterService(),
  );
  return { instance, redis, dataSource };
}

describe('EventsGateway — cache de recognition token não é autoridade', () => {
  it('rejeita e remove mapping cacheado quando o token já foi rotacionado no banco', async () => {
    const ctx = gateway([]);

    const resolved = await (
      ctx.instance as unknown as {
        resolveRecognizedCustomer(client: unknown, schema: string): Promise<string | null>;
      }
    ).resolveRecognizedCustomer(socket(), SCHEMA);

    expect(resolved).toBeNull();
    expect(ctx.dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('recognition_token = $2'),
      [CUSTOMER, TOKEN],
    );
    expect(ctx.redis.del).toHaveBeenCalledWith(`recognition_customer:${SCHEMA}:${TOKEN}`);
  });

  it('aceita o cache somente quando o mesmo par customer/token ainda existe no banco', async () => {
    const ctx = gateway([{ id: CUSTOMER }]);

    const resolved = await (
      ctx.instance as unknown as {
        resolveRecognizedCustomer(client: unknown, schema: string): Promise<string | null>;
      }
    ).resolveRecognizedCustomer(socket(), SCHEMA);

    expect(resolved).toBe(CUSTOMER);
    expect(ctx.redis.del).not.toHaveBeenCalled();
  });
});
