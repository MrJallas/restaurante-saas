'use client';

// ScreenManagerTableTimeline - canvas garcom-screens-d.jsx:851.
//
// Diagnóstico de uma mesa lenta: hero operacional, timeline real de
// transições do pedido e CTA para cortesia.

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
import { defaultTenantSlug } from '../../lib/api';
import {
  getOrderTimeline,
  type OrderTimelineEvent,
  type OrderTimelineResponse,
} from '../../lib/api/manager';

type StepStatus = 'done' | 'slow' | 'open' | 'wait';

interface TimelineStep {
  label: string;
  t: string;
  delta: number | null;
  status: StepStatus;
  meta: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: 'Aguardando confirmação',
  open: 'Aberto',
  confirmed: 'Confirmado',
  received: 'Confirmado',
  preparing: 'Em preparo',
  in_progress: 'Em preparo',
  ready: 'Pronto',
  in_transit: 'A caminho da mesa',
  delivered: 'Entregue na mesa',
  cancelled: 'Cancelado',
};

const TARGET_MINUTES: Record<string, number> = {
  pending_confirmation: 15,
  open: 2,
  confirmed: 2,
  received: 2,
  preparing: 12,
  in_progress: 12,
  ready: 5,
  in_transit: 5,
};

const TERMINAL_STATUS = new Set(['delivered', 'cancelled']);

export interface ScreenManagerTableTimelineProps {
  dark?: boolean;
  orderId: string;
  tableNumber?: number;
}

function statusLabel(status?: string | null): string {
  if (!status) return 'Status desconhecido';
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

function formatClock(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function minutesBetween(fromIso?: string | null, to: number | string = Date.now()): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso).getTime();
  const end = typeof to === 'string' ? new Date(to).getTime() : to;
  if (Number.isNaN(from) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - from) / 60_000));
}

function formatMinutes(value: number | null): string {
  if (value == null) return 'sem tempo';
  if (value < 1) return '<1 min';
  return `${value} min`;
}

function formatMoney(cents?: number | null): string {
  if (typeof cents !== 'number') return 'valor indisponível';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function friendlyTimelineError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (!raw || /manager-only|x-staff-id|invalid uuid|invalid input syntax|SQL|syntax/i.test(raw)) {
    return 'Não foi possível carregar a timeline. Faça login como gerente e tente novamente.';
  }
  return raw;
}

function actorLabel(event: OrderTimelineEvent): string {
  if (event.byStaffName) return `por ${event.byStaffName}`;
  if (event.byStaffId) return 'por equipe';
  return 'por sistema';
}

function actionSteps(status: string | null | undefined, delayMinutes: number): string[] {
  if (status === 'cancelled') {
    return [
      'Confira quem cancelou o pedido e em qual etapa.',
      'Use a cortesia se a mesa precisar de compensação.',
    ];
  }
  if (status === 'delivered') {
    return [
      'Revise o tempo total antes de fechar a mesa.',
      'Registre cortesia se houve espera excessiva.',
    ];
  }
  if (delayMinutes > 0) {
    return [
      'Verifique a etapa atual com a equipe responsável.',
      'Atualize o cliente com uma previsão objetiva.',
      'Considere uma cortesia se a espera já impactou a mesa.',
    ];
  }
  return [
    'Acompanhe a próxima transição do pedido.',
    'Intervenha se a etapa atual ultrapassar a meta operacional.',
  ];
}

