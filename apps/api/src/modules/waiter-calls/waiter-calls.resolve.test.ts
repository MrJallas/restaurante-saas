/**
 * P1 (re-scan 2026-07-04): `resolveCall` + `POST /:callId/resolve` eram DEAD
 * CODE — zero call-sites no monorepo. O chamado morria em 'acknowledged' pra
 * sempre: a sheet do cliente travava em "Aguardando garçom" ("Chamar de novo"
 * desabilitado porque 'acknowledged' ∉ DONE_STATUSES, "Cancelar" estourando
 * BadRequest 'já atendido'). O garçom NÃO tinha ação "Atendido/Concluído".
 *
 * Fix: o garçom resolve o chamado → status vira 'resolved' (terminal) E um WS
 * `waiter:resolved` é EMITIDO pro session room do cliente (destrava a sheet em
 * realtime, além do poll de 5s que já enxerga 'resolved') e pro tenant:waiter
 * (a lista do garçom limpa o chamado). 'resolved' já está em DONE_STATUSES no
 * lado do cliente — o gap era só o staff nunca disparar o resolve.
 *
 * RED→GREEN: resolve move pra 'resolved' + emite WS com o table_session_id
 * real (não pode sair com session undefined — mesmo footgun do unwrapRows do
 * acknowledge).
 */

import { ForbiddenException } from '@nestjs/common';
import { WaiterCallsService } from './waiter-calls.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';
import type { BillingService } from '../billing/billing.service';

const CALL = 'dddd4444-0000-4000-8000-000000000004';
const SESSION = 'eeee5555-0000-4000-8000-000000000005';
const SLUG = 'restaurant_dev';
const STAFF = 'aaaa5555-0000-4000-8000-000000000005';
const OTHER_STAFF = 'bbbb5555-0000-4000-8000-000000000005';

/**
 * DB fake: roteia o UPDATE ... RETURNING de resolveCall. `updated` controla
 * se a row ativa foi tocada (1 linha = resolveu; 0 = já-terminal/inexistente).
 * O driver pg devolve UPDATE...RETURNING como [rows, count] — imitamos pra
 * provar que o unwrapRows extrai o table_session_id real pro WS.
 */
function makeService(opts: { updated?: boolean }) {
  const resolvedEmits: Array<{ slug: string; callId: string; sessionId: string }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith("UPDATE waiter_calls SET status = 'resolved'")) {
      if (opts.updated === false) return [[], 0] as unknown[];
      return [[{ id: params[0], table_session_id: SESSION }], 1] as unknown[];
    }
    if (s.startsWith('SELECT status, acknowledged_by FROM waiter_calls')) {
      return [{ status: 'acknowledged', acknowledged_by: OTHER_STAFF }];
    }
    throw new Error(`fake resolve: SQL não roteado: ${s}`);
  };
  const conn = { query } as unknown as TenantConnectionProvider;
  const eventsGateway = {
    emitWaiterCallResolved: (slug: string, callId: string, sessionId: string) => {
      resolvedEmits.push({ slug, callId, sessionId });
    },
  } as unknown as EventsGateway;
  const service = new WaiterCallsService(conn, eventsGateway, {} as unknown as BillingService);
  return { service, resolvedEmits };
}

describe('WaiterCallsService.resolveCall — garçom conclui o chamado (P1)', () => {
  it('move pra resolved e EMITE waiter:resolved com o session real', async () => {
    const { service, resolvedEmits } = makeService({ updated: true });
    const res = await service.resolveCall(CALL, SLUG, STAFF);
    expect(res).toEqual({ callId: CALL, status: 'resolved' });
    // O WS destrava a sheet do cliente: precisa carregar o session real
    // (não undefined — regra do unwrapRows).
    expect(resolvedEmits).toHaveLength(1);
    expect(resolvedEmits[0]).toEqual({ slug: SLUG, callId: CALL, sessionId: SESSION });
  });

  it('garçom diferente do owner não resolve nem re-emite WS', async () => {
    const { service, resolvedEmits } = makeService({ updated: false });
    await expect(service.resolveCall(CALL, SLUG, STAFF)).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolvedEmits).toHaveLength(0);
  });
});
