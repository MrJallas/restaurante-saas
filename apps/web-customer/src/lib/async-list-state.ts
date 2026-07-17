export function shouldShowEmptyListState(
  loading: boolean,
  error: string | null,
  itemCount: number,
): boolean {
  return !loading && error === null && itemCount === 0;
}
