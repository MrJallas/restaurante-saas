'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '../lib/api';
import {
  ACTIVE_ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  formatEtaCompact,
} from '../lib/orderStatus';

interface ActiveOrderApi {
  id: string;
  status: string;
  created_at: string;
  eta_minutes_min?: number | null;
  eta_minutes_max?: number | null;
  queue_ahead?: number;
}

export interface ActiveOrderStatus {
  orderId: string;
  status: string;
  /** Label canon da tela Meu pedido (ex.: "Em preparo"). */
  label: string;
  /** Classe tailwind do ponto de status (mesmo canon de Meu pedido). */
  dotClass: string;
  /** `5–9 min` / `~3 min` — null quando o backend não devolveu ETA. */
  etaText: string | null;
}

const ACTIVE_SET = new Set<string>(ACTIVE_ORDER_STATUSES);
const FALLBACK_POLL_MS = 60_000;

/**
 * Pedido ativo da sessão pra eyebrow de status do assistente (prompt 100
 * §1). Busca `GET /:slug/orders` (mesma ETA dinâmica da tela Meu pedido),
 * escolhe o pedido ativo mais recente e expõe `refresh()` pro caller ligar
 * nos eventos WS `order:created`/`order:status` — o hook NÃO abre socket
 * próprio pra não duplicar a conexão que a page já tem via useTableSocket.
 * Poll discreto de 60s cobre socket dropado (mesmo fallback de /pedido).
 */
export function useActiveOrderStatus(
  slug: string | null,
  sessionId: string | null,
): { active: ActiveOrderStatus | null; refresh: () => void } {
  const [orders, setOrders] = useState<ActiveOrderApi[]>([]);
  const stopRef = useRef(false);

  const refresh = useCallback(() => {
    if (!slug || !sessionId) return;
    apiGet<{ orders: ActiveOrderApi[] }>(`/${slug}/orders`)
      .then((res) => {
        if (!stopRef.current) setOrders(res.orders ?? []);
      })
      .catch(() => {
        /* eyebrow é informativa — sem pedido carregado ela só não aparece */
      });
  }, [slug, sessionId]);

  useEffect(() => {
    if (!slug || !sessionId) return;
    stopRef.current = false;
    refresh();
    const timer = setInterval(refresh, FALLBACK_POLL_MS);
    return () => {
      stopRef.current = true;
      clearInterval(timer);
    };
  }, [slug, sessionId, refresh]);

  const active = useMemo<ActiveOrderStatus | null>(() => {
    const candidate = [...orders]
      .filter((o) => ACTIVE_SET.has(o.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (!candidate) return null;
    return {
      orderId: candidate.id,
      status: candidate.status,
      label: ORDER_STATUS_LABELS[candidate.status] ?? candidate.status,
      dotClass: ORDER_STATUS_COLORS[candidate.status] ?? 'bg-mute',
      etaText: formatEtaCompact(candidate),
    };
  }, [orders]);

  return { active, refresh };
}
