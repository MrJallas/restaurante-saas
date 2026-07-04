/**
 * CHARACTERIZATION (FASE 2 · 2B): congela o cálculo de ETA exatamente como
 * era dentro do orders.service (extração verbatim). Valores computados à
 * mão do algoritmo original — a regra do cliente "range que encolhe por
 * estágio" (MEMORY.md 2026-06-10) não pode mudar num refactor.
 */

import { computeEtaRange } from './eta-engine';

const BASE_DEFAULT: [number, number] = [10, 16];

describe('computeEtaRange — comportamento congelado', () => {
  it('na fila sem ninguém na frente usa o range base cheio', () => {
    expect(computeEtaRange('received', 0, BASE_DEFAULT)).toEqual({ min: 10, max: 16 });
    expect(computeEtaRange('pending_confirmation', 0, BASE_DEFAULT)).toEqual({ min: 10, max: 16 });
  });

  it('fila à frente soma por slots (2 linhas paralelas, 4–7min por pedido)', () => {
    // 3 na frente → ceil(3/2)=2 slots → +8min/+14min
    expect(computeEtaRange('received', 3, BASE_DEFAULT)).toEqual({ min: 18, max: 30 });
    // 1 na frente → 1 slot → +4/+7
    expect(computeEtaRange('received', 1, BASE_DEFAULT)).toEqual({ min: 14, max: 23 });
  });

  it('no fogão (in_progress) é metade do base, e a fila NÃO soma mais', () => {
    expect(computeEtaRange('in_progress', 5, BASE_DEFAULT)).toEqual({ min: 5, max: 8 });
    expect(computeEtaRange('preparing', 2, BASE_DEFAULT)).toEqual({ min: 5, max: 8 });
  });

  it('pronto/a caminho são fixos (handoff, independem do preparo)', () => {
    expect(computeEtaRange('ready', 9, BASE_DEFAULT)).toEqual({ min: 2, max: 5 });
    expect(computeEtaRange('in_transit', 9, BASE_DEFAULT)).toEqual({ min: 1, max: 3 });
  });

  it('base configurado pela cozinha propaga (fila = cheio; fogão = metade)', () => {
    expect(computeEtaRange('received', 0, [20, 30])).toEqual({ min: 20, max: 30 });
    expect(computeEtaRange('in_progress', 0, [20, 30])).toEqual({ min: 10, max: 15 });
    // base mínimo: pisos de 1/2 minutos no fogão
    expect(computeEtaRange('in_progress', 0, [1, 2])).toEqual({ min: 1, max: 2 });
  });

  it('estágio terminal não tem espera', () => {
    expect(computeEtaRange('delivered', 0, BASE_DEFAULT)).toBeNull();
    expect(computeEtaRange('cancelled', 0, BASE_DEFAULT)).toBeNull();
  });
});
