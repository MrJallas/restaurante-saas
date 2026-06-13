'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet } from '../../../lib/api';
import { getSessionToken } from '../../../lib/storage';
import { useSession } from '../../../hooks/useSession';
import { useNav } from '../../../hooks/useNav';
import { useUIState } from '../../../providers/UIStateProvider';
import { useTableSocket } from '../../../hooks/useTableSocket';
import { AppShell } from '../../../components/layout/AppShell';
import { PillButton } from '../../../components/ui/PillButton';
import { Row } from '../../../components/ui/Row';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../../../lib/orderStatus';

interface OrderItemApi {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  notes?: string;
  customerId?: string | null;
}

interface OrderApi {
  id: string;
  status: string;
  billing_mode: string;
  total_cents: number;
  notes?: string;
  visit_id: string | null;
  created_at: string;
  /** ETA dinâmica do backend: fila + prioridade + estágio (null = sem espera). */
  eta_minutes_min?: number | null;
  eta_minutes_max?: number | null;
  queue_ahead?: number;
  items: OrderItemApi[];
}

// Labels/cores canon agora vivem em `lib/orderStatus.ts` — compartilhados
// com a eyebrow de status do assistente (prompt 100). Mantidos idênticos.
const STATUS_LABELS = ORDER_STATUS_LABELS;
const STATUS_COLORS = ORDER_STATUS_COLORS;

const PROGRESS_STEPS: { key: string; label: string }[] = [
  { key: 'received', label: 'Recebido pela cozinha' },
  { key: 'in_progress', label: 'Em preparo' },
  { key: 'ready', label: 'Pronto para servir' },
  { key: 'in_transit', label: 'A caminho da mesa' },
  { key: 'delivered', label: 'Na sua mesa' },
];

const STATUS_INDEX: Record<string, number> = {
  received: 0,
  in_progress: 1,
  ready: 2,
  in_transit: 3,
  delivered: 4,
};

// Eyebrow do card hero acompanha o estágio real — antes era sempre
// "Em preparo agora" com "22–28 minutos" hardcoded.
const HERO_EYEBROW: Record<string, string> = {
  pending_confirmation: 'Aguardando confirmação',
  received: 'Na fila da cozinha',
  in_progress: 'Em preparo agora',
  ready: 'Pronto · aguardando garçom',
  in_transit: 'A caminho da sua mesa',
};

function fmtEta(order: OrderApi): string {
  const min = order.eta_minutes_min;
  const max = order.eta_minutes_max;
  if (min == null || max == null) return '—';
  if (max <= 3) return `~${max} min`;
  return `${min}–${max} minutos`;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes === 1) return 'há 1 min';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'há 1 h';
  return `há ${hours} h`;
}

