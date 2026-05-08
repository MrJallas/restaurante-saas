'use client';

// Equipe — V6 unified screen.
//
// Compacted from garcom-screens-c.jsx (the canvas implements 8 sections;
// here we ship the operational subset that the manager needs day-to-day:
// 3 KPIs, search, role chips, staff list with status + presence + contact,
// today's shift list).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MAppHeader,
  MBottomNav,
  MStat,
  MPill,
  MAvatar,
  MSection,
  MContactStaffSheet,
  type ManagerStaffTarget,
} from '../../components/manager';

type StaffStatus = 'on' | 'off';
type StaffFlag = 'overload' | 'in-call' | null;

interface StaffMember {
  id: string;
  name: string;
  role: 'Garçom' | 'Cozinheiro' | 'Bartender' | 'Caixa' | 'Recepção';
  init: string;
  shift: string;
  status: StaffStatus;
  rating: number;
  callsAvg: number;
  tables: number;
  sales: number;
  scaled: number;
  color: string;
  flag: StaffFlag;
}

const M_TEAM_FALLBACK: StaffMember[] = [
  { id: '1', name: 'Caleb Souza', role: 'Garçom', init: 'CS', shift: '17:00 — 23:00', status: 'on', rating: 4.8, callsAvg: 1.2, tables: 7, sales: 1840, scaled: 0, color: '#4F6BFF', flag: null },
  { id: '2', name: 'Olivia Martins', role: 'Garçom', init: 'OM', shift: '17:00 — 23:00', status: 'on', rating: 4.6, callsAvg: 1.8, tables: 6, sales: 1520, scaled: 1, color: '#E37D2F', flag: 'in-call' },
  { id: '3', name: 'Henrique Lima', role: 'Garçom', init: 'HL', shift: '17:00 — 23:00', status: 'on', rating: 4.4, callsAvg: 2.4, tables: 5, sales: 1180, scaled: 2, color: '#7A4FBE', flag: 'overload' },
  { id: '4', name: 'Marina Reis', role: 'Garçom', init: 'MR', shift: '12:00 — 17:00', status: 'off', rating: 4.7, callsAvg: 1.4, tables: 0, sales: 0, scaled: 0, color: '#1E8C5A', flag: null },
  { id: '5', name: 'Bruno Pacheco', role: 'Cozinheiro', init: 'BP', shift: '17:00 — 23:00', status: 'on', rating: 4.5, callsAvg: 0, tables: 0, sales: 0, scaled: 0, color: '#C43A3A', flag: null },
  { id: '6', name: 'Júlia Andrade', role: 'Bartender', init: 'JA', shift: '17:00 — 23:00', status: 'on', rating: 4.9, callsAvg: 0.8, tables: 0, sales: 0, scaled: 0, color: '#0B7A8B', flag: null },
];

export interface ScreenManagerStaffProps {
  dark?: boolean;
  tenantSlug: string;
}

