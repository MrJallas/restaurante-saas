'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCircle2,
  ChefHat,
  Clock,
  MessageSquare,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
  Truck,
  User,
  Volume2,
} from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { staffGet, staffPatch, staffPost } from '../../lib/api';
import { type StaffThemeMode, useStaffTheme } from '../../lib/theme';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  subtotalCents: number;
  notes?: string | null;
}

interface Order {
  id: string;
  status: string;
  billing_mode: string;
  total_cents: number;
  notes?: string | null;
  created_at: string;
  table_label?: string | null;
  table_number?: number | null;
  priority_rank?: string;
  priority_reason?: string | null;
  priority_updated_at?: string | null;
  delivery_id?: string | null;
  delivery_status?: string | null;
  delivery_called_at?: string | null;
  delivery_claimed_at?: string | null;
  delivery_target_waiter_id?: string | null;
  delivery_target_waiter_name?: string | null;
  items: OrderItem[];
}

interface PriorityRequest {
  id: string;
  order_ids: string[];
  reason: string | null;
  requested_by_name: string | null;
  status: 'pending' | 'accepted' | 'next' | 'cancelled';
  created_at: string;
  orders: Order[];
}

type CardColor = 'yellow' | 'orange' | 'green' | 'blue';

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';
const STAFF_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) return apiUrl.replace(/\/?api\/?$/, '');
  return 'http://localhost:3001';
}

function readStaffId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = window.localStorage.getItem('staffId') || '';
    return STAFF_ID_RE.test(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

function TimerBadge({ createdAt, dark }: { createdAt: string; dark: boolean }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span
      className={`flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs ${
        dark ? 'bg-black/30 text-white/70' : 'bg-zinc-900/10 text-zinc-600'
      }`}
    >
      <Clock className="h-3 w-3" />
      {elapsed}
    </span>
  );
}

