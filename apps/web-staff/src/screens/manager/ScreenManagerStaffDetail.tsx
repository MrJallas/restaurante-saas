'use client';

// ScreenManagerStaffDetail — canvas garcom-screens-d.jsx:34.
//
// Drill-down do funcionário: hero (avatar + nome + role + flag),
// time-window chips, 4 KPIs com help-text, gráfico 7 dias, comparativo
// equipe, CTA "Editar funcionário" → /manager/equipe/[id]/editar.
//
// Dados reais: GET /staff/:id pra nome/role/cpf/email/phone (round 18
// migration 041 expandiu).
//
// Métricas (KPIs + chart + comparativo): mock por enquanto. Backend de
// performance metrics fica pra Onda 4 (precisa agregar orders/calls/
// ratings por staff_id × periodo). Marcado com TODO claro no UI.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  MAvatar,
  MPill,
  MSection,
  MStat,
  GButton,
  GIconBtn,
  MBottomNav,
  Icon,
} from '../../components/manager';
import { manager, type StaffRosterEntry } from '../../lib/api/manager';

const STAFF_COLORS = [
  '#4F6BFF', '#E37D2F', '#7A4FBE', '#C43A3A', '#0B7A8B',
  '#5B7CD9', '#D9595B', '#3E8C72', '#9A4FBE', '#1E8C5A',
];
function staffColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return STAFF_COLORS[Math.abs(h) % STAFF_COLORS.length];
}
function staffInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
function roleLabel(role: string): string {
  const map: Record<string, string> = {
    waiter: 'Garçom',
    cook: 'Cozinheiro',
    bartender: 'Bartender',
    cashier: 'Caixa',
    manager: 'Gerente',
    host: 'Recepcionista',
  };
  return map[role] ?? role;
}

type Window = 'today' | '7d' | '30d';

export interface ScreenManagerStaffDetailProps {
  dark?: boolean;
  staffId: string;
  tenantSlug?: string;
}

