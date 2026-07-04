'use client';

// Round 18 (links-broken fix + V11 redesign): /manager/mesa/[n] proxy.
//
// `ScreenManagerOps` renderiza um grid de mesas com link
// `/manager/mesa/${t.n}` (n = numero da mesa). A tela alvo eh
// `ScreenManagerTableMenu`, que vive em `/manager/table-menu/[tableId]`
// e exige o `tableSessionId` (UUID) — nao o numero. Esta rota faz a
// resolucao numero -> sessionId via `GET /:slug/host/tables` e:
//   • mesa ocupada (active_session_id != null) -> redirect pra
//     `/manager/table-menu/[id]?tableNumber=n&slug=...`
//   • livre -> mostra empty state V11 (eyebrow + hero + capacidade card)
//   • nao encontrada / erro -> mensagem + CTA voltar
//
// Mantem o link curto `/manager/mesa/[n]` que o canvas usa (mais legivel
// em deep-links e push notifications) sem quebrar a integracao com a
// tela existente.
//
// Visual: tokens manager (useG/G_FONT/MONO_FONT) + MTopBar + GButton —
// mesma linguagem do resto do app (nao mais o stub feio com inline
// styles).

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  GButton,
  Icon,
} from '../../../../components/manager';
import { listHostTables, type HostTableEntry } from '../../../../lib/api/host';
import { getTableSessionsHistory } from '../../../../lib/api/manager';
import type { TableSessionHistoryItem } from '@restaurant/shared-types';

type LookupState =
  | { kind: 'loading' }
  | { kind: 'redirecting'; sessionId: string }
  | { kind: 'free'; table: HostTableEntry }
  | { kind: 'not_found'; n: number }
  | { kind: 'error'; message: string };

function ManagerMesaInner() {
  const router = useRouter();
  const route = useParams<{ n: string }>();
  const search = useSearchParams();
  const slug = search.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const dark = search.get('dark') === '1';
  const n = parseInt(route?.n ?? '', 10);
  const [state, setState] = useState<LookupState>({ kind: 'loading' });

  useEffect(() => {
    if (!Number.isFinite(n) || n <= 0) {
      setState({ kind: 'error', message: 'Numero de mesa invalido.' });
      return;
    }
    let cancelled = false;
    listHostTables(slug)
      .then((tables) => {
        if (cancelled) return;
        const t = tables.find((row) => row.number === n);
        if (!t) {
          setState({ kind: 'not_found', n });
          return;
        }
        if (t.active_session_id) {
          const qs = new URLSearchParams({
            slug,
            tableNumber: String(n),
            seats: String(t.capacity),
          });
          const party = t.party ?? t.seats;
          if (party != null) qs.set('party', String(party));
          if (t.observation) qs.set('observation', t.observation);
          router.replace(`/manager/table-menu/${t.active_session_id}?${qs.toString()}`);
          setState({ kind: 'redirecting', sessionId: t.active_session_id });
        } else {
          setState({ kind: 'free', table: t });
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ kind: 'error', message: err.message || 'Falha ao consultar mesa.' });
      });
    return () => {
      cancelled = true;
    };
  }, [n, slug, router]);

  const C = useG(dark);
  const back = () => {
    const qs = new URLSearchParams({ slug, tab: 'map' }).toString();
    router.push(`/manager/operacoes?${qs}`);
  };

  const titleFor = (): string => {
    switch (state.kind) {
      case 'free':
        return `Mesa ${state.table.number}`;
      case 'not_found':
        return `Mesa ${state.n}`;
      case 'redirecting':
        return `Mesa ${Number.isFinite(n) ? n : ''}`;
      case 'loading':
        return 'Carregando…';
      case 'error':
        return 'Erro';
    }
  };

  return (
    <div
      style={{
        height: '100dvh',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <MTopBar
        title={titleFor()}
        dark={dark}
        left={<GIconBtn icon={Icon.back(20)} onClick={back} ariaLabel="Voltar" dark={dark} />}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          overflowY: 'auto',
          padding: '32px 24px 40px',
        }}
      >
        {/* `margin: auto` centra igual ao grid/place-items anterior, mas sem
            clipar o topo quando a lista de sessões anteriores estoura a
            altura (aí vira scroll). */}
        <div
          style={{
            margin: 'auto',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {state.kind === 'loading' && <Loading C={C} />}
          {state.kind === 'redirecting' && <Redirecting C={C} />}
          {state.kind === 'free' && (
            <>
              <FreeTable C={C} table={state.table} onBack={back} />
              <PreviousSessions
                C={C}
                slug={slug}
                n={state.table.number}
                onOpen={(sessionId) => {
                  const qs = new URLSearchParams({ slug });
                  if (dark) qs.set('dark', '1');
                  router.push(`/manager/session-timeline/${sessionId}?${qs.toString()}`);
                }}
              />
            </>
          )}
          {state.kind === 'not_found' && <NotFound C={C} n={state.n} onBack={back} />}
          {state.kind === 'error' && <ErrorState C={C} message={state.message} onBack={back} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────

function Loading({ C }: { C: ReturnType<typeof useG> }) {
  return (
    <div
      style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Spinner C={C} />
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: C.faint,
        }}
      >
        Resolvendo mesa
      </span>
    </div>
  );
}

function Redirecting({ C }: { C: ReturnType<typeof useG> }) {
  return (
    <div
      style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Spinner C={C} />
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: C.faint,
        }}
      >
        Abrindo mesa
      </span>
    </div>
  );
}

