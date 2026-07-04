/**
 * P1 (re-scan 2026-07-04): re-chamar numa mesa com call 'acknowledged' sumia
 * SILENCIOSAMENTE. O `ON CONFLICT (table_session_id) ... DO UPDATE SET reason`
 * colapsava a nova reason na row acknowledged com was_inserted=false → o guard
 * `if (call.was_inserted)` barrava o WS. Cenário: cliente pede ask_bill, garçom
 * ack, cliente pede serve_drink → o garçom NÃO era avisado e a reason antiga
 * era sobrescrita sem ninguém saber.
 *
 * Fix: quando o ON CONFLICT atualiza um call ATIVO e a reason MUDOU, re-emite
 * `waiter:call` pro garçom (nova solicitação visível), sem criar row duplicada
 * (preserva o índice 1-ativo-por-mesa) e sem quebrar o dedup de spam do MESMO
 * botão (mesma reason numa row ainda pending NÃO re-notifica).
 *
 * RED→GREEN: re-chamar com reason nova emite WS; mesmo-botão (reason igual)
 * não spamma.
 */

import { WaiterCallsService } from './waiter-calls.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';
import type { BillingService } from '../billing/billing.service';

const SESSION = 'eeee5555-0000-4000-8000-000000000005';
const CALL = 'dddd4444-0000-4000-8000-000000000004';
const SLUG = 'restaurant_dev';

/**
 * DB fake do createCall: SELECT da mesa + INSERT ... ON CONFLICT ... RETURNING.
 * `insert` controla o resultado do upsert:
 *   - wasInserted: xmax=0 (linha nova)
 *   - status/reason: estado FINAL da row após o upsert
 *   - reasonChanged: se o ON CONFLICT trocou a reason (prova do re-chamado)
 */
function makeService(insert: {
  wasInserted: boolean;
  status: string;
  reason: string;
  reasonChanged: boolean;
}) {
  const calls: Array<{ slug: string; reason?: string; callId: string }> = [];
  const query = async (sql: string, _params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT ts.id, t.label, t.code')) {
      return [{ id: SESSION, label: 'Mesa 12', code: 'M12' }];
    }
    // O upsert virou um CTE (`WITH prior ... upsert ... SELECT`) porque o
    // PG16 não expõe OLD/EXCLUDED em RETURNING — o fake casa pela cabeça do CTE.
    if (s.startsWith('WITH prior AS')) {
      return [
        {
          id: CALL,
          status: insert.status,
          reason: insert.reason,
          created_at: '2026-07-04T01:00:00Z',
          assigned_waiter_name: null,
          eta_minutes: null,
          was_inserted: insert.wasInserted,
          reason_changed: insert.reasonChanged,
        },
      ];
    }
    throw new Error(`fake recall: SQL não roteado: ${s}`);
  };
  const conn = { query } as unknown as TenantConnectionProvider;
  const eventsGateway = {
    emitWaiterCall: (
      slug: string,
      callData: { callId: string; reason?: string },
    ) => {
      calls.push({ slug, reason: callData.reason, callId: callData.callId });
    },
  } as unknown as EventsGateway;
  const service = new WaiterCallsService(conn, eventsGateway, {} as unknown as BillingService);
  return { service, calls };
}

describe('WaiterCallsService.createCall — re-chamar avisa o garçom (P1)', () => {
  it('chamado NOVO (inserido) emite waiter:call — caminho feliz preservado', async () => {
    const { service, calls } = makeService({
      wasInserted: true,
      status: 'pending',
      reason: 'bring_menu',
      reasonChanged: false,
    });
    await service.createCall(SESSION, SLUG, { reason: 'bring_menu' });
    expect(calls).toHaveLength(1);
    expect(calls[0].reason).toBe('bring_menu');
  });

  it('re-chamar com call ACKNOWLEDGED + reason NOVA → RE-EMITE waiter:call (o bug)', async () => {
    const { service, calls } = makeService({
      wasInserted: false,
      status: 'acknowledged',
      reason: 'serve_drink',
      reasonChanged: true,
    });
    await service.createCall(SESSION, SLUG, { reason: 'serve_drink' });
    // O garçom TEM que ser avisado da nova solicitação (serve_drink), mesmo
    // com a row já acknowledged.
    expect(calls).toHaveLength(1);
    expect(calls[0].reason).toBe('serve_drink');
  });

  it('mesmo botão (reason IGUAL, ON CONFLICT sem troca) → NÃO spamma o garçom', async () => {
    const { service, calls } = makeService({
      wasInserted: false,
      status: 'pending',
      reason: 'bring_menu',
      reasonChanged: false,
    });
    await service.createCall(SESSION, SLUG, { reason: 'bring_menu' });
    expect(calls).toHaveLength(0);
  });
});
