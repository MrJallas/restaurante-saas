/**
 * Núcleo COMPARTILHADO da timeline server-side (M5 backfill + M8 verify).
 *
 * O backfill (backfill-timeline.ts) e o verificador (verify-timeline.ts)
 * precisam do MESMO passo: por tenant, rodar os SELECTs das BACKFILL_SOURCES
 * (com os JOINs de ctx) e mapear as rows → TimelineEntry[] pelos mappers puros
 * do M1. Extraído pra cá pra que os dois scripts NÃO dupliquem o SQL — a
 * verdade-SQL é computada de um lugar só.
 *
 * Fica em scripts/ (não em src/) de propósito: importa `pg` (I/O), e src/ é o
 * que o `nest build` compila — manter `pg` fora do bundle da API. Coberto pelo
 * tsc via scripts/tsconfig.json; a montagem dos ctx/joins (backfill-sources)
 * já é unit-testada. A prova viva desta função é do auditor (roda contra o
 * Postgres real do container).
 *
 * Regra do commit 045133a: de '@restaurant/shared-types' SÓ `import type`.
 */

import type { PoolClient } from 'pg';
import type { TimelineEntry, TimelineKind } from '@restaurant/shared-types';
import { BACKFILL_SOURCES } from '../src/modules/session-timeline/backfill-sources';

/** Guard anti-injection de schema (paridade tenant.middleware/backfill). */
const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Resultado por fonte SQL — `rows: null` = tabela ausente no schema. */
export interface SourceCollectResult {
  table: string;
  rows: number | null;
  /** Entries desta fonte (vazio quando a tabela não existe no schema). */
  entries: TimelineEntry[];
}

export interface CollectResult {
  /** Resultado por fonte (na ordem de BACKFILL_SOURCES) — inclui as entries. */
  sources: SourceCollectResult[];
  /** Todas as entries-verdade, achatadas (conveniência pro verify). */
  entries: TimelineEntry[];
  /** Contagem de entries por kind. */
  byKind: Map<TimelineKind, number>;
}

/**
 * Computa a VERDADE-SQL de um tenant: SET search_path, descobre as tabelas
 * existentes (fontes sem migration são puladas, não é erro), roda cada
 * baseSql (+ sessionWhere quando `session` dado) e mapeia rows → entries.
 * Idêntico pro backfill (que upserta as entries) e pro verify (que as compara
 * com o store) — nenhum SQL duplicado entre os dois.
 */
export async function collectTenantEntries(
  client: PoolClient,
  schemaName: string,
  session: string | null,
): Promise<CollectResult> {
  if (!SCHEMA_RE.test(schemaName)) {
    throw new Error(`schema inválido: ${schemaName}`);
  }
  // schema_name já validado por regex — interpolação segura.
  await client.query(`SET search_path = '${schemaName}'`);

  const existing = new Set(
    (
      await client.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
        [schemaName],
      )
    ).rows.map((r: { table_name: string }) => r.table_name),
  );

  const allEntries: TimelineEntry[] = [];
  const sources: SourceCollectResult[] = [];
  const byKind = new Map<TimelineKind, number>();

  for (const source of BACKFILL_SOURCES) {
    if (!existing.has(source.table)) {
      sources.push({ table: source.table, rows: null, entries: [] });
      continue;
    }

    const sql = session ? `${source.baseSql} ${source.sessionWhere}` : source.baseSql;
    const result = await client.query(sql, session ? [session] : []);

    const sourceEntries: TimelineEntry[] = [];
    for (const row of result.rows as Record<string, unknown>[]) {
      for (const entry of source.toEntries(row)) {
        sourceEntries.push(entry);
        allEntries.push(entry);
        byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
      }
    }

    sources.push({ table: source.table, rows: result.rows.length, entries: sourceEntries });
  }

  return { sources, entries: allEntries, byKind };
}
