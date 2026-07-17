import type { EventsGateway } from '../websocket/events.gateway';
import type { TenantConnectionProvider, TenantTx } from '../tenant/tenant-connection.provider';
import { AlertRow, AlertsService } from './alerts.service';

function makeSingletonHarness() {
  let sequence = 0;
  let open: AlertRow | null = null;
  let recent: AlertRow | null = null;
  let inserts = 0;
  let refreshes = 0;
  const emitted: AlertRow[] = [];

  const txQuery = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.includes('pg_advisory_xact_lock')) return [];

    if (normalized.startsWith('SELECT id, sev') && normalized.includes('FOR UPDATE')) {
      return open ? [open] : [];
    }

    if (normalized.startsWith('UPDATE alerts') && normalized.includes('SET sev =')) {
      refreshes += 1;
      if (!open) return [[], 0] as unknown as unknown[];
      open = {
        ...open,
        sev: params[1] as AlertRow['sev'],
        title: String(params[2]),
        sub: params[3] == null ? null : String(params[3]),
        ttl_at: params[4] == null ? null : String(params[4]),
        actions: JSON.parse(String(params[5])),
      };
      recent = open;
      return [[open], 1] as unknown as unknown[];
    }

    if (normalized.startsWith('SELECT id, sev') && normalized.includes('COALESCE(dismissed_at')) {
      return recent ? [recent] : [];
    }

    if (normalized.startsWith('INSERT INTO alerts')) {
      inserts += 1;
      const row: AlertRow = {
        id: `alert-${++sequence}`,
        sev: params[0] as AlertRow['sev'],
        kind: String(params[1]),
        title: String(params[2]),
        sub: params[3] == null ? null : String(params[3]),
        ttl_at: params[4] == null ? null : String(params[4]),
        actions: JSON.parse(String(params[5])),
        dismissed_at: null,
        resolved_at: null,
        created_at: new Date().toISOString(),
      };
      open = row;
      recent = row;
      return [row];
    }

    if (normalized.startsWith('UPDATE alerts') && normalized.includes('SET resolved_at')) {
      if (!open) return [[], 0] as unknown as unknown[];
      const id = open.id;
      open = null;
      return [[{ id }], 1] as unknown as unknown[];
    }

    throw new Error(`SQL singleton não roteado: ${normalized}`);
  };

  const conn = {
    getTenantSlug: () => 'acme',
    transaction: async <T>(work: (tx: TenantTx) => Promise<T>) => work({ query: txQuery }),
  } as unknown as TenantConnectionProvider;
  const events = {
    emitAlertCreated: (_slug: string, alert: Record<string, unknown>) => {
      emitted.push(alert as unknown as AlertRow);
    },
  } as unknown as EventsGateway;
  const service = new AlertsService(conn, events);

  return {
    service,
    emitted,
    inserts: () => inserts,
    refreshes: () => refreshes,
    simulateHandledAlert: () => {
      open = null;
    },
  };
}

describe('AlertsService singleton reconciliation', () => {
  const input = {
    sev: 'atenção' as const,
    kind: 'manager_staff_workload_imbalance',
    title: 'Carga de garçons desequilibrada',
    sub: 'Ana: 64 pts · Bruno: 12 pts.',
    cooldownSeconds: 900,
  };

  it('refreshes concorrentes/repetidos reutilizam a row e emitem apenas uma criação', async () => {
    const ctx = makeSingletonHarness();

    const first = await ctx.service.createOrRefreshSingleton(input);
    const second = await ctx.service.createOrRefreshSingleton({
      ...input,
      sub: 'Carga atualizada',
    });

    expect(first).toMatchObject({ created: true, suppressed: false });
    expect(second).toMatchObject({ created: false, suppressed: false });
    expect(second.alert.id).toBe(first.alert.id);
    expect(second.alert.sub).toBe('Carga atualizada');
    expect(ctx.inserts()).toBe(1);
    expect(ctx.refreshes()).toBe(1);
    expect(ctx.emitted).toHaveLength(1);
  });

  it('respeita cooldown após o gerente tratar o alerta, sem loop de recriação', async () => {
    const ctx = makeSingletonHarness();
    await ctx.service.createOrRefreshSingleton(input);
    ctx.simulateHandledAlert();

    const retried = await ctx.service.createOrRefreshSingleton(input);

    expect(retried).toMatchObject({ created: false, suppressed: true });
    expect(ctx.inserts()).toBe(1);
    expect(ctx.emitted).toHaveLength(1);
  });

  it('resolve o singleton aberto quando o sinal deixa de existir', async () => {
    const ctx = makeSingletonHarness();
    await ctx.service.createOrRefreshSingleton(input);

    await expect(ctx.service.resolveOpenByKind(input.kind)).resolves.toBe(1);
    await expect(ctx.service.resolveOpenByKind(input.kind)).resolves.toBe(0);
  });
});