function deriveSteps(timeline: OrderTimelineResponse | null): TimelineStep[] {
  if (!timeline) return [];
  const currentStatus = timeline.currentStatus ?? timeline.events.at(-1)?.event ?? null;
  const lastEventAt = timeline.events.at(-1)?.at ?? timeline.createdAt ?? null;
  const statusAge = minutesBetween(lastEventAt);
  const target = currentStatus ? TARGET_MINUTES[currentStatus] : undefined;
  const delay =
    target && statusAge != null && !TERMINAL_STATUS.has(currentStatus ?? '')
      ? Math.max(0, statusAge - target)
      : 0;

  return timeline.events.map((event, index, events) => {
    const previousAt = index === 0 ? timeline.createdAt : events[index - 1]?.at;
    const delta = minutesBetween(previousAt, event.at);
    const isLatest = index === events.length - 1;
    const isActive = isLatest && !TERMINAL_STATUS.has(currentStatus ?? '');
    const meta = [
      event.fromStatus
        ? `${statusLabel(event.fromStatus)} -> ${statusLabel(event.event)}`
        : 'Status inicial',
      actorLabel(event),
      isActive && statusAge != null ? `há ${formatMinutes(statusAge)} nesta etapa` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      label: statusLabel(event.event),
      t: formatClock(event.at),
      delta,
      status: isActive && delay > 0 ? 'slow' : isActive ? 'open' : 'done',
      meta,
    };
  });
}

