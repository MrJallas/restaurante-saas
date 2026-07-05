/**
 * P1 (re-scan 2026-07-05): chamado 'acknowledged' fica ÓRFÃO — sumia de TODA
 * lista do garçom. Repro: garçom toca "A caminho" (acknowledge), guarda o
 * celular e volta pra home → o chamado fica INVISÍVEL (as 3 listas do web-staff
 * consomem `getPendingCalls`, que filtrava só status='pending'). Sem estar na
 * lista, o garçom nunca alcança o ScreenWaiterCallDetail pra tocar "Atendido"
 * (resolve), então o cliente fica preso em "garçom a caminho" e o "Cancelar"
 * dele estoura 'já atendido'.
 *
 * Fix: `getPendingCalls` traz status IN ('pending','acknowledged') — um chamado
 * que o garçom aceitou mas ainda não concluiu CONTINUA visível na lista pra ele
 * poder tocar "Atendido". O resolve (commit 9f2bfe2) e o WS ficam intactos.
 *
 * RED→GREEN: um chamado 'acknowledged' aparece no retorno de getPendingCalls
 * (hoje some); o 'pending' segue aparecendo; um terminal ('resolved') fica fora.
 */

import { WaiterCallsService } from './waiter-calls.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';
import type { BillingService } from '../billing/billing.service';

const PENDING_CALL = 'aaaa1111-0000-4000-8000-000000000001';
const ACK_CALL = 'bbbb2222-0000-4000-8000-000000000002';
const RESOLVED_CALL = 'cccc3333-0000-4000-8000-000000000003';

interface Row {
  id: string;
  status: string;
  reason: string;
  created_at: string;
  assigned_waiter_name: string | null;
  eta_minutes: number | null;
  table_label: string;
  table_code: string;
  flags: string[];
}

/**
 * DB fake que MODELA a tabela: guarda um chamado de cada status e devolve só as
 * linhas cujo status casa com o predicado que `getPendingCalls` colocou no SQL.
 * Assim o teste é comportamental — com o `WHERE status = 'pending'` antigo o
 * 'acknowledged' NÃO volta (RED); com `status IN ('pending','acknowledged')`
 * ele volta (GREEN) — sem string-matching frágil do SQL inteiro.
 */
function makeService() {
  const table: Row[] = [
    {
      id: PENDING_CALL,
      status: 'pending',
      reason: 'ask_bill',
      created_at: '2026-07-05T01:00:00Z',
      assigned_waiter_name: null,
      eta_minutes: null,
      table_label: 'Mesa 12',
      table_code: 'M12',
      flags: [],
    },
    {
      id: ACK_CALL,
      status: 'acknowledged',
      reason: 'serve_drink',
      created_at: '2026-07-05T01:01:00Z',
      assigned_waiter_name: 'Rodrigo',
      eta_minutes: 3,
      table_label: 'Mesa 07',
      table_code: 'M07',
      flags: [],
    },
    {
      id: RESOLVED_CALL,
      status: 'resolved',
      reason: 'bring_menu',
      created_at: '2026-07-05T00:59:00Z',
      assigned_waiter_name: 'Ana',
      eta_minutes: null,
      table_label: 'Mesa 03',
      table_code: 'M03',
      flags: [],
    },
  ];

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('FROM waiter_calls wc') && s.includes('ORDER BY wc.created_at ASC')) {
      // Deriva quais status a lista pede olhando o SQL E os params ligados
      // (o fix usa `status = ANY($1)` com o array vindo por parâmetro, então
      // 'acknowledged' pode estar no SQL literal OU no param — cobre os dois).
      const boundStatuses = params.flat().map(String);
      const wantsAck =
        /wc\.status[^;]*acknowledged/.test(s) || boundStatuses.includes('acknowledged');
      const allowed = wantsAck ? new Set(['pending', 'acknowledged']) : new Set(['pending']);
      return table
        .filter((r) => allowed.has(r.status))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    throw new Error(`fake pending-list: SQL não roteado: ${s}`);
  };

  const conn = { query } as unknown as TenantConnectionProvider;
  const service = new WaiterCallsService(
    conn,
    {} as unknown as EventsGateway,
    {} as unknown as BillingService,
  );
  return { service };
}

describe('WaiterCallsService.getPendingCalls — lista do garçom (P1 órfão)', () => {
  it('inclui o chamado acknowledged (a-caminho) — não pode sumir da lista', async () => {
    const { service } = makeService();
    const rows = (await service.getPendingCalls()) as Array<{ id: string; status: string }>;
    const ids = rows.map((r) => r.id);
    // O essencial: o chamado que o garçom aceitou continua VISÍVEL pra ele
    // tocar "Atendido".
    expect(ids).toContain(ACK_CALL);
  });

  it('mantém o chamado pending (não regride o caminho feliz)', async () => {
    const { service } = makeService();
    const rows = (await service.getPendingCalls()) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toContain(PENDING_CALL);
  });

  it('não vaza chamados terminais (resolved fica fora)', async () => {
    const { service } = makeService();
    const rows = (await service.getPendingCalls()) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).not.toContain(RESOLVED_CALL);
  });
});
