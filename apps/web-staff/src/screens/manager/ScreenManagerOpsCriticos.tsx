'use client';

// V9 drill-down — CRÍTICOS chip (/manager/operacoes/criticos).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:569-667
// (variant `criticos`). Hero "N" críticos vermelho + lista cada com 2
// ações inline + Fórmula.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL: GET /:slug/complaints
//     populam o pool. Aqui filtramos só os "críticos" (status pendente
//     + além da meta).
//
// P2 (re-scan): antes qualquer complaint não-resolvida virava "crítica /
// excedeu a meta" — sem filtro de TEMPO. Agora só entra o que passou da meta
// de resposta (COMPLAINT_SLA_MIN), casando com o rótulo "além da meta" e a
// Fórmula. Não há SLA compartilhado no backend (o próprio dashboard conta
// "critical_alerts" como complaint aberta do dia, sem tempo), então o limiar
// vive documentado aqui — alinhado à janela de 10 min do continuation service.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  Icon,
  MTopBar,
  GIconBtn,
  MBottomNav,
} from '../../components/manager';
import { manager } from '../../lib/api/manager';

// Meta de resposta a reclamação: acima disso a reclamação conta como "crítica"
// (cliente esperando além da meta). Janela de 10 min espelha a prioridade
// pos_reclamacao do continuation service.
const COMPLAINT_SLA_MIN = 10;

interface CriticalAlert {
  id: string;
  mesa: number;
  msg: string;
  sub: string;
  ts: string;
  actions: [string, string];
}

export interface ScreenManagerOpsCriticosProps {
  dark?: boolean;
  tenantSlug: string;
}