export function ScreenManagerTableTimeline({
  dark = false,
  orderId,
  tableNumber,
}: ScreenManagerTableTimelineProps) {
  const C = useG(dark);
  const router = useRouter();
  const slug = useMemo(() => {
    if (typeof window === 'undefined') return defaultTenantSlug();
    return new URLSearchParams(window.location.search).get('slug') || defaultTenantSlug();
  }, []);

  const [timeline, setTimeline] = useState<OrderTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orderId) {
        setError('Pedido não encontrado.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await getOrderTimeline(slug, orderId);
        if (!cancelled) setTimeline(data);
      } catch (err) {
        if (!cancelled) setError(friendlyTimelineError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, slug]);

  const steps = useMemo(() => deriveSteps(timeline), [timeline]);
  const currentStatus = timeline?.currentStatus ?? timeline?.events.at(-1)?.event ?? null;
  const lastEventAt = timeline?.events.at(-1)?.at ?? timeline?.createdAt ?? null;
  const statusAge = minutesBetween(lastEventAt);
  const target = currentStatus ? TARGET_MINUTES[currentStatus] : undefined;
  const delay =
    target && statusAge != null && !TERMINAL_STATUS.has(currentStatus ?? '')
      ? Math.max(0, statusAge - target)
      : 0;
  const totalAge = minutesBetween(timeline?.createdAt);
  const resolvedTableNumber = timeline?.tableNumber ?? tableNumber;
  const tableLabel =
    timeline?.tableLabel ??
    (typeof resolvedTableNumber === 'number' ? `Mesa ${resolvedTableNumber}` : 'Pedido');
  const heroTone = delay > 0 ? 'danger' : currentStatus === 'delivered' ? 'success' : 'info';
  const heroColor = delay > 0 ? '#C43A3A' : currentStatus === 'delivered' ? '#1E8C5A' : '#3B5FBE';
  const heroBorder = delay > 0 ? '#C43A3A' : C.borderSoft;
  const heroBg = delay > 0 ? '#FFF1F1' : C.bg;
  const heroMetric = delay > 0 ? delay : (statusAge ?? totalAge);
  const suggestions = actionSteps(currentStatus, delay);

  const dotColor = (s: StepStatus): string => {
    if (s === 'done') return '#1E8C5A';
    if (s === 'slow') return '#D98E2B';
    if (s === 'open') return '#3B5FBE';
    return C.borderSoft;
  };

  const retry = () => {
    setTimeline(null);
    setError(null);
    setLoading(true);
    getOrderTimeline(slug, orderId)
      .then(setTimeline)
      .catch((err) => setError(friendlyTimelineError(err)))
      .finally(() => setLoading(false));
  };

  return (
    <div
      style={{
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
        title={`${tableLabel} · timeline`}
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.back()}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {loading && (
          <div style={{ padding: '18px 16px 4px' }}>
            <div
              style={{
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 14,
                padding: 16,
                background: C.bg,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Carregando timeline real do pedido...
            </div>
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '18px 16px 4px' }}>
            <div
              style={{
                border: '1px solid #C43A3A',
                borderRadius: 14,
                padding: 14,
                background: '#FFF1F1',
              }}
            >
              <MPill tone="danger" dark={dark}>
                Erro
              </MPill>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: '#1d1c19' }}>
                {error}
              </div>
              <button
                type="button"
                onClick={retry}
                style={{
                  marginTop: 12,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '8px 12px',
                  background: C.bg,
                  color: C.ink,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {!loading && !error && timeline && (
          <>
            <div style={{ padding: '18px 16px 4px' }}>
              <div
                style={{
                  background: heroBg,
                  border: `1px solid ${heroBorder}`,
                  borderRadius: 14,
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    background: heroColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 17,
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {heroMetric != null ? `${heroMetric}′` : '--'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MPill tone={heroTone} dark={dark}>
                    {delay > 0 ? 'Atrasado' : statusLabel(currentStatus)}
                  </MPill>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginTop: 6 }}>
                    {statusLabel(currentStatus)}
                    {statusAge != null ? ` há ${formatMinutes(statusAge)}` : ''}
                    {delay > 0 && target
                      ? ` · atraso de ${formatMinutes(delay)} sobre meta ${target} min`
                      : ''}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: delay > 0 ? '#A12626' : C.faint,
                      marginTop: 2,
                      fontWeight: 600,
                    }}
                  >
                    Responsável: {timeline.assignedStaffName ?? 'não atribuído'} ·{' '}
                    {formatMoney(timeline.totalCents)}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 16px 4px' }}>
              <div style={{ background: C.ink, color: C.bg, borderRadius: 14, padding: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    opacity: 0.7,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    fontFamily: MONO_FONT,
                  }}
                >
                  O que fazer agora
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
                  {suggestions.map((item) => (
                    <li key={item} style={{ marginBottom: 4 }}>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div style={{ padding: '18px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: C.faint,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                  fontFamily: MONO_FONT,
                }}
              >
                Etapas do pedido
              </div>

              {steps.length === 0 ? (
                <div
                  style={{
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                    padding: 14,
                    background: C.bg,
                    fontSize: 13,
                    color: C.faint,
                    fontWeight: 700,
                  }}
                >
                  Este pedido ainda não tem transições registradas.
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 22 }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 9,
                      top: 6,
                      bottom: 6,
                      width: 2,
                      background: C.borderSoft,
                    }}
                  />
                  {steps.map((s, index) => (
                    <div
                      key={`${s.label}-${index}`}
                      style={{ position: 'relative', paddingBottom: 14, display: 'flex', gap: 12 }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: -22,
                          top: 3,
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          background: dotColor(s.status),
                          border: s.status === 'wait' ? `2px dashed ${C.borderSoft}` : 'none',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: s.status === 'wait' ? C.faint : C.ink,
                            }}
                          >
                            {s.label}
                          </span>
                          {s.t && (
                            <span
                              style={{
                                fontSize: 12,
                                color: C.faint,
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              {s.t}
                            </span>
                          )}
                        </div>
                        {s.meta && (
                          <div
                            style={{
                              fontSize: 12,
                              color: s.status === 'slow' ? '#9A7212' : C.faint,
                              marginTop: 2,
                              fontWeight: s.status === 'slow' ? 600 : 500,
                            }}
                          >
                            {s.meta}
                          </div>
                        )}
                        {s.delta != null && (
                          <div
                            style={{
                              fontSize: 11,
                              color: C.faint,
                              marginTop: 2,
                              fontVariantNumeric: 'tabular-nums',
                              fontWeight: 600,
                            }}
                          >
                            + {formatMinutes(s.delta)} após etapa anterior
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          padding: '14px 16px 24px',
          display: 'flex',
          gap: 10,
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
          flexShrink: 0,
        }}
      >
        <GButton
          dark={dark}
          full
          kind="primary"
          onClick={() => {
            const qs = new URLSearchParams({ slug, orderId });
            if (typeof resolvedTableNumber === 'number') {
              qs.set('tableNumber', String(resolvedTableNumber));
            }
            router.push(`/manager/compensate?${qs.toString()}`);
          }}
        >
          Cortesia
        </GButton>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}
