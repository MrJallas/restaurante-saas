const mockRedisClient = {
  on: jest.fn(),
  eval: jest.fn(),
  del: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockRedisClient),
}));

import { RedisService, type AttemptBucket } from './redis.service';

/**
 * A semântica do script (travas → contagem → trava na max-ésima) foi provada
 * contra o Redis real e é reproduzida em attempts-in-memory.testing.ts; aqui
 * fica a fiação: um único EVAL com os pares de chaves de cada balde e as
 * trincas max/janela/trava, na mesma ordem.
 */
const BY_IP: AttemptBucket = {
  key: 'staff:pin_ip:10.0.0.1',
  max: 20,
  windowSeconds: 900,
  lockSeconds: 900,
};
const BY_STAFF: AttemptBucket = {
  key: 'staff:pin:abc',
  max: 5,
  windowSeconds: 300,
  lockSeconds: 300,
};

describe('RedisService.reserveAttempt', () => {
  beforeEach(() => {
    mockRedisClient.eval.mockReset();
    mockRedisClient.del.mockReset();
  });

  it('reserva em todos os baldes num único EVAL', async () => {
    mockRedisClient.eval.mockResolvedValueOnce(0);
    const redis = new RedisService();

    await expect(redis.reserveAttempt(BY_IP, BY_STAFF)).resolves.toBeNull();

    expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('exists', KEYS[2 * i]) == 1"),
      4,
      'staff:pin_ip:10.0.0.1:attempts',
      'staff:pin_ip:10.0.0.1:lock',
      'staff:pin:abc:attempts',
      'staff:pin:abc:lock',
      '20',
      '900',
      '900',
      '5',
      '300',
      '300',
    );
  });

  it('devolve o balde cuja trava recusou (o script devolve o índice 1..n)', async () => {
    const redis = new RedisService();

    mockRedisClient.eval.mockResolvedValueOnce(2);
    await expect(redis.reserveAttempt(BY_IP, BY_STAFF)).resolves.toBe(BY_STAFF);

    mockRedisClient.eval.mockResolvedValueOnce(1);
    await expect(redis.reserveAttempt(BY_IP, BY_STAFF)).resolves.toBe(BY_IP);
  });
});

describe('RedisService.clearAttempts', () => {
  it('apaga contador e trava de cada balde num único DEL', async () => {
    const redis = new RedisService();

    await redis.clearAttempts(BY_IP, BY_STAFF);

    expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    expect(mockRedisClient.del).toHaveBeenCalledWith(
      'staff:pin_ip:10.0.0.1:attempts',
      'staff:pin_ip:10.0.0.1:lock',
      'staff:pin:abc:attempts',
      'staff:pin:abc:lock',
    );
  });
});
