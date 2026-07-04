import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type {
  MergeTreeEdge,
  MergeTreeNode,
  SessionMergeTree,
  SessionTimelineResponse,
  TableSessionHistoryItem,
  TableSessionsHistoryResponse,
  TimelineEntry,
} from '@restaurant/shared-types';
import { MongoService } from '../../infra/mongo/mongo.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { compareTimelineEntries } from './timeline-mappers';
import type { TimelineDoc } from './timeline-store.service';

const TIMELINE_COLLECTION = 'session_timeline';

/** Coerção canônica code→número de mesa (mesma do host/salon/dashboard). */
const TABLE_NUMBER_SQL = `CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT)`;

const TIMELINE_LIMIT_DEFAULT = 100;
const TIMELINE_LIMIT_MAX = 500;
const SESSIONS_LIMIT_DEFAULT = 20;
const SESSIONS_LIMIT_MAX = 100;

type SqlTimestamp = Date | string;

function toIso(value: SqlTimestamp): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toIsoOrNull(value: SqlTimestamp | null): string | null {
  return value === null ? null : toIso(value);
}

function clamp(limit: number | undefined, def: number, max: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return def;
  return Math.min(max, Math.floor(limit));
}

interface SessionSummaryRow {
  id: string;
  status: string;
  created_at: SqlTimestamp;
  closed_at: SqlTimestamp | null;
  table_number: number | null;
  host_name: string | null;
}

interface MergeEdgeRow {
  id: string;
  source_table_session_id: string;
  target_table_session_id: string;
  decided_at: SqlTimestamp | null;
}

interface MergeNodeRow {
  id: string;
  table_number: number | null;
  host_name: string | null;
  created_at: SqlTimestamp;
}

interface TableSessionHistoryRow {
  id: string;
  host_name: string | null;
  created_at: SqlTimestamp;
  closed_at: SqlTimestamp | null;
  closed_by: string | null;
  closed_by_staff_name: string | null;
  total_orders: number;
  total_paid_cents: number;
}

/**
 * M6 (timeline) — LEITURA do event-store `session_timeline` + árvore de
 * merge. Casamento das duas fontes:
 *  - Mongo: entries da sessão (docs do tap M4 / backfill M5), filtradas por
 *    { tenantId: slug, sessionId } — multitenancy no doc, não no schema.
 *  - Postgres (TenantConnectionProvider, schema do slug): sumário da sessão,
 *    nomes de staff (resolvidos NO READ — LGPD: erasure de staff reflete na
 *    timeline sem reescrever docs) e a árvore de merges aprovados.
 *
 * Decisões:
 *  - ORDENAÇÃO: o sort do Mongo por `at` NÃO desempata (ties reais existem —
 *    merge staff-override tem created_at == decided_at). A página volta do
 *    driver em `at` DESC e é reordenada em memória pelo comparator canônico
 *    do M1 (at ASC → prioridade causal de TIMELINE_KINDS → id).
 *  - PAGINAÇÃO backward por `at`: sem cursor, os `limit` mais recentes;
 *    `before` (ISO) corta com $lt (strings ISO comparam lexicograficamente).
 *    Próxima página = `before` com o `at` da primeira entry da página atual.
 *    Limitação documentada: entries EMPATADAS exatamente no `at` do cursor
 *    ficam de fora da página seguinte (aceito no desenho aprovado — o caso
 *    real de tie é intra-página).
 *  - Leitura NÃO é fail-open (diferente do write do tap): Mongo off → 503.
 *    Timeline vazia com status 200 seria mentira operacional.
 *  - mergeTree: WITH RECURSIVE bidirecional (a sessão expande como source E
 *    target) só sobre status='approved'; guard de ciclo por path de REQUEST
 *    ids (NOT tmr.id = ANY(mw.path)) + depth < 10; DISTINCT ON (id) dedupa
 *    os caminhos múltiplos (fan-in/ciclo). Sessão fora de qualquer merge
 *    aprovado → null.
 */
@Injectable()
export class SessionTimelineQueryService {
  constructor(
    private readonly mongo: MongoService,
    private readonly tenantConn: TenantConnectionProvider,
  ) {}

