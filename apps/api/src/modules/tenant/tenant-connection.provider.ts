import { Scope, Injectable, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource, QueryRunner } from 'typeorm';
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
 * tenant schema. Historically this held onto a single `QueryRunner` for the
 * whole request and expected the caller to release it — which nothing did,
 * so every request leaked a pool connection and the service eventually
 * stalled once the pool saturated. To avoid that whole class of bug we now
 * acquire and release a fresh runner per `query()` call. `SET search_path`
 * is set on the same runner right before the user query so multi-tenant
 * isolation is preserved.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantConnectionProvider {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REQUEST) private readonly request: TenantRequest,
  ) {}

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const schemaName = this.request.tenantSchemaName;
    if (!schemaName) {
      throw new Error('Schema do tenant nao encontrado no request.');
    }

    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      await qr.query(`SET search_path = '${schemaName}'`);
      return await qr.query(sql, params);
    } finally {
      await qr.release();
    }
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

    const qr: QueryRunner = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      await qr.query(`SET search_path = '${schemaName}'`);
      await qr.startTransaction();
      try {
        const tx: TenantTx = {
          query: (sql: string, params?: unknown[]) => qr.query(sql, params),
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
