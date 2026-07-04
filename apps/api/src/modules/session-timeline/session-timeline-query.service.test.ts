/**
 * M6 (timeline) — leitura do event-store + árvore de merge.
 *
 * O que este arquivo fixa:
 *  1. A leitura APLICA o comparator do M1 (`compareTimelineEntries`): o sort
 *     do Mongo por `at` não desempata — entries com o MESMO `at` saem na
 *     prioridade causal de TIMELINE_KINDS, não na ordem em que o driver
 *     devolveu.
 *  2. Paginação backward por `at`: sem cursor devolve os `limit` mais
 *     recentes (em ordem cronológica ASC); `before` corta com $lt e pega a
 *     página anterior.
 *  3. Resolução de nome de staff no READ em UMA query (`id = ANY($1)`), só
 *     pros actors staff com name null — LGPD: staff apagado continua null.
 *  4. Árvore de merge via WITH RECURSIVE bidirecional (só status
 *     'approved'): cadeia A→B→C, fan-in (A,C)→B e CICLO A→B→A terminam e
 *     dedupam — o fake emula a semântica do Postgres (path de request ids +
 *     depth < 10) e EXPLODE se a recursão passar de 1000 iterações, então
 *     um SQL sem guard de ciclo faz o teste falhar em vez de pendurar.
 *  5. Sessão sem merge aprovado → mergeTree null (pending/rejected não
 *     contam).
 *  6. Sessão inexistente → 404; Mongo off → 503 (a leitura NÃO é fail-open
 *     como o write do tap — devolver timeline vazia seria mentira).
 */

import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { TimelineEntry } from '@restaurant/shared-types';
import { SessionTimelineQueryService } from './session-timeline-query.service';
import type { MongoService } from '../../infra/mongo/mongo.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { TimelineDoc } from './timeline-store.service';

const SLUG = 'resto_dev';
const SESSION_A = 'aaaa1111-0000-4000-8000-000000000001';
const SESSION_B = 'bbbb2222-0000-4000-8000-000000000002';
const SESSION_C = 'cccc3333-0000-4000-8000-000000000003';
const STAFF_1 = '11110000-0000-4000-8000-0000000000a1';
const STAFF_2 = '22220000-0000-4000-8000-0000000000a2';

// ─── Fake Mongo (find → sort → limit → toArray) ────────────────────────────

interface FindCall {
  filter: Record<string, unknown>;
  sort?: Record<string, number>;
  limit?: number;
}

function fakeMongo(docs: TimelineDoc[]) {
  const findCalls: FindCall[] = [];

  function collection(name: string) {
    if (name !== 'session_timeline') {
      throw new Error(`coleção inesperada no teste: ${name}`);
    }
    return {
      find(filter: Record<string, unknown>) {
        const call: FindCall = { filter };
        findCalls.push(call);
        const cursor = {
          sort(spec: Record<string, number>) {
            call.sort = spec;
            return cursor;
          },
          limit(n: number) {
            call.limit = n;
            return cursor;
          },
          async toArray() {
            let out = docs.filter((d) => {
              if (filter.tenantId !== undefined && d.tenantId !== filter.tenantId) return false;
              if (filter.sessionId !== undefined && d.sessionId !== filter.sessionId) return false;
              const at = filter.at as { $lt?: string } | undefined;
              if (at?.$lt !== undefined && !(d.at < at.$lt)) return false;
              return true;
            });
            if (call.sort?.at === -1) {
              // Desce por `at` SEM desempate — igual ao Mongo. Ties ficam na
              // ordem de inserção do fixture (de propósito: é o comparator
              // do service que tem que arrumar).
              out = [...out].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
            }
            if (call.limit !== undefined) out = out.slice(0, call.limit);
            // Docs saem como o driver devolve: com _id e tenantId.
            return out.map((d) => ({ _id: `oid-${d.id}`, ...d }));
          },
        };
        return cursor;
      },
    };
  }

  const mongo = { tryDb: () => ({ collection }) } as unknown as MongoService;
  return { mongo, findCalls };
}

