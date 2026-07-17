import { Scope, Injectable, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource, QueryRunner } from 'typeorm';
import { recordPgQuery } from '../../common/performance/request-timing';
import { TenantRequest } from './tenant.middleware';

/**
 * Helper passado pra callback de transaction(). Executa queries reusando
 * o MESMO QueryRunner — sem ele cada `query()` pegaria conexao nova do
 * pool e a transaction nao englobaria nada. search_path ja foi setado
 * pelo transaction() outer; nao reaplica aqui.
 */
export interface TenantTx {
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
}

/**
 * Per-request query helper that transparently scopes queries to the caller's
 * tenant schema. It lazily reuses one QueryRunner for bursts of sequential
 * `query()` calls, then releases it after a short idle tick. That removes
 * repeated pool acquire + `SET search_path` inside chatty handlers without
 * holding a DB connection while the request waits on Redis, Mongo, fetch()
 * or serialization under concurrent load.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantConnectionProvider {
  private queryRunner?: QueryRunner;
  private queryRunnerPromise?: Promise<QueryRunner>;
  private releaseRegistered = false;
  private requestClosed = false;
  private queryQueue: Promise<unknown> = Promise.resolve();
  private idleReleaseTimer?: ReturnType<typeof setTimeout>;
  private releasePromise?: Promise<void>;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REQUEST) private readonly request: TenantRequest,
  ) {}

  getTenantSlug(): string | undefined {
    return this.request.tenantSlug;
  }

  /** Schema validado pelo TenantMiddleware para integrações que precisam
   * invalidar caches escopados no mesmo namespace do PostgreSQL. */
  getTenantSchemaName(): string | undefined {
    return this.request.tenantSchemaName;
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const schemaName = this.request.tenantSchemaName;
    if (!schemaName) {
      throw new Error('Schema do tenant nao encontrado no request.');
    }

    const run = async () => {
      const qr = await this.getRequestQueryRunner(schemaName);
      const startedAt = process.hrtime.bigint();
      try {
        return await qr.query(sql, params);
      } finally {
        recordPgQuery(startedAt);
        this.scheduleIdleRelease();
      }
    };

    const result = this.queryQueue.then(run, run);
    this.queryQueue = result.catch(() => undefined);
    return result;
  }

  private async getRequestQueryRunner(schemaName: string): Promise<QueryRunner> {
    if (this.requestClosed) {
      throw new Error('Tenant query runner ja foi liberado para este request.');
    }
    this.clearIdleReleaseTimer();
    if (this.releasePromise) {
      await this.releasePromise;
    }
    if (this.queryRunner) return this.queryRunner;
    if (this.queryRunnerPromise) return this.queryRunnerPromise;

    this.registerReleaseHooks();
    this.queryRunnerPromise = (async () => {
      const qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.query(`SET search_path = '${schemaName}'`);
      this.queryRunner = qr;
      return qr;
    })();
    try {
      return await this.queryRunnerPromise;
    } catch (err) {
      this.queryRunnerPromise = undefined;
      throw err;
    }
  }

  private registerReleaseHooks(): void {
    if (this.releaseRegistered) return;
    this.releaseRegistered = true;

    const res = this.request.res;
    const release = () => {
      void this.releaseCurrentQueryRunner(true);
    };

    if (res) {
      res.once('finish', release);
      res.once('close', release);
    } else {
      this.request.once('close', release);
    }
  }

  private scheduleIdleRelease(): void {
    if (this.requestClosed) return;
    this.clearIdleReleaseTimer();
    this.idleReleaseTimer = setTimeout(() => {
      this.idleReleaseTimer = undefined;
      void this.releaseCurrentQueryRunner(false);
    }, 5);
  }

  private clearIdleReleaseTimer(): void {
    if (!this.idleReleaseTimer) return;
    clearTimeout(this.idleReleaseTimer);
    this.idleReleaseTimer = undefined;
  }

  private async releaseCurrentQueryRunner(markRequestClosed: boolean): Promise<void> {
    if (markRequestClosed) {
      this.requestClosed = true;
    }
    this.clearIdleReleaseTimer();
    if (this.releasePromise) {
      await this.releasePromise;
      return;
    }

    this.releasePromise = (async () => {
      await this.queryQueue.catch(() => undefined);
      await this.queryRunnerPromise?.catch(() => undefined);

      const requestRunner = this.queryRunner;
      this.queryRunner = undefined;
      this.queryRunnerPromise = undefined;
      if (requestRunner && !requestRunner.isReleased) {
        await requestRunner.release().catch(() => undefined);
      }
    })().finally(() => {
      this.releasePromise = undefined;
    });

    await this.releasePromise;
  }

  /**
   * Executa um bloco de queries em uma transacao com search_path ja
   * setado. Commit no fim do callback, rollback automatico em throw.
   * Use pra operacoes multi-statement (ex.: createOrder, que insere
   * orders + N order_items + status_history + UPDATE menu_items —
   * antes era N queries em conexoes diferentes do pool, sem atomicidade
   * nenhuma, deixando pedidos orfaos quando uma das etapas falhava).
   */
  async transaction<T>(work: (tx: TenantTx) => Promise<T>): Promise<T> {
    const schemaName = this.request.tenantSchemaName;
    if (!schemaName) {
      throw new Error('Schema do tenant nao encontrado no request.');
    }

    await this.releaseCurrentQueryRunner(false);

    const qr: QueryRunner = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      await qr.query(`SET search_path = '${schemaName}'`);
      await qr.startTransaction();
      try {
        const tx: TenantTx = {
          query: async (sql: string, params?: unknown[]) => {
            const startedAt = process.hrtime.bigint();
            try {
              return await qr.query(sql, params);
            } finally {
              recordPgQuery(startedAt);
            }
          },
        };
        const result = await work(tx);
        await qr.commitTransaction();
        return result;
      } catch (err) {
        await qr.rollbackTransaction();
        throw err;
      }
    } finally {
      await qr.release();
    }
  }
}
