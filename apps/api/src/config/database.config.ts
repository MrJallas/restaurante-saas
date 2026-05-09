import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Round 16 (B-NEW-41):
 * - Pool size configurável via `DB_POOL_SIZE` env (default 20). TypeORM
 *   default era 10 — apertava no boot do prod com 4+ workers. Cada
 *   `tenantConn.query` cria QueryRunner novo então pool warmup importa.
 * - Logging só quando `DEBUG_DB=true` (era `NODE_ENV !== 'production'`,
 *   logando todas queries em dev — ruidoso e sem stack-trace útil).
 *   Stdout fica limpo; quem quiser debug habilita explícito.
 */
const poolSize = Number(process.env.DB_POOL_SIZE ?? 20);

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5434/restaurant_saas',
  synchronize: false,
  logging: process.env.DEBUG_DB === 'true',
  extra: {
    max: Number.isFinite(poolSize) && poolSize > 0 ? poolSize : 20,
    // Connection idle timeout (30s) — solta conexões ociosas pra liberar
    // slots durante picos. Postgres default é nunca soltar.
    idleTimeoutMillis: 30_000,
    // Connection acquire timeout (5s) — fail fast em vez de pendurar req.
    connectionTimeoutMillis: 5_000,
  },
};
