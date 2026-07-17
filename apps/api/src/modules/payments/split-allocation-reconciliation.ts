export interface ReconciliableSplitAllocation {
  customerId: string;
  amountCents: number;
}

/**
 * Fecha diferenças pequenas de arredondamento sem mutar o array recebido.
 * A ordem canônica dos participantes define quem absorve os centavos: o
 * primeiro recebe sobras e, quando há excesso, cada allocation é reduzida na
 * ordem até zerar o delta — nunca abaixo de zero.
 *
 * A tolerância para aceitar ou rejeitar o drift pertence ao caller. Esta
 * função só garante o invariante final `sum(allocations) === totalCents`.
 */
export function reconcileSplitAllocations<Allocation extends ReconciliableSplitAllocation>(
  allocations: Allocation[],
  totalCents: number,
): Allocation[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError('Total do rateio deve ser um inteiro não negativo em centavos.');
  }

  const reconciled = allocations.map((allocation) => {
    if (!Number.isSafeInteger(allocation.amountCents) || allocation.amountCents < 0) {
      throw new RangeError('Allocation deve ser um inteiro não negativo em centavos.');
    }
    return { ...allocation };
  });

  const currentTotal = reconciled.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const delta = totalCents - currentTotal;
  if (delta === 0) return reconciled;
  if (!reconciled.length) {
    throw new RangeError('Não é possível reconciliar um total sem participantes.');
  }

  if (delta > 0) {
    reconciled[0].amountCents += delta;
    return reconciled;
  }

  let excess = -delta;
  for (const allocation of reconciled) {
    if (excess === 0) break;
    const reduction = Math.min(excess, allocation.amountCents);
    allocation.amountCents -= reduction;
    excess -= reduction;
  }
  if (excess !== 0) {
    throw new RangeError('As allocations não possuem saldo suficiente para o total informado.');
  }

  return reconciled;
}
