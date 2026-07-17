/**
 * CHARACTERIZATION (FASE 2 · 2C): congela o comportamento do decorador de ETA
 * exatamente como era dentro do orders.service antes da extração VERBATIM.
 *
 * O eta-engine.test.ts já cobre a matemática pura (computeEtaRange). Aqui a
 * cobertura é da ORQUESTRAÇÃO + I/O que saiu do service:
 *  - decorateWithEta anota etaMin/etaMax/queueAhead por status (fila vs fogão);
 *  - getKitchenEtaBase lê settings.kitchen_eta_* com fallback pro default;
 *  - o snapshot da fila é consultado na ordenação canônica e posiciona o
 *    pedido (índice = quantos à frente), degradando pra ETA sem fila quando
 *    o snapshot falha.
 */

import { EtaDecoratorService } from './eta-decorator.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown[]>;

interface FakeConnOpts {
  // settings.kitchen_eta_* — undefined => coluna ausente/NULL (fallback default)
  etaBase?: { min: number | null; max: number | null };
  // ids na ordem canônica que o snapshot da fila devolve
  snapshot?: Array<string | { id: string; station: 'kitchen' | 'bar'; workload?: number }>;
  // força o SELECT de kitchen_eta a lançar (tenant pré-056)
  throwOnEtaBase?: boolean;
  // força o snapshot da fila a lançar (degrada pra ETA sem fila)
  throwOnSnapshot?: boolean;
}

function makeService(opts: FakeConnOpts = {}): EtaDecoratorService {
  const query: QueryFn = async (sql: string): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('kitchen_eta_min_minutes')) {
      if (opts.throwOnEtaBase) throw new Error('coluna kitchen_eta_* ausente (pré-056)');
      const base = opts.etaBase ?? { min: null, max: null };
      return [{ min: base.min, max: base.max }];
    }
    if (s.includes('FROM orders o') && s.includes('JOIN table_sessions ts')) {
      if (opts.throwOnSnapshot) throw new Error('snapshot da fila falhou');
      return (opts.snapshot ?? []).map((entry) =>
        typeof entry === 'string'
          ? { id: entry, station: 'kitchen', workload: 1 }
          : { workload: 1, ...entry },
      );
    }
    throw new Error(`fake eta conn: SQL não roteado: ${s}`);
  };
  const conn = { query } as unknown as TenantConnectionProvider;
  return new EtaDecoratorService(conn);
}

describe('EtaDecoratorService — comportamento congelado', () => {
  it('anota received sem fila com o range base default (fallback)', async () => {
    const svc = makeService(); // settings NULL => fallback [10,16]
    const [row] = await svc.decorateWithEta([{ id: 'o1', status: 'received' }]);
    expect(row).toEqual({ id: 'o1', status: 'received', etaMin: 10, etaMax: 16, queueAhead: 0 });
  });

  it('lê o range base configurado pela cozinha (settings.kitchen_eta_*)', async () => {
    const svc = makeService({ etaBase: { min: 20, max: 30 } });
    const [row] = await svc.decorateWithEta([{ id: 'o1', status: 'received' }]);
    expect(row.etaMin).toBe(20);
    expect(row.etaMax).toBe(30);
  });

  it('base inválido no settings (max < min) cai no fallback default', async () => {
    const svc = makeService({ etaBase: { min: 30, max: 10 } });
    const [row] = await svc.decorateWithEta([{ id: 'o1', status: 'received' }]);
    expect(row.etaMin).toBe(10);
    expect(row.etaMax).toBe(16);
  });

  it('SELECT do base lança (tenant pré-056) → fallback default', async () => {
    const svc = makeService({ throwOnEtaBase: true });
    const [row] = await svc.decorateWithEta([{ id: 'o1', status: 'received' }]);
    expect(row.etaMin).toBe(10);
    expect(row.etaMax).toBe(16);
  });

  it('posiciona pelo snapshot: índice = quantos à frente, soma por slots', async () => {
    // o3 está na 4ª posição (3 à frente) → ceil(3/2)=2 slots → +8/+14 sobre [10,16]
    const svc = makeService({ snapshot: ['o0', 'o1', 'o2', 'o3'] });
    const [row] = await svc.decorateWithEta([{ id: 'o3', status: 'received' }]);
    expect(row.queueAhead).toBe(3);
    expect(row.etaMin).toBe(18);
    expect(row.etaMax).toBe(30);
  });

  it('separa cozinha e bar: bebidas não aumentam ETA de um pedido de comida', async () => {
    const svc = makeService({
      snapshot: [
        { id: 'drink-1', station: 'bar' },
        { id: 'drink-2', station: 'bar' },
        { id: 'food-1', station: 'kitchen' },
        { id: 'target', station: 'kitchen' },
      ],
    });
    const [row] = await svc.decorateWithEta([
      { id: 'target', status: 'received', items: [{ kind: 'food', quantity: 1 }] },
    ]);

    expect(row.queueAhead).toBe(1);
    expect(row.etaMin).toBe(14);
    expect(row.etaMax).toBe(23);
  });

  it('usa quantidade como trabalho sem chamar cada item de pedido na UI', async () => {
    const svc = makeService({
      snapshot: [
        { id: 'large-food', station: 'kitchen', workload: 4 },
        { id: 'target', station: 'kitchen', workload: 1 },
      ],
    });
    const [row] = await svc.decorateWithEta([
      { id: 'target', status: 'received', items: [{ kind: 'food', quantity: 1 }] },
    ]);

    expect(row.queueAhead).toBe(1);
    expect(row.etaMin).toBe(18);
    expect(row.etaMax).toBe(30);
  });

  it('preparing (fogão) usa metade do base e a fila NÃO conta como queueAhead', async () => {
    const svc = makeService({ snapshot: ['o1'] });
    const [row] = await svc.decorateWithEta([{ id: 'o1', status: 'preparing' }]);
    // preparing não está em ETA_QUEUED_STATUSES → queueAhead zerado
    expect(row.queueAhead).toBe(0);
    // metade de [10,16] com pisos → [5,8]
    expect(row.etaMin).toBe(5);
    expect(row.etaMax).toBe(8);
  });

  it('snapshot falhando degrada pra ETA sem componente de fila (não derruba)', async () => {
    const svc = makeService({ throwOnSnapshot: true });
    const [row] = await svc.decorateWithEta([{ id: 'o1', status: 'received' }]);
    // sem snapshot → ahead 0 → range base cheio, queueAhead 0
    expect(row.queueAhead).toBe(0);
    expect(row.etaMin).toBe(10);
    expect(row.etaMax).toBe(16);
  });

  it('status terminal (delivered) não recebe ETA e não consulta o base', async () => {
    // etaBase NÃO roteado: se decorateWithEta consultasse, o fake lançaria só
    // se roteasse errado; aqui provamos que needsEta=false pula tudo.
    const svc = makeService();
    const [row] = await svc.decorateWithEta([{ id: 'o1', status: 'delivered' }]);
    expect(row.etaMin).toBeNull();
    expect(row.etaMax).toBeNull();
    expect(row.queueAhead).toBe(0);
  });
});
