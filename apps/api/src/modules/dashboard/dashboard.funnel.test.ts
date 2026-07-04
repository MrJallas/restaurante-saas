/**
 * Decisão Caleb 2026-07-04 (gate 1D): as telas de leitura do manager saem
 * do fake e ganham BACKEND REAL. O funil de pedidos nasce aqui: etapas com
 * mediana/p95 do dia calculadas da order_status_history (fonte que já
 * registra toda transição), com "acima da meta" ancorado no kitchen_eta
 * das settings — nunca em número inventado.
 */

import { DashboardService } from './dashboard.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

function fakeDb(opts: {
  funnelRows?: Array<{
    stage: string;
    ord: number;
    count: unknown;
    median_min: unknown;
    p95_min: unknown;
  }>;
  kitchenEtaMax?: number | null;
}) {
  const query = async (sql: string): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('FROM order_status_history') || s.includes('WITH h AS')) {
      return opts.funnelRows ?? [];
    }
    if (s.includes('kitchen_eta_max_minutes')) {
      return [{ kitchen_eta_max_minutes: opts.kitchenEtaMax ?? null }];
    }
    throw new Error(`fake dashboard: SQL não roteado: ${s}`);
  };
  return { query } as unknown as TenantConnectionProvider;
}

describe('DashboardService.getOrderFunnel — funil real do dia', () => {
  it('devolve etapas com números COAGIDOS (pg manda string) e meta da cozinha aplicada', async () => {
    const service = new DashboardService(
      fakeDb({
        kitchenEtaMax: 16,
        funnelRows: [
          // pg devolve numeric/round como STRING — o serviço tem que coagir.
          { stage: 'Confirmação', ord: 1, count: '42', median_min: '0.3', p95_min: '0.8' },
          { stage: 'Em preparo', ord: 3, count: '38', median_min: '21.0', p95_min: '34.5' },
        ],
      }),
    );

    const funnel = await service.getOrderFunnel();
    expect(funnel.stages).toHaveLength(2);

    const confirm = funnel.stages[0];
    expect(confirm.count).toBe(42);
    expect(confirm.medianMinutes).toBe(0.3);
    expect(confirm.ok).toBe(true);

    const prep = funnel.stages[1];
    expect(prep.medianMinutes).toBe(21);
    expect(prep.p95Minutes).toBe(34.5);
    // mediana 21min > meta da cozinha 16min → sinaliza, com nota honesta
    expect(prep.ok).toBe(false);
    expect(prep.note).toMatch(/meta da cozinha/i);
  });

  it('sem meta configurada não inventa julgamento (ok=true, sem nota)', async () => {
    const service = new DashboardService(
      fakeDb({
        kitchenEtaMax: null,
        funnelRows: [
          { stage: 'Em preparo', ord: 3, count: '5', median_min: '40.0', p95_min: '55.0' },
        ],
      }),
    );
    const funnel = await service.getOrderFunnel();
    expect(funnel.stages[0].ok).toBe(true);
    expect(funnel.stages[0].note).toBe('');
  });

  it('dia sem transições → stages vazio (a tela mostra empty-state, não demo)', async () => {
    const service = new DashboardService(fakeDb({ funnelRows: [] }));
    const funnel = await service.getOrderFunnel();
    expect(funnel.stages).toEqual([]);
  });
});
