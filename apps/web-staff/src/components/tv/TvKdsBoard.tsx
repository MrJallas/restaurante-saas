'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KdsCounter } from './KdsCounter';
import { KdsOrderCard } from './KdsOrderCard';
import { C, FONT, TV_KEYFRAMES } from './styles';
import {
  countActiveDrinks,
  deriveStatus,
  nextKdsAction,
  LATE_THRESHOLD_MIN,
  type KdsOrder,
  type KdsResponse,
  type KdsStation,
} from './types';

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';
const POLL_INTERVAL_MS = 5_000;

async function tvApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...options,
    credentials: 'include',
    cache: options.cache ?? 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      body &&
      typeof body === 'object' &&
      typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : 'Erro inesperado.';
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

interface TvKdsBoardProps {
  station: KdsStation;
  // Header config — preserva o estilo do handoff (Cozinha tem logo
  // monogramado "TL", Bar usa o emoji de taca).
  title: string;
  subtitle: string;
  iconLabel: string;
  iconIsEmoji?: boolean;
  // Grid colunas: cozinha 4, bar 3 (handoff).
  gridColumns: number;
}

export function TvKdsBoard({
  station,
  title,
  subtitle,
  iconLabel,
  iconIsEmoji,
  gridColumns,
}: TvKdsBoardProps) {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  // Status pendente por order — usado pra desabilitar o botao
  // enquanto o PATCH voa e mostrar feedback. Se o servidor responder
  // com erro, removemos o pedido do set e o usuario pode tentar de
  // novo. Set evita re-render desnecessario quando outro card muda.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  // Beep quando entra um pedido novo. Comparamos pelo id pra evitar
  // bipar quando um pedido muda de status (o length seria igual mas
  // conteudo diferente).
  const previousIdsRef = useRef<Set<string>>(new Set());

  const loadOrders = useCallback(async () => {
    try {
      const res = await tvApi<KdsResponse>(`/${TENANT_SLUG}/orders/_kds?station=${station}`);
      const list = res.orders ?? [];

      // Detecta novos pedidos (id que nao existia no fetch anterior)
      // pra disparar beep + flash. Inicial load nao bipa.
      const currentIds = new Set(list.map((o) => o.id));
      if (!isInitialLoad) {
        const arrivedNew = list.some((o) => !previousIdsRef.current.has(o.id));
        if (arrivedNew) playBeep();
      }
      previousIdsRef.current = currentIds;

      setOrders(list);
      // Sincroniza o relogio com o tick do polling — sem isso, elapsedMin
      // (e portanto o status 'atrasado') so atualizava a cada 60s, ate 11
      // segundos depois do tempo real. O setNow inline garante que cards
      // que cruzaram o threshold no ultimo minuto entrem no estado
      // correto no proximo render.
      setNow(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar pedidos da cozinha.');
    } finally {
      setIsInitialLoad(false);
    }
  }, [station, isInitialLoad]);

  // Polling. Deliberadamente SEM useTableSocket aqui — o
  // events.gateway atual emite events scoped por session e por
  // status, mas nao garante a list completa pra TV. Ate que vire um
  // canal "kds:*" dedicado, polling de 5s e suficiente (o handoff
  // ja sugere isso como first-pass).
  useEffect(() => {
    loadOrders();
    const t = setInterval(loadOrders, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadOrders]);

  // Relogio do header — atualiza a cada 30s. O elapsedMin tambem e
  // recomputado em cada loadOrders (ver setNow no try acima), entao
  // esse interval e fallback pra caso o polling pare/erre. Display
  // HH:MM nao se mexe entre minutos inteiros, entao 30s e folgado.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const handleAdvance = useCallback(
    async (order: KdsOrder) => {
      const action = nextKdsAction(order.status);
      if (!action) return;
      setPendingIds((prev) => {
        const s = new Set(prev);
        s.add(order.id);
        return s;
      });
      try {
        if (action.kind === 'call_waiter') {
          await tvApi(`/${TENANT_SLUG}/orders/${order.id}/call-waiter`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
        } else {
          await tvApi(`/${TENANT_SLUG}/orders/${order.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: action.status,
              changedBy: station,
            }),
          });
        }
        // Optimistic-ish: avanca local imediatamente pro feedback ser
        // instantaneo, e o proximo poll (5s) reconcilia. Quando chama
        // garcom, o pedido sai do feed porque a query esconde ready ja
        // com entrega ativa.
        setOrders((prev) => {
          if (action.kind === 'call_waiter') {
            return prev.filter((o) => o.id !== order.id);
          }
          return prev.map((o) => (o.id === order.id ? { ...o, status: action.status } : o));
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar pedido.');
      } finally {
        setPendingIds((prev) => {
          const s = new Set(prev);
          s.delete(order.id);
          return s;
        });
      }
    },
    [station],
  );

  const decorated = useMemo(() => {
    if (!now) {
      return orders.map((o) => ({ order: o, elapsedMin: 0 }));
    }
    return orders.map((o) => {
      const elapsedMin = Math.max(
        0,
        Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 60_000),
      );
      return { order: o, elapsedMin };
    });
  }, [orders, now]);

  const counts = useMemo(() => {
    let novo = 0;
    let preparando = 0;
    let atrasado = 0;
    let pronto = 0;
    for (const { order, elapsedMin } of decorated) {
      const d = deriveStatus(order, elapsedMin);
      if (d === 'novo') novo++;
      else if (d === 'preparando') preparando++;
      else if (d === 'atrasado') atrasado++;
      else if (d === 'pronto') pronto++;
    }
    return {
      todos: decorated.length,
      novo,
      preparando,
      atrasado,
      pronto,
    };
  }, [decorated]);

  const totalDrinks = useMemo(
    () => (station === 'bar' ? countActiveDrinks(orders) : 0),
    [orders, station],
  );

  const dateLabel =
    now?.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }) ?? '';

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: '#fff',
        color: C.ink,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        className="kds-header"
        style={{
          minHeight: 88,
          background: C.ink,
          color: '#fff',
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '12px 36px',
          gap: '8px 0',
          borderBottom: `1.5px solid ${C.ink}`,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            border: `1.5px solid #fff`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: iconIsEmoji ? 22 : 18,
            fontWeight: 700,
            letterSpacing: -0.5,
            marginRight: 18,
          }}
        >
          {iconLabel}
        </div>
        <div style={{ marginRight: 40 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{title}</div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {station === 'bar' && totalDrinks > 0
              ? `${subtitle} · ${totalDrinks} ${totalDrinks === 1 ? 'bebida' : 'bebidas'} na fila`
              : subtitle}
          </div>
        </div>

        <div
          className="kds-counters"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, flex: 1 }}
        >
          <span className="kds-counter-totals">
            <KdsCounter label="Todos" n={counts.todos} active />
          </span>
          <KdsCounter label="Atrasados" n={counts.atrasado} dot={C.danger} alert />
          <span className="kds-counter-secondary">
            <KdsCounter label="Novos" n={counts.novo} dot="#fff" />
          </span>
          <span className="kds-counter-secondary">
            <KdsCounter
              label={station === 'bar' ? 'Preparando' : 'Em preparo'}
              n={counts.preparando}
              dot={C.amber}
            />
          </span>
          <span className="kds-counter-secondary">
            <KdsCounter label="Prontos" n={counts.pronto} dot={C.success} />
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                minHeight: 14,
              }}
            >
              {dateLabel}
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: -1,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
                minHeight: 36,
              }}
            >
              {now?.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              }) ?? '--:--'}
            </div>
          </div>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: error ? C.danger : C.success,
              animation: 'kdsPulse 2s infinite',
            }}
          />
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div
          style={{
            background: C.danger,
            color: '#fff',
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠ {error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.5)',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Grid */}
      <div
        className="kds-grid"
        data-max-cols={gridColumns}
        style={{
          flex: 1,
          padding: 24,
          display: 'grid',
          gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
          gridAutoRows: 'min-content',
          gap: station === 'bar' ? 20 : 18,
          background: C.surface,
          overflowY: 'auto',
        }}
      >
        {decorated.length === 0 && !isInitialLoad && (
          <div
            style={{
              gridColumn: `1 / -1`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 48,
              fontSize: 18,
              color: C.mute,
              fontWeight: 500,
            }}
          >
            Nenhum pedido na fila no momento.
          </div>
        )}
        {decorated.map(({ order, elapsedMin }) => (
          <KdsOrderCard
            key={order.id}
            order={order}
            variant={station}
            elapsedMin={elapsedMin}
            pending={pendingIds.has(order.id)}
            onAdvance={() => handleAdvance(order)}
          />
        ))}
      </div>

      <style>{TV_KEYFRAMES}</style>
    </div>
  );
}

// Beep pra notificar pedido novo. Reutiliza o padrao da pagina antiga
// (cozinha/page.tsx). Falha silenciosa se WebAudio nao estiver
// disponivel (Safari incognito, etc).
// AudioContext SINGLETON (auditoria 2026-07-03): um contexto NOVO por
// beep, sem close(), estoura o limite de ~6 contextos do browser — a TV
// KDS (que nunca recarrega) ficava MUDA e o beep é a notificação da
// cozinha. Um contexto vive pra sempre e é retomado se suspenso.
let sharedAudioCtx: AudioContext | null = null;

function playBeep() {
  try {
    type WebAudioWindow = Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const w = window as WebAudioWindow;
    const Ctx = window.AudioContext || w.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new Ctx();
    }
    const audioCtx = sharedAudioCtx;
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch {
    /* ignore */
  }
}

// Re-export pra docs: o handoff quer alertar quando passar de
// LATE_THRESHOLD_MIN min — o derivedStatus ja faz isso.
export { LATE_THRESHOLD_MIN };
