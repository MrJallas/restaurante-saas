import { homeForStaffRole } from './api';

describe('homeForStaffRole', () => {
  it('envia bartender autenticado ao KDS individual do bar', () => {
    expect(homeForStaffRole('bartender')).toBe('/bar');
  });

  it('envia cada papel para a superfície própria, inclusive cashier', () => {
    expect(homeForStaffRole('owner')).toBe('/manager');
    expect(homeForStaffRole('manager')).toBe('/manager');
    expect(homeForStaffRole('host')).toBe('/host');
    expect(homeForStaffRole('waiter')).toBe('/waiter');
    expect(homeForStaffRole('cook')).toBe('/cozinha');
    expect(homeForStaffRole('cashier')).toBe('/cashier');
  });
});
