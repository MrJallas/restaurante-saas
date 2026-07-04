'use client';

// V9 drill-down — SOBRECARGA tile (/manager/equipe/sobrecarga).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:200-370
// (variant `sobrecarga`). Hero "N" sobrecarregados + lista expansível
// das mesas de cada um + banner sugestão IA + 4 ActionPills incluindo
// "Pausar mesas do X por 5 min" + Fórmula.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL (parcial): GET /:slug/staff?activeOnly=true → derive overload
//     candidates. Ações usam redistribuição/manual, mensagem direta e pausa
//     de zona já existentes.
//   • DEMO: mesas-por-garçom NÃO tem endpoint (team-kpis só traz chamados/
//     resposta/entregas) — a lista de sobrecarregados é ilustrativa e a
//     tela carrega o selo "Dados de demonstração" até existir fonte real.

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
  MContactStaffSheet,
  type ManagerStaffTarget,
} from '../../components/manager';
import { staffRosterApi, type StaffRosterEntry } from '../../lib/api/manager';

export interface ScreenManagerStaffSobrecargaProps {
  dark?: boolean;
  tenantSlug: string;
}

const ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];
const OVERLOAD_THRESHOLD = 7; // 7+ mesas = sobrecarga

interface OverloadedPerson {
  id: string;
  name: string;
  color: string;
  tables: number[];
}