function FreeTable({
  C,
  table,
  onBack,
}: {
  C: ReturnType<typeof useG>;
  table: HostTableEntry;
  onBack: () => void;
}) {
  return (
    <Hero C={C}>
      <Eyebrow C={C}>MESA · LIVRE</Eyebrow>
      <Title C={C}>Mesa {table.number}</Title>
      <Subtitle C={C}>Sem sessão ativa no momento.</Subtitle>

      <InfoCard C={C}>
        <InfoRow C={C} label="Setor" value={table.sector} />
        <InfoDivider C={C} />
        <InfoRow C={C} label="Capacidade" value={`${table.capacity} pessoas`} />
        {table.waiter_initial && (
          <>
            <InfoDivider C={C} />
            <InfoRow C={C} label="Garçom" value={table.waiter_initial} />
          </>
        )}
      </InfoCard>

      <Hint C={C}>
        Quando um cliente escanear o QR ou a recepcionista liberar a mesa, o atendimento abre
        automaticamente aqui.
      </Hint>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <GButton kind="primary" full onClick={onBack}>
          Voltar pro mapa
        </GButton>
      </div>
    </Hero>
  );
}

function NotFound({ C, n, onBack }: { C: ReturnType<typeof useG>; n: number; onBack: () => void }) {
  return (
    <Hero C={C}>
      <Eyebrow C={C}>NÃO ENCONTRADA</Eyebrow>
      <Title C={C}>Mesa {n}</Title>
      <Subtitle C={C}>
        Esse número não existe no salão. Pode ter sido removido ou renomeado.
      </Subtitle>

      <InfoCard C={C}>
        <InfoRow C={C} label="Possível causa" value="Mesa removida do mapa" />
        <InfoDivider C={C} />
        <InfoRow C={C} label="Ação" value="Voltar pro mapa atualizado" />
      </InfoCard>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <GButton kind="primary" full onClick={onBack}>
          Voltar pro mapa
        </GButton>
      </div>
    </Hero>
  );
}

function ErrorState({
  C,
  message,
  onBack,
}: {
  C: ReturnType<typeof useG>;
  message: string;
  onBack: () => void;
}) {
  return (
    <Hero C={C}>
      <Eyebrow C={C} tone="danger">
        ERRO · CONSULTA
      </Eyebrow>
      <Title C={C}>Não consegui carregar</Title>
      <Subtitle C={C}>{message}</Subtitle>
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <GButton kind="primary" full onClick={onBack}>
          Voltar pro mapa
        </GButton>
      </div>
    </Hero>
  );
}

// ─────────────────────────────────────────────────────────────
// Sessões anteriores (fatia M7 — timeline de sessão)
//
// Mesa livre é o único estado onde não há sessão ativa pra abrir;
// aqui entra o histórico (GET /:slug/tables/:n/sessions, M6), cada
// item linkando pra /manager/session-timeline/[sessionId]. Erro do
// backend (ex.: Mongo off → 503) aparece na tela — nunca lista
// vazia silenciosa.
// ─────────────────────────────────────────────────────────────

type SessionsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; sessions: TableSessionHistoryItem[] };

