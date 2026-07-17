export type WaiterCallVisualType =
  | 'pediu-conta'
  | 'chamou-garcom'
  | 'pronto-cozinha'
  | 'mais-bebida';

export function waiterCallTypeFromReason(reason: string): WaiterCallVisualType {
  if (reason === 'ask_bill') return 'pediu-conta';
  if (reason === 'serve_drink') return 'mais-bebida';
  return 'chamou-garcom';
}

export function canMutateWaiterCall(input: {
  hasDetail: boolean;
  loadFailed: boolean;
  submitting: boolean;
  resolved: boolean;
}): boolean {
  return input.hasDetail && !input.loadFailed && !input.submitting && !input.resolved;
}
