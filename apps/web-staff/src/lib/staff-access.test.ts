import {
  canAccessCashierSurface,
  canAccessManagerDashboard,
  canManageEstablishment,
} from './staff-access';

describe('canAccessManagerDashboard', () => {
  it('permite manager e owner no dashboard, mas só owner no estabelecimento', () => {
    expect(canAccessManagerDashboard({ staffId: '1', staffName: 'M', staffRole: 'manager' })).toBe(
      true,
    );
    const owner = { staffId: '3', staffName: 'D', staffRole: 'owner' as const };
    expect(canAccessManagerDashboard(owner)).toBe(true);
    expect(canManageEstablishment(owner)).toBe(true);
    expect(canManageEstablishment({ staffId: '1', staffName: 'M', staffRole: 'manager' })).toBe(
      false,
    );
    expect(canAccessManagerDashboard({ staffId: '2', staffName: 'G', staffRole: 'waiter' })).toBe(
      false,
    );
    expect(canAccessManagerDashboard(null)).toBe(false);
  });
});

describe('canAccessCashierSurface', () => {
  it('libera apenas cashier, sem herdar acesso de manager ou owner', () => {
    expect(canAccessCashierSurface({ staffId: '4', staffName: 'C', staffRole: 'cashier' })).toBe(
      true,
    );
    expect(canAccessCashierSurface({ staffId: '1', staffName: 'M', staffRole: 'manager' })).toBe(
      false,
    );
    expect(canAccessCashierSurface({ staffId: '3', staffName: 'D', staffRole: 'owner' })).toBe(
      false,
    );
    expect(canAccessCashierSurface(null)).toBe(false);
  });
});