export default function CozinhaKDS() {
  const router = useRouter();
  const { mode, setTheme, dark } = useStaffTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [priorityRequests, setPriorityRequests] = useState<PriorityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [staffId, setStaffId] = useState<string | undefined>();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [protectedSelection, setProtectedSelection] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const prevCountRef = useRef(0);
  const prevRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setStaffId(readStaffId());
  }, []);

  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 3200);
  };

  const loadPriorityRequests = useCallback(async () => {
    try {
      const requests = await staffGet<PriorityRequest[]>(
        `/${TENANT_SLUG}/kitchen/reorder-requests/pending`,
      );
      const nextIds = new Set(requests.map((r) => r.id));
      const hasNew = requests.some((r) => !prevRequestIdsRef.current.has(r.id));
      if (soundEnabled && hasNew && prevRequestIdsRef.current.size > 0) playBeep(520);
      prevRequestIdsRef.current = nextIds;
      setPriorityRequests(requests);
    } catch {
      /* polling keeps trying */
    }
  }, [soundEnabled]);

  const loadOrders = useCallback(async () => {
    try {
      const res = await staffGet<{ orders: Order[] }>(`/${TENANT_SLUG}/kitchen/queue`);
      const activeOrders = res.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));

      if (soundEnabled && activeOrders.length > prevCountRef.current && prevCountRef.current > 0) {
        playBeep();
      }
      prevCountRef.current = activeOrders.length;
      setOrders(activeOrders);
    } catch {
      /* silently fail; kiosk polling retries */
    } finally {
      setLoading(false);
    }
  }, [soundEnabled]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOrders(), loadPriorityRequests()]);
  }, [loadOrders, loadPriorityRequests]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 5000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  useEffect(() => {
    if (typeof window === 'undefined' || !staffId) return;
    let socket: Socket | null = null;
    try {
      socket = io(resolveWsUrl(), {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: true,
        auth: {
          staffKey: process.env.NEXT_PUBLIC_STAFF_API_KEY || undefined,
          staffId,
          tenantSlug: TENANT_SLUG,
          staffRole: 'cook',
        },
      });
    } catch {
      return;
    }

    const refresh = () => {
      refreshAll();
    };
    const priorityRefresh = () => {
      if (soundEnabled) playBeep(520);
      refreshAll();
    };
    socket.on('connect', () => {
      socket?.emit('join:tenant', { slug: TENANT_SLUG, role: 'kitchen' });
    });
    socket.on('order:new', refresh);
    socket.on('order:status', refresh);
    socket.on('order:handoff_called', refresh);
    socket.on('kitchen:reorder', refresh);
    socket.on('kitchen:priority_request', priorityRefresh);
    socket.on('kitchen:priority_response', refresh);
    return () => {
      socket?.off('order:new', refresh);
      socket?.off('order:status', refresh);
      socket?.off('order:handoff_called', refresh);
      socket?.off('kitchen:reorder', refresh);
      socket?.off('kitchen:priority_request', priorityRefresh);
      socket?.off('kitchen:priority_response', refresh);
      socket?.disconnect();
    };
  }, [refreshAll, soundEnabled, staffId]);

  const handleAdvanceStatus = async (orderId: string, nextStatus: string) => {
    setBusyOrderId(orderId);
    try {
      await staffPatch(`/${TENANT_SLUG}/orders/${orderId}/status`, {
        status: nextStatus,
        changedBy: 'cozinha',
      });
      await loadOrders();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Erro');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCallWaiter = async (order: Order) => {
    if (!staffId) {
      showMessage('Faça login como cozinha ou gerente para chamar o garçom.');
      return;
    }
    setBusyOrderId(order.id);
    try {
      const res = await staffPost<{
        targetWaiterName?: string | null;
      }>(`/${TENANT_SLUG}/orders/${order.id}/call-waiter`, {});
      await loadOrders();
      showMessage(
        res.targetWaiterName
          ? `Garçom chamado: ${res.targetWaiterName}.`
          : 'Garçom chamado para retirar o pedido.',
      );
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Erro ao chamar garçom.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleRespondPriority = async (request: PriorityRequest, response: 'accept' | 'next') => {
    if (!staffId) {
      showMessage('Faça login como cozinha ou gerente para responder.');
      return;
    }
    setBusyRequestId(request.id);
    try {
      const protectedOrderIds =
        response === 'next'
          ? Object.entries(protectedSelection)
              .filter(([, selected]) => selected)
              .map(([id]) => id)
          : [];
      await staffPost(`/${TENANT_SLUG}/kitchen/reorder-requests/${request.id}/respond`, {
        response,
        protectedOrderIds,
      });
      setPriorityRequests((prev) => prev.filter((r) => r.id !== request.id));
      setProtectedSelection({});
      await loadOrders();
      showMessage(
        response === 'accept'
          ? 'Prioridade aceita. Pedidos foram para o topo.'
          : 'Prioridade confirmada para depois dos pedidos em preparo.',
      );
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Erro ao responder prioridade.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const newOrders = orders.filter((o) => ['received', 'open', 'confirmed'].includes(o.status));
  const preparingOrders = orders.filter((o) => ['in_progress', 'preparing'].includes(o.status));
  const readyOrders = orders.filter((o) => o.status === 'ready' && o.delivery_status !== 'claimed');
  const transitOrders = orders.filter(
    (o) => o.status === 'in_transit' || o.delivery_status === 'claimed',
  );
  const activePriorityRequest = priorityRequests[0];

  useEffect(() => {
    if (!activePriorityRequest) return;
    setProtectedSelection((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, boolean> = {};
      preparingOrders.forEach((order) => {
        next[order.id] = true;
      });
      return next;
    });
  }, [activePriorityRequest, preparingOrders]);

  const page = dark ? 'bg-gray-950 text-white' : 'bg-zinc-50 text-zinc-950';
  const headerBorder = dark ? 'border-white/10' : 'border-zinc-200';

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${page}`}>
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-yellow-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 ${page}`}>
      <div
        className={`mb-4 flex flex-wrap items-center justify-between gap-3 border-b ${headerBorder} pb-3`}
      >
        <h1 className="min-w-0 truncate text-2xl font-bold">
          <ChefHat className="mr-2 inline h-7 w-7 text-orange-400" />
          Cozinha — KDS
        </h1>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ThemeSwitch mode={mode} onMode={setTheme} dark={dark} />
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              soundEnabled ? 'bg-green-600/20 text-green-500' : 'bg-red-600/20 text-red-500'
            }`}
          >
            <Volume2 className="h-4 w-4" />
            Som {soundEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() =>
              router.push(
                `/cozinha/mensagens?tenant=${TENANT_SLUG}${staffId ? `&cookId=${staffId}` : ''}`,
              )
            }
            aria-label="Mensagens"
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              dark
                ? 'border-white/15 bg-white/5 text-white/80'
                : 'border-zinc-200 bg-white text-zinc-700'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              router.push(`/cozinha/eu?tenant=${TENANT_SLUG}${staffId ? `&cookId=${staffId}` : ''}`)
            }
            aria-label="Perfil"
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              dark
                ? 'border-white/15 bg-white/5 text-white/80'
                : 'border-zinc-200 bg-white text-zinc-700'
            }`}
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>

      {activePriorityRequest && (
        <PriorityRequestPanel
          request={activePriorityRequest}
          preparingOrders={preparingOrders}
          selected={protectedSelection}
          onToggle={(orderId) =>
            setProtectedSelection((prev) => ({ ...prev, [orderId]: !prev[orderId] }))
          }
          onAccept={() => handleRespondPriority(activePriorityRequest, 'accept')}
          onNext={() => handleRespondPriority(activePriorityRequest, 'next')}
          busy={busyRequestId === activePriorityRequest.id}
          dark={dark}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KdsColumn
          title="NOVOS"
          icon={<Clock className="h-5 w-5 text-yellow-400" />}
          count={newOrders.length}
          color="yellow"
          dark={dark}
        >
          {newOrders.map((order) => (
            <KdsCard
              key={order.id}
              order={order}
              color="yellow"
              dark={dark}
              busy={busyOrderId === order.id}
              onAdvance={() => handleAdvanceStatus(order.id, 'in_progress')}
              actionLabel="Preparar"
            />
          ))}
        </KdsColumn>

        <KdsColumn
          title="PREPARANDO"
          icon={<ChefHat className="h-5 w-5 text-orange-400" />}
          count={preparingOrders.length}
          color="orange"
          dark={dark}
        >
          {preparingOrders.map((order) => (
            <KdsCard
              key={order.id}
              order={order}
              color="orange"
              dark={dark}
              busy={busyOrderId === order.id}
              onAdvance={() => handleAdvanceStatus(order.id, 'ready')}
              actionLabel="Pronto!"
            />
          ))}
        </KdsColumn>

        <KdsColumn
          title="PRONTOS"
          icon={<Bell className="h-5 w-5 text-green-400" />}
          count={readyOrders.length}
          color="green"
          dark={dark}
        >
          {readyOrders.map((order) => {
            const waiting = order.delivery_status === 'pending';
            return (
              <KdsCard
                key={order.id}
                order={order}
                color="green"
                dark={dark}
                busy={busyOrderId === order.id}
                onAdvance={() => handleCallWaiter(order)}
                actionLabel={waiting ? 'Aguardando garçom' : 'Chamar garçom'}
                disabled={waiting}
              />
            );
          })}
        </KdsColumn>

        <KdsColumn
          title="EM TRÂNSITO"
          icon={<Truck className="h-5 w-5 text-sky-400" />}
          count={transitOrders.length}
          color="blue"
          dark={dark}
        >
          {transitOrders.map((order) => (
            <KdsCard
              key={order.id}
              order={order}
              color="blue"
              dark={dark}
              busy={false}
              actionLabel="Garçom levando"
              disabled
            />
          ))}
        </KdsColumn>
      </div>

      {message && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full px-4 py-3 text-sm font-semibold shadow-2xl ${
            dark ? 'bg-white text-zinc-950' : 'bg-zinc-950 text-white'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

function ThemeSwitch({
  mode,
  onMode,
  dark,
}: {
  mode: StaffThemeMode;
  onMode: (mode: StaffThemeMode) => void;
  dark: boolean;
}) {
  const options: Array<{ id: StaffThemeMode; icon: ReactNode; label: string }> = [
    { id: 'light', icon: <Sun className="h-4 w-4" />, label: 'Claro' },
    { id: 'dark', icon: <Moon className="h-4 w-4" />, label: 'Escuro' },
    { id: 'auto', icon: <Monitor className="h-4 w-4" />, label: 'Auto' },
  ];
  return (
    <div
      className={`flex rounded-lg border p-1 ${
        dark ? 'border-white/15 bg-white/5' : 'border-zinc-200 bg-white'
      }`}
    >
      {options.map((opt) => {
        const selected = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onMode(opt.id)}
            aria-label={opt.label}
            className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-bold ${
              selected
                ? dark
                  ? 'bg-white text-zinc-950'
                  : 'bg-zinc-950 text-white'
                : dark
                  ? 'text-white/60'
                  : 'text-zinc-500'
            }`}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

function KdsColumn({
  title,
  icon,
  count,
  color,
  dark,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  color: CardColor;
  dark: boolean;
  children: ReactNode;
}) {
  const header = {
    yellow: 'bg-yellow-500/20 text-yellow-400',
    orange: 'bg-orange-500/20 text-orange-400',
    green: 'bg-green-500/20 text-green-400',
    blue: 'bg-sky-500/20 text-sky-400',
  }[color];
  const badge = {
    yellow: 'bg-yellow-400/30 text-yellow-300',
    orange: 'bg-orange-400/30 text-orange-300',
    green: 'bg-green-400/30 text-green-300',
    blue: 'bg-sky-400/30 text-sky-300',
  }[color];
  return (
    <div>
      <div className={`mb-3 flex items-center gap-2 rounded-t-lg px-4 py-2 ${header}`}>
        {icon}
        <span className="font-bold">{title}</span>
        <span className={`ml-auto rounded-full px-2 text-sm ${badge}`}>{count}</span>
      </div>
      <div className="space-y-3">
        {children}
        {count === 0 && (
          <div
            className={`rounded-lg border border-dashed px-4 py-8 text-center text-sm ${
              dark ? 'border-white/10 text-white/35' : 'border-zinc-200 text-zinc-400'
            }`}
          >
            Vazio
          </div>
        )}
      </div>
    </div>
  );
}

function KdsCard({
  order,
  color,
  dark,
  busy,
  onAdvance,
  actionLabel,
  disabled = false,
}: {
  order: Order;
  color: CardColor;
  dark: boolean;
  busy: boolean;
  onAdvance?: () => void;
  actionLabel: string;
  disabled?: boolean;
}) {
  const borderColor = {
    yellow: 'border-yellow-500/30',
    orange: 'border-orange-500/30',
    green: 'border-green-500/30',
    blue: 'border-sky-500/30',
  }[color];
  const btnColor = {
    yellow: 'bg-yellow-500 hover:bg-yellow-600',
    orange: 'bg-orange-500 hover:bg-orange-600',
    green: 'bg-green-500 hover:bg-green-600',
    blue: 'bg-sky-500 hover:bg-sky-600',
  }[color];
  const deliveryLabel = deliveryStateLabel(order);

  return (
    <div
      className={`rounded-xl border ${borderColor} ${dark ? 'bg-gray-900' : 'bg-white'} p-4 shadow-sm`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`min-w-0 truncate text-xs ${dark ? 'text-white/40' : 'text-zinc-500'}`}>
          {order.table_label ? `${order.table_label} · ` : ''}#{order.id.slice(0, 8)}
        </span>
        <TimerBadge createdAt={order.created_at} dark={dark} />
      </div>

      {Number(order.priority_rank ?? 0) > 0 && (
        <div className="mb-3 rounded-lg border border-red-400/40 bg-red-500/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-red-300">
          Prioridade gerência
          {order.priority_reason ? ` · ${order.priority_reason}` : ''}
        </div>
      )}

      {deliveryLabel && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-sky-400/35 bg-sky-500/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-sky-300">
          <span>{deliveryLabel}</span>
          {order.delivery_status === 'pending' && order.delivery_called_at && (
            <TimerBadge createdAt={order.delivery_called_at} dark={dark} />
          )}
        </div>
      )}

      <div className="mb-3 space-y-2">
        {order.items.map((item) => (
          <div key={item.id}>
            <div className={`text-lg font-bold ${dark ? 'text-white' : 'text-zinc-950'}`}>
              {item.quantity}x {item.name}
            </div>
            {item.notes && (
              <div className="mt-0.5 rounded bg-red-600/20 px-2 py-1 text-sm font-bold uppercase text-red-400">
                {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="mb-3 rounded bg-yellow-600/15 px-2 py-1 text-sm text-yellow-500">
          Obs: {order.notes}
        </div>
      )}

      <button
        type="button"
        onClick={onAdvance}
        disabled={disabled || busy || !onAdvance}
        className={`w-full rounded-lg py-2.5 font-bold text-white transition-colors ${
          disabled || !onAdvance ? 'cursor-not-allowed bg-zinc-500/50' : btnColor
        }`}
      >
        {busy ? 'Atualizando...' : actionLabel}
      </button>
    </div>
  );
}

function PriorityRequestPanel({
  request,
  preparingOrders,
  selected,
  onToggle,
  onAccept,
  onNext,
  busy,
  dark,
}: {
  request: PriorityRequest;
  preparingOrders: Order[];
  selected: Record<string, boolean>;
  onToggle: (orderId: string) => void;
  onAccept: () => void;
  onNext: () => void;
  busy: boolean;
  dark: boolean;
}) {
  const requestOrders = useMemo(() => request.orders ?? [], [request.orders]);
  return (
    <div
      className={`mb-4 rounded-xl border p-4 ${
        dark
          ? 'border-red-400/50 bg-red-500/15 text-white'
          : 'border-red-300 bg-red-50 text-zinc-950'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-red-400">
            <ShieldAlert className="h-4 w-4" />
            Prioridade solicitada pela gerência
          </div>
          <div className="mt-1 text-lg font-extrabold">
            {requestOrders.length} pedido{requestOrders.length === 1 ? '' : 's'} para puxar
          </div>
          {request.reason && (
            <div
              className={`mt-1 text-sm font-semibold ${dark ? 'text-white/70' : 'text-zinc-600'}`}
            >
              {request.reason}
            </div>
          )}
        </div>
        <TimerBadge createdAt={request.created_at} dark={dark} />
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {requestOrders.map((order) => (
          <div
            key={order.id}
            className={`rounded-lg border px-3 py-2 ${
              dark ? 'border-white/10 bg-black/20' : 'border-red-100 bg-white'
            }`}
          >
            <div className="text-sm font-bold">
              {order.table_label || `Mesa ${order.table_number || '—'}`} · #{order.id.slice(0, 8)}
            </div>
            <div className={`mt-1 text-xs ${dark ? 'text-white/60' : 'text-zinc-500'}`}>
              {order.items.map((item) => `${item.quantity}x ${item.name}`).join(' + ')}
            </div>
          </div>
        ))}
      </div>

      {preparingOrders.length > 0 && (
        <div className="mt-4">
          <div
            className={`mb-2 text-xs font-black uppercase tracking-wide ${dark ? 'text-white/45' : 'text-zinc-500'}`}
          >
            Mantém antes destes em preparo
          </div>
          <div className="flex flex-wrap gap-2">
            {preparingOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => onToggle(order.id)}
                aria-pressed={!!selected[order.id]}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  selected[order.id]
                    ? 'border-orange-400 bg-orange-400 text-zinc-950'
                    : dark
                      ? 'border-white/15 bg-white/5 text-white/70'
                      : 'border-zinc-200 bg-white text-zinc-600'
                }`}
              >
                {order.table_label || `Mesa ${order.table_number || '—'}`} · #{order.id.slice(0, 6)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-3 text-sm font-black text-white hover:bg-red-600 disabled:cursor-wait disabled:opacity-70"
        >
          <CheckCircle2 className="h-4 w-4" />
          Aceitar
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-black disabled:cursor-wait disabled:opacity-70 ${
            dark
              ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
              : 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50'
          }`}
        >
          Serão os próximos
        </button>
      </div>
    </div>
  );
}

function deliveryStateLabel(order: Order): string | null {
  if (order.status === 'in_transit' || order.delivery_status === 'claimed') {
    return order.delivery_target_waiter_name
      ? `Em trânsito · ${order.delivery_target_waiter_name}`
      : 'Em trânsito';
  }
  if (order.delivery_status === 'pending') {
    return order.delivery_target_waiter_name
      ? `Aguardando garçom · ${order.delivery_target_waiter_name}`
      : 'Aguardando garçom';
  }
  return null;
}

function playBeep(frequency = 880) {
  try {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtor();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch {
    /* audio not supported */
  }
}
