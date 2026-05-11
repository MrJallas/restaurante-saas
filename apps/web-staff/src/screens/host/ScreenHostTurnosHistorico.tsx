'use client';

// ScreenHostTurnosHistorico — histórico de turnos passados do host.
// Mostra liberações, reservas, walk-ins e espera média por turno. Mock
// data até o backend ter o endpoint; cada row expande pra detalhe inline.
//
// TODO(round19): wire GET /:slug/host/turnos-history — hoje só renderiza
// mock fixo. Cada row já está pronta pra receber payload real (mesmo
// shape).

import * as React from 'react';
import { useMemo, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GIconBtn, HBottomNav } from '../../components/waiter/Primitives';

interface ShiftEntry {
  id: string;
  date: string; // ISO YYYY-MM-DD
  weekday: string;
  startedAt: string; // HH:MM
  endedAt: string; // HH:MM
  tablesReleased: number;
  reservations: number;
  walkins: number;
  avgWaitMin: number;
}

// Mock 10 turnos (D-1 ate D-10). Padroniza turno noite (17h-23h).
const MOCK_SHIFTS: ShiftEntry[] = [
  { id: 's-1', date: '2026-05-09', weekday: 'Sex', startedAt: '17:00', endedAt: '23:14', tablesReleased: 28, reservations: 14, walkins: 6, avgWaitMin: 8 },
  { id: 's-2', date: '2026-05-08', weekday: 'Qui', startedAt: '17:02', endedAt: '22:51', tablesReleased: 22, reservations: 11, walkins: 4, avgWaitMin: 6 },
  { id: 's-3', date: '2026-05-07', weekday: 'Qua', startedAt: '17:00', endedAt: '22:34', tablesReleased: 19, reservations: 9, walkins: 3, avgWaitMin: 5 },
  { id: 's-4', date: '2026-05-06', weekday: 'Ter', startedAt: '17:05', endedAt: '22:20', tablesReleased: 17, reservations: 8, walkins: 3, avgWaitMin: 4 },
  { id: 's-5', date: '2026-05-05', weekday: 'Seg', startedAt: '17:01', endedAt: '22:10', tablesReleased: 15, reservations: 6, walkins: 2, avgWaitMin: 4 },
  { id: 's-6', date: '2026-05-04', weekday: 'Dom', startedAt: '11:30', endedAt: '16:45', tablesReleased: 24, reservations: 12, walkins: 9, avgWaitMin: 12 },
  { id: 's-7', date: '2026-05-03', weekday: 'Sáb', startedAt: '17:00', endedAt: '23:38', tablesReleased: 32, reservations: 18, walkins: 8, avgWaitMin: 14 },
  { id: 's-8', date: '2026-05-02', weekday: 'Sex', startedAt: '17:00', endedAt: '23:05', tablesReleased: 27, reservations: 13, walkins: 7, avgWaitMin: 9 },
  { id: 's-9', date: '2026-05-01', weekday: 'Qui', startedAt: '17:00', endedAt: '23:18', tablesReleased: 30, reservations: 15, walkins: 8, avgWaitMin: 11 },
  { id: 's-10', date: '2026-04-30', weekday: 'Qua', startedAt: '17:02', endedAt: '22:40', tablesReleased: 21, reservations: 10, walkins: 4, avgWaitMin: 7 },
];

interface ScreenHostTurnosHistoricoProps {
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
  /** Override pra testes; em produção vem do hook futuro. */
  shifts?: ShiftEntry[];
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export const ScreenHostTurnosHistorico: React.FC<ScreenHostTurnosHistoricoProps> = ({
  onBack,
  onTabChange,
  shifts = MOCK_SHIFTS,
}) => {
  const dark = false;
  const C = useG(dark);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...shifts].sort((a, b) => b.date.localeCompare(a.date)),
    [shifts],
  );

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
      {/* TopBar · back + título */}
      <div
        style={{
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />
        <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
          Histórico de turnos
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 24 }}>
        {/* Hero KPI */}
        <div style={{ padding: '16px 16px 0' }}>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: C.faint,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              No histórico
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: C.ink,
                letterSpacing: -0.6,
                marginTop: 4,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {sorted.length}
              <span style={{ fontSize: 14, color: C.faint, fontWeight: 600, marginLeft: 6 }}>
                {sorted.length === 1 ? 'turno' : 'turnos'}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>
              Toque num turno pra ver detalhes. Os números refletem só as suas
              ações como recepcionista — não o salão inteiro.
            </div>
          </div>
        </div>

        {/* Lista turnos */}
        <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((shift) => {
            const expanded = expandedId === shift.id;
            return (
              <div
                key={shift.id}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${C.borderSoft}`,
                  background: C.bg,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : shift.id)}
                  aria-expanded={expanded}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: '#F4F0E8',
                      color: C.ink,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                      {shift.weekday}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>
                      {shift.date.slice(8, 10)}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                      {formatDateBr(shift.date)} · {shift.startedAt}–{shift.endedAt}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>
                      {shift.tablesReleased} liberações · {shift.reservations} reservas · espera ~{shift.avgWaitMin} min
                    </div>
                  </div>
                  <div
                    style={{
                      color: C.faint,
                      opacity: 0.5,
                      flexShrink: 0,
                      transform: expanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 140ms ease',
                    }}
                  >
                    {Icon.arrow(16)}
                  </div>
                </button>
                {expanded && (
                  <div
                    style={{
                      padding: '0 14px 14px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 8,
                    }}
                  >
                    <KpiTile dark={dark} label="Mesas liberadas" value={shift.tablesReleased} />
                    <KpiTile dark={dark} label="Reservas atendidas" value={shift.reservations} />
                    <KpiTile dark={dark} label="Walk-ins" value={shift.walkins} />
                    <KpiTile dark={dark} label="Espera média" value={`${shift.avgWaitMin} min`} />
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: C.faint,
                padding: '24px 4px',
                textAlign: 'center',
                fontWeight: 500,
              }}
            >
              Nenhum turno fechado ainda. Volte aqui no fim do primeiro
              expediente.
            </div>
          )}
        </div>
      </div>

      <HBottomNav active="me" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

// ─── KpiTile — caixa minimalista pra KPIs no expand ───────────────
function KpiTile({ label, value, dark }: { label: string; value: number | string; dark?: boolean }) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        background: C.surface,
        border: `1px solid ${C.borderSoft}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: C.faint,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: C.ink,
          letterSpacing: -0.3,
          marginTop: 3,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default ScreenHostTurnosHistorico;
