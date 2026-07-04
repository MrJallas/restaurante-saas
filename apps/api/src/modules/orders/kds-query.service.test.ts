/**
 * CHARACTERIZATION (FASE 2 · KDS): congela o comportamento das duas leituras
 * de fila da cozinha extraídas do orders.service. Fixa: (a) o predicado de
 * estação — bar filtra `= 'bebidas'`, cozinha filtra `<> 'bebidas'`; (b) o
 * mapeamento numérico priority_bucket → label (0=urgent, 1=vip, 2=normal,
 * fora-de-range → normal) e a REMOÇÃO da coluna priority_bucket do output;
 * (c) getKitchenQueue devolve o resultado da query direto (passthrough).
 *
 * O sweep-throttled NÃO é responsabilidade deste serviço (fica no wrapper do
 * orders.service) — por isso estas leituras não tocam Redis nem sweep.
 */

import { KdsQueryService } from './kds-query.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

function fakeConn(rows: unknown[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return rows;
  };
  return { calls, conn: { query } as unknown as TenantConnectionProvider };
}

describe('KdsQueryService — characterization (extraído do orders.service)', () => {
  it("getActiveOrdersForKds('bar') filtra bebidas e mapeia priority_bucket → label", async () => {
    const { calls, conn } = fakeConn([
      { id: 'o1', priority_bucket: 0, items: [] },
      { id: 'o2', priority_bucket: 1, items: [] },
      { id: 'o3', priority_bucket: 2, items: [] },
      { id: 'o4', priority_bucket: 9, items: [] },
    ]);

    const out = await new KdsQueryService(conn).getActiveOrdersForKds('bar');

    expect(calls[0].sql).toContain("= 'bebidas'");
    expect(out.map((o) => (o as { priority: string }).priority)).toEqual([
      'urgent',
      'vip',
      'normal',
      'normal',
    ]);
    // priority_bucket é interno — não vaza pro cliente da TV
    expect(out[0]).not.toHaveProperty('priority_bucket');
    expect(out[0]).toHaveProperty('id', 'o1');
  });

  it("getActiveOrdersForKds('kitchen') exclui bebidas", async () => {
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getActiveOrdersForKds('kitchen');
    expect(calls[0].sql).toContain("<> 'bebidas'");
  });

  it('getKitchenQueue devolve o resultado da query direto (passthrough)', async () => {
    const rows = [{ id: 'k1', status: 'received' }];
    const { conn } = fakeConn(rows);
    const out = await new KdsQueryService(conn).getKitchenQueue();
    expect(out).toBe(rows);
  });
});
