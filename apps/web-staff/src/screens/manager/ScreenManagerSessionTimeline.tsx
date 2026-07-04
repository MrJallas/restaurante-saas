'use client';

// ScreenManagerSessionTimeline — fatia M7 da timeline de sessão.
//
// Consome GET /:slug/sessions/:sessionId/timeline (M6): sumário Postgres da
// sessão (mesa, host, status) + entries do event store + árvore de merge.
// Mesma linguagem visual do ScreenManagerTableTimeline (dots done/open,
// delta de minutos entre entries, 'por <staff> | pelo sistema'). A leitura
// NÃO é fail-open: Mongo off → 503 com mensagem — o erro aparece na tela
// (nunca lista vazia silenciosa).

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
  Icon,
} from '../../components/manager';
import { getSessionTimeline } from '../../lib/api/manager';
import type {
  SessionMergeTree,
  SessionTimelineResponse,
  TimelineActor,
  TimelineEntry,
} from '@restaurant/shared-types';

// Página cheia o suficiente pra timeline de um serviço inteiro; quando o
// backend devolve exatamente PAGE_LIMIT entries, oferecemos "carregar
// anteriores" (paginação backward via `before`, contrato do M6).
const PAGE_LIMIT = 200;

const KIND_LABEL: Record<string, string> = {
  'session.opened': 'Mesa aberta',
  'participant.joined': 'Cliente entrou na mesa',
  'participant.approved': 'Entrada aprovada',
  'late_arrival.requested': 'Chegada tardia solicitada',
  'late_arrival.approved': 'Chegada tardia aprovada',
  'late_arrival.rejected': 'Chegada tardia recusada',
  'merge.requested': 'Juntar mesas solicitado',
  'merge.approved': 'Mesas juntadas',
  'merge.rejected': 'Juntar mesas recusado',
  'waiter.called': 'Cliente chamou garçom',
  'waiter.acknowledged': 'Garçom atendeu',
  'order.created': 'Pedido feito',
  'delivery.called': 'Cozinha chamou entrega',
  'delivery.claimed': 'Garçom pegou o pedido',
  'delivery.delivered': 'Entregue',
  'courtesy.created': 'Cortesia',
  'complaint.received': 'Reclamação',
  'complaint.resolved': 'Reclamação resolvida',
  'session.flag_changed': 'Flag da mesa',
  'payment.confirmed': 'Conta paga',
  'session.closed': 'Mesa fechada',
};

// Mesmo vocabulário do ScreenManagerTableTimeline, em minúsculo pra compor
// 'Pedido <status>'.
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_confirmation: 'aguardando confirmação',
  open: 'aberto',
  confirmed: 'confirmado',
  received: 'confirmado',
  preparing: 'em preparo',
  in_progress: 'em preparo',
  ready: 'pronto',
  in_transit: 'a caminho da mesa',
  delivered: 'entregue na mesa',
  cancelled: 'cancelado',
};

export interface ScreenManagerSessionTimelineProps {
  dark?: boolean;
  slug: string;
  sessionId: string;
}

function entryLabel(entry: TimelineEntry): string {
  if (entry.kind === 'order.status_changed') {
    const to = typeof entry.payload.toStatus === 'string' ? entry.payload.toStatus : null;
    const status = to ? (ORDER_STATUS_LABEL[to] ?? to.replace(/_/g, ' ')) : 'atualizado';
    return `Pedido ${status}`;
  }
  return KIND_LABEL[entry.kind] ?? entry.kind.replace(/[._]/g, ' ');
}

function actorLabel(actor: TimelineActor): string {
  if (actor.name) return `por ${actor.name}`;
  if (actor.type === 'system') return 'pelo sistema';
  if (actor.type === 'customer') return 'pelo cliente';
  return 'pela equipe';
}

/** Detalhe curto por kind (valor, flag, tipo do problema) — opcional. */
function entryDetail(entry: TimelineEntry): string | null {
  const p = entry.payload;
  if (entry.kind === 'payment.confirmed' && typeof p.amountCents === 'number') {
    return formatMoney(p.amountCents);
  }
  if (entry.kind === 'order.created' && typeof p.totalCents === 'number') {
    return formatMoney(p.totalCents);
  }
  if (entry.kind === 'session.flag_changed' && typeof p.flag === 'string') {
    return p.cleared === true ? `${p.flag} removida` : `${p.flag} ativada`;
  }
  if (entry.kind === 'complaint.received' && typeof p.problemType === 'string') {
    return p.problemType;
  }
  return null;
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

function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function minutesBetween(fromIso?: string | null, toIso?: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 60_000));
}