export function ScreenManagerStaff({ dark, tenantSlug }: ScreenManagerStaffProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const [team, setTeam] = useState<StaffMember[]>(M_TEAM_FALLBACK);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | StaffMember['role']>('todos');
  const [contactTarget, setContactTarget] = useState<ManagerStaffTarget | null>(null);

  // Try to fetch real staff from API; fall back to mocks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/${tenantSlug}/staff`,
          { credentials: 'include' },
        );
        if (!r.ok) return;
        const data = (await r.json()) as Array<{
          id: string;
          name: string;
          role: string;
          color?: string;
          shift?: string;
        }>;
        if (cancelled || !Array.isArray(data) || !data.length) return;
        setTeam(
          data.map((s, i) => ({
            id: s.id,
            name: s.name,
            role: (s.role as StaffMember['role']) ?? 'Garçom',
            init: s.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')
              .toUpperCase(),
            shift: s.shift ?? '17:00 — 23:00',
            status: 'on',
            rating: 4.5 + (i % 3) * 0.1,
            callsAvg: 1.2 + (i % 4) * 0.3,
            tables: Math.max(0, 7 - i),
            sales: 1000 + i * 200,
            scaled: i === 2 ? 2 : 0,
            color: s.color ?? ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'][i % 6],
            flag: null,
          })),
        );
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const inField = team.filter((p) => p.status === 'on').length;
  const totalCount = team.length;
  const overloadCount = team.filter((p) => p.tables >= 7).length;
  const totalTables = team.reduce((s, p) => s + (p.status === 'on' ? p.tables : 0), 0);
  const avgLoadNum = inField > 0 ? totalTables / inField : 0;
  const avgLoad = inField > 0 ? avgLoadNum.toFixed(1).replace('.', ',') : '—';

  const META = 5;
  const loadHealth = useMemo(
    () =>
      avgLoadNum === 0
        ? { color: C.faint, sub: '—' }
        : avgLoadNum < META * 0.7
        ? { color: '#1E8C5A', sub: 'FOLGADO' }
        : avgLoadNum < META
        ? { color: C.faint, sub: 'NA META' }
        : { color: '#A12626', sub: 'ACIMA · REALOCAR' },
    [avgLoadNum, C.faint],
  );

  const filtered = team.filter((p) => {
    if (roleFilter !== 'todos' && p.role !== roleFilter) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        <MAppHeader dark={dark} title="Equipe" />

        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
          <MStat
            dark={dark}
            compact
            label="Em campo"
            value={
              <span>
                {inField}
                <span style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>/{totalCount}</span>
              </span>
            }
            sub={totalCount - inField > 0 ? `${totalCount - inField} fora` : 'todos OK'}
            help="Funcionários logados com status 'em turno' agora."
          />
          <MStat
            dark={dark}
            compact
            label="Sobrecarga"
            value={String(overloadCount)}
            sub={overloadCount > 0 ? '↓ realocar' : 'tudo certo'}
            accent={overloadCount > 0 ? '#A12626' : null}
            help="Funcionários com 7+ mesas atendendo simultaneamente."
          />
          <MStat
            dark={dark}
            compact
            label="Carga média"
            value={avgLoad}
            sub={loadHealth.sub}
            subColor={loadHealth.color}
            help="Mesas abertas por funcionário em campo · meta < 5."
          />
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 10,
              background: C.bg,
              color: search ? C.ink : C.faint,
              fontSize: 13,
            }}
          >
            <span aria-hidden>{Icon.search(16)}</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome"
              aria-label="Buscar funcionário"
              style={{
                all: 'unset',
                flex: 1,
                fontFamily: G_FONT,
                fontSize: 13,
                color: C.ink,
              }}
            />
          </label>
        </div>

        <div
          style={{
            padding: '8px 16px 0',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
          }}
        >
          {(['todos', 'Garçom', 'Cozinheiro', 'Bartender', 'Caixa'] as const).map((r) => {
            const active = roleFilter === r;
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.ink : 'transparent',
                  color: active ? C.bg : C.ink,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {r === 'todos' ? 'Todos' : r}
              </button>
            );
          })}
        </div>

        <div
          style={{
            padding: '14px 16px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '28px 20px',
                textAlign: 'center',
                background: C.bg,
                border: `1.5px dashed ${C.borderSoft}`,
                borderRadius: 14,
                color: C.mute,
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              Nenhum funcionário encontrado.
            </div>
          ) : (
            filtered.map((p) => {
              const status =
                p.status === 'off'
                  ? { tone: 'mute' as const, label: 'Folga' }
                  : p.tables >= 7
                  ? { tone: 'danger' as const, label: 'Sobrecarregado' }
                  : p.tables >= 5
                  ? { tone: 'warn' as const, label: 'Carga média' }
                  : { tone: 'success' as const, label: 'Em turno' };
              return (
                <div
                  key={p.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${C.borderSoft}`,
                    background: p.status === 'off' ? C.surface : C.bg,
                    opacity: p.status === 'off' ? 0.78 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MAvatar name={p.name} init={p.init} color={p.color} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.15 }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 500, marginTop: 2 }}>
                        {p.role} · {p.shift}
                      </div>
                    </div>
                    <MPill tone={status.tone} dark={dark}>
                      {status.label}
                    </MPill>
                  </div>

                  {p.status === 'on' && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: `1px dashed ${C.borderSoft}`,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 0,
                      }}
                    >
                      {[
                        { lbl: 'MESAS', val: p.tables || '—' },
                        { lbl: 'RESPOSTA', val: p.callsAvg ? `${p.callsAvg}m` : '—' },
                        { lbl: 'VENDIDO', val: p.sales ? `R$ ${p.sales}` : '—' },
                      ].map((m, i) => (
                        <div
                          key={m.lbl}
                          style={{
                            paddingLeft: i === 0 ? 0 : 12,
                            borderLeft: i === 0 ? 'none' : `1px solid ${C.borderFaint}`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 9.5,
                              color: C.faint,
                              fontWeight: 700,
                              letterSpacing: 0.6,
                              textTransform: 'uppercase',
                            }}
                          >
                            {m.lbl}
                          </div>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              color: C.ink,
                              marginTop: 2,
                              letterSpacing: -0.3,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {m.val}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {p.status === 'on' && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                      <button
                        onClick={() =>
                          setContactTarget({
                            staffId: p.id,
                            name: p.name,
                            init: p.init,
                            color: p.color,
                            role: p.role,
                            contextHint: `${p.tables} mesas`,
                          })
                        }
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          flex: 1,
                          height: 36,
                          padding: '0 12px',
                          borderRadius: 9,
                          background: C.ink,
                          color: C.bg,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: -0.1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        Mensagem
                      </button>
                      <button
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          flex: 1,
                          height: 36,
                          padding: '0 12px',
                          borderRadius: 9,
                          border: `1px solid ${C.borderSoft}`,
                          background: 'transparent',
                          color: C.ink,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: -0.1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        Ver mesas
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <MSection dark={dark} title="Turnos de hoje">
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { id: 'tarde', label: 'TARDE', range: '12H – 17H', count: team.filter((p) => p.shift.startsWith('12:00')).length, status: 'past' as const },
              { id: 'noite', label: 'NOITE', range: '17H – 23H', count: team.filter((p) => p.shift.startsWith('17:00')).length, status: 'now' as const },
              { id: 'enc', label: 'ENCERRAMENTO', range: '23H – 02H', count: 0, status: 'soon' as const },
            ].map((sh) => (
              <div
                key={sh.id}
                style={{
                  padding: '10px 12px',
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  background: C.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: 0.6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sh.label} · {sh.range}
                </div>
                <div style={{ flex: 1, fontSize: 12, color: C.mute, fontWeight: 600 }}>
                  {sh.count} {sh.count === 1 ? 'funcionário' : 'funcionários'}
                </div>
                {sh.status === 'now' && (
                  <MPill tone="success" dot dark={dark}>
                    Atual
                  </MPill>
                )}
              </div>
            ))}
          </div>
        </MSection>
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
