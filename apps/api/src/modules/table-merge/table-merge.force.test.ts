/**
 * P1 da auditoria 2026-07-03: `forceMerge` (override do manager) SEMPRE
 * dava 500 — o INSERT usava colunas que NÃO existem em escalation_chains
 * (type/context/current_step/status/resolved_at/resolved_by; o schema real
 * da migration 023+034 é kind, source_id, level, current_assignee_role,
 * current_assignee_staff_id, steps, completed_at, resolution_notes).
 *
 * O fake é SCHEMA-AWARE: valida as colunas do INSERT contra o schema real
 * e rejeita coluna desconhecida exatamente como o Postgres (42703) — o
 * mesmo tipo de mentira-de-fake que o E2E da 1A pegou no pg driver.
 */

import { TableMergeService } from './table-merge.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const SOURCE = 'aaaa1111-0000-4000-8000-000000000001';
const TARGET = 'bbbb2222-0000-4000-8000-000000000002';
const STAFF = 'cccc3333-0000-4000-8000-000000000003';

/** Colunas reais (migrations 023 + 034) — manter em sincronia com o SQL. */
const ESCALATION_CHAINS_COLUMNS = new Set([
  'id',
  'kind',
  'source_id',
  'level',
  'escalated_at',
  'current_assignee_role',
  'current_assignee_staff_id',
  'ttl_expires_at',
  'completed_at',
  'resolution_notes',
  'created_at',
  'updated_at',
  'steps',
]);

function fakeMergeDb() {
  const chains: Array<Record<string, unknown>> = [];
  const requests: Array<Record<string, unknown>> = [];

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT id, host_customer_id FROM table_sessions')) {
      return [
        { id: SOURCE, host_customer_id: null },
        { id: TARGET, host_customer_id: null },
      ];
    }

    if (s.startsWith('INSERT INTO escalation_chains')) {
      const shape = s.match(
        /INSERT INTO escalation_chains \(([^)]+)\) VALUES \((.+?)\)(?: RETURNING|$)/,
      )!;
      const cols = shape[1].split(',').map((c) => c.trim());
      for (const col of cols) {
        if (!ESCALATION_CHAINS_COLUMNS.has(col)) {
          // O que o Postgres real devolve (SQLSTATE 42703):
          throw new Error(`column "${col}" of relation "escalation_chains" does not exist`);
        }
      }
      // Resolve o VALUES como o PG: literal 'x', $n(::cast), now(), número.
      const values = shape[2].split(',').map((raw) => {
        const v = raw.trim();
        const param = v.match(/^\$(\d+)/);
        if (param) return params[parseInt(param[1], 10) - 1];
        const literal = v.match(/^'(.*)'$/);
        if (literal) return literal[1];
        if (v === 'now()') return '2026-07-04T00:00:00Z';
        return v;
      });
      const row: Record<string, unknown> = { id: 'chain-1' };
      cols.forEach((col, i) => (row[col] = values[i]));
      chains.push(row);
      return [{ id: 'chain-1' }];
    }

    if (s.startsWith('INSERT INTO table_merge_requests')) {
      const row: Record<string, unknown> = {
        id: 'req-1',
        source_table_session_id: SOURCE,
        target_table_session_id: TARGET,
        status: 'approved',
        message: params.find((p) => typeof p === 'string' && String(p).includes('OVERRIDE')),
        created_at: '2026-07-04T00:00:00Z',
        updated_at: '2026-07-04T00:00:00Z',
      };
      requests.push(row);
      return [row];
    }

    if (s.startsWith('UPDATE table_merge_requests')) {
      requests.forEach((r) => (r.escalation_chain_id = params[0]));
      return [];
    }

    if (s.startsWith('DELETE FROM table_merge_cooldowns')) {
      return [];
    }

    throw new Error(`fake merge: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(work: (tx: { query: typeof query }) => Promise<T>) => work({ query }),
  } as unknown as TenantConnectionProvider;

  return { conn, chains, requests };
}

describe('TableMergeService.forceMerge — colunas reais de escalation_chains', () => {
  it('cria o request approved + chain de audit sem estourar 42703', async () => {
    const { conn, chains } = fakeMergeDb();
    const service = new TableMergeService(conn);

    const result = await service.forceMerge({
      sourceTableSessionId: SOURCE,
      targetTableSessionId: TARGET,
      staffId: STAFF,
      reason: 'mesas grandes juntas presencialmente',
    });

    expect(result).toBeTruthy();
    expect(chains).toHaveLength(1);
    const chain = chains[0];
    expect(chain.kind).toBe('table_merge');
    // steps carrega o staff_override pro audit trail
    const steps = JSON.parse(String(chain.steps)) as Array<Record<string, unknown>>;
    expect(steps[0].kind).toBe('staff_override');
    expect(steps[0].staff_id).toBe(STAFF);
  });

  it('chain fica ligada ao request (escalation_chain_id preenchido)', async () => {
    const { conn, requests } = fakeMergeDb();
    const service = new TableMergeService(conn);
    await service.forceMerge({
      sourceTableSessionId: SOURCE,
      targetTableSessionId: TARGET,
      staffId: STAFF,
      reason: 'override',
    });
    expect(requests[0].escalation_chain_id).toBe('chain-1');
  });
});
