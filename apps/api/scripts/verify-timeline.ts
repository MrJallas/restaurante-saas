/**
 * Fatia M8 da timeline — VERIFICADOR de reconciliação SQL↔store.
 *
 * Rede de segurança PRÉ-BETA pro tap fire-and-forget do M4 (que pode PERDER
 * evento num outage do Mongo) E medidor da DIVERGÊNCIA DE ID entre a
 * verdade-SQL (mappers do backfill M5) e o event-store `session_timeline`.
 *
 * READ-ONLY por padrão (só relatório). `--heal` (opt-in) upserta os
 * MISSING_IN_STORE reusando o MESMO upsert idempotente do backfill; NUNCA
 * apaga nada (STORE_ONLY não é tocado — limpeza é decisão humana).
 *
 * Script STANDALONE ts-node (SEM Nest/DI — igual ao backfill): pg.Pool +
 * MongoClient crus. Reusa `collectTenantEntries` (núcleo SQL compartilhado com
 * o backfill — nenhum SQL duplicado) e `diffTimeline` (diff PURO, unit-testado
 * em timeline-verify.test.ts).
 *
 * Uso (de dentro do container da api, cwd /repo):
 *   npx ts-node apps/api/scripts/verify-timeline.ts [--tenant <slug>]
 *     [--session <tableSessionId>] [--heal]
 *
 *  - sem --tenant: todos os tenants ativos de public.restaurants;
 *  - --session: restringe a um tableSessionId (WHERE por fonte);
 *  - --heal: upserta os MISSING_IN_STORE (idempotente). Default OFF.
 *
 * Regra do commit 045133a: de '@restaurant/shared-types' SÓ `import type`.
 */

import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { MongoClient, MongoBulkWriteError } from 'mongodb';
import type { Collection } from 'mongodb';
import type { TimelineEntry, TimelineKind } from '@restaurant/shared-types';
import { TIMELINE_KINDS } from '../src/modules/session-timeline/timeline-kinds';
import { collectTenantEntries } from './timeline-collect';
import {
  diffTimeline,
  type StoreDoc,
  type VerifyReport,
} from '../src/modules/session-timeline/timeline-verify';

/** Doc persistido — MESMO shape do TimelineDoc do store (M4)/backfill (M5). */
type TimelineDoc = TimelineEntry & { tenantId: string };

const TIMELINE_COLLECTION = 'session_timeline';
const BATCH_SIZE = 500;
const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5434/restaurant_saas';

// ─── CLI ───────────────────────────────────────────────────────────────────

