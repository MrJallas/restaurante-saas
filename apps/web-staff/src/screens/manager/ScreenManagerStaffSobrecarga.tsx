'use client';

// V9 drill-down — SOBRECARGA tile (/manager/equipe/sobrecarga).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:200-370
// (variant `sobrecarga`). Hero "N" sobrecarregados + lista expansível
// das zonas de cada um + 3 ActionPills + Fórmula.
//
// Backend wiring (2026-07-11 — waiterWorkload):
//   • REAL: GET /:slug/dashboard/team-kpis.waiterWorkload.
//   • Cada sessão ativa já chega atribuída uma única vez entre candidatos por
//     zona/turno/pausa; esta tela não volta a multiplicar ocupação por zona.

import { useCallback, useEffect, useState } from 'react';
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
import { teamKpisApi } from '../../lib/api/manager';
import { projectManagerWorkload, type ManagerWorkloadRow } from '../../lib/manager-waiter-workload';

export interface ScreenManagerStaffSobrecargaProps {
  dark?: boolean;
  tenantSlug: string;
}

const ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];
type WaiterLoad = ManagerWorkloadRow & { color: string };

export function ScreenManagerStaffSobrecarga({
  dark,
  tenantSlug,
}: ScreenManagerStaffSobrecargaProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/equipe?slug=${slugQs}` : '/manager/equipe';
  const equipeHref = backHref;

  const [assigned, setAssigned] = useState<WaiterLoad[] | null>(null);
  const [unassignedSessions, setUnassignedSessions] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [contactTarget, setContactTarget] = useState<ManagerStaffTarget | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('--:--');

  const load = useCallback(async () => {
    try {
      const { waiterWorkload } = await teamKpisApi(tenantSlug).get();
      const projection = projectManagerWorkload(waiterWorkload);
      setAssigned(
        projection.rows.map((waiter) => ({
          ...waiter,
          color: ROLE_PALETTE[waiter.colorIndex % ROLE_PALETTE.length],
        })),
      );
      setUnassignedSessions(projection.unassignedSessions);
      setLoadError(false);
      // Horário do fetch real — não relógio decorativo.
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // Erro visível (anti-placebo) — nunca lista fabricada.
      setLoadError(true);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const overloaded = (assigned ?? []).filter((waiter) => waiter.overloaded);
  const count = overloaded.length;
  const hasAssignments = (assigned ?? []).length > 0;
  const firstOverloaded = overloaded[0];
  const heroCount = unassignedSessions > 0 ? unassignedSessions : count;

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
              color: count > 0 || unassignedSessions > 0 ? '#A12626' : C.ink,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {hasAssignments || unassignedSessions > 0 ? heroCount : '—'}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: loadError ? '#A12626' : count > 0 ? '#9A7212' : C.faint,
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {loadError
              ? 'ERRO AO CARREGAR'
              : assigned === null
                ? 'CARREGANDO'
                : unassignedSessions > 0
                  ? 'MESAS SEM GARÇOM ELEGÍVEL'
                  : !hasAssignments
                    ? 'SEM GARÇONS EM TURNO'
                    : count > 0
                      ? '↓ REDISTRIBUIR CARGA'
                      : 'TUDO CERTO'}
          </div>
          <div
            style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}
          >
            {unassignedSessions > 0
              ? `${unassignedSessions} ${unassignedSessions === 1 ? 'mesa ativa está' : 'mesas ativas estão'} sem garçom elegível. Revise turno, pausa e zonas.`
              : hasAssignments && count > 0
                ? `${count} ${count === 1 ? 'garçom está' : 'garçons estão'} com carga materialmente acima do restante da equipe.`
                : hasAssignments
                  ? 'Nenhum desequilíbrio material entre os garçons em turno.'
                  : 'A carga aparece quando há garçons em turno e sessões ativas distribuídas pelo monitor.'}
          </div>
        </div>

        {loadError && (
          <div style={{ padding: '0 16px' }}>
            <div
              role="alert"
              style={{
                padding: '16px 14px',
                borderRadius: 12,
                border: '1px solid #E7BFBF',
                background: '#FBEFEF',
                fontSize: 12.5,
                color: '#7A1818',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ flex: 1 }}>Não deu pra carregar a carga da equipe.</span>
              <button
                type="button"
                onClick={() => void load()}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: '#A12626',
                  color: '#fff',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                Tentar de novo
              </button>
            </div>
          </div>
        )}

        {!loadError && assigned !== null && !hasAssignments && (
          <div style={{ padding: '0 16px' }}>
            <div
              style={{
                padding: '24px 18px',
                textAlign: 'center',
                background: C.bg,
                border: `1.5px dashed ${C.borderSoft}`,
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.faint,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontFamily: MONO_FONT,
                }}
              >
                Nenhum garçom em turno agora
              </div>
              <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 6 }}>
                Revise os turnos e as zonas de hoje na tela Equipe para monitorar a carga real.
              </div>
              <button
                type="button"
                onClick={() => router.push(equipeHref)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  marginTop: 12,
                  padding: '9px 14px',
                  borderRadius: 10,
                  background: C.ink,
                  color: C.bg,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: -0.1,
                }}
              >
                Ir pra tela Equipe
              </button>
            </div>
          </div>
        )}

        {count > 0 && (
          <>
            <SectionLabel C={C}>Quem está sobrecarregado</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overloaded.map((p) => (
                <PersonRowExpandable
                  key={p.staffId}
                  C={C}
                  person={p}
                  open={openId === p.staffId}
                  onToggle={() => setOpenId(openId === p.staffId ? null : p.staffId)}
                />
              ))}
            </div>

            <SectionLabel C={C}>O que fazer agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionPill
                C={C}
                filled
                icon={Icon.table(13)}
                onClick={() => router.push(equipeHref)}
              >
                Atribuir outro garçom às zonas
              </ActionPill>
              <ActionPill
                C={C}
                icon={Icon.chat(13)}
                onClick={() => {
                  if (!firstOverloaded) return;
                  setContactTarget({
                    staffId: firstOverloaded.staffId,
                    name: firstOverloaded.name,
                    color: firstOverloaded.color,
                    contextHint: `${firstOverloaded.tables} mesas · carga ${firstOverloaded.loadScore}`,
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
                  Pausar pedidos novos na zona
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
                  Só a zona pausada para de receber pedidos · resto do salão funciona normal.
                </div>
              </div>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Cada sessão ativa é atribuída <b>uma única vez</b> entre os garçons elegíveis por zona,
          turno e pausa. A carga combina mesas, pessoas, pedidos, atrasos, chamados e entregas; o
          alerta aponta somente um desequilíbrio material calculado pelo backend.
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
  person: WaiterLoad;
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
            {person.tables} {person.tables === 1 ? 'MESA' : 'MESAS'} · CARGA {person.loadScore}
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
          {person.zoneRows.map((zone) => (
            <span
              key={zone.zoneName}
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
              {zone.zoneName} · {zone.tables} {zone.tables === 1 ? 'mesa' : 'mesas'} · {zone.people}{' '}
              pessoas · {zone.activeOrders} pedidos
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
