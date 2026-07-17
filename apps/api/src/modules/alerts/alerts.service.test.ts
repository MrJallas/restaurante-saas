/**
 * Role-aware alert visibility. MIGRADO de `alerts.service.spec.ts`
 * (ts-node) pra Jest no prompt 100 §5.4 + cobre o alert novo
 * `host_assist_table` ("Mesa X pediu a recepção") do mesmo prompt §5.5.
 */

import { AlertsService, alertVisibleForRole } from './alerts.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';

describe('alertVisibleForRole', () => {
  const kitchenAlert = {
    kind: 'kitchen_priority_request',
    title: 'Pedido puxado para frente',
    sub: 'Cozinha precisa responder',
  };
  const hostAlert = {
    kind: 'scan_verification_pending',
    title: 'QR precisa de verificação',
    sub: 'Mesa 12 aguardando recepção',
  };
  const waiterAlert = {
    kind: 'waiter_call_overdue',
    title: 'Chamado de mesa atrasado',
    sub: 'Garçom responsável deve responder',
  };
  const hostAssistAlert = {
    kind: 'host_assist_table',
    title: 'Mesa 7 pediu a recepção',
    sub: 'Cliente pediu ajuda da recepção pelo assistente.',
  };

  it('manager sees everything', () => {
    expect(alertVisibleForRole(kitchenAlert, 'manager')).toBe(true);
    expect(alertVisibleForRole(hostAssistAlert, 'manager')).toBe(true);
  });

  it('cook sees kitchen alerts; host does not', () => {
    expect(alertVisibleForRole(kitchenAlert, 'cook')).toBe(true);
    expect(alertVisibleForRole(kitchenAlert, 'host')).toBe(false);
  });

  it('host sees scan verification alerts', () => {
    expect(alertVisibleForRole(hostAlert, 'host')).toBe(true);
  });

  it('waiter sees waiter alerts; cashier does not', () => {
    expect(alertVisibleForRole(waiterAlert, 'waiter')).toBe(true);
    expect(alertVisibleForRole(waiterAlert, 'cashier')).toBe(false);
  });

  it('host sees (and can act on) host_assist_table — prompt 100 §5.5', () => {
    expect(alertVisibleForRole(hostAssistAlert, 'host')).toBe(true);
    expect(alertVisibleForRole(hostAssistAlert, 'cook')).toBe(false);
  });
});

/**
 * P1 retry-safety (re-scan #8): `POST /:slug/host/assist` deve ser idempotente.
 * `AlertsService.create({ kind:'host_assist_table', tableSessionId })` NÃO pode
 * spammar N alertas ativos por sessão (double-tap com guard liberado no finally
 * ou timeout+retry do api() em 15s). Fix: coluna table_session_id + índice único
 * parcial (migration 069) + `ON CONFLICT DO NOTHING` no INSERT; em conflito,
 * re-fetch reusa o alerta ativo existente sem reemitir `alert.created`.
 *
 * OUTROS kinds (escalation/qr-issue/etc.) NÃO passam tableSessionId → coluna NULL
 * → fora do índice parcial → nunca conflitam → seguem criando N linhas normais.
 * Estes testes provam os dois lados via um fake que emula o árbitro parcial.
 */