export default function PedidoPage() {
  const params = useParams();
  const router = useRouter();
  const { push } = useNav();
  const { openCallWaiterSheet } = useUIState();
  const { tableLabel, sessionId, customerId } = useSession();
  const slug = params.slug as string;

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  const [orders, setOrders] = useState<OrderApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'table' | 'mine'>('table');
  const stopRef = useRef(false);

  // Refetch sob demanda — chamada inicial, polling de fallback (60s — antes
  // era 15s mas com WebSocket viramos event-driven, polling so cobre o caso
  // do socket dropar) e em todo evento que vem da sala da mesa.
  const reload = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await apiGet<{ orders: OrderApi[] }>(`/${slug}/orders`);
      if (!stopRef.current) setOrders(res.orders);
    } catch {
      /* ignore */
    } finally {
      if (!stopRef.current) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    stopRef.current = false;
    reload();
    const timer = setInterval(reload, 60_000);
    return () => {
      stopRef.current = true;
      clearInterval(timer);
    };
  }, [slug, reload]);

  // Quando outro customer da mesma mesa cria/cancela/avanca pedido, recebe
  // event e refetcha. Multi-user passa a coordenar em tempo real (P1-A do
  // bug-hunt: antes precisavam esperar 15s do polling).
  // 4o arg (onResync): apos um reconnect do socket, refetcha os pedidos —
  // eventos emitidos enquanto a aba estava offline nao chegam, entao o
  // estado precisa ser re-sincronizado na volta da conexao.
  useTableSocket(
    sessionId,
    (event) => {
      if (event === 'order:created' || event === 'order:status') {
        reload();
      }
    },
    null,
    () => reload(),
  );

  const activeOrders = useMemo(() => orders.filter((o) => o.status !== 'cancelled'), [orders]);

  const flatItems = useMemo(
    () =>
      activeOrders.flatMap((o) =>
        o.items.map((it) => ({
          key: it.id,
          quantity: it.quantity,
          name: it.name,
          note: it.notes,
          lineTotal: it.subtotalCents,
          customerId: it.customerId ?? null,
        })),
      ),
    [activeOrders],
  );

  const hasMineItems = flatItems.some((item) => item.customerId === customerId);
  const visibleItems =
    scope === 'mine' && customerId
      ? flatItems.filter((item) => item.customerId === customerId)
      : flatItems;

  const subtotalCents = visibleItems.reduce((s, item) => s + item.lineTotal, 0);
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  const latestOrder = useMemo(() => {
    if (activeOrders.length === 0) return null;
    return [...activeOrders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  }, [activeOrders]);

  const statusLabel = latestOrder ? (STATUS_LABELS[latestOrder.status] ?? latestOrder.status) : '';
  const statusDotClass = latestOrder ? (STATUS_COLORS[latestOrder.status] ?? 'bg-mute') : '';
  const latestKitchenOrder = useMemo(
    () =>
      activeOrders.find(
        (order) =>
          !['cancelled', 'canceled', 'delivered', 'pending_confirmation'].includes(order.status),
      ) ?? null,
    [activeOrders],
  );
  const currentProgressIndex = latestKitchenOrder
    ? (STATUS_INDEX[latestKitchenOrder.status] ?? 0)
    : 0;
  const latestSummary =
    latestKitchenOrder?.items.map((item) => `${item.quantity}× ${item.name}`).join(' · ') ?? '';

  if (loading) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pedido`}
      >
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (flatItems.length === 0) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pedido`}
        noMainPadding
      >
        <div className="shrink-0 px-[22px] pb-3 pt-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Meu pedido</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-10 text-center">
          <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-[1.5px] border-dashed border-border-soft text-[30px] text-faint">
            ◉
          </div>
          <div>
            <div className="mb-1.5 text-[20px] font-semibold tracking-[-0.02em]">
              Você ainda não pediu nada
            </div>
            <div className="mx-auto max-w-[260px] text-[13px] leading-[1.5] text-mute text-pretty">
              Explore o cardápio ou peça uma sugestão personalizada para o assistente.
            </div>
          </div>
          <div className="mt-1 flex w-full max-w-[260px] flex-col gap-2.5">
            <PillButton variant="filled" fullWidth onClick={() => push(`/${slug}/cardapio`)}>
              Ver cardápio
            </PillButton>
            <PillButton fullWidth onClick={() => push(`/${slug}/assistente`)}>
              ✦ Pedir sugestão à IA
            </PillButton>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pedido`}
      noMainPadding
    >
      <div className="flex flex-1 flex-col">
        <div className="shrink-0 px-[22px] pb-3 pt-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Meu pedido</h1>
          {latestOrder && (
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-mute">
              <span className={`h-[6px] w-[6px] rounded-full ${statusDotClass}`} />
              <span>
                {statusLabel} · {timeAgo(latestOrder.created_at)}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto px-[22px] pb-5">
          {latestKitchenOrder && (
            <div className="mb-5 rounded-[18px] border-[1.5px] border-ink p-[18px]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[1.2px] text-mute">
                    {HERO_EYEBROW[latestKitchenOrder.status] ?? 'Em preparo agora'}
                  </div>
                  <div className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em] tabular-nums">
                    {fmtEta(latestKitchenOrder)}
                  </div>
                  {(latestKitchenOrder.queue_ahead ?? 0) > 0 && (
                    <div className="mt-0.5 text-[12px] text-mute">
                      {latestKitchenOrder.queue_ahead}{' '}
                      {latestKitchenOrder.queue_ahead === 1
                        ? 'pedido na sua frente'
                        : 'pedidos na sua frente'}
                    </div>
                  )}
                </div>
                <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink text-[20px]">
                  ◷
                </div>
              </div>
              <div className="pl-1">
                {PROGRESS_STEPS.map((step, index) => {
                  const done = index < currentProgressIndex;
                  const active = index === currentProgressIndex;
                  const isLast = index === PROGRESS_STEPS.length - 1;
                  return (
                    <div key={step.key} className="relative flex gap-3.5">
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] text-white ${
                            done
                              ? 'border-ink bg-ink'
                              : active
                                ? 'animate-pulse-dot border-ink bg-bg'
                                : 'border-border-soft bg-bg'
                          }`}
                        >
                          {done && '✓'}
                        </div>
                        {!isLast && (
                          <div
                            className={`min-h-[22px] w-[1.5px] flex-1 ${
                              done ? 'bg-ink' : 'bg-border-soft'
                            }`}
                          />
                        )}
                      </div>
                      <div className="flex-1 pb-[14px]">
                        <div
                          className={`text-[14px] ${
                            active
                              ? 'font-semibold text-ink'
                              : done
                                ? 'font-medium text-ink'
                                : 'font-medium text-faint'
                          }`}
                        >
                          {step.label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-mute">
                          {active ? 'agora' : done ? 'concluído' : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {latestSummary && (
                <div className="mt-1 rounded-[12px] border border-border-soft bg-surface px-3 py-2 text-[12px] leading-[1.5] text-mute">
                  {latestSummary}
                </div>
              )}
            </div>
          )}

          {hasMineItems && (
            <div className="mb-3 flex gap-2">
              {[
                ['table', 'Mesa'],
                ['mine', 'Minha comanda'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value as 'table' | 'mine')}
                  className={`rounded-full border-[1.2px] border-ink px-3.5 py-[7px] text-[12px] font-medium ${
                    scope === value ? 'bg-ink text-white' : 'bg-bg text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {visibleItems.map((it, idx) => (
            <div
              key={`${it.key}-${idx}`}
              className="flex items-start gap-3.5 border-b border-border-soft py-4"
            >
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.2px] border-ink bg-bg text-[12px] font-semibold tabular-nums">
                {it.quantity}×
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium tracking-[-0.01em]">{it.name}</div>
                {it.note && (
                  <div className="mt-0.5 text-[11px] italic leading-[1.4] text-mute text-pretty">
                    obs: {it.note}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-[14px] font-semibold tabular-nums">
                {fmt(it.lineTotal)}
              </div>
            </div>
          ))}

          <div className="mt-[18px] border-t-[1.3px] border-ink pt-4">
            <Row label="Subtotal" value={fmt(subtotalCents)} />
            <div className="h-2.5" />
            <Row
              label={<b className="text-[16px] text-ink">Total</b>}
              value={<b className="text-[20px] text-ink tabular-nums">{fmt(subtotalCents)}</b>}
            />
          </div>
        </div>

        <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
          <PillButton onClick={openCallWaiterSheet} className="flex-1">
            Garçom
          </PillButton>
          <PillButton
            variant="filled"
            onClick={() => push(`/${slug}/pagamento`)}
            className="flex-[2]"
          >
            Ir para pagamento
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
