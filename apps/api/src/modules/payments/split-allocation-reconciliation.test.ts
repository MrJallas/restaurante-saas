import { reconcileSplitAllocations } from './split-allocation-reconciliation';

describe('reconcileSplitAllocations', () => {
  it('delta positivo: primeiro participante absorve a sobra', () => {
    expect(
      reconcileSplitAllocations(
        [
          { customerId: 'a', amountCents: 500 },
          { customerId: 'b', amountCents: 499 },
        ],
        1_000,
      ),
    ).toEqual([
      { customerId: 'a', amountCents: 501 },
      { customerId: 'b', amountCents: 499 },
    ]);
  });

  it('delta negativo: distribui a redução sem produzir allocation negativa', () => {
    const reconciled = reconcileSplitAllocations(
      [
        { customerId: 'a', amountCents: 1 },
        { customerId: 'b', amountCents: 500 },
      ],
      499,
    );

    expect(reconciled).toEqual([
      { customerId: 'a', amountCents: 0 },
      { customerId: 'b', amountCents: 499 },
    ]);
    expect(reconciled.every(({ amountCents }) => amountCents >= 0)).toBe(true);
  });

  it('delta zero: preserva os valores e ainda devolve cópias', () => {
    const original = [
      { customerId: 'a', amountCents: 500 },
      { customerId: 'b', amountCents: 500 },
    ];

    const reconciled = reconcileSplitAllocations(original, 1_000);

    expect(reconciled).toEqual(original);
    expect(reconciled).not.toBe(original);
    expect(reconciled[0]).not.toBe(original[0]);
  });
});
