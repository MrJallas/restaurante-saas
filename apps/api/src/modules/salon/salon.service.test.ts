/**
 * A07 (customer→customer): /salon/tables/adjacent é guardado por SessionGuard
 * (cliente). Ele NÃO pode devolver `active_session_id` de mesa nenhuma — esse é
 * o `x-session-token` do cliente daquela mesa, e vazá-lo deixa qualquer cliente
 * forjar a sessão de outra mesa. O status ('you'/'occupied'/'free') é resolvido
 * server-side, então o cliente não precisa do token de ninguém.
 */
import { SalonService } from './salon.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const MY_TOKEN = 'sess-my-secret-token';
const OTHER_TOKEN = 'sess-OTHER-table-secret-token';

function fakeConn(): TenantConnectionProvider {
  const query = async (): Promise<unknown> => [
    // minha mesa (ativa)
    {
      table_id: 'tbl-1',
      table_code: 'M01',
      table_label: 'Mesa 1',
      sort_order: 1,
      table_number: 1,
      active_session_id: MY_TOKEN,
      host_name: 'Ana',
      party: 2,
    },
    // mesa vizinha ativa — o token dela NÃO pode sair pro meu cliente
    {
      table_id: 'tbl-2',
      table_code: 'M02',
      table_label: 'Mesa 2',
      sort_order: 2,
      table_number: 2,
      active_session_id: OTHER_TOKEN,
      host_name: 'Bruno',
      party: 3,
    },
    // mesa livre
    {
      table_id: 'tbl-3',
      table_code: 'M03',
      table_label: 'Mesa 3',
      sort_order: 3,
      table_number: 3,
      active_session_id: null,
      host_name: null,
      party: 0,
    },
  ];
  return { query } as unknown as TenantConnectionProvider;
}

describe('SalonService.listAdjacentTables — não vaza token de sessão (A07)', () => {
  it('nenhum token de sessão aparece no payload do cliente', async () => {
    const svc = new SalonService(fakeConn());
    const res = await svc.listAdjacentTables({
      currentTableId: 'tbl-1',
      currentSessionId: MY_TOKEN,
      radius: 2,
    });
    const json = JSON.stringify(res);
    expect(json).not.toContain(MY_TOKEN);
    expect(json).not.toContain(OTHER_TOKEN);
    for (const t of res.tables) {
      expect((t as unknown as Record<string, unknown>).sessionId).toBeUndefined();
    }
  });

  it('preserva o status resolvido server-side (você/ocupada/livre) sem o token', async () => {
    const svc = new SalonService(fakeConn());
    const res = await svc.listAdjacentTables({
      currentTableId: 'tbl-1',
      currentSessionId: MY_TOKEN,
      radius: 2,
    });
    const byCode = Object.fromEntries(res.tables.map((t) => [t.tableCode, t]));
    expect(byCode['M01'].status).toBe('you'); // minha mesa
    expect(byCode['M02'].status).toBe('occupied'); // vizinha ativa (dist 1 <= radius 2)
    expect(byCode['M03'].status).toBe('free'); // sem sessão
    expect(byCode['M02'].party).toBe(3); // party segue exposto (não é credencial)
  });
});
