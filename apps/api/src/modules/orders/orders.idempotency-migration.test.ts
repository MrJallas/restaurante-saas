import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('migration 075 — idempotência durável de pedidos', () => {
  const migrationPath = resolve(
    __dirname,
    '../../../../../packages/database/migrations/tenant-template/075_orders_durable_idempotency.sql',
  );
  const sql = readFileSync(migrationPath, 'utf8');
  const repairMigrationPath = resolve(
    __dirname,
    '../../../../../packages/database/migrations/tenant-template/076_repair_orders_idempotency_pair_check.sql',
  );
  const repairSql = readFileSync(repairMigrationPath, 'utf8');

  it('persiste chave UUID e fingerprint SHA-256 sem quebrar pedidos legacy', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS idempotency_key UUID/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR\(64\)/i);
    expect(sql).toContain('idempotency_key IS NULL AND idempotency_fingerprint IS NULL');
    expect(sql).toContain('idempotency_fingerprint IS NOT NULL');
    expect(sql).toContain("idempotency_fingerprint ~ '^[0-9a-f]{64}$'");
  });

  it('cria uma UNIQUE idempotente no escopo da sessão de mesa', () => {
    expect(sql).toContain("conname = 'orders_table_session_idempotency_key_unique'");
    expect(sql).toMatch(/UNIQUE \(table_session_id, idempotency_key\)/i);
    expect(sql).toMatch(/IF NOT EXISTS[\s\S]*ADD CONSTRAINT/i);
  });

  it('repara schemas que aplicaram o CHECK permissivo antes da correção da 075', () => {
    expect(repairSql).toMatch(/DROP CONSTRAINT IF EXISTS orders_idempotency_pair_check/i);
    expect(repairSql).toContain('idempotency_fingerprint IS NOT NULL');
    expect(repairSql).toContain("idempotency_fingerprint !~ '^[0-9a-f]{64}$'");
    expect(repairSql).toMatch(/ADD CONSTRAINT orders_idempotency_pair_check[\s\S]*CHECK/i);
  });
});
