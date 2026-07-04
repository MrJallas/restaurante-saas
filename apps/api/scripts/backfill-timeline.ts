/**
 * Fatia M5 da timeline — BACKFILL das fontes SQL pra coleção Mongo
 * `session_timeline`.
 *
 * Script STANDALONE ts-node (SEM Nest/DI — o TenantConnectionProvider é
 * REQUEST-scoped e não serve em script): pg.Pool + MongoClient crus + os
 * mappers puros do M1 via `backfill-sources.ts` (que descreve os JOINs de
 * ctx e os conversores row→entries; testados por unit test).
 *
 * Os ids dos mappers CONVERGEM com os do tap live (M4) — o upsert
 * `updateOne({id}, {$setOnInsert: doc}, {upsert:true})` colapsa no MESMO
 * doc do evento live (o original vence; E11000 de corrida = já existia).
 * Doc = TimelineEntry + { tenantId: slug } — MESMO shape do
 * TimelineStoreService; índices garantidos idênticos antes da escrita.
 *
 * Uso (de dentro do container da api, cwd /repo):
 *   npx ts-node apps/api/scripts/backfill-timeline.ts [--tenant <slug>]
 *     [--session <tableSessionId>] [--dry-run]
 *   (ou: npm run backfill:timeline --workspace @restaurant/api -- --dry-run)
 *
 *  - sem --tenant: todos os tenants ativos de public.restaurants;
 *  - --dry-run: mapeia e conta (por fonte e por kind), NÃO escreve;
 *  - --session: restringe a um tableSessionId (WHERE por fonte).
 *
 * IMPORTANTE (regra do commit 045133a): de '@restaurant/shared-types' SÓ
 * `import type` — import de VALOR quebra o runtime ts-node CJS. O array
 * TIMELINE_KINDS (valor) vem de src/modules/session-timeline/timeline-kinds.
 */

import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { MongoClient, MongoBulkWriteError } from 'mongodb';
import type { Collection } from 'mongodb';
import type { TimelineEntry, TimelineKind } from '@restaurant/shared-types';
import { TIMELINE_KINDS } from '../src/modules/session-timeline/timeline-kinds';
import { BACKFILL_SOURCES } from '../src/modules/session-timeline/backfill-sources';

/**
 * Doc persistido — MESMO shape do TimelineDoc do TimelineStoreService (M4).
 * Redeclarado aqui (em vez de importado) porque o store importa
 * @nestjs/common e este script não deve depender de Nest nem em type-check
 * com config default do ts-node.
 */
type TimelineDoc = TimelineEntry & { tenantId: string };

const TIMELINE_COLLECTION = 'session_timeline';
const BATCH_SIZE = 500;
/** Mesmo guard anti-injection do tenant.middleware/ttl-tick. */
const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5434/restaurant_saas';

// ─── CLI ───────────────────────────────────────────────────────────────────

interface CliArgs {
  tenant: string | null;
  session: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { tenant: null, session: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--tenant' || arg === '--session') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} exige um valor (ex.: ${arg} restaurant_dev)`);
      }
      if (arg === '--tenant') args.tenant = value;
      else args.session = value;
    } else {
      throw new Error(
        `Argumento desconhecido: ${arg}. Uso: [--tenant <slug>] [--session <id>] [--dry-run]`,
      );
    }
  }
  return args;
}

// ─── Tenants ───────────────────────────────────────────────────────────────

interface TenantRow {
  slug: string;
  schema_name: string;
}

async function listTenants(pool: Pool, filter: string | null): Promise<TenantRow[]> {
  const base = `
    SELECT slug, schema_name
      FROM public.restaurants
     WHERE is_active = true
       AND schema_name ~ '^[a-z_][a-z0-9_]{0,62}$'`;
  const result = filter
    ? await pool.query(`${base} AND (slug = $1 OR schema_name = $1) ORDER BY slug`, [filter])
    : await pool.query(`${base} ORDER BY slug`);
  return result.rows as TenantRow[];
}

// ─── Mongo (lazy — dry-run nem conecta) ────────────────────────────────────

let mongoClient: MongoClient | null = null;
let timelineCol: Collection<TimelineDoc> | null = null;

async function getTimelineCollection(): Promise<Collection<TimelineDoc>> {
  if (timelineCol) return timelineCol;
  const url = process.env.MONGODB_URI ?? process.env.MONGO_URL ?? 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB ?? process.env.MONGO_DB ?? 'restaurant_chat';
  mongoClient = new MongoClient(url);
  await mongoClient.connect();
  const col = mongoClient.db(dbName).collection<TimelineDoc>(TIMELINE_COLLECTION);
  // Índices IDÊNTICOS ao TimelineStoreService.ensureIndexes (M4), garantidos
  // ANTES de qualquer escrita — o unique {id:1} é o que torna o upsert
  // idempotente mesmo em corrida com o tap live.
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ tenantId: 1, sessionId: 1, at: 1 });
  await col.createIndex({ tenantId: 1, at: -1 });
  timelineCol = col;
  return col;
}

interface UpsertResult {
  upserted: number;
  matched: number;
}