const mongoOff = { tryDb: () => null } as unknown as MongoService;

// ─── Fake Postgres (TenantConnectionProvider.query) ────────────────────────

interface MergeRequestFixture {
  id: string;
  source: string;
  target: string;
  status: string;
  decided_at: string | null;
}

interface SessionFixture {
  id: string;
  status: string;
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  table_number: number | null;
  host_name: string | null;
  closed_by_staff_name?: string | null;
  total_orders?: number;
  total_paid_cents?: number;
}

/**
 * Emulação fiel do WITH RECURSIVE do service (semântica Postgres): seed =
 * requests aprovadas tocando a raiz; expansão bidirecional pelos DOIS
 * endpoints de cada aresta; guard de ciclo por path de REQUEST ids
 * (NOT id = ANY(path)); depth < 10; DISTINCT ON (id) no final. O contador
 * `iterations` explode em runaway — se o SQL do service perder o guard, o
 * teste do ciclo falha com erro em vez de loop infinito.
 */
function emulateMergeWalk(requests: MergeRequestFixture[], root: string) {
  const approved = requests.filter((r) => r.status === 'approved');
  type Branch = { row: MergeRequestFixture; depth: number; path: string[] };
  let frontier: Branch[] = approved
    .filter((r) => r.source === root || r.target === root)
    .map((r) => ({ row: r, depth: 1, path: [r.id] }));
  const all: Branch[] = [...frontier];
  let iterations = 0;
  while (frontier.length > 0) {
    if (++iterations > 1000) {
      throw new Error('emulação da recursão passou de 1000 iterações — guard de ciclo furou');
    }
    const next: Branch[] = [];
    for (const branch of frontier) {
      if (branch.depth >= 10) continue;
      const endpoints = [branch.row.source, branch.row.target];
      for (const r of approved) {
        if (branch.path.includes(r.id)) continue;
        if (!endpoints.includes(r.source) && !endpoints.includes(r.target)) continue;
        next.push({ row: r, depth: branch.depth + 1, path: [...branch.path, r.id] });
      }
    }
    all.push(...next);
    frontier = next;
  }
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const b of all) {
    if (seen.has(b.row.id)) continue;
    seen.add(b.row.id);
    rows.push({
      id: b.row.id,
      source_table_session_id: b.row.source,
      target_table_session_id: b.row.target,
      decided_at: b.row.decided_at,
    });
  }
  return rows;
}

function fakeTenant(fixtures: {
  sessions?: SessionFixture[];
  staff?: Record<string, string>;
  mergeRequests?: MergeRequestFixture[];
}) {
  const sessions = fixtures.sessions ?? [];
  const staff = fixtures.staff ?? {};
  const mergeRequests = fixtures.mergeRequests ?? [];
  const queries: { sql: string; params: unknown[] }[] = [];

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql: s, params });

    if (s.includes('WITH RECURSIVE')) {
      return emulateMergeWalk(mergeRequests, params[0] as string);
    }

    if (s.includes('FROM staff') && s.includes('ANY($1)')) {
      const ids = params[0] as string[];
      return ids.filter((id) => staff[id] !== undefined).map((id) => ({ id, name: staff[id] }));
    }

    // Nós da árvore de merge (batch por ids).
    if (s.includes('FROM table_sessions') && s.includes('ANY($1)')) {
      const ids = params[0] as string[];
      return sessions
        .filter((ts) => ids.includes(ts.id))
        .map((ts) => ({
          id: ts.id,
          table_number: ts.table_number,
          host_name: ts.host_name,
          created_at: ts.created_at,
        }));
    }

    // Histórico de sessões da mesa.
    if (s.includes('FROM table_sessions') && s.includes('ORDER BY ts.created_at DESC')) {
      const [tableNumber, limit] = params as [number, number];
      return sessions
        .filter((ts) => ts.table_number === tableNumber)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit)
        .map((ts) => ({
          id: ts.id,
          host_name: ts.host_name,
          created_at: ts.created_at,
          closed_at: ts.closed_at,
          closed_by: ts.closed_by,
          closed_by_staff_name: ts.closed_by_staff_name ?? null,
          total_orders: ts.total_orders ?? 0,
          total_paid_cents: ts.total_paid_cents ?? 0,
        }));
    }

    // Sumário de UMA sessão ($1 = sessionId).
    if (s.includes('FROM table_sessions')) {
      return sessions
        .filter((ts) => ts.id === params[0])
        .map((ts) => ({
          id: ts.id,
          status: ts.status,
          created_at: ts.created_at,
          closed_at: ts.closed_at,
          table_number: ts.table_number,
          host_name: ts.host_name,
        }));
    }

    throw new Error(`SQL não mapeado no fake: ${s.slice(0, 120)}`);
  };

  const tenant = { query, getTenantSlug: () => SLUG } as unknown as TenantConnectionProvider;
  return { tenant, queries };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

