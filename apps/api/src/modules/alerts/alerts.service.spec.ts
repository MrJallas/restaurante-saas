/**
 * Executable contract assertions for role-aware alerts.
 *
 * Run with:
 *   TS_NODE_PROJECT=apps/api/tsconfig.json TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node -r ts-node/register apps/api/src/modules/alerts/alerts.service.spec.ts
 */

import { alertVisibleForRole } from './alerts.service';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/* eslint-disable no-console */
export function runAlertsRoleAssertions(): void {
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

  assert(alertVisibleForRole(kitchenAlert, 'manager'), 'manager must see kitchen alert');
  assert(alertVisibleForRole(kitchenAlert, 'cook'), 'cook must see kitchen alert');
  assert(!alertVisibleForRole(kitchenAlert, 'host'), 'host must not see kitchen alert');
  assert(alertVisibleForRole(hostAlert, 'host'), 'host must see scan verification alert');
  assert(alertVisibleForRole(waiterAlert, 'waiter'), 'waiter must see waiter call alert');
  assert(!alertVisibleForRole(waiterAlert, 'cashier'), 'cashier must not see waiter alert');

  console.log('alerts role assertions OK');
}

if (require.main === module) {
  runAlertsRoleAssertions();
}
