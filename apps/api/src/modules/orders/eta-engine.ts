/**
 * FASE 2 · 2B: motor de ETA extraído VERBATIM do orders.service — a parte
 * PURA (constantes + cálculo do range por estágio + componente de fila).
 * A leitura do range base configurado pela cozinha (settings.kitchen_eta_*)
 * continua no service (é I/O); aqui só matemática, testável sem banco.
 * Comportamento congelado em eta-engine.test.ts.
 */

// Valores são heurística de dev (TODO: configuráveis por restaurante nas
// settings junto com meta_minutes do KDS).
export const ETA_KITCHEN_PARALLEL_LINES = 2;
export const ETA_PER_QUEUED_ORDER_MIN = 4;
export const ETA_PER_QUEUED_ORDER_MAX = 7;
export const ETA_STAGE_RANGE: Record<string, [number, number]> = {
  pending_confirmation: [10, 16],
  received: [10, 16],
  in_progress: [5, 9],
  ready: [2, 5],
  in_transit: [1, 3],
  // aliases legados
  open: [10, 16],
  confirmed: [10, 16],
  preparing: [5, 9],
};
// Estágios em que o pedido ainda disputa a fila da cozinha (a partir de
// in_progress ele já está no fogão — fila à frente deixa de somar).
export const ETA_QUEUED_STATUSES = new Set([
  'pending_confirmation',
  'received',
  'open',
  'confirmed',
]);

export function computeEtaRange(
  status: string,
  aheadCount: number,
  base: [number, number],
): { min: number; max: number } | null {
  const stage = ETA_STAGE_RANGE[status];
  if (!stage) return null; // delivered/cancelled — não há espera
  let [min, max] = stage;
  // Estágios de preparo derivam do range BASE configurado pela cozinha:
  // na fila = base cheio; no fogão = metade restante. Pronto/a caminho
  // são handoff/deslocamento — independem do tempo de preparo.
  if (ETA_QUEUED_STATUSES.has(status)) {
    [min, max] = base;
  } else if (status === 'in_progress' || status === 'preparing') {
    [min, max] = [Math.max(1, Math.ceil(base[0] / 2)), Math.max(2, Math.ceil(base[1] / 2))];
  }
  if (ETA_QUEUED_STATUSES.has(status) && aheadCount > 0) {
    const slots = Math.ceil(aheadCount / ETA_KITCHEN_PARALLEL_LINES);
    min += slots * ETA_PER_QUEUED_ORDER_MIN;
    max += slots * ETA_PER_QUEUED_ORDER_MAX;
  }
  return { min, max };
}