function entryDoc(partial: Partial<TimelineEntry> & { id: string }): TimelineDoc {
  return {
    kind: 'order.created',
    at: '2026-07-04T12:00:00.000Z',
    sessionId: SESSION_A,
    actor: { type: 'customer', id: null, name: null },
    refs: {},
    payload: {},
    ...partial,
    tenantId: SLUG,
  };
}

const SESSION_A_ROW: SessionFixture = {
  id: SESSION_A,
  status: 'active',
  created_at: '2026-07-04T11:00:00.000Z',
  closed_at: null,
  closed_by: null,
  table_number: 5,
  host_name: 'Ana',
};

function service(mongo: MongoService, tenant: TenantConnectionProvider) {
  return new SessionTimelineQueryService(mongo, tenant);
}

// ─── getSessionTimeline ────────────────────────────────────────────────────

describe('SessionTimelineQueryService.getSessionTimeline (M6)', () => {
  it('sessão inexistente → NotFoundException (404), sem tocar o Mongo', async () => {
    const { mongo, findCalls } = fakeMongo([]);
    const { tenant } = fakeTenant({ sessions: [] });
    await expect(service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A)).rejects.toThrow(
      NotFoundException,
    );
    expect(findCalls).toHaveLength(0);
  });

  it('Mongo off (tryDb null) → 503 — leitura NÃO é fail-open (timeline vazia seria mentira)', async () => {
    const { tenant } = fakeTenant({ sessions: [SESSION_A_ROW] });
    const err = await service(mongoOff, tenant)
      .getSessionTimeline(SLUG, SESSION_A)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('monta o sumário do Postgres (sessionId/tableNumber/hostName/status/createdAt/closedAt em ISO)', async () => {
    const { mongo } = fakeMongo([]);
    const { tenant } = fakeTenant({
      sessions: [
        {
          ...SESSION_A_ROW,
          status: 'closed',
          // Driver pg devolve Date — o service converte pra ISO.
          created_at: new Date('2026-07-04T11:00:00.000Z') as unknown as string,
          closed_at: '2026-07-04T14:00:00.000Z',
        },
      ],
    });
    const res = await service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A);
    expect(res.session).toEqual({
      sessionId: SESSION_A,
      tableNumber: 5,
      hostName: 'Ana',
      status: 'closed',
      createdAt: '2026-07-04T11:00:00.000Z',
      closedAt: '2026-07-04T14:00:00.000Z',
    });
    expect(res.entries).toEqual([]);
    expect(res.mergeTree).toBeNull();
  });

  it('filtra o Mongo por tenantId+sessionId — doc de outro tenant/sessão não vaza', async () => {
    const { mongo, findCalls } = fakeMongo([
      entryDoc({ id: 'ord:o1' }),
      { ...entryDoc({ id: 'ord:leak-tenant' }), tenantId: 'outro_tenant' },
      entryDoc({ id: 'ord:leak-session', sessionId: SESSION_B }),
    ]);
    const { tenant } = fakeTenant({ sessions: [SESSION_A_ROW] });
    const res = await service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A);
    expect(res.entries.map((e) => e.id)).toEqual(['ord:o1']);
    expect(findCalls[0].filter).toMatchObject({ tenantId: SLUG, sessionId: SESSION_A });
  });

  it('entries saem SEM campos de persistência (_id/tenantId) — shape wire = TimelineEntry', async () => {
    const { mongo } = fakeMongo([entryDoc({ id: 'ord:o1' })]);
    const { tenant } = fakeTenant({ sessions: [SESSION_A_ROW] });
    const res = await service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A);
    expect(Object.keys(res.entries[0]).sort()).toEqual([
      'actor',
      'at',
      'id',
      'kind',
      'payload',
      'refs',
      'sessionId',
    ]);
  });

  it('mesmo `at` → aplica o comparator do M1 (prioridade causal de TIMELINE_KINDS), não a ordem do driver', async () => {
    const at = '2026-07-04T12:00:00.000Z';
    // Inseridos na ordem INVERSA da causal — o fake preserva ties na ordem
    // de inserção (como o Mongo), então sem o comparator sairia errado.
    const { mongo } = fakeMongo([
      entryDoc({ id: 'sess:a:closed', kind: 'session.closed', at }),
      entryDoc({ id: 'pay:p1', kind: 'payment.confirmed', at }),
      entryDoc({ id: 'ord:o1', kind: 'order.created', at }),
      entryDoc({ id: 'sess:a:opened', kind: 'session.opened', at }),
    ]);
    const { tenant } = fakeTenant({ sessions: [SESSION_A_ROW] });
    const res = await service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A);
    expect(res.entries.map((e) => e.kind)).toEqual([
      'session.opened',
      'order.created',
      'payment.confirmed',
      'session.closed',
    ]);
  });

  it('paginação backward: sem cursor devolve os `limit` mais recentes em ordem ASC; `before` pega a página anterior', async () => {
    const docs = [
      entryDoc({ id: 'ord:o1', at: '2026-07-04T12:01:00.000Z' }),
      entryDoc({ id: 'ord:o2', at: '2026-07-04T12:02:00.000Z' }),
      entryDoc({ id: 'ord:o3', at: '2026-07-04T12:03:00.000Z' }),
    ];
    const { mongo, findCalls } = fakeMongo(docs);
    const { tenant } = fakeTenant({ sessions: [SESSION_A_ROW] });
    const svc = service(mongo, tenant);

    const page1 = await svc.getSessionTimeline(SLUG, SESSION_A, { limit: 2 });
    expect(page1.entries.map((e) => e.id)).toEqual(['ord:o2', 'ord:o3']);
    expect(findCalls[0].sort).toEqual({ at: -1 });
    expect(findCalls[0].limit).toBe(2);

    const page2 = await svc.getSessionTimeline(SLUG, SESSION_A, {
      limit: 2,
      before: page1.entries[0].at,
    });
    expect(page2.entries.map((e) => e.id)).toEqual(['ord:o1']);
    expect(findCalls[1].filter).toMatchObject({ at: { $lt: '2026-07-04T12:02:00.000Z' } });
  });

  it('clamp do limit: 0/negativo/ausente caem no default 100; acima de 500 vira 500', async () => {
    const { mongo, findCalls } = fakeMongo([]);
    const { tenant } = fakeTenant({ sessions: [SESSION_A_ROW] });
    const svc = service(mongo, tenant);
    await svc.getSessionTimeline(SLUG, SESSION_A);
    await svc.getSessionTimeline(SLUG, SESSION_A, { limit: 0 });
    await svc.getSessionTimeline(SLUG, SESSION_A, { limit: 9999 });
    expect(findCalls.map((c) => c.limit)).toEqual([100, 100, 500]);
  });

  it('resolve nomes de staff em UMA query (id = ANY) só pros actors staff com name null; staff apagado (LGPD) continua null', async () => {
    const { mongo } = fakeMongo([
      entryDoc({
        id: 'osh:h1',
        kind: 'order.status_changed',
        at: '2026-07-04T12:01:00.000Z',
        actor: { type: 'staff', id: STAFF_1, name: null },
      }),
      entryDoc({
        id: 'osh:h2',
        kind: 'order.status_changed',
        at: '2026-07-04T12:02:00.000Z',
        actor: { type: 'staff', id: STAFF_1, name: null },
      }),
      entryDoc({
        id: 'osh:h3',
        kind: 'order.status_changed',
        at: '2026-07-04T12:03:00.000Z',
        actor: { type: 'staff', id: STAFF_2, name: null },
      }),
      entryDoc({
        id: 'ord:o1',
        at: '2026-07-04T12:04:00.000Z',
        actor: { type: 'customer', id: 'cust-1', name: null },
      }),
      entryDoc({
        id: 'wcall:w1',
        kind: 'waiter.acknowledged',
        at: '2026-07-04T12:05:00.000Z',
        actor: { type: 'staff', id: STAFF_2, name: 'Já Resolvido' },
      }),
    ]);
    // STAFF_2 não existe mais no Postgres (erasure) — name fica null.
    const { tenant, queries } = fakeTenant({
      sessions: [SESSION_A_ROW],
      staff: { [STAFF_1]: 'Bruno' },
    });
    const res = await service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A);

    const staffQueries = queries.filter((q) => q.sql.includes('FROM staff'));
    expect(staffQueries).toHaveLength(1);
    // Dedup: STAFF_1 aparece em 2 entries mas vai UMA vez no ANY; o actor já
    // resolvido (name preenchido) não entra no lookup.
    expect([...(staffQueries[0].params[0] as string[])].sort()).toEqual([STAFF_1, STAFF_2].sort());

    const byId = new Map(res.entries.map((e) => [e.id, e]));
    expect(byId.get('osh:h1')?.actor.name).toBe('Bruno');
    expect(byId.get('osh:h2')?.actor.name).toBe('Bruno');
    expect(byId.get('osh:h3')?.actor.name).toBeNull();
    expect(byId.get('ord:o1')?.actor.name).toBeNull();
    expect(byId.get('wcall:w1')?.actor.name).toBe('Já Resolvido');
  });

  it('sem actor staff pendente → NENHUMA query em staff', async () => {
    const { mongo } = fakeMongo([entryDoc({ id: 'ord:o1' })]);
    const { tenant, queries } = fakeTenant({ sessions: [SESSION_A_ROW] });
    await service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A);
    expect(queries.filter((q) => q.sql.includes('FROM staff'))).toHaveLength(0);
  });
});

