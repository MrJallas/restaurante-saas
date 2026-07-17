/**
 * P1-R (re-scan da auditoria 2026-07-03): `cancelCall` cancelava um chamado
 * JÁ ATENDIDO ('acknowledged') — o gate usava `ACTIVE_STATUSES` (que INCLUI
 * 'acknowledged'), então acknowledged passava o gate e caía no UPDATE sem
 * `WHERE status='pending'`. O garçom já A CAMINHO nunca sabia que o chamado
 * sumiu (nenhum WS de cancelamento). Isso VIOLAVA o próprio docstring do
 * método ("A call that's already acknowledged cannot be cancelled — the
 * waiter is already on their way").
 *
 * Decisão do fix (conservador, alinhado ao docstring): BARRAR o cancel de
 * 'acknowledged' com BadRequestException. O caminho feliz — cancelar um
 * 'pending' — fica CONGELADO/preservado.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WaiterCallsService } from './waiter-calls.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';
import type { BillingService } from '../billing/billing.service';

const CALL = 'dddd4444-0000-4000-8000-000000000004';
const SESSION = 'eeee5555-0000-4000-8000-000000000005';
const OTHER_SESSION = 'ffff6666-0000-4000-8000-000000000006';

/**
 * DB fake: roteia o SELECT de status/scope e o UPDATE de cancelamento.
 * `status` controla o estado do chamado carregado; `updateCalls` grava os
 * UPDATEs que chegaram pra provar que o acknowledged NÃO cancela.
 */
function makeService(opts: { status?: string; sessionId?: string; call?: boolean }) {
  const updateCalls: string[] = [];
  const query = async (sql: string, _params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, status, table_session_id FROM waiter_calls')) {
      if (opts.call === false) return [];
      return [
        { id: CALL, status: opts.status ?? 'pending', table_session_id: opts.sessionId ?? SESSION },
      ];
    }
    if (s.startsWith('UPDATE waiter_calls SET status')) {
      updateCalls.push(s);
      // pg devolve [rows, affected] em UPDATE; imitamos 1 linha afetada.
      return [[], 1] as unknown[];
    }
    throw new Error(`fake cancel: SQL não roteado: ${s}`);
  };
  const conn = { query } as unknown as TenantConnectionProvider;
  const service = new WaiterCallsService(
    conn,
    {} as unknown as EventsGateway,
    {} as unknown as BillingService,
  );
  return { service, updateCalls };
}

describe('WaiterCallsService.cancelCall — só cancela pending (P1-R)', () => {
  it('cancela um chamado pending (caminho feliz preservado)', async () => {
    const { service, updateCalls } = makeService({ status: 'pending' });
    const res = await service.cancelCall(CALL, SESSION);
    expect(res).toEqual({ callId: CALL, status: 'cancelled' });
    // O UPDATE de cancelamento REALMENTE rodou pro pending.
    expect(updateCalls).toHaveLength(1);
  });

  it('REJEITA cancelar um chamado já atendido (acknowledged) e NÃO roda UPDATE', async () => {
    const { service, updateCalls } = makeService({ status: 'acknowledged' });
    await expect(service.cancelCall(CALL, SESSION)).rejects.toThrow(BadRequestException);
    await expect(service.cancelCall(CALL, SESSION)).rejects.toThrow(/já atendido/i);
    // Prova do bug: nenhum UPDATE de cancelamento pôde rodar.
    expect(updateCalls).toHaveLength(0);
  });

  it('chamado já cancelado → idempotente (retorna cancelled, sem novo UPDATE)', async () => {
    const { service, updateCalls } = makeService({ status: 'cancelled' });
    const res = await service.cancelCall(CALL, SESSION);
    expect(res).toEqual({ callId: CALL, status: 'cancelled' });
    expect(updateCalls).toHaveLength(0);
  });

  it('chamado já resolvido → retorna status atual, sem cancelar', async () => {
    const { service, updateCalls } = makeService({ status: 'resolved' });
    const res = await service.cancelCall(CALL, SESSION);
    expect(res).toEqual({ callId: CALL, status: 'resolved' });
    expect(updateCalls).toHaveLength(0);
  });

  it('chamado inexistente → 404', async () => {
    const { service } = makeService({ call: false });
    await expect(service.cancelCall(CALL, SESSION)).rejects.toThrow(NotFoundException);
  });

  it('chamado de outra sessão → 404 (scope check)', async () => {
    const { service } = makeService({ status: 'pending', sessionId: OTHER_SESSION });
    await expect(service.cancelCall(CALL, SESSION)).rejects.toThrow(NotFoundException);
  });
});
