'use client';

// V9 drill-down — EM CAMPO tile (/manager/equipe/em-campo).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:132-198
// (variant `em-campo`). Hero "5/6" + "1 fora" lista quem está fora +
// 3 ActionPills + bloco Fórmula. Topbar com voltar pra /manager/equipe.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL: GET /:slug/staff?activeOnly=true → lista de ativos no turno.
//     Cálculo de "em campo" = funcionários com is_active. "Fora" = total - em campo.
//   • STUB: ações "Avisar Ricardo", "Marcar folga retroativa", "Substituir"
//     — sem endpoints ainda. Toast "em desenvolvimento (Onda 4 backend)".
//
// Sticky-footer canon: outer 100dvh + middle flex:1/overflow:auto/minHeight:0.
// Não tem CTA bottom-fixed nessa tela — actions ficam inline no fim do scroll.

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
  MAvatar,
} from '../../components/manager';
import { staffRosterApi, type StaffRosterEntry } from '../../lib/api/manager';

export interface ScreenManagerStaffEmCampoProps {
  dark?: boolean;
  tenantSlug: string;
}

const ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];

export function ScreenManagerStaffEmCampo({ dark, tenantSlug }: ScreenManagerStaffEmCampoProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/equipe?slug=${slugQs}` : '/manager/equipe';

  const [staff, setStaff] = useState<StaffRosterEntry[]>([]);
  const [stubMsg, setStubMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    staffRosterApi(tenantSlug)
      .list()
      .then((data) => {
        if (!cancelled) setStaff(data);
      })
      .catch(() => {
        // keep empty fallback
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const showStub = (action: string) => {
    setStubMsg(`${action} · em desenvolvimento (Onda 4 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  const inField = staff.filter((s) => s.is_active);
  const offShift = staff.filter((s) => !s.is_active);
  const total = staff.length;
  const inFieldCount = inField.length;
  const offCount = offShift.length;

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
        title="Em campo"
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
              color: C.ink,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {inFieldCount}
            <span style={{ fontSize: 20, color: C.faint, fontWeight: 600 }}>/{total || '—'}</span>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: offCount > 0 ? '#9A7212' : C.faint,
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {offCount > 0 ? `${offCount} fora` : 'todos no turno'}
          </div>
          <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
            {inFieldCount} funcionários ativos no turno
            {offCount > 0 ? ` · ${offCount} esperado mas ausente.` : '.'}
          </div>
        </div>

        {offCount > 0 && (
          <>
            <SectionLabel C={C}>Quem está fora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {offShift.map((p, i) => (
                <PersonRow
                  key={p.id}
                  C={C}
                  name={p.name}
                  color={ROLE_PALETTE[i % ROLE_PALETTE.length]}
                  badgeMono="NÃO LOGOU AINDA"
                  badgeColor="#A12626"
                />
              ))}
            </div>
          </>
        )}

        <SectionLabel C={C}>O que fazer agora</SectionLabel>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionPill
            C={C}
            filled
            icon={Icon.bell(13)}
            onClick={() => showStub('Avisar funcionários fora')}
          >
            Avisar quem ainda não logou
          </ActionPill>
          <ActionPill
            C={C}
            icon={Icon.clock(13)}
            onClick={() => showStub('Marcar folga retroativa')}
          >
            Marcar folga retroativa
          </ActionPill>
          <ActionPill
            C={C}
            icon={Icon.user(13)}
            onClick={() => router.push(slugQs ? `/manager/equipe/turnos?slug=${slugQs}` : '/manager/equipe/turnos')}
          >
            Substituir por outro funcionário
          </ActionPill>
        </div>

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Funcionários com status <b>em turno</b> agora · não inclui pausados ou fora. Escala
          configurada em <span style={{ color: C.ink, fontWeight: 700 }}>Editar turnos</span>.
        </Formula>
      </div>

      <MBottomNav active="staff" dark={dark} onTo={(r) => router.push(r)} />

      {stubMsg && <StubToast C={C}>{stubMsg}</StubToast>}
    </div>
  );
}

// ─── Shared bits used by all 7 drill-down screens ────────────────
// kept local (intentional duplication) until V9 set stabilizes.

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

function PersonRow({
  C,
  name,
  color,
  badgeMono,
  badgeColor,
}: {
  C: ReturnType<typeof useG>;
  name: string;
  color: string;
  badgeMono: string;
  badgeColor?: string;
}) {
  const init = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        gap: 11,
      }}
    >
      <MAvatar name={name} init={init} color={color} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: -0.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: badgeColor || C.faint,
            fontWeight: 800,
            letterSpacing: 0.55,
            textTransform: 'uppercase',
            fontFamily: MONO_FONT,
            marginTop: 2,
          }}
        >
          {badgeMono}
        </div>
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

function StubToast({
  C,
  children,
}: {
  C: ReturnType<typeof useG>;
  children: React.ReactNode;
}) {
  return (
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
      {children}
    </div>
  );
}