// ─── mergeTree ─────────────────────────────────────────────────────────────

describe('SessionTimelineQueryService — árvore de merge (M6)', () => {
  const SESSION_B_ROW: SessionFixture = {
    id: SESSION_B,
    status: 'active',
    created_at: '2026-07-04T11:10:00.000Z',
    closed_at: null,
    closed_by: null,
    table_number: 7,
    host_name: 'Bia',
  };
  const SESSION_C_ROW: SessionFixture = {
    id: SESSION_C,
    status: 'active',
    created_at: '2026-07-04T11:20:00.000Z',
    closed_at: null,
    closed_by: null,
    table_number: 9,
    host_name: null,
  };

  async function treeFor(root: string, mergeRequests: MergeRequestFixture[]) {
    const { mongo } = fakeMongo([]);
    const { tenant } = fakeTenant({
      sessions: [SESSION_A_ROW, SESSION_B_ROW, SESSION_C_ROW],
      mergeRequests,
    });
    const res = await service(mongo, tenant).getSessionTimeline(SLUG, root);
    return res.mergeTree;
  }

  it('sessão sem merge aprovado → mergeTree null (pending/rejected não contam)', async () => {
    const tree = await treeFor(SESSION_A, [
      { id: 'req-p', source: SESSION_A, target: SESSION_B, status: 'pending', decided_at: null },
      {
        id: 'req-r',
        source: SESSION_A,
        target: SESSION_C,
        status: 'rejected',
        decided_at: '2026-07-04T11:40:00.000Z',
      },
    ]);
    expect(tree).toBeNull();
  });

  it('cadeia A→B→C: consultar pela PONTA (A) alcança as duas arestas e os 3 nós', async () => {
    const tree = await treeFor(SESSION_A, [
      {
        id: 'req-ab',
        source: SESSION_A,
        target: SESSION_B,
        status: 'approved',
        decided_at: '2026-07-04T11:30:00.000Z',
      },
      {
        id: 'req-bc',
        source: SESSION_B,
        target: SESSION_C,
        status: 'approved',
        decided_at: '2026-07-04T11:45:00.000Z',
      },
    ]);
    expect(tree).not.toBeNull();
    expect(tree?.root).toBe(SESSION_A);
    expect(tree?.nodes.map((n) => n.sessionId).sort()).toEqual(
      [SESSION_A, SESSION_B, SESSION_C].sort(),
    );
    expect(tree?.edges).toEqual(
      expect.arrayContaining([
        {
          requestId: 'req-ab',
          from: SESSION_A,
          to: SESSION_B,
          approvedAt: '2026-07-04T11:30:00.000Z',
        },
        {
          requestId: 'req-bc',
          from: SESSION_B,
          to: SESSION_C,
          approvedAt: '2026-07-04T11:45:00.000Z',
        },
      ]),
    );
    expect(tree?.edges).toHaveLength(2);
    const nodeB = tree?.nodes.find((n) => n.sessionId === SESSION_B);
    expect(nodeB).toEqual({
      sessionId: SESSION_B,
      tableNumber: 7,
      hostName: 'Bia',
      createdAt: '2026-07-04T11:10:00.000Z',
    });
  });

  it('bidirecional: consultar pelo MEIO da cadeia (B, que é target numa aresta e source na outra) vê tudo', async () => {
    const tree = await treeFor(SESSION_B, [
      {
        id: 'req-ab',
        source: SESSION_A,
        target: SESSION_B,
        status: 'approved',
        decided_at: '2026-07-04T11:30:00.000Z',
      },
      {
        id: 'req-bc',
        source: SESSION_B,
        target: SESSION_C,
        status: 'approved',
        decided_at: '2026-07-04T11:45:00.000Z',
      },
    ]);
    expect(tree?.root).toBe(SESSION_B);
    expect(tree?.nodes.map((n) => n.sessionId).sort()).toEqual(
      [SESSION_A, SESSION_B, SESSION_C].sort(),
    );
    expect(tree?.edges).toHaveLength(2);
  });

  it('fan-in (A,C)→B: as duas arestas aparecem sem duplicar nós', async () => {
    const tree = await treeFor(SESSION_A, [
      {
        id: 'req-ab',
        source: SESSION_A,
        target: SESSION_B,
        status: 'approved',
        decided_at: '2026-07-04T11:30:00.000Z',
      },
      {
        id: 'req-cb',
        source: SESSION_C,
        target: SESSION_B,
        status: 'approved',
        decided_at: '2026-07-04T11:45:00.000Z',
      },
    ]);
    expect(tree?.edges.map((e) => e.requestId).sort()).toEqual(['req-ab', 'req-cb']);
    expect(tree?.nodes).toHaveLength(3);
    expect(new Set(tree?.nodes.map((n) => n.sessionId)).size).toBe(3);
  });

  it('CICLO A→B→A (duas requests aprovadas em sentidos opostos): termina, deduplica e devolve as 2 arestas', async () => {
    const tree = await treeFor(SESSION_A, [
      {
        id: 'req-ab',
        source: SESSION_A,
        target: SESSION_B,
        status: 'approved',
        decided_at: '2026-07-04T11:30:00.000Z',
      },
      {
        id: 'req-ba',
        source: SESSION_B,
        target: SESSION_A,
        status: 'approved',
        decided_at: '2026-07-04T11:50:00.000Z',
      },
    ]);
    expect(tree?.edges.map((e) => e.requestId).sort()).toEqual(['req-ab', 'req-ba']);
    expect(tree?.nodes.map((n) => n.sessionId).sort()).toEqual([SESSION_A, SESSION_B].sort());
  });

  it('o SQL da árvore mantém a forma aprovada: recursivo, só approved, guard de ciclo por path e depth < 10', async () => {
    const { mongo } = fakeMongo([]);
    const { tenant, queries } = fakeTenant({ sessions: [SESSION_A_ROW] });
    await service(mongo, tenant).getSessionTimeline(SLUG, SESSION_A);
    const recursive = queries.find((q) => q.sql.includes('WITH RECURSIVE'));
    expect(recursive).toBeDefined();
    expect(recursive?.sql).toContain("status = 'approved'");
    expect(recursive?.sql).toContain('ANY(mw.path)');
    expect(recursive?.sql).toContain('mw.depth < 10');
    expect(recursive?.params).toEqual([SESSION_A]);
  });
});

