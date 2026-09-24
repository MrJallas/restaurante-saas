'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

export interface ActiveZonePause {
  id: string;
  waiterId: string;
  endsAt: string;
}

interface ZonePauseListResponse {
  // BE retorna o array direto via service.list — mas algumas variantes
  // legacy embrulharam em { items: [...] }. Aceitamos ambos pra robustez.
  items?: ActiveZonePause[];
}

/**
 * Polls active zone pauses for the tenant.
 *
 * P1 #21: o customer-side nao tinha nenhum hook (WS ou polling) que
 * detectasse zone-pause ativa, entao a tela do cliente nao podia ajustar
 * ETA "silenciosamente" como o spec pede (`docs/produto/funcionalidades/pausa-de-zona.md`).
 *
 * Optei por polling em vez de WS porque:
 *   - O broadcast atual de `zone_pause.{started|ended}` vai pra
 *     `tenant:{slug}` (staff) e `staff:{waiterId}` — NAO pra
 *     `session:{sessionId}` ou `customer:{customerId}`. Subscrever do
 *     lado do cliente exigiria mudancas na gateway de rooms.
 *   - O endpoint `GET /:slug/zone-pauses?active=true` ja existe; eu
 *     relaxei o guard pra aceitar session-token (mutacoes seguem
 *     manager-only). Polling de 30s e leve e cobre o caso de uso (UI
 *     do customer nao precisa atualizar em ms — ETA silencioso so
 *     importa quando ele esta de fato escolhendo o pedido).
 *
 * O hook retorna `null` enquanto carrega ou se nao houver pausa ativa
 * para o waiter da mesa atual; retorna `ActiveZonePause` quando ha.
 *
 * Hoje nao filtramos por waiter — o customer nao conhece o waiter id
 * dele. Retornamos a primeira pausa ativa do tenant. O backend fica
 * livre pra refinar isso quando expusermos `tableSession.waiterId`
 * para o customer.
 */
export function useZonePause(
  slug: string | null,
  options: { enabled?: boolean; intervalMs?: number } = {},
): ActiveZonePause | null {
  const { enabled = true, intervalMs = 30_000 } = options;
  const [pause, setPause] = useState<ActiveZonePause | null>(null);

  useEffect(() => {
    if (!slug || !enabled) return;
    let cancelled = false;

    async function fetchActive() {
      try {
        const data = await apiGet<ZonePauseListResponse | ActiveZonePause[]>(
          `/${slug}/zone-pauses?active=true`,
        );
        const list = Array.isArray(data) ? data : (data.items ?? []);
        const first =
          list.find((p) => p && p.endsAt && new Date(p.endsAt).getTime() > Date.now()) ?? null;
        if (!cancelled) setPause(first);
      } catch {
        // 401/403/network — silenciamos. ETA fallback ja e o do BE
        // mesmo sem o flag client-side; nao queremos quebrar a tela
        // por causa de pausa indisponivel.
        if (!cancelled) setPause(null);
      }
    }

    fetchActive();
    const id = window.setInterval(fetchActive, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [slug, enabled, intervalMs]);

  return pause;
}
