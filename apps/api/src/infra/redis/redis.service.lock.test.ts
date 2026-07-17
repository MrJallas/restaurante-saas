const mockRedisClient = {
  on: jest.fn(),
  eval: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockRedisClient),
}));

import { RedisService } from './redis.service';

describe('RedisService.compareAndDelete', () => {
  beforeEach(() => {
    mockRedisClient.eval.mockReset();
  });

  it('remove a chave somente quando o valor ainda pertence ao caller', async () => {
    mockRedisClient.eval.mockResolvedValueOnce(1);
    const redis = new RedisService();

    await expect(redis.compareAndDelete('payment_lock:session:tablebill', 'owner-a')).resolves.toBe(
      true,
    );

    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),
      1,
      'payment_lock:session:tablebill',
      'owner-a',
    );
  });

  it('não remove o lock quando ele já foi readquirido por outro owner', async () => {
    mockRedisClient.eval.mockResolvedValueOnce(0);
    const redis = new RedisService();

    await expect(redis.compareAndDelete('payment_lock:session:tablebill', 'owner-a')).resolves.toBe(
      false,
    );
  });
});