export function ScreenManagerStaffSobrecarga({
  dark,
  tenantSlug,
}: ScreenManagerStaffSobrecargaProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/equipe?slug=${slugQs}` : '/manager/equipe';

  const [overloaded, setOverloaded] = useState<OverloadedPerson[]>([]);
  const [contactTarget, setContactTarget] = useState<ManagerStaffTarget | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    staffRosterApi(tenantSlug)
      .list({ activeOnly: true })
      .then((data: StaffRosterEntry[]) => {
        if (cancelled) return;
        // TODO(round19): wire GET /:slug/staff/load endpoint pra ter mesas reais
        // por garçom. Por enquanto deriva mock: 1º waiter ativo recebe overload
        // sintético (igual ao mock canvas) pra demonstrar layout.
        const waiters = data.filter((s) => s.role === 'waiter');
        const result: OverloadedPerson[] = waiters.slice(0, 1).map((s, i) => ({
          id: s.id,
          name: s.name,
          color: ROLE_PALETTE[i % ROLE_PALETTE.length],
          tables: [3, 5, 9, 12, 14, 18, 21],
        }));
        setOverloaded(result);
      })
      .catch(() => {
        // fallback canvas mock
        setOverloaded([
          {
            id: 'mock-cs',
            name: 'Caleb Souza',
            color: '#4F6BFF',
            tables: [3, 5, 9, 12, 14, 18, 21],
          },
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const count = overloaded.length;
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
  const firstOverloaded = overloaded[0];

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
        title="Sobrecarga"
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
          <DemoBadge C={C} />
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
              color: count > 0 ? '#A12626' : C.ink,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {count}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: count > 0 ? '#9A7212' : C.faint,
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {count > 0 ? '↓ REALOCAR MESAS' : 'TUDO CERTO'}
          </div>
          <div
            style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}
          >
            {count > 0
              ? `${count} ${count === 1 ? 'funcionário' : 'funcionários'} com carga acima do limiar (${OVERLOAD_THRESHOLD}+ mesas).`
              : 'Nenhum funcionário acima do limiar agora.'}
          </div>
        </div>

        {count > 0 && (
          <>
            <SectionLabel C={C}>Quem está sobrecarregado</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overloaded.map((p) => (
                <PersonRowExpandable
                  key={p.id}
                  C={C}
                  person={p}
                  open={openId === p.id}
                  onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                />
              ))}
            </div>

            {/* Banner sugestão IA */}
            <div style={{ padding: '14px 16px 0' }}>
              <div
                style={{
                  background: '#FFF7E6',
                  border: '1px solid #F0DCB6',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: '#9A7212',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {Icon.sparkle(14)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: '#7A4D10',
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      fontFamily: MONO_FONT,
                    }}
                  >
                    Sugestão
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: '#1d1c19',
                      lineHeight: 1.4,
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    Mover{' '}
                    <b style={{ fontWeight: 700 }}>1 mesa de {firstOverloaded?.name ?? 'Caleb'}</b>{' '}
                    para outro garçom equilibra a praça em ~2 min.
                  </div>
                </div>
              </div>
            </div>

            <SectionLabel C={C}>O que fazer agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionPill
                C={C}
                filled
                icon={Icon.table(13)}
                onClick={() =>
                  router.push(
                    slugQs
                      ? `/manager/operacoes/mesas-ativas?slug=${slugQs}`
                      : '/manager/operacoes/mesas-ativas',
                  )
                }
              >
                Realocar mesas manualmente
              </ActionPill>
              <ActionPill
                C={C}
                icon={Icon.chat(13)}
                onClick={() => {
                  if (!firstOverloaded) return;
                  setContactTarget({
                    staffId: firstOverloaded.id,
                    name: firstOverloaded.name,
                    color: firstOverloaded.color,
                    contextHint: `${firstOverloaded.tables.length} mesas`,
                  });
                }}
              >
                Mensagem direta pro {firstOverloaded?.name.split(' ')[0] ?? 'garçom'}
              </ActionPill>
              <div>
                <ActionPill
                  C={C}
                  icon={Icon.pause(13)}
                  onClick={() =>
                    router.push(
                      slugQs ? `/manager/pausa-zona?slug=${slugQs}` : '/manager/pausa-zona',
                    )
                  }
                >
                  Pausar mesas do {firstOverloaded?.name.split(' ')[0] ?? 'garçom'} por 5 min
                </ActionPill>
                <div
                  style={{
                    fontSize: 12,
                    color: C.faint,
                    fontWeight: 500,
                    lineHeight: 1.45,
                    padding: '6px 14px 0',
                  }}
                >
                  Só as mesas que ele atende · resto do salão funciona normal.
                </div>
              </div>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Funcionários com <b>{OVERLOAD_THRESHOLD}+ mesas</b> simultaneamente OU{' '}
          <b>3+ chamados sem resposta</b> há mais de 2 min · ajuste limiares em{' '}
          <span style={{ color: C.ink, fontWeight: 700 }}>Operação</span>.
        </Formula>
      </div>

      <MBottomNav active="staff" dark={dark} onTo={(r) => router.push(r)} />

      <MContactStaffSheet
        open={!!contactTarget}
        dark={dark}
        tenantSlug={tenantSlug}
        target={contactTarget ?? { staffId: '', name: '' }}
        onClose={() => setContactTarget(null)}
      />
    </div>
  );
}

// ─── Local shared bits (intentional duplication while V9 stabilizes) ──

// Selo anti-placebo — mesmo padrão do que existia na aba Funil do
// ScreenManagerOps antes do backend real (pill border-soft, mono 10px
// uppercase tracking 1px).
function DemoBadge({ C }: { C: ReturnType<typeof useG> }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 100,
        border: `1px solid ${C.borderSoft}`,
        color: C.faint,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
        marginBottom: 10,
      }}
    >
      Dados de demonstração
    </div>
  );
}

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

function PersonRowExpandable({
  C,
  person,
  open,
  onToggle,
}: {
  C: ReturnType<typeof useG>;
  person: { id: string; name: string; color: string; tables: number[] };
  open: boolean;
  onToggle: () => void;
}) {
  const init = person.name
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
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          width: '100%',
        }}
      >
        <MAvatar name={person.name} init={init} color={person.color} size={36} />
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
            {person.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#A12626',
              fontWeight: 800,
              letterSpacing: 0.55,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
              marginTop: 2,
            }}
          >
            {person.tables.length} MESAS · LIMITE 6
          </div>
        </div>
        <span
          style={{
            color: C.faint,
            opacity: 0.7,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 140ms ease',
            flexShrink: 0,
          }}
        >
          {Icon.arrow(14)}
        </span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px dashed ${C.borderSoft}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {person.tables.map((t) => (
            <span
              key={t}
              style={{
                padding: '5px 9px',
                borderRadius: 7,
                border: `1px solid ${C.borderSoft}`,
                background: C.surface,
                fontSize: 11,
                fontWeight: 700,
                color: C.ink,
                letterSpacing: -0.1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Mesa {t}
            </span>
          ))}
        </div>
      )}
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
