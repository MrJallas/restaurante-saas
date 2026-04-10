import { Scope, Injectable, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource, QueryRunner } from 'typeorm';
import { TenantRequest } from './tenant.middleware';

@Injectable({ scope: Scope.REQUEST })
export class TenantConnectionProvider {
  private queryRunner: QueryRunner | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REQUEST) private readonly request: TenantRequest,
  ) {}

  async getConnection(): Promise<QueryRunner> {
    if (this.queryRunner) return this.queryRunner;

    const schemaName = this.request.tenantSchemaName;
    if (!schemaName) {
      throw new Error('Schema do tenant nao encontrado no request.');
    }

    this.queryRunner = this.dataSource.createQueryRunner();
    await this.queryRunner.connect();
    await this.queryRunner.query(`SET search_path = '${schemaName}'`);

    return this.queryRunner;
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const qr = await this.getConnection();
    return qr.query(sql, params);
  }

  async release(): Promise<void> {
    if (this.queryRunner) {
      await this.queryRunner.release();
      this.queryRunner = null;
    }
  }
}