export function ScreenManagerOpsCriticos({ dark, tenantSlug }: ScreenManagerOpsCriticosProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const [items, setItems] = useState<CriticalAlert[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Tenta puxar complaints reais (= "críticos" mais próximos do que temos).
    let cancelled = false;
    manager(tenantSlug)
      .complaints.list()
      .then((list) => {
        if (cancelled || !list.length) return;
        const ageMin = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;
        // Crítico = reclamação aberta E além da meta de resposta. Sem o filtro
        // de tempo, toda reclamação recém-aberta era rotulada "excedeu a meta".
        const open = list
          .filter((c) => c.status !== 'resolved' && ageMin(c.createdAt) >= COMPLAINT_SLA_MIN)
          .slice(0, 5);
        if (open.length === 0) return;
        const minutesAgo = (iso: string) => `${Math.max(1, Math.round(ageMin(iso)))} min`;
        setItems(
          open.map((c) => ({
            id: c.id,
            mesa: c.tableNumber ?? 0,
            msg: `Mesa ${c.tableNumber} · ${c.problemType}`,
            sub: c.description.slice(0, 80),
            ts: minutesAgo(c.createdAt),
            actions: ['Responder', 'Resolver'],
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const setTimedFeedback = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 2800);
  };

  const resolveComplaint = async (id: string) => {
    try {
      await manager(tenantSlug).complaints.resolve(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTimedFeedback('Chamado marcado como resolvido.');
    } catch (err) {
      setTimedFeedback(err instanceof Error ? err.message : 'Não foi possível resolver o chamado.');
    }
  };

  // Render-time `new Date()` causa hydration mismatch (server em UTC,
  // client em Brasília). Placeholder no SSR, atualiza após mount.
  const [updatedAt, setUpdatedAt] = useState<string>('--:--');
  useEffect(() => {
    setUpdatedAt(
      new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, []);

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
        title="Críticos"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(backHref)}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 100 }}>
        {/* Hero */}
        <div style={{ padding: '20px 16px 18px' }}>
          <div
            style={{
              fontSize: 10.5,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
            }}
          >
            Atualizado às {updatedAt}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: -1,
              color: items.length > 0 ? '#A12626' : C.ink,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {items.length}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: items.length > 0 ? '#A12626' : C.faint,
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {items.length > 0 ? '· RESOLVER AGORA' : '· TUDO NO RITMO'}
          </div>
          <div
            style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}
          >
            {items.length > 0
              ? `${items.length} alertas com cliente esperando além da meta.`
              : 'Sem alertas críticos nesse momento.'}
          </div>
        </div>

        {items.length > 0 && (
          <>
            <SectionLabel C={C}>O que está crítico</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((a) => (
                <AlertCard
                  key={a.id}
                  C={C}
                  alert={a}
                  onAction0={() =>
                    router.push(
                      `/manager?slug=${tenantSlug}&replyComplaint=${encodeURIComponent(a.id)}`,
                    )
                  }
                  onAction1={() => resolveComplaint(a.id)}
                />
              ))}
            </div>

            <SectionLabel C={C}>O que fazer agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionPill
                C={C}
                icon={Icon.bell(13)}
                onClick={() =>
                  router.push(slugQs ? `/manager/mensagens?slug=${slugQs}` : '/manager/mensagens')
                }
              >
                Avisar todos os garçons da praça
              </ActionPill>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Reclamações abertas que <b>passaram da meta de resposta</b> ({COMPLAINT_SLA_MIN} min sem
          serem resolvidas). Reclamação recém-aberta ainda dentro da meta não entra aqui.
        </Formula>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={items.length} />

      {feedback && <InlineToast C={C}>{feedback}</InlineToast>}
    </div>
  );
}

// ─── Local shared bits ───────────────────────────────────────────

function SectionLabel({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '18px 16px 8px',
        fontSize: 11,
        color: C.faint,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
      }}
    >
      {children}
    </div>
  );
}

function AlertCard({
  C,
  alert,
  onAction0,
  onAction1,
}: {
  C: ReturnType<typeof useG>;
  alert: CriticalAlert;
  onAction0: () => void;
  onAction1: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: '10px 12px',
        position: 'relative',
        border: '1px solid #F4C7C7',
        background: C.bg,
        borderLeft: '3px solid #C43A3A',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: '#C43A3A',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {Icon.flame(12)}
        </div>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: '#A12626',
            fontFamily: MONO_FONT,
          }}
        >
          CRÍTICO · há {alert.ts}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.25, marginTop: 6 }}>
        {alert.msg}
      </div>
      <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1 }}>{alert.sub}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          type="button"
          onClick={onAction0}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '0 10px',
            height: 30,
            borderRadius: 7,
            background: C.ink,
            color: C.bg,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: -0.1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {alert.actions[0]}
        </button>
        <button
          type="button"
          onClick={onAction1}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '0 10px',
            height: 30,
            borderRadius: 7,
            background: 'transparent',
            color: C.ink,
            border: `1px solid ${C.borderSoft}`,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: -0.1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {alert.actions[1]}
        </button>
      </div>
    </div>
  );
}

function ActionPill({
  C,
  filled,
  accent,
  icon,
  children,
  onClick,
}: {
  C: ReturnType<typeof useG>;
  filled?: boolean;
  accent?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        padding: '12px 14px',
        borderRadius: 12,
        border: filled ? 'none' : `1px solid ${C.borderSoft}`,
        background: filled ? accent || C.ink : 'transparent',
        color: filled ? '#fff' : C.ink,
        fontSize: 13.5,
        fontWeight: 700,
        letterSpacing: -0.1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 10,
      }}
    >
      {icon && (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: filled ? 'rgba(255,255,255,0.18)' : C.surface,
            color: filled ? '#fff' : C.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

function Formula({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: '0 16px',
        padding: 14,
        borderRadius: 12,
        background: C.surface,
        border: `1px solid ${C.borderFaint}`,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: C.faint,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontFamily: MONO_FONT,
          marginBottom: 8,
        }}
      >
        Como esse número é calculado
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

function InlineToast({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 132,
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
      {children}
    </div>
  );
}