interface CliArgs {
  tenant: string | null;
  session: string | null;
  heal: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { tenant: null, session: null, heal: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--heal') {
      args.heal = true;
    } else if (arg === '--tenant' || arg === '--session') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} exige um valor (ex.: ${arg} restaurant_dev)`);
      }
      if (arg === '--tenant') args.tenant = value;
      else args.session = value;
    } else {
      throw new Error(
        `Argumento desconhecido: ${arg}. Uso: [--tenant <slug>] [--session <id>] [--heal]`,
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

// ─── Mongo ─────────────────────────────────────────────────────────────────

let mongoClient: MongoClient | null = null;
let timelineCol: Collection<TimelineDoc> | null = null;

async function getTimelineCollection(): Promise<Collection<TimelineDoc>> {
  if (timelineCol) return timelineCol;
  const url = process.env.MONGODB_URI ?? process.env.MONGO_URL ?? 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB ?? process.env.MONGO_DB ?? 'restaurant_chat';
  mongoClient = new MongoClient(url);
  await mongoClient.connect();
  timelineCol = mongoClient.db(dbName).collection<TimelineDoc>(TIMELINE_COLLECTION);
  return timelineCol;
}

/** Lê os docs do store do tenant projetando só o necessário pro diff. */
async function readStoreDocs(
  col: Collection<TimelineDoc>,
  tenantId: string,
  session: string | null,
): Promise<StoreDoc[]> {
  const filter: Record<string, unknown> = { tenantId };
  if (session) filter.sessionId = session;
  const docs = await col
    .find(filter, { projection: { _id: 0, id: 1, kind: 1, sessionId: 1, refs: 1, payload: 1 } })
    .toArray();
  return docs as unknown as StoreDoc[];
}

/** --heal: upsert idempotente ($setOnInsert) dos MISSING — mesmo do backfill. */
async function healMissing(
  col: Collection<TimelineDoc>,
  entries: TimelineEntry[],
  tenantId: string,
): Promise<{ upserted: number; matched: number }> {
  // Índices garantidos antes da 1ª escrita (paridade store/backfill).
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ tenantId: 1, sessionId: 1, at: 1 });
  await col.createIndex({ tenantId: 1, at: -1 });

  let upserted = 0;
  let matched = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const ops = entries.slice(i, i + BATCH_SIZE).map((entry) => ({
      updateOne: {
        filter: { id: entry.id },
        update: { $setOnInsert: { ...entry, tenantId } },
        upsert: true,
      },
    }));
    try {
      const res = await col.bulkWrite(ops, { ordered: false });
      upserted += res.upsertedCount;
      matched += res.matchedCount;
    } catch (err) {
      // E11000 (corrida com o tap live) = já existe → conta como matched.
      if (!(err instanceof MongoBulkWriteError)) throw err;
      const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
      if (writeErrors.some((e) => e.code !== 11000)) throw err;
      upserted += err.result.upsertedCount;
      matched += err.result.matchedCount + writeErrors.length;
    }
  }
  return { upserted, matched };
}

// ─── Verificação por tenant ─────────────────────────────────────────────────

interface TenantVerifyReport {
  report: VerifyReport;
  byKindSql: Map<TimelineKind, number>;
  byKindStore: Map<TimelineKind, number>;
  healed?: { upserted: number; matched: number };
}

async function verifyTenant(
  client: PoolClient,
  tenant: TenantRow,
  args: CliArgs,
): Promise<TenantVerifyReport> {
  // Verdade-SQL via núcleo compartilhado com o backfill.
  const collected = await collectTenantEntries(client, tenant.schema_name, args.session);

  // Store do tenant (só read; projeção mínima).
  const col = await getTimelineCollection();
  const storeDocs = await readStoreDocs(col, tenant.slug, args.session);

  const report = diffTimeline(collected.entries, storeDocs);

  const byKindStore = new Map<TimelineKind, number>();
  for (const d of storeDocs) byKindStore.set(d.kind, (byKindStore.get(d.kind) ?? 0) + 1);

  let healed: { upserted: number; matched: number } | undefined;
  if (args.heal && report.missing.ids.length > 0) {
    const missingSet = new Set(report.missing.ids);
    const toHeal = collected.entries.filter((e) => missingSet.has(e.id));
    healed = await healMissing(col, toHeal, tenant.slug);
  }

  return { report, byKindSql: collected.byKind, byKindStore, healed };
}

// ─── Relatório ─────────────────────────────────────────────────────────────

function pad(v: string | number, width: number): string {
  return String(v).padStart(width);
}

function printTenantReport(tenant: TenantRow, r: TenantVerifyReport, args: CliArgs): void {
  const scope = args.session ? ` · session ${args.session}` : '';
  const mode = args.heal ? ' · HEAL' : ' · read-only';
  console.log(`\n━━ tenant ${tenant.slug} (schema ${tenant.schema_name})${scope}${mode}`);

  const { report } = r;
  // Coluna por kind: sql, store, missing, store_only(inesperado), dup_lógica.
  console.log(
    `${'kind'.padEnd(24)}${'sql'.padStart(7)}${'store'.padStart(7)}${'missing'.padStart(9)}${'store_only'.padStart(11)}${'dup_log'.padStart(9)}`,
  );

  const kindsSeen = new Set<TimelineKind>([
    ...r.byKindSql.keys(),
    ...r.byKindStore.keys(),
    ...(Object.keys(report.missing.byKind) as TimelineKind[]),
    ...(Object.keys(report.storeOnly.byKind) as TimelineKind[]),
  ]);

  const total = { sql: 0, store: 0, missing: 0, storeOnly: 0, dup: 0 };
  for (const kind of TIMELINE_KINDS) {
    if (!kindsSeen.has(kind)) continue;
    const sql = r.byKindSql.get(kind) ?? 0;
    const store = r.byKindStore.get(kind) ?? 0;
    const missing = report.missing.byKind[kind] ?? 0;
    const storeOnly = report.storeOnly.byKind[kind] ?? 0;
    const dup = report.dupLogica.byKind[kind] ?? 0;
    console.log(
      `${kind.padEnd(24)}${pad(sql, 7)}${pad(store, 7)}${pad(missing, 9)}${pad(storeOnly, 11)}${pad(dup, 9)}`,
    );
    total.sql += sql;
    total.store += store;
    total.missing += missing;
    total.storeOnly += storeOnly;
    total.dup += dup;
  }
  console.log(
    `${'TOTAL'.padEnd(24)}${pad(total.sql, 7)}${pad(total.store, 7)}${pad(total.missing, 9)}${pad(total.storeOnly, 11)}${pad(total.dup, 9)}`,
  );

  // Detalhe do store_only: esperados (ws:* tap-only) vs órfãos inesperados.
  console.log(
    `store_only detalhe: ${report.storeOnly.expectedTapOnly.length} esperados (ws:* tap-only) · ` +
      `${report.storeOnly.unexpectedOrphan.length} órfãos inesperados`,
  );
  if (report.storeOnly.unexpectedOrphan.length > 0) {
    console.log(`  órfãos (amostra): ${report.storeOnly.unexpectedOrphan.slice(0, 10).join(', ')}`);
  }

  // Detalhe da duplicação lógica (o bug pré-beta).
  if (report.dupLogica.count > 0) {
    console.log(`duplicação lógica: ${report.dupLogica.count} ato(s) nos DOIS esquemas`);
    for (const p of report.dupLogica.pairs.slice(0, 10)) {
      console.log(`  [${p.kind}] ${p.sqlId}  ⇔  ${p.wsId}`);
    }
  }

  if (r.healed) {
    console.log(`--heal: ${r.healed.upserted} upserted · ${r.healed.matched} já existiam`);
  }

  const verdict = report.drift ? 'DRIFT DETECTADO ✗' : 'ÍNTEGRO ✓';
  console.log(
    `veredito: ${verdict}  (missing=${report.missing.ids.length} · ` +
      `órfãos=${report.storeOnly.unexpectedOrphan.length} · dup=${report.dupLogica.count})`,
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });

  let anyDrift = false;
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
        console.warn(`schema inválido, pulando: ${tenant.schema_name}`);
        continue;
      }
      const client = await pool.connect();
      try {
        const report = await verifyTenant(client, tenant, args);
        printTenantReport(tenant, report, args);
        if (report.report.drift) anyDrift = true;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
    await mongoClient?.close();
  }

  // Exit 2 = drift detectado (útil pra gate de CI/beta); 0 = íntegro.
  process.exitCode = anyDrift ? 2 : 0;
}

main().catch((err) => {
  console.error('[verify-timeline] falhou:', err);
  process.exit(1);
});
