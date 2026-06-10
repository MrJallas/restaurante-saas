'use client';

// ScreenTableDetail — waiter detail screen pra UMA mesa.
// Canvas: garcom-screens-b.jsx:9 (V12 with payment progress + timeline).
//
// Onda 4:
//   • Hero card preto com total da conta + progresso de pagamento real
//   • Lista de itens pendentes/servidos
//   • PATCH /orders/:id/status → marca pedido pronto como entregue

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
} from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import {
  getWaiterTableDetail,
  markOrderDelivered,
  markOrderInTransit,
  type WaiterTableDetail,
} from '../../lib/api/waiter';

type ItemStatus = 'preparando' | 'pronto' | 'em_transito' | 'servido';

interface Item {
  id: string;
  orderId: string;
  qty: number;
  name: string;
  note?: string;
  station: 'Cozinha' | 'Bar';
  status: ItemStatus;
}

export interface ScreenTableDetailProps {
  dark?: boolean;
  tenantSlug: string;
  tableId: string;
  tableNumber?: number;
}

export function ScreenTableDetail({
  dark = false,
  tenantSlug,
  tableId,
  tableNumber,
}: ScreenTableDetailProps) {
  const C = useG(dark);
  const router = useRouter();
  const [detail, setDetail] = useState<WaiterTableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [stubMsg, setStubMsg] = useState<string | null>(null);

  const showMsg = (m: string) => {
    setStubMsg(m);
    setTimeout(() => setStubMsg(null), 2800);
  };

  const load = useCallback(async () => {
    if (!tenantSlug || !tableId) return;
    setLoading(true);
    try {
      const data = await getWaiterTableDetail(tenantSlug, tableId);
      setDetail(data);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Erro ao carregar mesa.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, tableId]);

  useEffect(() => {
    load();
  }, [load]);

  const session = detail?.session;
  const parsedTableNumber = Number(
    String(session?.table_label ?? session?.table_code ?? '').replace(/[^0-9]/g, ''),
  );
  const resolvedTableNumber =
    tableNumber ??
    (Number.isFinite(parsedTableNumber) && parsedTableNumber > 0 ? parsedTableNumber : 0);
  const openedMin = session
    ? Math.max(0, Math.floor((Date.now() - new Date(session.created_at).getTime()) / 60000))
    : 0;

  const items = useMemo<Item[]>(() => {
    const statusFromOrder = (status: string): ItemStatus => {
      if (status === 'ready') return 'pronto';
      if (status === 'in_transit') return 'em_transito';
      if (status === 'delivered') return 'servido';
      return 'preparando';
    };
    return (detail?.orders ?? []).flatMap((order) =>
      order.items.map((item) => ({
        id: item.id,
        orderId: order.id,
        qty: item.quantity,
        name: item.name,
        note: item.notes ?? undefined,
        station: 'Cozinha',
        status: statusFromOrder(order.status),
      })),
    );
  }, [detail]);

  const totalConta = (session?.total_cents ?? 0) / 100;
  const totalPago = (session?.paid_cents ?? 0) / 100;
  const restante = Math.max(0, totalConta - totalPago);
  const pessoas = session?.party_size || session?.capacity || 1;
  const pagaram = session?.paid_count ?? 0;
  const processando = session?.processing_count ?? 0;

  const pendentes = items.filter((i) => i.status !== 'servido');

  const fmt = (v: number) => v.toFixed(2).replace('.', ',');

  const statusTint: Record<ItemStatus, { bg: string; fg: string; label: string }> = {
    pronto: { bg: '#E8F3EC', fg: '#1E8C5A', label: 'Pronto · servir' },
    em_transito: { bg: '#E7EEF8', fg: '#1A4F8A', label: 'Em trânsito' },
    preparando: { bg: '#FDF3D8', fg: '#7A4D10', label: 'Preparando' },
    servido: { bg: '#F4F0E8', fg: '#666', label: 'Servido' },
  };

  const markInTransit = async (orderId: string) => {
    if (!tenantSlug || updatingOrderId) return;
    setUpdatingOrderId(orderId);
    try {
      await markOrderInTransit(tenantSlug, orderId);
      await load();
      showMsg('Pedido em trânsito.');
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Erro ao atualizar pedido.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const confirmDelivered = async (orderId: string) => {
    if (!tenantSlug || updatingOrderId) return;
    setUpdatingOrderId(orderId);
    try {
      await markOrderDelivered(tenantSlug, orderId);
      await load();
      showMsg('Pedido entregue na mesa.');
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Erro ao atualizar pedido.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.back()} />}
        title={`Mesa ${resolvedTableNumber || '—'}`}
        sub={`${pessoas} PESSOAS · ABERTA HÁ ${openedMin} MIN`}
        right={<GIconBtn dark={dark} icon={Icon.more(20)} onClick={load} />}
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Bill hero */}
        <div
          style={{
            margin: '14px 16px',
            padding: 18,
            borderRadius: 16,
            background: C.ink,
            color: C.bg,
          }}
        >
          <div
            style={{
              fontSize: 11,
              opacity: 0.6,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
            }}
          >
            Total da conta
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: -0.8,
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
              lineHeight: 1.05,
            }}
          >
            {loading ? 'Carregando…' : `R$ ${fmt(totalConta)}`}
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            R$ {fmt(totalConta / Math.max(1, pessoas))} por pessoa · {pessoas} pessoas
          </div>

          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                opacity: 0.85,
                marginBottom: 8,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>Pago · R$ {fmt(totalPago)}</span>
              <span>Falta · R$ {fmt(restante)}</span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 99,
                background: 'rgba(255,255,255,0.18)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${totalConta > 0 ? Math.min(100, (totalPago / totalConta) * 100) : 0}%`,
                  background: C.bg,
                  borderRadius: 99,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: C.bg,
                  }}
                />
                <span style={{ opacity: 0.85 }}>{pagaram} pagaram</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.4)',
                  }}
                />
                <span style={{ opacity: 0.85 }}>{processando} processando</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    border: '1.5px solid rgba(255,255,255,0.5)',
                  }}
                />
                <span style={{ opacity: 0.85 }}>
                  {pessoas - pagaram - processando} pendente
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Itens pendentes */}
        <div style={{ padding: '8px 16px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.mute,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 10,
              fontFamily: MONO_FONT,
            }}
          >
            Itens · {pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.length === 0 && !loading && (
              <div
                style={{
                  padding: 18,
                  border: `1px dashed ${C.borderSoft}`,
                  borderRadius: 12,
                  color: C.faint,
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                Nenhum pedido ativo nesta mesa.
              </div>
            )}
            {items.map((item) => {
              const st = statusTint[item.status];
              return (
                <div
                  key={item.id}
                  style={{
                    padding: 12,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                    background: item.status === 'servido' ? C.surface : C.bg,
                    opacity: item.status === 'servido' ? 0.7 : 1,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.ink,
                          letterSpacing: -0.1,
                        }}
                      >
                        {item.qty}× {item.name}
                      </div>
                      {item.note && (
                        <div
                          style={{
                            fontSize: 12,
                            color: C.mute,
                            marginTop: 3,
                            lineHeight: 1.4,
                          }}
                        >
                          {item.note}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 10.5,
                          color: C.faint,
                          marginTop: 4,
                          fontWeight: 700,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          fontFamily: MONO_FONT,
                        }}
                      >
                        {item.station}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: st.bg,
                        color: st.fg,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        fontFamily: MONO_FONT,
                        flexShrink: 0,
                      }}
                    >
                      {st.label}
                    </span>
                  </div>
                  {item.status === 'pronto' && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => markInTransit(item.orderId)}
                        disabled={updatingOrderId === item.orderId}
                        style={{
                          all: 'unset',
                          cursor: updatingOrderId === item.orderId ? 'wait' : 'pointer',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: C.ink,
                          color: C.bg,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {updatingOrderId === item.orderId ? 'Atualizando…' : 'Estou levando'}
                      </button>
                    </div>
                  )}
                  {item.status === 'em_transito' && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => confirmDelivered(item.orderId)}
                        disabled={updatingOrderId === item.orderId}
                        style={{
                          all: 'unset',
                          cursor: updatingOrderId === item.orderId ? 'wait' : 'pointer',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: C.ink,
                          color: C.bg,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {updatingOrderId === item.orderId ? 'Atualizando…' : 'Entregue'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          borderTop: `1px solid ${C.borderFaint}`,
          background: C.bg,
          display: 'flex',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <GButton kind="secondary" dark={dark} onClick={() => router.back()}>
          Voltar
        </GButton>
        <div style={{ flex: 1 }}>
          <GButton kind="primary" dark={dark} full onClick={load}>
            Atualizar mesa
          </GButton>
        </div>
      </div>

      {stubMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 90,
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '12px 18px',
            borderRadius: 999,
            background: C.ink,
            color: C.bg,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.1,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {stubMsg}
        </div>
      )}
    </div>
  );
}
