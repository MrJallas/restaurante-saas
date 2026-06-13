/**
 * Tenant migrations runner — Round 4 §C-NEW-1.
 *
 * `create-tenant.ts` aplica TODAS as migrations no momento de criação
 * do schema, mas migrations adicionadas DEPOIS ficam dormentes em tenants
 * já existentes. Antes deste script, era necessário rodar manualmente
 * `psql ... -f 037_…sql` em cada schema (round 3 PR #26 fixou isso só
 * pra dev). Esta runner aplica migrations novas em todos os tenants
 * descobertos via `information_schema.schemata`.
 *
 * Estratégia:
 *   1. Em cada tenant, garantir tabela `__migrations__(filename TEXT PK)`.
 *   2. Pular migrations já registradas; aplicar e gravar as novas.
 *   3. Idempotente — re-run não duplica.
 *
 * O runner é wirado no boot do `apps/api` (main.ts) atrás de uma flag
 * de env `RUN_TENANT_MIGRATIONS=1` (default em dev/docker-compose),
 * então `docker-compose up api` aplica automaticamente.
 *
 * CLI:
 *   ts-node scripts/migrate-tenants.ts          # todos os tenants
 *   ts-node scripts/migrate-tenants.ts dev      # apenas restaurant_dev
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5434/restaurant_saas';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations', 'tenant-template');

// Schemas que não são tenants — pulamos.
const SYSTEM_SCHEMAS = new Set(['public', 'pg_catalog', 'information_schema', 'pg_toast']);

interface RunOptions {
  databaseUrl?: string;
  /** Filtrar pra apenas 1 tenant. */
  tenantFilter?: string;
  /** Se true, log + return em vez de aplicar. */
  dryRun?: boolean;
}

export async function migrateTenants(options: RunOptions = {}): Promise<{
  applied: Record<string, string[]>;
  skipped: Record<string, string[]>;
}> {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const applied: Record<string, string[]> = {};
  const skipped: Record<string, string[]> = {};

  try {
    // 1. Descobrir schemas de tenant (pular sistema + pg_*).
    const { rows } = await client.query<{ schema_name: string }>(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name NOT LIKE 'pg_%'
          AND schema_name NOT IN ('public', 'information_schema')`,
    );
    let tenants = rows.map((r) => r.schema_name).filter((s) => !SYSTEM_SCHEMAS.has(s));
    if (options.tenantFilter) {
      tenants = tenants.filter(
        (t) => t === options.tenantFilter || t.endsWith(`_${options.tenantFilter}`),
      );
    }

    if (tenants.length === 0) {
      console.log('[migrate-tenants] nenhum tenant encontrado · skip');
      return { applied, skipped };
    }

    // 2. Ler migrations em ordem natural (já que arquivos são prefixados 001-…).
    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(
      `[migrate-tenants] ${tenants.length} tenant(s) × ${migrationFiles.length} migration(s)`,
    );

    for (const tenant of tenants) {
      applied[tenant] = [];
      skipped[tenant] = [];

      // search_path com aspas — schemas podem ter underscores e dígitos.
      await client.query(`SET search_path TO "${tenant}"`);

      // Idempotente — só cria a tabela na 1ª execução.
      const tableExistedBefore = await tenantHasMigrationsTable(client, tenant);
      await client.query(`
        CREATE TABLE IF NOT EXISTS __migrations__ (
          filename TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Backfill de tenants pre-existentes (criados via create-tenant.ts):
      // se o schema já tem migrations 001…036 aplicadas mas a tabela
      // `__migrations__` é nova (tableExistedBefore=false), inferir quais
      // migrations já foram aplicadas heuristicamente — assumir que todas
      // anteriores à última migration nova foram aplicadas. Aqui marcamos
      // apenas as que aparecem como "core schema present" via probe.
      // Lógica simples e segura: olha pra `customers` (migration 004) +
      // `escalation_chains` (023) + `host_module_tables` proxies (035).
      // Se as 3 estiverem presentes, marca 001-035 como already-done.
      if (!tableExistedBefore) {
        const { rows: probe } = await client.query<{
          has_customers: boolean;
          has_escalation: boolean;
          has_host_module: boolean;
        }>(
          `SELECT
             EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'customers') AS has_customers,
             EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'escalation_chains') AS has_escalation,
             EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'reservations') AS has_host_module
          `,
        );
        const p = probe[0];
        if (p?.has_customers && p?.has_escalation) {
          // Pelo menos 001-023 aplicadas. Marcar tudo até 023 como done.
          // Se host_module_tables presente, marcar até 035.
          const baselineCutoff = p.has_host_module ? 35 : 23;
          for (const f of migrationFiles) {
            const m = /^0*(\d+)_/.exec(f);
            const num = m ? parseInt(m[1], 10) : NaN;
            if (Number.isFinite(num) && num <= baselineCutoff) {
              await client.query(
                `INSERT INTO __migrations__(filename) VALUES ($1) ON CONFLICT DO NOTHING`,
                [f],
              );
            }
          }
        }
      }

      const { rows: doneRows } = await client.query<{ filename: string }>(
        `SELECT filename FROM __migrations__`,
      );
      const done = new Set(doneRows.map((r) => r.filename));

      for (const file of migrationFiles) {
        if (done.has(file)) {
          skipped[tenant].push(file);
          continue;
        }
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
        if (options.dryRun) {
          console.log(`[migrate-tenants] (dry) ${tenant} ← ${file}`);
          applied[tenant].push(file);
          continue;
        }
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query(
            `INSERT INTO __migrations__(filename) VALUES ($1) ON CONFLICT DO NOTHING`,
            [file],
          );
          await client.query('COMMIT');
          applied[tenant].push(file);
          console.log(`[migrate-tenants] ${tenant} ← ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`Falha aplicando ${file} em ${tenant}: ${(err as Error).message}`);
        }
      }
    }

    return { applied, skipped };
  } finally {
    await client.end();
  }
}

async function tenantHasMigrationsTable(client: Client, _tenant: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name   = '__migrations__'
     ) AS exists`,
  );
  return Boolean(rows[0]?.exists);
}

// CLI entrypoint
if (require.main === module) {
  const tenantFilter = process.argv[2];
  migrateTenants({ tenantFilter })
    .then((res) => {
      const totalApplied = Object.values(res.applied).flat().length;
      const totalSkipped = Object.values(res.skipped).flat().length;
      console.log(`[migrate-tenants] OK · applied=${totalApplied} skipped=${totalSkipped}`);
    })
    .catch((err) => {
      console.error('[migrate-tenants] ERRO:', err);
      process.exit(1);
    });
}
