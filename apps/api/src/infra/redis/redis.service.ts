import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';
import { recordRedisOperation } from '../../common/performance/request-timing';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.client = new Redis(redisConfig.url);
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  private async timed<T>(operation: () => Promise<T>): Promise<T> {
    const startedAt = process.hrtime.bigint();
    try {
      return await operation();
    } finally {
      recordRedisOperation(startedAt);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.timed(async () => {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    });
  }

  /**
   * Round 10 (B-NEW-46): atomic `SET key value EX ttl NX` — só seta se a
   * key NÃO existe (lock pattern). Retorna `true` quando ganhou o lock,
   * `false` quando outro caller já estava lá.
   *
   * Usado por idempotency keys (orders.create, payments.request, etc.):
   * o primeiro POST com idempotencyKey ganha SETNX, processa o INSERT,
   * sobrescreve com o resultado. POSTs concorrentes com mesma key veem
   * `false`, fazem GET pra recuperar o resultado em loop curto.
   *
   * Antes: `redis.set` plain após INSERT permitia 2 INSERTs concorrentes
   * passarem (GET → GET → INSERT → INSERT → SET → SET overwrite).
   */
  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.timed(() => this.client.set(key, value, 'EX', ttlSeconds, 'NX'));
    return result === 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.timed(() => this.client.get(key));
  }

  async del(key: string): Promise<void> {
    await this.timed(() => this.client.del(key));
  }

  async decr(key: string): Promise<number> {
    return this.timed(async () => this.client.decr(key));
  }

  async incr(key: string): Promise<number> {
    return this.timed(() => this.client.incr(key));
  }

  /**
   * INCR + EXPIRE-na-1ª-request ATÔMICO via Lua. Fecha a janela em que o
   * INCR sobe mas o EXPIRE falha (hiccup do Redis) e a chave fica ÓRFÃ sem
   * TTL — um fixed-window que nunca reseta e poderia 429ar um IP / suprimir
   * o sweep de um tenant pra sempre. Devolve o contador pós-incremento.
   */
  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    return this.timed(async () => {
      const result = await this.client.eval(
        "local c = redis.call('incr', KEYS[1]); if c == 1 then redis.call('expire', KEYS[1], ARGV[1]) end; return c",
        1,
        key,
        String(ttlSeconds),
      );
      return Number(result);
    });
  }

  async lpop(key: string): Promise<string | null> {
    return this.timed(() => this.client.lpop(key));
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.timed(() => this.client.rpush(key, ...values));
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.timed(() => this.client.expire(key, ttlSeconds));
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.timed(() => this.client.ping());
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
