'use client';

// ScreenManagerKitchenReorder — canvas garcom-screens-d.jsx:1818.
//
// State-machine select → sent → accepted. Manager seleciona pedidos
// pra puxar pra frente, adiciona motivo, cozinha confirma.
//
// Onda 4:
//   • GET /kitchen/queue → fila atual
//   • POST /kitchen/reorder → puxa pedidos selecionados
//   • KDS recebe kitchen:reorder via WS e reordena no próximo refresh

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  MPill,
  MBottomNav,
  GButton,
  Icon,
} from '../../components/manager';
import { manager, type KitchenQueueOrder, type KitchenReorderRequest } from '../../lib/api/manager';

interface QueueItem {
  id: string;
  table: number;
  items: string;
  minutes: number;
  meta: number;
  late: boolean;
  waiterInit: string;
  waiterName: string;
  priorityReason?: string | null;
}

type ReorderState = 'select' | 'sent' | 'accepted';

const heroByState = {
  select: {
    bg: '#FFF1EC',
    bd: '#C2401A',
    fg: '#7A3010',
    label: 'Cozinha lenta agora',
    title: 'Fila com 11 pedidos · 2 já passaram da meta',
    meta: 'Selecione abaixo quais puxar pra frente.',
  },
  sent: {
    bg: '#EFF3FA',
    bd: '#3B5FBE',
    fg: '#1F3784',
    label: 'Aguardando cozinha',
    title: 'Aviso enviado · cozinha vai responder',
    meta: 'Resposta esperada em ~30 segundos.',
  },
  accepted: {
    bg: '#EFF5EC',
    bd: '#1E8C5A',
    fg: '#0F5A37',
    label: 'Resposta da cozinha',
    title: 'Cozinha respondeu ao pedido',
    meta: 'A fila sera atualizada conforme a resposta.',
  },
} as const;

function initials(label: string): string {
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'CZ'
  );
}

function mapQueueOrder(order: KitchenQueueOrder): QueueItem {
  const names = order.items
    .map((item) => `${item.name}${item.quantity > 1 ? ` · ${item.quantity}` : ''}`)
    .slice(0, 3)
    .join(' + ');
  const table = order.table_number || Number(String(order.table_label).replace(/\D/g, '')) || 0;
  const late = order.wait_minutes > order.meta_minutes;
  return {
    id: order.id,
    table,
    items: names || 'Pedido sem itens',
    minutes: order.wait_minutes,
    meta: order.meta_minutes,
    late,
    waiterInit: initials(order.table_label || 'Mesa'),
    waiterName: order.table_label || `Mesa ${table}`,
    priorityReason: order.priority_reason,
  };
}

