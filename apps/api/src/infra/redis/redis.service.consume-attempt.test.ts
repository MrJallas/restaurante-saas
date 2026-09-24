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

/**
 * A semântica do script (trava → incr → trava ao estourar) é provada contra o
 * Redis real pela rajada do E2E P1-X7-3; aqui fica a fiação: um único EVAL com
 * as duas chaves do bucket e os limites como argumentos.
 */
describe('RedisService.consumeAttempt', () => {
  beforeEach(() => {
    mockRedisClient.eval.mockReset();
  });

  it('reserva a tentativa num único EVAL com as chaves attempts e lock do bucket', async () => {
    mockRedisClient.eval.mockResolvedValueOnce(1);
    const redis = new RedisService();

    await expect(redis.consumeAttempt('customers:identify:127.0.0.1', 5, 900, 600)).resolves.toBe(
      true,
    );

    expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('exists', KEYS[2]) == 1"),
      2,
      'customers:identify:127.0.0.1:attempts',
      'customers:identify:127.0.0.1:lock',
      '5',
      '900',
      '600',
    );
  });

  it('trava ativa ou limite estourado (script devolve 0) → recusa', async () => {
    mockRedisClient.eval.mockResolvedValueOnce(0);
    const redis = new RedisService();

    await expect(redis.consumeAttempt('customers:welcome:ip:sess', 30, 900, 900)).resolves.toBe(
      false,
    );
  });
});