function formatSessionWindow(item: TableSessionHistoryItem): string {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const opened = new Date(item.createdAt);
  const openedTxt = Number.isNaN(opened.getTime()) ? '—' : fmt.format(opened);
  if (!item.closedAt) return `${openedTxt} · ainda aberta`;
  const closed = new Date(item.closedAt);
  const closedTxt = Number.isNaN(closed.getTime())
    ? ''
    : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(closed);
  return closedTxt ? `${openedTxt} → ${closedTxt}` : openedTxt;
}

function formatPaidCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function PreviousSessions({
  C,
  slug,
  n,
  onOpen,
}: {
  C: ReturnType<typeof useG>;
  slug: string;
  n: number;
  onOpen: (sessionId: string) => void;
}) {
  const [state, setState] = useState<SessionsState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getTableSessionsHistory(slug, n)
      .then((res) => {
        if (!cancelled) setState({ kind: 'ready', sessions: res.sessions });
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err.message || 'Não foi possível carregar as sessões anteriores.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, n]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 360,
        marginTop: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: C.faint,
          paddingLeft: 4,
        }}
      >
        Sessões anteriores
      </span>

      {state.kind === 'loading' && (
        <div
          style={{
            padding: '14px 16px',
            background: C.bg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 600,
            color: C.faint,
          }}
        >
          Carregando sessões…
        </div>
      )}

      {state.kind === 'error' && (
        <div
          style={{
            padding: '14px 16px',
            background: C.dangerBg,
            border: `1px solid ${C.danger}`,
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 600,
            color: C.danger,
          }}
        >
          {state.message}
        </div>
      )}

      {state.kind === 'ready' && state.sessions.length === 0 && (
        <div
          style={{
            padding: '14px 16px',
            background: C.bg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 600,
            color: C.faint,
          }}
        >
          Nenhuma sessão anterior registrada nesta mesa.
        </div>
      )}

      {state.kind === 'ready' && state.sessions.length > 0 && (
        <div
          style={{
            background: C.bg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          {state.sessions.map((item, index) => (
            <button
              key={item.sessionId}
              type="button"
              onClick={() => onOpen(item.sessionId)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderTop: index === 0 ? 'none' : `1px solid ${C.borderFaint}`,
                cursor: 'pointer',
                fontFamily: G_FONT,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                  {item.hostName ? `Mesa de ${item.hostName}` : 'Sessão sem host'}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.faint,
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatSessionWindow(item)}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.mute, marginTop: 2 }}>
                {item.totalOrders} {item.totalOrders === 1 ? 'pedido' : 'pedidos'} ·{' '}
                {formatPaidCents(item.totalPaidCents)}
                {item.closedByLabel ? ` · fechada por ${item.closedByLabel}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────

function Hero({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 14,
        textAlign: 'center',
        color: C.ink,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({
  C,
  children,
  tone,
}: {
  C: ReturnType<typeof useG>;
  children: React.ReactNode;
  tone?: 'danger';
}) {
  return (
    <span
      style={{
        fontFamily: MONO_FONT,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: tone === 'danger' ? C.danger : C.mute,
      }}
    >
      {children}
    </span>
  );
}

function Title({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: 0,
        fontSize: 30,
        fontWeight: 800,
        letterSpacing: -0.7,
        color: C.ink,
        fontFamily: G_FONT,
      }}
    >
      {children}
    </h2>
  );
}

function Subtitle({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.45,
        color: C.mute,
        fontFamily: G_FONT,
      }}
    >
      {children}
    </p>
  );
}

function InfoCard({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 6,
        padding: '14px 16px',
        background: C.bg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  C,
  label,
  value,
}: {
  C: ReturnType<typeof useG>;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: C.faint,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function InfoDivider({ C }: { C: ReturnType<typeof useG> }) {
  return <div style={{ height: 1, background: C.borderFaint }} />;
}

function Hint({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        marginTop: 4,
        fontSize: 12,
        lineHeight: 1.5,
        color: C.faint,
        fontFamily: G_FONT,
        textAlign: 'center',
      }}
    >
      {children}
    </p>
  );
}

function Spinner({ C }: { C: ReturnType<typeof useG> }) {
  return (
    <div
      aria-hidden
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: `2.5px solid ${C.borderSoft}`,
        borderTopColor: C.ink,
        animation: 'mesa-spin 0.85s linear infinite',
      }}
    >
      <style>{`@keyframes mesa-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function ManagerMesaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: G_FONT }}>Carregando…</div>}>
      <ManagerMesaInner />
    </Suspense>
  );
}
