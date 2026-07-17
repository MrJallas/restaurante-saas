'use client';

// ScreenWaiterCalls — canvas garcom-screens-b.jsx:1908. Lista
// unificada de chamados do salão pro waiter (table-calls + manager-msgs
// + cozinha-ready). Tap em card → /waiter/call/[id].
//
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn, GBottomNav } from '../../components/waiter/Primitives';
import { OperationalErrorBanner } from '../../components/OperationalErrorBanner';
import { readStaffSession } from '../../lib/api';
import {
  isAuthoritativeEmpty,
  retainRowsOnFailure,
  type OperationalLoadState,
} from '../../lib/operational-error';
import {
  deliveryTimestamp,
  isDeliveryClaimedBy,
  isDeliveryForWaiter,
  listPendingCalls,
  listPendingDeliveries,
  type PendingDelivery,
  type WaiterCallSummary,
} from '../../lib/api/waiter';

type CallType = 'pediu-conta' | 'chamou-garcom' | 'pronto-cozinha' | 'mais-bebida';
type Urgency = 'high' | 'med' | 'low';

interface CallRow {
  id: string;
  type: CallType;
  tableNumber?: number;
  partySize?: number;
  sub: string;
  ts: string;
  urgency: Urgency;
  /** Presente quando a row é uma entrega (handoff cozinha/bar) — roteia pra /waiter/entrega. */
  deliveryOrderId?: string;
  /** Entrega direcionada/claimed pra mim — alimenta o filtro "Minhas mesas". */
  mine?: boolean;
}

const COPY: Record<CallType, { label: string; tint: string; icon: (s?: number) => ReactNode }> = {
  'pediu-conta': { label: 'Pediu a conta', tint: '#C43A3A', icon: Icon.receipt },
  'chamou-garcom': { label: 'Chamou garçom', tint: '#D98E2B', icon: Icon.hand },
  'pronto-cozinha': { label: 'Pronto · cozinha', tint: '#2F7D4F', icon: Icon.check },
  'mais-bebida': { label: 'Pediu bebida', tint: '#1F3784', icon: Icon.glass },
};

type Filter = 'todos' | 'urgentes' | 'pronto' | 'minhas';

const REASON_LABEL: Record<string, string> = {
  bring_menu: 'Trazer cardápio',
  place_order: 'Anotar pedido',
  serve_drink: 'Trazer bebida',
  ask_bill: 'Cliente pediu a conta',
  other: 'Sem motivo informado',
};

function typeFromReason(reason?: string | null): CallType {
  if (reason === 'ask_bill') return 'pediu-conta';
  if (reason === 'serve_drink') return 'mais-bebida';
  return 'chamou-garcom';
}

