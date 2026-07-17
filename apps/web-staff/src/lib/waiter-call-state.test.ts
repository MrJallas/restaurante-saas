import { canMutateWaiterCall, waiterCallTypeFromReason } from './waiter-call-state';

describe('waiter call detail fail-closed', () => {
  it('deriva o visual do motivo autoritativo', () => {
    expect(waiterCallTypeFromReason('ask_bill')).toBe('pediu-conta');
    expect(waiterCallTypeFromReason('serve_drink')).toBe('mais-bebida');
    expect(waiterCallTypeFromReason('other')).toBe('chamou-garcom');
  });

  it('não permite mutação sem detalhe real ou após erro', () => {
    expect(
      canMutateWaiterCall({
        hasDetail: false,
        loadFailed: false,
        submitting: false,
        resolved: false,
      }),
    ).toBe(false);
    expect(
      canMutateWaiterCall({
        hasDetail: false,
        loadFailed: true,
        submitting: false,
        resolved: false,
      }),
    ).toBe(false);
    expect(
      canMutateWaiterCall({
        hasDetail: true,
        loadFailed: false,
        submitting: false,
        resolved: false,
      }),
    ).toBe(true);
  });
});