  async getSessionTimeline(
    slug: string,
    sessionId: string,
    opts?: { limit?: number; before?: string },
  ): Promise<SessionTimelineResponse> {
    const session = await this.fetchSessionSummary(sessionId);
    const entries = await this.fetchEntries(slug, sessionId, opts);
    await this.resolveStaffNames(entries);
    const mergeTree = await this.fetchMergeTree(sessionId);

    return {
      session: {
        sessionId: session.id,
        tableNumber: session.table_number,
        hostName: session.host_name,
        status: session.status,
        createdAt: toIso(session.created_at),
        closedAt: toIsoOrNull(session.closed_at),
      },
      entries,
      mergeTree,
    };
  }

  async listTableSessions(
    tableNumber: number,
    opts?: { limit?: number },
  ): Promise<TableSessionsHistoryResponse> {
    const limit = clamp(opts?.limit, SESSIONS_LIMIT_DEFAULT, SESSIONS_LIMIT_MAX);
    const rows = (await this.tenantConn.query(
      `SELECT ts.id,
              host.name AS host_name,
              ts.created_at,
              ts.closed_at,
              ts.closed_by,
              closer.name AS closed_by_staff_name,
              COALESCE(o.cnt, 0)        AS total_orders,
              COALESCE(p.paid_cents, 0) AS total_paid_cents
         FROM table_sessions ts
         JOIN tables t ON t.id = ts.table_id
         LEFT JOIN customers host ON host.id = ts.host_customer_id
         LEFT JOIN staff closer ON closer.id::text = ts.closed_by
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt
             FROM orders o
            WHERE o.table_session_id = ts.id
         ) o ON TRUE
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(p.amount_cents), 0)::int AS paid_cents
             FROM payments p
            WHERE p.table_session_id = ts.id
              AND p.status IN ('confirmed', 'paid')
         ) p ON TRUE
        WHERE ${TABLE_NUMBER_SQL} = $1
        ORDER BY ts.created_at DESC
        LIMIT $2`,
      [tableNumber, limit],
    )) as TableSessionHistoryRow[];

    const sessions: TableSessionHistoryItem[] = rows.map((row) => ({
      sessionId: row.id,
      hostName: row.host_name,
      createdAt: toIso(row.created_at),
      closedAt: toIsoOrNull(row.closed_at),
      // Nome do staff quando closed_by era UUID; senão o label legacy cru.
      closedByLabel: row.closed_by_staff_name ?? row.closed_by ?? null,
      totalOrders: row.total_orders,
      totalPaidCents: row.total_paid_cents,
    }));

    return { sessions };
  }

  // ─── Sumário da sessão (Postgres) ────────────────────────────────────────

  private async fetchSessionSummary(sessionId: string): Promise<SessionSummaryRow> {
    const rows = (await this.tenantConn.query(
      `SELECT ts.id,
              ts.status,
              ts.created_at,
              ts.closed_at,
              ${TABLE_NUMBER_SQL} AS table_number,
              host.name AS host_name
         FROM table_sessions ts
         JOIN tables t ON t.id = ts.table_id
         LEFT JOIN customers host ON host.id = ts.host_customer_id
        WHERE ts.id = $1`,
      [sessionId],
    )) as SessionSummaryRow[];

    if (rows.length === 0) {
      throw new NotFoundException('Sessão não encontrada.');
    }
    return rows[0];
  }

  // ─── Entries (Mongo) ─────────────────────────────────────────────────────

  private async fetchEntries(
    slug: string,
    sessionId: string,
    opts?: { limit?: number; before?: string },
  ): Promise<TimelineEntry[]> {
    const db = this.mongo.tryDb();
    if (!db) {
      throw new HttpException(
        'Histórico da sessão indisponível no momento. Tente novamente.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const limit = clamp(opts?.limit, TIMELINE_LIMIT_DEFAULT, TIMELINE_LIMIT_MAX);
    const filter: Record<string, unknown> = { tenantId: slug, sessionId };
    if (opts?.before) filter.at = { $lt: opts.before };

    const docs = await db
      .collection<TimelineDoc>(TIMELINE_COLLECTION)
      .find(filter)
      .sort({ at: -1 })
      .limit(limit)
      .toArray();

    // Pick explícito: o doc carrega _id/tenantId — o wire é TimelineEntry.
    const entries: TimelineEntry[] = docs.map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      at: doc.at,
      sessionId: doc.sessionId,
      actor: doc.actor,
      refs: doc.refs,
      payload: doc.payload,
    }));

