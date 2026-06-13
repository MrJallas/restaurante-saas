/**
 * Role-aware alert visibility. MIGRADO de `alerts.service.spec.ts`
 * (ts-node) pra Jest no prompt 100 §5.4 + cobre o alert novo
 * `host_assist_table` ("Mesa X pediu a recepção") do mesmo prompt §5.5.
 */

import { alertVisibleForRole } from './alerts.service';

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
