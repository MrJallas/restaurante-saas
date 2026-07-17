export type PixLoadStatus = 'loading' | 'ready' | 'error';
export type PixGate = 'missing-payment' | 'loading' | 'load-error' | 'ready';

export const PIX_INITIAL_LOAD_ERROR =
  'Não consegui carregar esta demonstração de Pix. Nenhum código foi exibido; tente novamente.';

export function resolvePixGate(
  paymentId: string,
  loadStatus: PixLoadStatus,
  hasPayment: boolean,
): PixGate {
  if (!paymentId.trim()) return 'missing-payment';
  if (loadStatus === 'error') return 'load-error';
  if (loadStatus === 'ready' && hasPayment) return 'ready';
  return 'loading';
}