async function upsertEntries(
  col: Collection<TimelineDoc>,
  entries: TimelineEntry[],
  tenantId: string,
): Promise<UpsertResult> {
  let upserted = 0;
  let matched = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const ops = entries.slice(i, i + BATCH_SIZE).map((entry) => ({
      updateOne: {
        filter: { id: entry.id },
        // MESMO padrão do store (M4): $setOnInsert — o doc original vence.
        update: { $setOnInsert: { ...entry, tenantId } },
        upsert: true,
      },
    }));
    try {
      const res = await col.bulkWrite(ops, { ordered: false });
      upserted += res.upsertedCount;
      matched += res.matchedCount;
    } catch (err) {
      // E11000 da corrida upsert-vs-unique (tap live escrevendo o mesmo id
      // durante o backfill) = o doc já existe — conta como matched.
      if (!(err instanceof MongoBulkWriteError)) throw err;
      const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
      if (writeErrors.some((e) => e.code !== 11000)) throw err;
      upserted += err.result.upsertedCount;
      matched += err.result.matchedCount + writeErrors.length;
    }
  }
  return { upserted, matched };
}

// ─── Backfill por tenant ───────────────────────────────────────────────────

interface SourceStats {
  table: string;
  /** null = tabela ausente no schema do tenant (migration não aplicada). */
  rows: number | null;
  entries: number;
  upserted: number;
  matched: number;
}

interface TenantReport {
  stats: SourceStats[];
  byKind: Map<TimelineKind, number>;
}

async function backfillTenant(
  client: PoolClient,
  tenant: TenantRow,
  args: CliArgs,
): Promise<TenantReport> {
  // schema_name já foi validado por regex (SQL + SCHEMA_RE) — interpolação segura.
  await client.query(`SET search_path = '${tenant.schema_name}'`);

  const existing = new Set(
    (
      await client.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
        [tenant.schema_name],
      )
    ).rows.map((r: { table_name: string }) => r.table_name),
  );

  const stats: SourceStats[] = [];
  const byKind = new Map<TimelineKind, number>();

  for (const source of BACKFILL_SOURCES) {
    if (!existing.has(source.table)) {
      // Tenant sem a migration da fonte — pula, não é erro.
      stats.push({ table: source.table, rows: null, entries: 0, upserted: 0, matched: 0 });
      continue;
    }

    const sql = args.session ? `${source.baseSql} ${source.sessionWhere}` : source.baseSql;
    const result = await client.query(sql, args.session ? [args.session] : []);

    const entries: TimelineEntry[] = [];
    for (const row of result.rows as Record<string, unknown>[]) {
      entries.push(...source.toEntries(row));
    }
    for (const entry of entries) {
      byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
    }

    let upserted = 0;
    let matched = 0;
    if (!args.dryRun && entries.length > 0) {
      const col = await getTimelineCollection();
      ({ upserted, matched } = await upsertEntries(col, entries, tenant.slug));
    }

    stats.push({
      table: source.table,
      rows: result.rows.length,
      entries: entries.length,
      upserted,
      matched,
    });
  }

  return { stats, byKind };
}

// ─── Relatório ─────────────────────────────────────────────────────────────

function num(value: number | null, width: number, dryRun = false): string {
  if (value === null) return '—'.padStart(width);
  if (dryRun) return '·'.padStart(width);
  return String(value).padStart(width);
}

function printTenantReport(tenant: TenantRow, report: TenantReport, args: CliArgs): void {
  const mode = args.dryRun ? ' · DRY-RUN (nada escrito)' : '';
  const scope = args.session ? ` · session ${args.session}` : '';
  console.log(`\n━━ tenant ${tenant.slug} (schema ${tenant.schema_name})${scope}${mode}`);
  console.log(
    `${'fonte'.padEnd(24)}${'rows'.padStart(8)}${'entries'.padStart(9)}${'upserted'.padStart(10)}${'matched'.padStart(9)}`,
  );

  const total = { rows: 0, entries: 0, upserted: 0, matched: 0 };
  for (const s of report.stats) {
    console.log(
      `${s.table.padEnd(24)}${num(s.rows, 8)}${num(s.entries, 9)}${num(s.upserted, 10, args.dryRun)}${num(s.matched, 9, args.dryRun)}`,
    );
    total.rows += s.rows ?? 0;
    total.entries += s.entries;
    total.upserted += s.upserted;
    total.matched += s.matched;
  }
  console.log(
    `${'TOTAL'.padEnd(24)}${num(total.rows, 8)}${num(total.entries, 9)}${num(total.upserted, 10, args.dryRun)}${num(total.matched, 9, args.dryRun)}`,
  );

  if (report.byKind.size > 0) {
    console.log('por kind:');
    // Ordem canônica de TIMELINE_KINDS (mesma prioridade causal do sort M1).
    for (const kind of TIMELINE_KINDS) {
      const count = report.byKind.get(kind);
      if (count) console.log(`  ${kind.padEnd(24)}${String(count).padStart(8)}`);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });

  try {
    const tenants = await listTenants(pool, args.tenant);
    if (tenants.length === 0) {
      throw new Error(
        args.tenant
          ? `Tenant '${args.tenant}' não encontrado (ou inativo) em public.restaurants`
          : 'Nenhum tenant ativo em public.restaurants',
      );
    }

    for (const tenant of tenants) {
      if (!SCHEMA_RE.test(tenant.schema_name)) {
        // Defensivo — o SQL já filtra; nunca deve acontecer.
        console.warn(`schema inválido, pulando: ${tenant.schema_name}`);
        continue;
      }
      const client = await pool.connect();
      try {
        const report = await backfillTenant(client, tenant, args);
        printTenantReport(tenant, report, args);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
    await mongoClient?.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[backfill-timeline] falhou:', err);
    process.exit(1);
  },
);
