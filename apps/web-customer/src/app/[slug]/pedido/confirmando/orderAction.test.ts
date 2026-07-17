import { runOrderAction } from './orderAction';

describe('runOrderAction', () => {
  it('reports complete success and de-duplicates ids', async () => {
    const action = jest.fn().mockResolvedValue({ ok: true });

    await expect(runOrderAction(['a', 'a', ' b '], action)).resolves.toEqual({
      succeededIds: ['a', 'b'],
      failedIds: [],
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('keeps partial failure explicit instead of pretending the batch succeeded', async () => {
    const action = jest.fn(async (id: string) => {
      if (id === 'b') throw new Error('offline');
    });

    await expect(runOrderAction(['a', 'b'], action)).resolves.toEqual({
      succeededIds: ['a'],
      failedIds: ['b'],
    });
  });

  it('reports total failure without throwing away the affected ids', async () => {
    await expect(
      runOrderAction(['a', 'b'], async () => {
        throw new Error('offline');
      }),
    ).resolves.toEqual({ succeededIds: [], failedIds: ['a', 'b'] });
  });
});