describe('AlertsService.create — dedup host_assist_table por sessão (P1 retry-safety)', () => {
  /**
   * fakeAlertsDb emula o comportamento do índice único parcial (mig 069):
   *  - INSERT host_assist_table (tableSessionId != null): 1º pra a sessão cria
   *    row; um 2º com a MESMA sessão ATIVA "conflita" → DO NOTHING → [] (tupla
   *    pg-mutation vazia). Guarda a row ativa por sessão pra o re-fetch reusar.
   *  - INSERT de outros kinds (tableSessionId null): SEMPRE cria (o predicado do
   *    árbitro exige kind='host_assist_table' + sessão NOT NULL → nunca casa).
   *  - SELECT ... (re-fetch): devolve a row ativa da sessão.
   */
  function fakeAlertsDb() {
    let seq = 0;
    // sessão ativa → row host_assist ativa (emula o estado do índice parcial).
    const activeHostAssistBySession = new Map<string, Record<string, unknown>>();
    const inserts: Array<{ kind: string; sessionId: string | null }> = [];

    const buildRow = (params: unknown[]): Record<string, unknown> => ({
      id: `alert-${++seq}`,
      sev: params[0],
      kind: params[1],
      title: params[2],
      sub: params[3] ?? null,
      ttl_at: params[4] ?? null,
      actions: JSON.parse((params[5] as string) ?? '[]'),
      dismissed_at: null,
      resolved_at: null,
      created_at: new Date(Date.now() + seq).toISOString(),
      table_session_id: params[6] ?? null,
    });

    const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('INSERT INTO alerts')) {
        const sessionId = (params[6] ?? null) as string | null;
        const kind = params[1] as string;
        inserts.push({ kind, sessionId });
        const hasConflictClause = s.includes('ON CONFLICT');
        // Conflito: host_assist com sessão que já tem alerta ativo → DO NOTHING.
        if (hasConflictClause && sessionId && activeHostAssistBySession.has(sessionId)) {
          return []; // pg mutation com 0 linhas afetadas
        }
        const row = buildRow(params);
        if (kind === 'host_assist_table' && sessionId) {
          activeHostAssistBySession.set(sessionId, row);
        }
        return [row];
      }

      // re-fetch do alerta ativo pra a sessão (caminho de conflito).
      if (s.startsWith('SELECT id, sev, kind, title, sub, ttl_at, actions,')) {
        const sessionId = params[0] as string;
        const row = activeHostAssistBySession.get(sessionId);
        return row ? [row] : [];
      }

      throw new Error(`fake alerts: SQL não roteado: ${s}`);
    };

    const emitted: Array<Record<string, unknown>> = [];
    const conn = {
      query,
      getTenantSlug: () => 'acme',
    } as unknown as TenantConnectionProvider;
    const events = {
      emitAlertCreated: (_slug: string, alert: Record<string, unknown>) => {
        emitted.push(alert);
      },
    } as unknown as EventsGateway;

    return {
      service: new AlertsService(conn, events),
      getInserts: () => inserts,
      getEmittedCount: () => emitted.length,
    };
  }

  it('2x create host_assist_table pra a MESMA sessão → 1 alerta ativo (reusa o existente no retry)', async () => {
    const db = fakeAlertsDb();
    const base = {
      sev: 'atenção' as const,
      kind: 'host_assist_table',
      title: 'Mesa 7 pediu a recepção',
      tableSessionId: 'sess-7',
    };

    const first = await db.service.create(base);
    const second = await db.service.create(base);

    // Retry devolve o MESMO alerta ativo, não um novo id.
    expect(second.id).toBe(first.id);
    // Só o 1º INSERT criou; o 2º conflitou → 1 alerta ativo, não 2.
    const hostInserts = db.getInserts().filter((i) => i.kind === 'host_assist_table');
    expect(hostInserts).toHaveLength(2); // ambos tentaram inserir
    // …mas só 1 WS `alert.created` foi emitido (o retry não reemite).
    expect(db.getEmittedCount()).toBe(1);
  });

  it('sessões DIFERENTES → 2 alertas host_assist distintos (dedup é por sessão, não global)', async () => {
    const db = fakeAlertsDb();
    const a = await db.service.create({
      sev: 'atenção',
      kind: 'host_assist_table',
      title: 'Mesa 7 pediu a recepção',
      tableSessionId: 'sess-7',
    });
    const b = await db.service.create({
      sev: 'atenção',
      kind: 'host_assist_table',
      title: 'Mesa 9 pediu a recepção',
      tableSessionId: 'sess-9',
    });
    expect(a.id).not.toBe(b.id);
    expect(db.getEmittedCount()).toBe(2);
  });

  it('OUTROS kinds (escalation/qr-issue) NÃO regridem: sem sessão, 2 creates → 2 alertas', async () => {
    const db = fakeAlertsDb();
    const e1 = await db.service.create({
      sev: 'crítica',
      kind: 'escalation_overdue',
      title: 'Escalonamento atrasado',
    });
    const e2 = await db.service.create({
      sev: 'crítica',
      kind: 'escalation_overdue',
      title: 'Escalonamento atrasado',
    });
    const q1 = await db.service.create({
      sev: 'atenção',
      kind: 'qr_issue_critical',
      title: 'QR com problema',
    });
    // Nenhum conflito: ids distintos, 3 emissões — dedup é ESPECÍFICA do host_assist.
    expect(new Set([e1.id, e2.id, q1.id]).size).toBe(3);
    expect(db.getEmittedCount()).toBe(3);
    // Nenhum INSERT de outro kind carregou sessão.
    expect(
      db.getInserts().every((i) => i.kind === 'host_assist_table' || i.sessionId === null),
    ).toBe(true);
  });
});