function formatMinutes(value: number | null): string {
  if (value == null) return 'sem tempo';
  if (value < 1) return '<1 min';
  return `${value} min`;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function mergeNodeLabel(tree: SessionMergeTree, sessionId: string): string {
  const node = tree.nodes.find((n) => n.sessionId === sessionId);
  if (!node) return `sessão ${sessionId.slice(0, 8)}`;
  const mesa = node.tableNumber != null ? `Mesa ${node.tableNumber}` : 'Mesa sem número';
  return node.hostName ? `${mesa} (${node.hostName})` : mesa;
}

export function ScreenManagerSessionTimeline({
  dark = false,
  slug,
  sessionId,
}: ScreenManagerSessionTimelineProps) {
  const C = useG(dark);
  const router = useRouter();

  const [data, setData] = useState<SessionTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Página cheia = pode haver entries mais antigas (contrato M6: backward
  // pagination via `before` com o `at` da primeira entry da página).
  const [maybeHasOlder, setMaybeHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sessionId) {
        setError('Sessão não encontrada.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await getSessionTimeline(slug, sessionId, { limit: PAGE_LIMIT });
        if (cancelled) return;
        setData(res);
        setMaybeHasOlder(res.entries.length >= PAGE_LIMIT);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Não foi possível carregar a timeline.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, sessionId]);

  const retry = () => {
    setData(null);
    setError(null);
    setLoading(true);
    getSessionTimeline(slug, sessionId, { limit: PAGE_LIMIT })
      .then((res) => {
        setData(res);
        setMaybeHasOlder(res.entries.length >= PAGE_LIMIT);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Não foi possível carregar a timeline.'),
      )
      .finally(() => setLoading(false));
  };

  const loadOlder = () => {
    if (!data || data.entries.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    getSessionTimeline(slug, sessionId, { limit: PAGE_LIMIT, before: data.entries[0].at })
      .then((res) => {
        setData((prev) => (prev ? { ...prev, entries: [...res.entries, ...prev.entries] } : prev));
        setMaybeHasOlder(res.entries.length >= PAGE_LIMIT);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Não foi possível carregar a timeline.'),
      )
      .finally(() => setLoadingOlder(false));
  };

  const session = data?.session ?? null;
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const mergeTree = data?.mergeTree ?? null;
  const isClosed = session ? session.closedAt != null || session.status === 'closed' : false;

  const tableLabel =
    session && session.tableNumber != null ? `Mesa ${session.tableNumber}` : 'Sessão';

  const dotColor = (index: number): string => {
    const isLast = index === entries.length - 1;
    if (isLast && !isClosed) return '#3B5FBE'; // open (sessão ainda ativa)
    return '#1E8C5A'; // done
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
        title={`${tableLabel} · timeline da sessão`}
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
              Carregando timeline da sessão...
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

        {!loading && !error && session && (
          <>
            {/* Header da sessão: Mesa N · mesa de [host] · status */}
            <div style={{ padding: '18px 16px 4px' }}>
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 14,
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                      color: C.faint,
                      fontFamily: MONO_FONT,
                      marginBottom: 4,
                    }}
                  >
                    {tableLabel} · sessão
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>
                    {session.hostName ? `Mesa de ${session.hostName}` : 'Sessão sem host'}
                  </div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2, fontWeight: 600 }}>
                    Aberta {formatDateTime(session.createdAt)}
                    {session.closedAt ? ` · fechada ${formatDateTime(session.closedAt)}` : ''}
                  </div>
                </div>
                <MPill tone={isClosed ? 'mute' : 'success'} dark={dark}>
                  {isClosed ? 'Fechada' : 'Ativa'}
                </MPill>
              </div>
            </div>

            {/* Timeline */}
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
                Linha do tempo
              </div>

              {entries.length === 0 ? (
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
                  Esta sessão ainda não tem eventos registrados.
                </div>
              ) : (
                <>
                  {maybeHasOlder && (
                    <button
                      type="button"
                      onClick={loadOlder}
                      disabled={loadingOlder}
                      style={{
                        width: '100%',
                        marginBottom: 12,
                        border: `1px solid ${C.borderSoft}`,
                        borderRadius: 10,
                        padding: '8px 12px',
                        background: C.bg,
                        color: C.mute,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: loadingOlder ? 'default' : 'pointer',
                      }}
                    >
                      {loadingOlder ? 'Carregando...' : 'Carregar eventos anteriores'}
                    </button>
                  )}
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
                    {entries.map((entry, index) => {
                      const previousAt = index === 0 ? null : entries[index - 1].at;
                      const delta = minutesBetween(previousAt, entry.at);
                      const detail = entryDetail(entry);
                      const meta = [actorLabel(entry.actor), detail].filter(Boolean).join(' · ');
                      return (
                        <div
                          key={entry.id}
                          style={{
                            position: 'relative',
                            paddingBottom: 14,
                            display: 'flex',
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: -22,
                              top: 3,
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              background: dotColor(index),
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
                              <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                                {entryLabel(entry)}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: C.faint,
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: 600,
                                  flexShrink: 0,
                                }}
                              >
                                {formatClock(entry.at)}
                              </span>
                            </div>
                            {meta && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: C.faint,
                                  marginTop: 2,
                                  fontWeight: 500,
                                }}
                              >
                                {meta}
                              </div>
                            )}
                            {delta != null && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: C.faint,
                                  marginTop: 2,
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: 600,
                                }}
                              >
                                + {formatMinutes(delta)} após evento anterior
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Árvore de merge — só quando a sessão participa de merge aprovado */}
            {mergeTree && mergeTree.edges.length > 0 && (
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
                  Árvore de merge
                </div>
                <div
                  style={{
                    background: C.bg,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 14,
                    padding: '6px 14px',
                  }}
                >
                  {mergeTree.edges.map((edge, index) => (
                    <div
                      key={edge.requestId}
                      style={{
                        padding: '10px 0',
                        borderTop: index === 0 ? 'none' : `1px solid ${C.borderFaint}`,
                        paddingLeft:
                          edge.from === mergeTree.root || edge.to === mergeTree.root ? 0 : 14,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                        {mergeNodeLabel(mergeTree, edge.from)} →{' '}
                        {mergeNodeLabel(mergeTree, edge.to)}
                      </div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 2, fontWeight: 600 }}>
                        {edge.approvedAt
                          ? `aprovado ${formatDateTime(edge.approvedAt)}`
                          : 'aprovado (sem data registrada)'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}
