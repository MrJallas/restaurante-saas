import { shouldShowEmptyListState } from './async-list-state';

describe('shouldShowEmptyListState', () => {
  it('shows empty only after a successful empty load', () => {
    expect(shouldShowEmptyListState(false, null, 0)).toBe(true);
  });

  it('does not contradict an error with an empty-success message', () => {
    expect(shouldShowEmptyListState(false, 'Falha de rede', 0)).toBe(false);
  });

  it('stays hidden while loading or when items exist', () => {
    expect(shouldShowEmptyListState(true, null, 0)).toBe(false);
    expect(shouldShowEmptyListState(false, null, 2)).toBe(false);
  });
});