export function ScreenManagerStaffDetail({
  dark = false,
  staffId,
  tenantSlug,
}: ScreenManagerStaffDetailProps) {
  const C = useG(dark);
  const router = useRouter();
  const slug =
    tenantSlug ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('slug') ?? undefined
      : undefined) ??
    process.env.NEXT_PUBLIC_TENANT_SLUG ??
    'demo';

  const [staff, setStaff] = useState<StaffRosterEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeWindow, setActiveWindow] = useState<Window>('7d');
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const showStub = (m: string) => {
    setStubMsg(`${m} · em desenvolvimento (Onda 4 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    manager(slug)
      .staffRoster.list()
      .then((rows) => {
        if (cancelled) return;
        const found = rows.find((r) => r.id === staffId);
        if (!found) {
          setErrorMsg('Funcionário não encontrado.');
        } else {
          setStaff(found);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg((e as Error).message || 'Erro ao carregar dados.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, staffId]);

  // Mock weekly data (canvas exemplo). TODO Onda 4 backend.
  const days = [
    { d: 'Seg', v: 1240 },
    { d: 'Ter', v: 1380 },
    { d: 'Qua', v: 980 },
    { d: 'Qui', v: 1620 },
    { d: 'Sex', v: 1840 },
    { d: 'Sáb', v: 2100 },
    { d: 'Dom', v: 1520 },
  ];
  const maxV = Math.max(...days.map((d) => d.v));

  const goEdit = () => router.push(`/manager/equipe/${staffId}/editar?slug=${slug}`);
  const goBack = () => router.push('/manager/equipe');

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
        title="Desempenho"
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={goBack} ariaLabel="Voltar" />}
        right={<GIconBtn dark={dark} icon={Icon.more(20)} onClick={() => showStub('Mais ações')} ariaLabel="Mais ações" />}
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.faint }}>Carregando…</div>
        ) : errorMsg || !staff ? (
          <div
            role="alert"
            style={{
              margin: '14px 16px',
              padding: 14,
              borderRadius: 12,
              background: '#FFF1F1',
              border: '1px solid #F4C7C7',
              color: '#A12626',
              fontSize: 13,
            }}
          >
            {errorMsg ?? 'Funcionário não encontrado.'}
          </div>
        ) : (
          <>
            {/* Hero */}
            <div
              style={{
                padding: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                borderBottom: `1px solid ${C.borderSoft}`,
                background: C.bg,
              }}
            >
              <MAvatar
                name={staff.name}
                init={staffInitials(staff.name)}
                color={staffColor(staff.id)}
                size={56}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{staff.name}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 2, fontWeight: 500 }}>
                  {roleLabel(staff.role)}
                  {staff.default_shift ? ` · turno ${staff.default_shift.toLowerCase()}` : ''}
                </div>
                {staff.is_active ? (
                  <div style={{ marginTop: 6 }}>
                    <MPill tone="success" dot dark={dark}>
                      Ativo
                    </MPill>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <MPill tone="warn" dark={dark}>Inativo</MPill>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: -0.4,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ★ 4,7
                </div>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>
                  mock · roadmap
                </div>
              </div>
            </div>

            {/* Time window chips */}
            <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6 }}>
              {(['today', '7d', '30d'] as Window[]).map((w) => {
                const active = w === activeWindow;
                const label = w === 'today' ? 'Hoje' : w === '7d' ? '7 dias' : '30 dias';
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setActiveWindow(w)}
                    aria-pressed={active}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      flex: 1,
                      textAlign: 'center',
                      padding: '8px',
                      borderRadius: 8,
                      border: `1px solid ${active ? C.ink : C.borderSoft}`,
                      background: active ? C.ink : 'transparent',
                      color: active ? C.bg : C.ink,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* KPIs */}
            <div
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <MStat
                  dark={dark}
                  label="Vendas no turno"
                  value="R$ 1.520"
                  sub="+8% vs média"
                  trend={{ dir: 'up' }}
                  help="Total que vendeu desde que entrou hoje."
                />
                <MStat
                  dark={dark}
                  label="Mesas atendidas"
                  value="6"
                  sub="média 5,2"
                  trend={{ dir: 'up' }}
                  help="Mesas que passaram por ele/ela neste turno."
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <MStat
                  dark={dark}
                  label="Tempo de resposta"
                  value="1m 48s"
                  sub="meta 2 min"
                  trend={{ dir: 'up' }}
                  help="Quanto demora pra ir na mesa quando o cliente chama."
                />
                <MStat
                  dark={dark}
                  label="Chamados escalados"
                  value="1"
                  sub="vs equipe 0,8"
                  trend={{ dir: 'down' }}
                  accent="#C43A3A"
                  help="Vezes que outro precisou cobrir por ele/ela."
                />
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: C.faint,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  fontFamily: MONO_FONT,
                }}
              >
                Métricas mock · backend de performance vem na Onda 4.
              </div>
            </div>

            {/* Sales chart */}
            <MSection dark={dark} title="Vendas · últimos 7 dias">
              <div style={{ padding: '0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
                  {days.map((d, i) => (
                    <div
                      key={d.d}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          width: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            height: `${(d.v / maxV) * 100}%`,
                            background:
                              i === days.length - 1
                                ? C.ink
                                : i === days.length - 2
                                ? '#888'
                                : '#d8d2c5',
                            borderRadius: '4px 4px 0 0',
                            minHeight: 6,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{d.d}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 8, fontWeight: 500 }}>
                  Total · R$ 10.680 · ticket médio R$ 138 · pico no sábado
                </div>
              </div>
            </MSection>

            {/* Comparativo equipe */}
            <MSection dark={dark} title="Comparativo · equipe da noite">
              <div
                style={{
                  padding: '0 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {[
                  { lbl: 'Tempo de resposta', mine: '1m 48s', team: '2m 10s', good: true },
                  { lbl: 'Ticket médio', mine: 'R$ 138', team: 'R$ 124', good: true },
                  { lbl: 'Chamados escalados', mine: '1', team: '0,8', good: false },
                  { lbl: 'Avaliação', mine: '★ 4,6', team: '★ 4,5', good: true },
                ].map((row) => (
                  <div
                    key={row.lbl}
                    style={{
                      padding: 12,
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: 10,
                      background: C.bg,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{row.lbl}</div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: row.good ? '#1E8C5A' : '#C43A3A',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.mine}
                      </div>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>
                        equipe {row.team}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </MSection>
          </>
        )}
      </div>

      {/* Round 18 sticky-footer fix (audit P0): "Editar funcionário" CTA
          fora do scroll container · sempre visível. */}
      {staff && (
        <div
          style={{
            padding: '12px 16px 18px',
            background: C.bg,
            borderTop: `1px solid ${C.borderSoft}`,
            flexShrink: 0,
          }}
        >
          <GButton dark={dark} full kind="primary" onClick={goEdit}>
            Editar funcionário
          </GButton>
        </div>
      )}

      <MBottomNav active="staff" dark={dark} onTo={(r) => router.push(r)} />

      {stubMsg && (
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
          {stubMsg}
        </div>
      )}
    </div>
  );
}
