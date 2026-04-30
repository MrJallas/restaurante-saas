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

  /**
   * Como `push` mas substitui a entry atual no history em vez de empilhar.
   * Use quando a tela atual nao deve aparecer no browser-back — ex.: tela
   * de "chamando garcom" depois de cancelar o chamado, tela de pagamento
   * apos confirmar. Sem isso, o usuario voltava com swipe-da-esquerda e
   * via "CHAMADO RECEBIDO" de um chamado ja cancelado (ghost screen).
   */
  const replace = useCallback(
    (href: string) => {
      start(() => router.replace(href));
    },
    [router],
  );

  const prefetch = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  return { push, replace, prefetch, pending };
}