// ─── listTableSessions ─────────────────────────────────────────────────────

describe('SessionTimelineQueryService.listTableSessions (M6)', () => {
  const CLOSED_SESSION: SessionFixture = {
    id: SESSION_B,
    status: 'closed',
    created_at: '2026-07-04T09:00:00.000Z',
    closed_at: '2026-07-04T10:30:00.000Z',
    closed_by: STAFF_1,
    closed_by_staff_name: 'Bruno',
    table_number: 5,
    host_name: 'Bia',
    total_orders: 3,
    total_paid_cents: 12500,
  };

  it('mapeia sessionId/hostName/createdAt/closedAt/closedByLabel/totais; ordena DESC por created_at', async () => {
    const { mongo } = fakeMongo([]);
    const { tenant } = fakeTenant({
      sessions: [
        CLOSED_SESSION,
        { ...SESSION_A_ROW, total_orders: 1, total_paid_cents: 0 },
        // Outra mesa — não entra.
        { ...SESSION_A_ROW, id: SESSION_C, table_number: 7 },
      ],
    });
    const res = await service(mongo, tenant).listTableSessions(5);
    expect(res.sessions).toEqual([
      {
        sessionId: SESSION_A,
        hostName: 'Ana',
        createdAt: '2026-07-04T11:00:00.000Z',
        closedAt: null,
        closedByLabel: null,
        totalOrders: 1,
        totalPaidCents: 0,
      },
      {
        sessionId: SESSION_B,
        hostName: 'Bia',
        createdAt: '2026-07-04T09:00:00.000Z',
        closedAt: '2026-07-04T10:30:00.000Z',
        closedByLabel: 'Bruno',
        totalOrders: 3,
        totalPaidCents: 12500,
      },
    ]);
  });

  it('closed_by legacy sem staff correspondente → label cru preservado; host_customer_id null → hostName null', async () => {
    const { mongo } = fakeMongo([]);
    const { tenant } = fakeTenant({
      sessions: [
        {
          ...CLOSED_SESSION,
          closed_by: 'system:ttl-4h',
          closed_by_staff_name: null,
          host_name: null,
        },
      ],
    });
    const res = await service(mongo, tenant).listTableSessions(5);
    expect(res.sessions[0].closedByLabel).toBe('system:ttl-4h');
    expect(res.sessions[0].hostName).toBeNull();
  });

  it('limit default 20 (clamp 1..100) vai como parâmetro do SQL', async () => {
    const { mongo } = fakeMongo([]);
    const { tenant, queries } = fakeTenant({ sessions: [] });
    const svc = service(mongo, tenant);
    await svc.listTableSessions(5);
    await svc.listTableSessions(5, { limit: 0 });
    await svc.listTableSessions(5, { limit: 9999 });
    const listQueries = queries.filter((q) => q.sql.includes('ORDER BY ts.created_at DESC'));
    expect(listQueries.map((q) => q.params)).toEqual([
      [5, 20],
      [5, 20],
      [5, 100],
    ]);
  });

  it('coerção do número da mesa usa o padrão canônico do repo (regexp_replace de não-dígitos no code)', async () => {
    const { mongo } = fakeMongo([]);
    const { tenant, queries } = fakeTenant({ sessions: [] });
    await service(mongo, tenant).listTableSessions(5);
    const listQuery = queries.find((q) => q.sql.includes('ORDER BY ts.created_at DESC'));
    expect(listQuery?.sql).toContain("regexp_replace(t.code, '[^0-9]', '', 'g')");
  });
});
