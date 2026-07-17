import type { StaffSession } from './api';

export function canAccessManagerDashboard(session: StaffSession | null): boolean {
  return session?.staffRole === 'manager' || session?.staffRole === 'owner';
}

export function canManageEstablishment(session: StaffSession | null): boolean {
  return session?.staffRole === 'owner';
}

/**
 * A superfície provisória de caixa não herda privilégios gerenciais.
 * O client guard usa esta função antes de renderizar até mesmo a mensagem
 * informativa; endpoints financeiros continuam protegidos no backend.
 */
export function canAccessCashierSurface(session: StaffSession | null): boolean {
  return session?.staffRole === 'cashier';
}