export function ScreenManagerKitchenReorder({
  dark = false,
  tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev',
}: {
  dark?: boolean;
  tenantSlug?: string;
}) {
  const C = useG(dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);

  const [state, setState] = useState<ReorderState>('select');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [response, setResponse] = useState<KitchenReorderRequest | null>(null);

  useEffect(() => {
    let alive = true;
    api.kitchen
      .queue()
      .then((orders) => {
        if (!alive) return;
        const mapped = orders.map(mapQueueOrder);
        setQueue(mapped);
        setSelected((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          const next: Record<string, boolean> = {};
          mapped
            .filter((q) => q.late)
            .slice(0, 3)
            .forEach((q) => {
              next[q.id] = true;
            });
          return next;
        });
        const firstLate = mapped.find((q) => q.late);
        if (firstLate) {
          setReason(
            `Mesa ${firstLate.table} está há ${firstLate.minutes} min esperando · acima da meta da cozinha.`,
          );
        }
        setErrorMsg(null);
      })
      .catch((err) => {
        if (alive) setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar fila.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [api]);

  const lateCount = queue.filter((q) => q.late).length;
  const heroBase = heroByState[state];
  const hero =
    state === 'select'
      ? {
          ...heroBase,
          title: `Fila com ${queue.length} pedidos · ${lateCount} ${lateCount === 1 ? 'passou' : 'passaram'} da meta`,
        }
      : state === 'accepted' && response?.status === 'next'
        ? {
            ...heroBase,
            label: 'Cozinha vai pegar em seguida',
            title: 'Pedidos entram logo após o preparo atual',
            meta: response.response_note ?? 'A confirmação é real e veio da cozinha.',
          }
        : state === 'accepted' && response?.status === 'accepted'
          ? {
              ...heroBase,
              label: 'Cozinha aceitou',
              title: 'Pedidos foram puxados para o topo',
              meta: response.response_note ?? 'A confirmação é real e veio da cozinha.',
            }
          : heroBase;
  const selectedItems = queue.filter((q) => selected[q.id]);

  useEffect(() => {
    if (state !== 'sent' || !requestId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await api.kitchen.getReorderRequest(requestId);
        if (cancelled) return;
        if (next.status === 'accepted' || next.status === 'next') {
          setResponse(next);
          setState('accepted');
        }
      } catch (err) {
        if (!cancelled)
          setErrorMsg(err instanceof Error ? err.message : 'Erro ao ler resposta da cozinha.');
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [api, requestId, state]);

  const onConfirm = async () => {
    if (selectedItems.length === 0) return;
    setState('sent');
    setErrorMsg(null);
    try {
      const request = await api.kitchen.requestReorder({
        orderIds: selectedItems.map((item) => item.id),
        reason: reason.trim() || undefined,
      });
      setRequestId(request.id);
      setResponse(request);
      if (request.status === 'accepted' || request.status === 'next') {
        setState('accepted');
      }
    } catch (err) {
      setState('select');
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao avisar cozinha.');
    }
  };
  const onCancel = () => {
    setState('select');
    setRequestId(null);
    setResponse(null);
  };

  return (
    <div
      style={{
        // Round 18 (Onda 2 sticky-fix): height (not minHeight) + flex-column
        // garante que o footer (CTA "Avisar cozinha") + BottomNav fiquem
        // FORA do scroll do middle. Com minHeight o outer cresceria com
        // o conteúdo do middle e o footer ia pro fim do scroll do body.
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Alterar ordem de preparo"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(`/manager/operacoes?slug=${tenantSlug}`)}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 120 }}>
        {/* Hero */}
        <div style={{ padding: '16px 16px 4px' }}>
          <div
            style={{
              background: hero.bg,
              border: `1px solid ${hero.bd}`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: MONO_FONT,
              }}
            >
              {hero.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: -0.2,
                marginBottom: 4,
              }}
            >
              {hero.title}
            </div>
            <div style={{ fontSize: 12.5, color: hero.fg, fontWeight: 600 }}>{hero.meta}</div>
          </div>
        </div>

        {state === 'select' && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                  fontFamily: MONO_FONT,
                }}
              >
                Fila atual · toque pra selecionar
              </div>
              {loading && (
                <div style={{ padding: 18, color: C.faint, fontSize: 13 }}>Carregando fila…</div>
              )}
              {!loading && queue.length === 0 && (
                <div style={{ padding: 18, color: C.faint, fontSize: 13 }}>
                  Nenhum pedido ativo na cozinha agora.
                </div>
              )}
              {queue.map((p) => {
                const sel = !!selected[p.id];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                    aria-pressed={sel}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      marginBottom: 8,
                      background: sel ? '#FFF1EC' : C.bg,
                      border: `1px solid ${sel ? '#C2401A' : C.borderSoft}`,
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: sel ? '#C2401A' : 'transparent',
                        border: `1.5px solid ${sel ? '#C2401A' : C.borderSoft}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                        color: '#fff',
                      }}
                    >
                      {sel && Icon.check(14)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: C.ink,
                            letterSpacing: -0.2,
                          }}
                        >
                          Mesa {p.table}{' '}
                          <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>
                            · #{p.id.slice(0, 8)}
                          </span>
                        </div>
                        {p.late ? (
                          <MPill tone="danger" dark={dark}>
                            {p.minutes} min · atrasada
                          </MPill>
                        ) : (
                          <MPill tone="mute" dark={dark}>
                            {p.minutes} min
                          </MPill>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 3 }}>
                        {p.items}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.faint,
                          fontWeight: 500,
                          marginTop: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: '#7A4FBE',
                            color: '#fff',
                            fontSize: 8,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {p.waiterInit}
                        </span>
                        {p.waiterName} · meta {p.meta} min
                      </div>
                      {p.priorityReason && (
                        <div
                          style={{ fontSize: 11, color: '#7A3010', fontWeight: 700, marginTop: 4 }}
                        >
                          Já priorizado · {p.priorityReason}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                  fontFamily: MONO_FONT,
                }}
              >
                Por quê (opcional)
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                rows={3}
                style={{
                  resize: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  background: C.bg,
                  padding: 12,
                  fontFamily: G_FONT,
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              />
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 6 }}>
                A cozinha vê o motivo. Ajuda eles a decidir.
              </div>
            </div>
          </>
        )}

        {state !== 'select' && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
                fontFamily: MONO_FONT,
              }}
            >
              Pedidos puxados pra frente
            </div>
            {selectedItems.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 12,
                  marginBottom: 8,
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    flexShrink: 0,
                    background: state === 'accepted' ? '#EFF5EC' : '#EFF3FA',
                    color: state === 'accepted' ? '#0F5A37' : '#1F3784',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 800,
                  }}
                >
                  {p.table}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                    Mesa {p.table}{' '}
                    <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>
                      · #{p.id.slice(0, 8)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 3 }}>
                    {p.items}
                  </div>
                </div>
              </div>
            ))}
            {reason && (
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 12.5,
                  color: C.mute,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  marginTop: 8,
                }}
              >
                <span style={{ color: C.ink, fontWeight: 700 }}>Motivo enviado.</span> {reason}
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            style={{
              margin: '14px 16px 0',
              padding: '10px 12px',
              borderRadius: 10,
              background: '#FFF7E6',
              border: '1px solid #F0DCB6',
              color: '#7A4D10',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {errorMsg}
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {state === 'select' && (
          <GButton
            dark={dark}
            full
            kind="primary"
            onClick={onConfirm}
            disabled={selectedItems.length === 0}
          >
            Avisar cozinha · {selectedItems.length} pedido{selectedItems.length === 1 ? '' : 's'}
          </GButton>
        )}
        {state === 'sent' && (
          <GButton dark={dark} full kind="ghost" onClick={onCancel}>
            Cancelar pedido de reordem
          </GButton>
        )}
        {state === 'accepted' && (
          <GButton
            dark={dark}
            full
            kind="primary"
            onClick={() => router.push(`/manager/operacoes?slug=${tenantSlug}`)}
          >
            Voltar pra Operação
          </GButton>
        )}
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}
