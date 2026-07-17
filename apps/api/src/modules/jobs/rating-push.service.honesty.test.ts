import type { DataSource } from 'typeorm';
import type { RedisService } from '../../infra/redis/redis.service';
import type { PushService } from './push.service';
import { RatingPushService } from './rating-push.service';

describe('RatingPushService delivery honesty', () => {
  it('releases dedup and retries when the provider reports not delivered', async () => {
    const runnerQuery = jest.fn(async (sql: string) => {
      if (sql.startsWith('SET search_path')) return [];
      if (sql.includes('FROM order_ratings')) {
        return [{ id: 'rating-1', order_id: 'order-1', customer_id: 'customer-1' }];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    });
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM public.restaurants')) {
          return [{ slug: 'luna', schema_name: 'tenant_luna' }];
        }
        if (sql.includes('information_schema.tables')) return [{ exists: 1 }];
        throw new Error(`SQL inesperado: ${sql}`);
      }),
      createQueryRunner: () => ({
        connect: jest.fn(async () => undefined),
        query: runnerQuery,
        release: jest.fn(async () => undefined),
      }),
    } as unknown as DataSource;
    const push = {
      sendOrderRatingPush: jest.fn(async () => ({
        delivered: false,
        reason: 'provider_not_configured' as const,
      })),
    } as unknown as PushService;
    const redis = {
      setNX: jest.fn(async () => true),
      del: jest.fn(async () => 1),
    } as unknown as RedisService;

    const service = new RatingPushService(dataSource, push, redis);
    await service.ratingPushTick();
    await service.ratingPushTick();

    expect(push.sendOrderRatingPush).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenNthCalledWith(1, 'rating-push:rating-1');
    expect(redis.del).toHaveBeenNthCalledWith(2, 'rating-push:rating-1');
  });
});