    // O sort do Mongo por `at` não desempata — comparator do M1 decide.
    return entries.sort(compareTimelineEntries);
  }

  /**
   * Resolve nomes de staff NO READ, em UMA query (`id = ANY($1)`), só pros
   * actors staff com name null. LGPD: staff apagado do Postgres simplesmente
   * não volta no SELECT — o name fica null sem reescrever o doc.
   */
  private async resolveStaffNames(entries: TimelineEntry[]): Promise<void> {
    const pending = new Set<string>();
    for (const entry of entries) {
      if (entry.actor.type === 'staff' && entry.actor.id && entry.actor.name === null) {
        pending.add(entry.actor.id);
      }
    }
    if (pending.size === 0) return;

    const rows = (await this.tenantConn.query(`SELECT id, name FROM staff WHERE id = ANY($1)`, [
      [...pending],
    ])) as { id: string; name: string | null }[];
    const names = new Map(rows.map((r) => [r.id, r.name]));

    for (const entry of entries) {
      if (entry.actor.type !== 'staff' || !entry.actor.id || entry.actor.name !== null) continue;
      const name = names.get(entry.actor.id);
      if (name != null) entry.actor = { ...entry.actor, name };
    }
  }

  // ─── Árvore de merge (Postgres, WITH RECURSIVE) ──────────────────────────

  private async fetchMergeTree(sessionId: string): Promise<SessionMergeTree | null> {
    const edgeRows = (await this.tenantConn.query(
      `WITH RECURSIVE merge_walk AS (
         SELECT tmr.id,
                tmr.source_table_session_id,
                tmr.target_table_session_id,
                tmr.decided_at,
                1 AS depth,
                ARRAY[tmr.id] AS path
           FROM table_merge_requests tmr
          WHERE tmr.status = 'approved'
            AND (tmr.source_table_session_id = $1 OR tmr.target_table_session_id = $1)
         UNION ALL
         SELECT tmr.id,
                tmr.source_table_session_id,
                tmr.target_table_session_id,
                tmr.decided_at,
                mw.depth + 1,
                mw.path || tmr.id
           FROM table_merge_requests tmr
           JOIN merge_walk mw
             ON tmr.source_table_session_id IN (mw.source_table_session_id, mw.target_table_session_id)
             OR tmr.target_table_session_id IN (mw.source_table_session_id, mw.target_table_session_id)
          WHERE tmr.status = 'approved'
            AND NOT tmr.id = ANY(mw.path)
            AND mw.depth < 10
       )
       SELECT DISTINCT ON (id) id, source_table_session_id, target_table_session_id, decided_at
         FROM merge_walk
        ORDER BY id`,
      [sessionId],
    )) as MergeEdgeRow[];

    if (edgeRows.length === 0) return null;

    const edges: MergeTreeEdge[] = edgeRows.map((row) => ({
      requestId: row.id,
      from: row.source_table_session_id,
      to: row.target_table_session_id,
      approvedAt: toIsoOrNull(row.decided_at),
    }));

    const sessionIds = new Set<string>([sessionId]);
    for (const edge of edges) {
      sessionIds.add(edge.from);
      sessionIds.add(edge.to);
    }

    const nodeRows = (await this.tenantConn.query(
      `SELECT ts.id,
              ${TABLE_NUMBER_SQL} AS table_number,
              host.name AS host_name,
              ts.created_at
         FROM table_sessions ts
         JOIN tables t ON t.id = ts.table_id
         LEFT JOIN customers host ON host.id = ts.host_customer_id
        WHERE ts.id = ANY($1)`,
      [[...sessionIds]],
    )) as MergeNodeRow[];

    const nodes: MergeTreeNode[] = nodeRows.map((row) => ({
      sessionId: row.id,
      tableNumber: row.table_number,
      hostName: row.host_name,
      createdAt: toIso(row.created_at),
    }));

    return { root: sessionId, nodes, edges };
  }
}