function tableNumberFromCode(row: WaiterCallSummary): number | undefined {
  const raw = row.table_code || row.table_label || '';
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function relativeTime(value: string): string {
  const created = new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (diffSeconds < 60) return `há ${Math.max(diffSeconds, 1)}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `há ${diffHours} h`;
}

function urgencyFromCreatedAt(value: string): Urgency {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSeconds >= 180) return 'high';
  if (diffSeconds >= 60) return 'med';
  return 'low';
}

/**
 * Ownership do chamado por IDENTIDADE — espelha os predicados canônicos das
 * entregas (isDeliveryForWaiter/isDeliveryClaimedBy em lib/api/waiter).
 *
 * O backend devolve `acknowledged_by`; nome é só apresentação e pode colidir.
 * Pending ainda não tem dono.
 */
export function isCallMine(row: WaiterCallSummary, staffId: string | null | undefined): boolean {
  return Boolean(staffId && row.status === 'acknowledged' && row.acknowledged_by === staffId);
}

export function mapCall(row: WaiterCallSummary, staffId: string | null): CallRow {
  const base = row.note || REASON_LABEL[row.reason || 'other'] || 'Sem motivo informado';
  // P1 (re-scan 2026-07-05): a lista agora inclui chamados 'acknowledged'
  // (o garçom tocou "A caminho" mas ainda não concluiu). Distingue-os
  // visualmente de 'pending' (aguardando) — o card continua roteando pro
  // detalhe, onde o CTA já vira "Atendido" pra concluir.
  const sub = row.status === 'acknowledged' ? `A caminho · ${base}` : base;
  return {
    id: row.id,
    type: typeFromReason(row.reason),
    tableNumber: tableNumberFromCode(row),
    sub,
    ts: relativeTime(row.created_at),
    urgency: urgencyFromCreatedAt(row.created_at),
    // Alimenta o filtro "Minhas mesas" — antes só entregas setavam mine.
    mine: isCallMine(row, staffId),
  };
}

function mapDelivery(row: PendingDelivery, staffId: string | null): CallRow {
  const itemsCount = row.items.reduce((sum, it) => sum + it.quantity, 0);
  const inTransit = row.delivery_status === 'claimed';
  // Predicado canônico (lib/api/waiter) — variantes locais divergiam entre
  // banner/home/aba e o portador exibido era o ALVO original, não quem
  // claimou (code-review).
  const mine = isDeliveryForWaiter(row, staffId) || isDeliveryClaimedBy(row, staffId);
  const carrierName = row.claimed_by_name ?? row.target_waiter_name;
  const parts = [
    `${itemsCount} ${itemsCount === 1 ? 'item' : 'itens'} prontos`,
    row.zone_name ?? undefined,
    inTransit ? `em trânsito${carrierName ? ` · ${carrierName}` : ''}` : undefined,
  ].filter(Boolean);
  // Timestamp estável (called_at → claimed_at → created_at): o fallback
  // antigo re-stampava now() a cada poll e a urgência nunca escalava.
  const referenceAt = deliveryTimestamp(row);
  return {
    id: `delivery:${row.delivery_id}`,
    type: 'pronto-cozinha',
    tableNumber: tableNumberFromCode({
      table_code: row.table_code,
      table_label: row.table_label,
    } as WaiterCallSummary),
    partySize: row.party_size || undefined,
    sub: parts.join(' · '),
    ts: relativeTime(referenceAt),
    urgency: urgencyFromCreatedAt(referenceAt),
    deliveryOrderId: row.order_id,
    mine,
  };
}

export function ScreenWaiterCalls({
  dark = false,
  tenantSlug,
}: {
  dark?: boolean;
  tenantSlug: string;
}) {
  const C = useG(dark);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('todos');
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [callsState, setCallsState] = useState<OperationalLoadState>('loading');
  const [deliveriesState, setDeliveriesState] = useState<OperationalLoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const session = readStaffSession();
    const staffId = session?.staffId ?? null;
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      const [callsResult, deliveriesResult] = await Promise.allSettled([
        listPendingCalls(tenantSlug),
        // Entregas pendentes (handoff TV cozinha/bar) entram como
        // 'pronto-cozinha' — antes a aba "Pronto" era código morto.
        listPendingDeliveries(tenantSlug),
      ]);
      if (cancelled) return;

      setCalls((previous) => {
        const previousCalls = previous.filter((row) => !row.deliveryOrderId);
        const previousDeliveries = previous.filter((row) => row.deliveryOrderId);
        const nextCalls = retainRowsOnFailure(
          previousCalls,
          callsResult.status === 'fulfilled'
            ? {
                status: 'fulfilled',
                value: callsResult.value.map((row) => mapCall(row, staffId)),
              }
            : callsResult,
        );
        const nextDeliveries = retainRowsOnFailure(
          previousDeliveries,
          deliveriesResult.status === 'fulfilled'
            ? {
                status: 'fulfilled',
                value: deliveriesResult.value.map((row) => mapDelivery(row, staffId)),
              }
            : deliveriesResult,
        );
        return [...nextDeliveries, ...nextCalls];
      });

      setCallsState(callsResult.status === 'fulfilled' ? 'ready' : 'error');
      setDeliveriesState(deliveriesResult.status === 'fulfilled' ? 'ready' : 'error');
      const failed: string[] = [];
      if (callsResult.status === 'rejected') {
        console.error('[waiter-calls] calls list failed', callsResult.reason);
        failed.push('os chamados das mesas');
      }
      if (deliveriesResult.status === 'rejected') {
        console.error('[waiter-calls] deliveries list failed', deliveriesResult.reason);
        failed.push('as entregas prontas');
      }
      setErrorMsg(failed.length > 0 ? `Não foi possível atualizar ${failed.join(' e ')}.` : null);
      setLoading(false);
    };

    load(true);
    const intervalId = window.setInterval(() => load(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [tenantSlug, reloadKey]);

  const filtered = calls.filter((c) => {
    if (filter === 'urgentes') return c.urgency === 'high';
    if (filter === 'pronto') return c.type === 'pronto-cozinha';
    if (filter === 'minhas') return c.mine === true;
    return true;
  });

  const open = (c: CallRow) => {
    if (c.deliveryOrderId) {
      router.push(`/waiter/entrega/${c.deliveryOrderId}?tenant=${tenantSlug}`);
      return;
    }
    const qs = new URLSearchParams({
      type: c.type,
      tenant: tenantSlug,
    });
    if (c.tableNumber) qs.set('tableNumber', String(c.tableNumber));
    router.push(`/waiter/call/${c.id}?${qs.toString()}`);
  };

  const tabs: { id: Filter; lbl: string; count: number }[] = [
    { id: 'todos', lbl: 'Todos', count: calls.length },
    { id: 'urgentes', lbl: 'Urgentes', count: calls.filter((c) => c.urgency === 'high').length },
    { id: 'pronto', lbl: 'Pronto', count: calls.filter((c) => c.type === 'pronto-cozinha').length },
    { id: 'minhas', lbl: 'Minhas mesas', count: calls.filter((c) => c.mine).length },
  ];
  const filteredIsAuthoritativelyEmpty =
    filter === 'pronto'
      ? isAuthoritativeEmpty(deliveriesState, filtered.length)
      : callsState === 'ready' &&
        deliveriesState === 'ready' &&
        isAuthoritativeEmpty('ready', filtered.length);

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <GAppHeader
        dark={dark}
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(`/waiter?tenant=${tenantSlug}`)}
          />
        }
        title="Chamados"
        right={
          <GIconBtn
            dark={dark}
            icon={Icon.bell(20)}
            onClick={() => router.push(`/waiter/notifications?tenant=${tenantSlug}`)}
            ariaLabel="Notificações"
          />
        }
      />

      {errorMsg && (
        <OperationalErrorBanner
          dark={dark}
          message={errorMsg}
          hasStaleData={calls.length > 0}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      )}

      <div
        data-hide-scrollbar
        style={{
          padding: '12px 16px 8px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            aria-pressed={filter === t.id}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 100,
              border: `1px solid ${filter === t.id ? C.ink : C.borderSoft}`,
              background: filter === t.id ? C.ink : 'transparent',
              color: filter === t.id ? C.bg : C.ink,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t.lbl} · {t.count}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 24px' }}>
        {loading ? (
          <div
            style={{
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Carregando chamados...
          </div>
        ) : filteredIsAuthoritativelyEmpty ? (
          <div
            style={{
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Sem chamados nessa categoria.
          </div>
        ) : filtered.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((c) => {
              const cp = COPY[c.type];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => open(c)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    width: '100%',
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${C.borderSoft}`,
                    background: C.bg,
                    borderLeft: `4px solid ${cp.tint}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: cp.tint,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {cp.icon(20)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        color: cp.tint,
                        fontFamily: MONO_FONT,
                      }}
                    >
                      {cp.label} · {c.ts}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: C.ink,
                        letterSpacing: -0.2,
                        marginTop: 2,
                      }}
                    >
                      Mesa {c.tableNumber ?? '-'}
                      {c.partySize ? ` · ${c.partySize}p` : ''}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.mute,
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.sub}
                    </div>
                  </div>
                  <span style={{ color: C.faint, flexShrink: 0 }}>{Icon.arrow(16)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <GBottomNav
        active="calls"
        dark={dark}
        onNewEntry={() => router.push(`/waiter/new-entry?tenant=${tenantSlug}`)}
        onTabChange={(id) => {
          if (id === 'home') router.push(`/waiter?tenant=${tenantSlug}`);
          else if (id === 'me') router.push(`/waiter/eu?tenant=${tenantSlug}`);
          else if (id === 'shift') router.push(`/waiter/eu?tenant=${tenantSlug}&focus=shift`);
        }}
      />
    </div>
  );
}
