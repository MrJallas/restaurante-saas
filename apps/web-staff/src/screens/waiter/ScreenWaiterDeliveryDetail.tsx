'use client';

// ScreenWaiterDeliveryDetail — entrega pendente do handoff cozinha/bar.
//
// Fluxo (decisão de produto 2026-06-10, prompt 99 §6): a TV da cozinha/bar
// chama o garçom quando o pedido fica pronto; o garçom vê AQUI a entrega
// pendente com o local da mesa (zona: Varanda, Salão Principal…) + mapa
// de orientação, marca "Estou levando" (ready → in_transit) e depois
// "Confirmar entrega" (in_transit → delivered). Só após o "Entregue" o
// pedido termina e o app do cliente atualiza (emit `order:status` pra
// sala da sessão acontece no backend).
//
// Dados 100% reais: GET /:slug/deliveries/pending (entrega + itens + zona)
// e GET /:slug/staff/tables-overview (mapa de mesas por zona).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import {
  isDeliveryClaimedBy,
  listPendingDeliveries,
  listTablesOverview,
  markOrderDelivered,
  markOrderInTransit,
  type PendingDelivery,
  type TableOverviewEntry,
} from '../../lib/api/waiter';

const SEM_ZONA = 'Sem zona definida';

function relativeTime(iso: string | null): string {
  if (!iso) return 'agora';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSeconds < 60) return `há ${Math.max(diffSeconds, 1)}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  return `há ${Math.floor(diffMinutes / 60)} h`;
}

export interface ScreenWaiterDeliveryDetailProps {
  dark?: boolean;
  tenantSlug: string;
  orderId: string;
  staffId?: string | null;
}

export function ScreenWaiterDeliveryDetail({
  dark = false,
  tenantSlug,
  orderId,
  staffId,
}: ScreenWaiterDeliveryDetailProps) {
  const C = useG(dark);
  const router = useRouter();
  const [delivery, setDelivery] = useState<PendingDelivery | null>(null);
  const [tables, setTables] = useState<TableOverviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deliveredOk, setDeliveredOk] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (m: string) => {
    setToastMsg(m);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3200);
  };

  // Timers fora do ciclo de vida disparavam navegação/setState depois do
  // unmount (code-review) — limpa ambos ao sair da tela.
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    [],
  );

  const load = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const [rows, overview] = await Promise.all([
          listPendingDeliveries(tenantSlug),
          listTablesOverview(tenantSlug).catch(() => [] as TableOverviewEntry[]),
        ]);
        setDelivery(rows.find((d) => d.order_id === orderId) ?? null);
        if (overview.length > 0) setTables(overview);
        setLoadError(null);
      } catch (error) {
        console.error('[waiter-delivery] load failed', error);
        setLoadError('Não foi possível carregar a entrega.');
      } finally {
        setLoading(false);
      }
    },
    [tenantSlug, orderId],
  );

  useEffect(() => {
    load(true);
    const tid = window.setInterval(() => {
      // Para de reconciliar depois do sucesso final (a entrega some do feed).
      if (!deliveredOk) load(false);
    }, 8000);
    return () => window.clearInterval(tid);
  }, [load, deliveredOk]);

  const zoneGroups = useMemo(() => {
    const groups = new Map<string, TableOverviewEntry[]>();
    for (const t of tables) {
      const key = t.zone_name ?? SEM_ZONA;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return Array.from(groups.entries());
  }, [tables]);

  // Planta espacial (migration 055): só quando a mesa-alvo tem posição e a
  // MAIORIA das mesas também (>=60%) — backfill parcial renderizava uma
  // planta enganosa omitindo as mesas sem coordenada (code-review); nesse
  // caso a grade por zona (completa) é mais honesta.
  const floorPlan = useMemo(() => {
    const positioned = tables.filter((t) => t.map_x != null && t.map_y != null);
    const target = tables.find((t) => t.code === delivery?.table_code);
    if (
      !delivery ||
      positioned.length < 2 ||
      positioned.length < tables.length * 0.6 ||
      !target ||
      target.map_x == null ||
      target.map_y == null
    ) {
      return null;
    }
    const cols = Math.max(...positioned.map((t) => t.map_x as number)) + 1;
    const rows = Math.max(...positioned.map((t) => t.map_y as number)) + 1;
    const zoneNames = Array.from(
      new Set(positioned.map((t) => t.zone_name ?? SEM_ZONA)),
    );
    return { positioned, cols, rows, zoneNames };
  }, [tables, delivery]);

  const isClaimed = delivery?.delivery_status === 'claimed';
  // Qualquer staff ativo pode CONFIRMAR a entrega (o backend permite
  // takeover — quem claimou pode ter saído de cena); o chip abaixo mostra
  // quem está levando quando não sou eu. O predicado antigo tratava
  // staffId null como "é meu" (code-review).
  const claimedByMe = delivery != null && isDeliveryClaimedBy(delivery, staffId ?? null);
  const carriedByOther = isClaimed && !claimedByMe && delivery?.claimed_by != null;
  const itemsCount = delivery?.items.reduce((s, it) => s + it.quantity, 0) ?? 0;
  const zoneLabel = delivery?.zone_name ?? SEM_ZONA;

  const handlePickup = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await markOrderInTransit(tenantSlug, orderId);
      showToast('Pedido em trânsito — leve até a mesa.');
      await load(false);
    } catch (error) {
      console.error('[waiter-delivery] in-transit failed', error);
      showToast(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível marcar "Estou levando".',
      );
      await load(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelivered = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await markOrderDelivered(tenantSlug, orderId);
      setDeliveredOk(true);
      showToast('Entrega confirmada.');
      redirectTimerRef.current = setTimeout(
        () => router.push(`/waiter/chamados?tenant=${tenantSlug}`),
        900,
      );
    } catch (error) {
      console.error('[waiter-delivery] delivered failed', error);
      showToast(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível confirmar a entrega.',
      );
      await load(false);
    } finally {
      setSubmitting(false);
    }
  };

  const heroTint = '#2F7D4F';

  return (
    <div
      style={{
        height: '100dvh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="waiter-delivery-detail"
    >
      <GAppHeader
        dark={dark}
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(`/waiter/chamados?tenant=${tenantSlug}`)}
            ariaLabel="Voltar"
          />
        }
        title="Entrega"
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div
            style={{
              margin: 16,
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Carregando entrega...
          </div>
        ) : !delivery ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div
              style={{
                padding: 32,
                border: `1px dashed ${C.borderSoft}`,
                borderRadius: 12,
                color: C.mute,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {loadError ?? (
                deliveredOk
                  ? 'Entrega confirmada.'
                  : 'Entrega não encontrada — pode já ter sido concluída ou cancelada.'
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div style={{ background: heroTint, color: '#fff', padding: '26px 24px 30px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    opacity: 0.85,
                    fontFamily: MONO_FONT,
                  }}
                >
                  {isClaimed ? 'Em trânsito · confirmar na mesa' : 'Pronto · levar na mesa'}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    borderRadius: 100,
                    background: '#fff',
                    color: heroTint,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontFamily: MONO_FONT,
                    flexShrink: 0,
                  }}
                >
                  {relativeTime(delivery.called_at)}
                </div>
              </div>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: -1.2,
                  marginTop: 14,
                  lineHeight: 1,
                }}
              >
                {delivery.table_label}
              </div>
              <div style={{ fontSize: 14, marginTop: 10, opacity: 0.92, fontWeight: 600 }}>
                {zoneLabel} · {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                {delivery.party_size > 0 ? ` · ${delivery.party_size} pessoas` : ''}
              </div>
              {carriedByOther && (
                <div
                  style={{
                    marginTop: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    borderRadius: 100,
                    background: 'rgba(255,255,255,0.18)',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {Icon.user(14)} Levado por {delivery.claimed_by_name ?? 'outro garçom'} · confirme se foi você quem entregou
                </div>
              )}
            </div>

            {/* Local da mesa + mapa */}
            <div style={{ padding: '20px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: C.mute,
                  fontWeight: 700,
                  marginBottom: 10,
                  fontFamily: MONO_FONT,
                }}
              >
                Local da mesa
              </div>
              <div
                data-testid="delivery-zone-label"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: `1.5px solid ${C.borderSoft}`,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: C.surface,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: C.ink,
                    flexShrink: 0,
                  }}
                >
                  {Icon.table(17)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>
                    {zoneLabel}
                  </div>
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>
                    {delivery.table_label} · código {delivery.table_code}
                  </div>
                </div>
              </div>

              {/* Planta espacial — posições reais (tables.map_x/map_y),
                  zonas com tinta própria e mesa-alvo destacada. */}
              {floorPlan && (
                <div
                  data-testid="delivery-map"
                  style={{
                    border: `1.5px solid ${C.borderSoft}`,
                    borderRadius: 14,
                    padding: '14px 14px 10px',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: floorPlan.rows * 54,
                    }}
                  >
                    {floorPlan.positioned.map((t) => {
                      const isTarget = t.code === delivery.table_code;
                      const zoneIdx = floorPlan.zoneNames.indexOf(t.zone_name ?? SEM_ZONA);
                      const zoneBg = zoneIdx % 2 === 1 ? C.surface : 'transparent';
                      return (
                        <div
                          key={t.id}
                          data-testid={isTarget ? 'delivery-map-target' : undefined}
                          style={{
                            position: 'absolute',
                            left: `${((t.map_x as number) / floorPlan.cols) * 100}%`,
                            top: (t.map_y as number) * 54,
                            width: `calc(${100 / floorPlan.cols}% - 6px)`,
                            height: 46,
                            borderRadius: 10,
                            border: `1.5px solid ${isTarget ? heroTint : C.borderSoft}`,
                            background: isTarget ? heroTint : zoneBg,
                            color: isTarget ? '#fff' : t.occupied ? C.ink : C.faint,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 15,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {t.number > 0 ? String(t.number).padStart(2, '0') : t.code}
                          {t.occupied && !isTarget && (
                            <span
                              style={{
                                position: 'absolute',
                                top: 5,
                                right: 5,
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                background: C.warn,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginTop: 10,
                      fontSize: 10.5,
                      color: C.faint,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: heroTint,
                        }}
                      />
                      mesa da entrega
                    </span>
                    {floorPlan.zoneNames.map((zn, i) => (
                      <span key={zn} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 3,
                            border: `1px solid ${C.borderSoft}`,
                            background: i % 2 === 1 ? C.surface : 'transparent',
                          }}
                        />
                        {zn}
                        {zn === zoneLabel ? ' · entregar aqui' : ''}
                      </span>
                    ))}
                    <span>· ● mesa ocupada</span>
                  </div>
                </div>
              )}

              {/* Fallback sem posições: mesas agrupadas por zona, alvo destacado */}
              {!floorPlan && zoneGroups.length > 0 && (
                <div
                  data-testid="delivery-map"
                  style={{
                    border: `1.5px solid ${C.borderSoft}`,
                    borderRadius: 14,
                    padding: '14px 14px 10px',
                  }}
                >
                  {zoneGroups.map(([zoneName, zoneTables]) => {
                    const isTargetZone = zoneName === zoneLabel;
                    return (
                      <div key={zoneName} style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 1.2,
                            textTransform: 'uppercase',
                            fontFamily: MONO_FONT,
                            color: isTargetZone ? heroTint : C.faint,
                            marginBottom: 6,
                          }}
                        >
                          {zoneName}
                          {isTargetZone ? ' · entregar aqui' : ''}
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
                            gap: 6,
                          }}
                        >
                          {zoneTables.map((t) => {
                            const isTarget = t.code === delivery.table_code;
                            return (
                              <div
                                key={t.id}
                                data-testid={isTarget ? 'delivery-map-target' : undefined}
                                style={{
                                  borderRadius: 10,
                                  border: `1.5px solid ${isTarget ? heroTint : C.borderSoft}`,
                                  background: isTarget ? heroTint : 'transparent',
                                  color: isTarget ? '#fff' : t.occupied ? C.ink : C.faint,
                                  padding: '8px 4px',
                                  textAlign: 'center',
                                  position: 'relative',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    fontVariantNumeric: 'tabular-nums',
                                    lineHeight: 1,
                                  }}
                                >
                                  {t.number > 0 ? String(t.number).padStart(2, '0') : t.code}
                                </div>
                                {t.occupied && !isTarget && (
                                  <span
                                    style={{
                                      position: 'absolute',
                                      top: 5,
                                      right: 5,
                                      width: 6,
                                      height: 6,
                                      borderRadius: 3,
                                      background: C.warn,
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                    ■ mesa da entrega · ● mesa ocupada
                  </div>
                </div>
              )}
            </div>

            {/* Itens da bandeja */}
            <div
              style={{
                padding: '18px 16px 6px',
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: C.mute,
                fontWeight: 700,
                fontFamily: MONO_FONT,
              }}
            >
              Itens da bandeja
            </div>
            {delivery.items.map((it, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: `1px solid ${C.borderFaint}`,
                }}
              >
                <div
                  style={{
                    minWidth: 30,
                    height: 30,
                    borderRadius: 8,
                    padding: '0 8px',
                    background: C.surface,
                    color: C.ink,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {it.quantity}×
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{it.name}</div>
                  {it.notes && (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.mute,
                        marginTop: 2,
                        fontStyle: 'italic',
                      }}
                    >
                      ↳ {it.notes}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Aviso no estágio de confirmação (copy canon do canvas) */}
            {isClaimed && (
              <div
                style={{
                  margin: '18px 16px 0',
                  padding: '14px 16px',
                  background: `${C.warn}1f`,
                  border: `1px solid ${C.warn}44`,
                  borderRadius: 14,
                  display: 'flex',
                  gap: 10,
                }}
              >
                <span style={{ color: C.warn, fontSize: 18, lineHeight: 1, marginTop: 1 }}>!</span>
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>
                  Se o cliente apontar item errado ou faltando, volte e abra
                  <b> chamado para a cozinha</b> antes de marcar entregue.
                </div>
              </div>
            )}
            <div style={{ height: 18 }} />
          </>
        )}
      </div>

      {delivery && (
        <div
          style={{
            borderTop: `1px solid ${C.borderFaint}`,
            padding: '12px 16px max(env(safe-area-inset-bottom), 14px)',
            display: 'flex',
            gap: 10,
            background: C.bg,
            flexShrink: 0,
          }}
        >
          <GButton
            kind="secondary"
            dark={dark}
            onClick={() => router.push(`/waiter/chamados?tenant=${tenantSlug}`)}
          >
            Voltar
          </GButton>
          <div style={{ flex: 1 }}>
            {isClaimed ? (
              <div data-testid="delivery-confirm-delivered">
                <GButton
                  kind="primary"
                  dark={dark}
                  full
                  onClick={handleDelivered}
                  disabled={submitting || deliveredOk}
                >
                  {deliveredOk ? 'Entregue ✓' : submitting ? 'Confirmando…' : 'Confirmar entrega'}
                </GButton>
              </div>
            ) : (
              <div data-testid="delivery-pickup">
                <GButton
                  kind="primary"
                  dark={dark}
                  full
                  onClick={handlePickup}
                  disabled={submitting}
                >
                  {submitting ? 'Registrando…' : 'Estou levando'}
                </GButton>
              </div>
            )}
          </div>
        </div>
      )}

      {toastMsg && (
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
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default ScreenWaiterDeliveryDetail;
