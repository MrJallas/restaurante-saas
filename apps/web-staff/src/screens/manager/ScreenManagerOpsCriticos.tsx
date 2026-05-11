'use client';

// V9 drill-down — CRÍTICOS chip (/manager/operacoes/criticos).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:569-667
// (variant `criticos`). Hero "N" críticos vermelho + lista cada com 2
// ações inline + 2 ActionPills "Resolver todos em sequência" / "Avisar
// todos os garçons" + Fórmula.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL: GET /:slug/complaints + GET /:slug/late-arrival-requests
//     populam o pool. Aqui filtramos só os "críticos" (status pendente
//     + além da meta). Por enquanto mock inline igual aos FALLBACK_ALERTS
//     do ScreenManagerOps quando os endpoints vierem vazios.
//   • STUB: ações inline ("Resolver", "Avisar Caleb", etc) e ActionPills
//     do bottom ("Resolver todos", "Avisar garçons") — sem endpoint
//     dedicado pra alert.resolve(id) ainda. Toast stub.

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

// Mock fallback bate com FALLBACK_ALERTS (sev=high) do ScreenManagerOps.
// TODO(round19): replace com GET /:slug/alerts?severity=high quando endpoint existir.
const FALLBACK_CRITICALS: CriticalAlert[] = [
  {
    id: 'c1',
    mesa: 14,
    msg: 'Risoto da mesa 14 esfriou',
    sub: '12 min na pass · cliente esperando',
    ts: '4 min',
    actions: ['Resolver', 'Avisar Caleb'],
  },
  {
    id: 'c2',
    mesa: 21,
    msg: 'Mesa 21 chamou 3× sem resposta',
    sub: 'Caleb atende · sobrecarga 7 mesas',
    ts: '6 min',
    actions: ['Atender agora', 'Realocar'],
  },
];

export function ScreenManagerOpsCriticos({ dark, tenantSlug }: ScreenManagerOpsCriticosProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const [items, setItems] = useState<CriticalAlert[]>(FALLBACK_CRITICALS);
  const [stubMsg, setStubMsg] = useState<string | null>(null);

  useEffect(() => {
    // Tenta puxar complaints reais (= "críticos" mais próximos do que temos).
    // Se vier vazio, mantém fallback canvas.
    let cancelled = false;
    manager(tenantSlug)
      .complaints.list()
      .then((list) => {
        if (cancelled || !list.length) return;
        // Filtra só não-resolvidos. Se houver dados reais, mostramos eles.
        const open = list.filter((c) => c.status !== 'resolved').slice(0, 5);
        if (open.length === 0) return;
        const minutesAgo = (iso: string) => {
          const diff = Date.now() - new Date(iso).getTime();
          return `${Math.max(1, Math.round(diff / 60000))} min`;
        };
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

  const showStub = (action: string) => {
    setStubMsg(`${action} · em desenvolvimento (Onda 4 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
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
          <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
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
                  onAction0={() => showStub(a.actions[0])}
                  onAction1={() => showStub(a.actions[1])}
                />
              ))}
            </div>

            <SectionLabel C={C}>O que fazer agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionPill
                C={C}
                filled
                accent="#A12626"
                icon={Icon.flame(13)}
                onClick={() => showStub('Resolver todos em sequência')}
              >
                Resolver todos em sequência
              </ActionPill>
              <ActionPill
                C={C}
                icon={Icon.bell(13)}
                onClick={() => router.push(slugQs ? `/manager/mensagens?slug=${slugQs}` : '/manager/mensagens')}
              >
                Avisar todos os garçons da praça
              </ActionPill>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Pedidos ou chamados que <b>excederam a meta de tempo</b> · meta varia por tipo (12 min cozinha · 5 min
          chamado · etc).
        </Formula>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={items.length} />

      {stubMsg && <StubToast C={C}>{stubMsg}</StubToast>}
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
      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function StubToast({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
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
