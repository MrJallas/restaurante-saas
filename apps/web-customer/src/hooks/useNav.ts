'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/**
 * Wrapper leve em cima do `useRouter` do Next 14. Envolve `router.push` em
 * `startTransition` para o React poder manter a UI atual pintada enquanto a
 * rota nova carrega no background — sem tela branca entre cliques rapidos.
 *
 * Tambem expoe `prefetch` direto e um `pending` pra quem quiser estado de
 * loading (botao desabilita, etc.). Em cross-origin/Safari iOS a diferenca
 * visual e grande: transicoes que travavam ~400ms agora sao imperceptiveis.
 */
export function useNav() {
  const router = useRouter();
  const [pending, start] = useTransition();

  const push = useCallback(
    (href: string) => {
      start(() => router.push(href));
    },
    [router],
  );

  const prefetch = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  return { push, prefetch, pending };
}
