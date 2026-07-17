import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('migration 078 — relógio de preparo por item/estação', () => {
  const migrationPath = resolve(
    __dirname,
    '../../../../../packages/database/migrations/tenant-template/078_order_items_prep_started_at.sql',
  );
  const sql = readFileSync(migrationPath, 'utf8');

  it('adiciona o timestamp sem inventar início para itens que ainda não estão em preparo', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS prep_started_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/WHERE oi\.status = 'in_progress'/i);
    expect(sql).toMatch(/oi\.prep_started_at IS NULL/i);
  });

  it('faz backfill legacy pela transição real do pedido e indexa somente trabalho ativo', () => {
    expect(sql).toMatch(/MAX\(h\.created_at\)/i);
    expect(sql).toMatch(/h\.to_status = 'in_progress'/i);
    expect(sql).toMatch(/WHERE status = 'in_progress' AND prep_started_at IS NOT NULL/i);
  });
});
