type ApiLikeError = {
  status?: unknown;
  code?: unknown;
};

export type OperationalLoadState = 'loading' | 'ready' | 'error';

/** Estado vazio só é fato quando a fonte terminou com sucesso. */
export function isAuthoritativeEmpty(state: OperationalLoadState, count: number): boolean {
  return state === 'ready' && count === 0;
}

/** Um refresh que falha preserva o último snapshot em vez de fabricar `[]`. */
export function retainRowsOnFailure<T>(previous: T[], result: PromiseSettledResult<T[]>): T[] {
  return result.status === 'fulfilled' ? result.value : previous;
}

export function operationalErrorCopy(error: unknown, subject: string): string {
  const candidate = error && typeof error === 'object' ? (error as ApiLikeError) : {};
  const authExpired =
    candidate.status === 401 ||
    candidate.code === 'AUTH_MISSING' ||
    candidate.code === 'AUTH_INVALID';
  if (authExpired) return 'Sessão expirada. Faça login novamente e tente de novo.';
  return `Não foi possível atualizar ${subject}. Tente novamente.`;
}
