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

  /**
   * Libera um lock somente se ele ainda pertence ao caller.
   *
   * Um `DEL` simples não é seguro para leases: o owner A pode ultrapassar o
   * TTL, o owner B readquirir a mesma chave e, quando A finalmente terminar,
   * apagar o lock de B. O compare-and-delete em Lua mantém GET+DEL atômicos no
   * Redis e transforma a liberação atrasada de A em no-op.
   */
  async compareAndDelete(key: string, expectedValue: string): Promise<boolean> {
    const result = await this.timed(() =>
      this.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        expectedValue,
      ),
    );
    return Number(result) === 1;
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

  /**
   * Limite de tentativas com trava, consumido NA CHEGADA e num único script Lua
   * (atômico no Redis). Chaves `<bucket>:attempts` e `<bucket>:lock`.
   *
   * O padrão anterior checava a trava, processava e só depois incrementava:
   * uma rajada paralela passava inteira pela checagem antes do primeiro
   * incremento (100 welcomes simultâneos contra limite 30 processavam 38).
   * Aqui cada chamada reserva a vaga antes de processar: com a trava ativa ou
   * acima de `max` na janela, devolve `false` e a chamada não é processada. A
   * `max + 1`-ésima arma a trava por `lockSeconds` e zera o contador, então,
   * vencida a trava, a janela recomeça do zero.
   */
  async consumeAttempt(
    bucketKey: string,
    max: number,
    windowSeconds: number,
    lockSeconds: number,
  ): Promise<boolean> {
    return this.timed(async () => {
      const result = await this.client.eval(
        "if redis.call('exists', KEYS[2]) == 1 then return 0 end; " +
          "local c = redis.call('incr', KEYS[1]); " +
          "if c == 1 then redis.call('expire', KEYS[1], ARGV[2]) end; " +
          "if c > tonumber(ARGV[1]) then redis.call('set', KEYS[2], '1', 'EX', ARGV[3]); redis.call('del', KEYS[1]); return 0 end; " +
          'return 1',
        2,
        `${bucketKey}:attempts`,
        `${bucketKey}:lock`,
        String(max),
        String(windowSeconds),
        String(lockSeconds),
      );
      return Number(result) === 1;
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

  /**
   * TROCAR-PIN (decisão Caleb 2026-07-04): sets nativos pro índice reverso
   * de sessões de staff (`staff-sessions:v1:<slug>:<staffId>`), que permite
   * revogar TODAS as sessões de um staff ao trocar/resetar o PIN.
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.timed(() => this.client.sadd(key, ...members));
  }

  async smembers(key: string): Promise<string[]> {
    return this.timed(() => this.client.smembers(key));
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.timed(() => this.client.srem(key, ...members));
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
