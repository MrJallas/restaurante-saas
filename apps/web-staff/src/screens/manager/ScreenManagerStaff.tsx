'use client';

// Equipe — V11 layout · faithful port of ScreenManagerStaff em
// docs/design-canvas/handoff/garcom/garcom-screens-c.jsx:876.
//
// 8 blocos:
//   1. Hero (MAppHeader saudação + AO VIVO)
//   2. 3 KPIs Compact com `?` tooltip · saúde no CARGA MÉDIA
//   3. Banner sugestão IA (mostarda · CTA "Aplicar sugestão") — oculto quando bannerHidden
//   4. Busca + 2 rows de chips (status + categoria)
//   5. Lista unificada · cards com avatar + status pill + 3 metrics + 2 action pills
//   6. Turnos de hoje · expansível inline
//   7. Próximos eventos do turno
//   8. CTA fixa "+ Adicionar funcionário" sobre o bottom-nav

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
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
import {
  staffRosterApi,
  teamKpisApi,
  zoneAssignmentsApi,
  type TeamKpiEntry,
  type ZoneAssignmentRow,
} from '../../lib/api/manager';

type StaffStatus = 'on' | 'off';

interface StaffMember {
  id: string;
  name: string;
  role: 'Garçom' | 'Cozinheiro' | 'Bartender' | 'Caixa' | 'Recepção';
  init: string;
  shift: string;
  status: StaffStatus;
  /** Chamados atendidos HOJE (waiter_calls acknowledged — fonte real). */
  calls: number;
  /** Tempo médio de resposta em minutos HOJE · null = sem chamados ainda. */
  respMin: number | null;
  rating: number | null;
  ratingsCount: number;
  /** Entregas HOJE (order_deliveries claimed — fonte real). */
  deliveries: number;
  color: string;
}

const M_TEAM_FALLBACK: StaffMember[] = [];

const ROLE_LABEL: Record<string, StaffMember['role']> = {
  waiter: 'Garçom',
  cook: 'Cozinheiro',
  bartender: 'Bartender',
  caixa: 'Caixa',
  recepcao: 'Recepção',
};

const ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];

type ShiftId = 'manha' | 'tarde' | 'noite' | 'enc';
type ShiftStatus = 'past' | 'now' | 'soon';
interface ShiftRow {
  id: ShiftId;
  label: string;
  range: string;
  status: ShiftStatus;
  members: StaffMember[];
}

interface NextEvent {
  time: string;
  txt: string;
  tone: 'success' | 'ink' | 'warn';
}

export interface ScreenManagerStaffProps {
  dark?: boolean;
  tenantSlug: string;
  /** Esconde o banner de sugestão IA — passa true quando não há sugestão. */
  bannerHidden?: boolean;
  /** Lista turnos do dia além dos derivados do roster (overrides). */
  shifts?: ShiftRow[];
  /** Próximos eventos do turno · ex Ricardo P. entra · Garçom às 21:00. */
  nextEvents?: NextEvent[];
  /** Sugestão IA dinâmica · texto rich. Se null, banner segue oculto. */
  iaSuggestion?: { text: ReactNode; cta?: string; onApply?: () => void } | null;
  /** Data do dia (mostra em "Turnos de hoje · 06 mai"). */
  shiftDate?: string;
}

export function ScreenManagerStaff({
  dark,
  tenantSlug,
  bannerHidden = false,
  shifts: shiftsOverride,
  nextEvents: nextEventsOverride,
  iaSuggestion = null,
  shiftDate,
}: ScreenManagerStaffProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const [team, setTeam] = useState<StaffMember[]>(M_TEAM_FALLBACK);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'em_turno' | 'folga' | 'fora'>(
    'todos',
  );
  const [roleFilter, setRoleFilter] = useState<'todos' | StaffMember['role'] | 'cozinha+bar'>(
    'todos',
  );
  const [openShift, setOpenShift] = useState<ShiftId | null>(null);
  const [contactTarget, setContactTarget] = useState<ManagerStaffTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // KPIs por funcionário vêm do dashboard/team-kpis (fonte real:
        // waiter_calls + order_deliveries de HOJE). Se o endpoint falhar,
        // as métricas ficam zeradas/'—' — nunca número inventado ao lado
        // de nome real.
        const [data, kpisRes] = await Promise.all([
          staffRosterApi(tenantSlug).list(),
          teamKpisApi(tenantSlug)
            .get()
            .catch(() => ({ team: [] as TeamKpiEntry[] })),
        ]);
        if (cancelled || !data.length) return;
        const kpiById = new Map(kpisRes.team.map((k) => [k.staffId, k]));
        setTeam(
          data.map((s, i) => {
            const kpi = kpiById.get(s.id);
            return {
              id: s.id,
              name: s.name,
              role: ROLE_LABEL[s.role] ?? (s.role as StaffMember['role']) ?? 'Garçom',
              init: s.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase(),
              shift: s.default_shift ?? '',
              status: s.is_active ? 'on' : 'off',
              calls: kpi?.callsAcknowledged ?? 0,
              respMin: kpi?.avgResponseMinutes ?? null,
              rating: kpi?.avgRating ?? null,
              ratingsCount: kpi?.ratingsCount ?? 0,
              deliveries: kpi?.deliveries ?? 0,
              color: ROLE_PALETTE[i % ROLE_PALETTE.length],
            };
          }),
        );
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // ─── Zonas de hoje (decisão Caleb 2026-07-04) ───────────────────
  // Fonte REAL da carga por garçom: atribuição explícita garçom→zona
  // do dia + mesas ocupadas por zona (table_sessions ativas). Alimenta
  // a seção "Zonas de hoje" e os tiles Sobrecarga / Carga média.
  const [zones, setZones] = useState<ZoneAssignmentRow[] | null>(null);
  const [zonesLoadError, setZonesLoadError] = useState(false);
  const [zonesActionError, setZonesActionError] = useState<string | null>(null);
  const [selectedByZone, setSelectedByZone] = useState<Record<string, string>>({});

  const loadZones = useCallback(async () => {
    try {
      const res = await zoneAssignmentsApi(tenantSlug).list();
      setZones(res.zones);
      setZonesLoadError(false);
    } catch {
      // Erro visível na seção (anti-placebo) — nunca lista fabricada.
      setZonesLoadError(true);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  const handleAssignZone = async (zoneId: string) => {
    const staffId = selectedByZone[zoneId];
    const waiter = team.find((p) => p.id === staffId);
    if (!staffId || !waiter || !zones) return;
    // Otimista: chip entra na hora (translúcido enquanto pendente);
    // rollback + erro visível se o POST falhar.
    const tempId = `temp-${zoneId}-${Date.now()}`;
    setZonesActionError(null);
    setZones((prev) =>
      prev
        ? prev.map((z) =>
            z.zoneId === zoneId
              ? {
                  ...z,
                  waiters: [...z.waiters, { assignmentId: tempId, staffId, name: waiter.name }],
                }
              : z,
          )
        : prev,
    );
    setSelectedByZone((prev) => ({ ...prev, [zoneId]: '' }));
    try {
      const { assignmentId } = await zoneAssignmentsApi(tenantSlug).assign({ staffId, zoneId });
      setZones((prev) =>
        prev
          ? prev.map((z) =>
              z.zoneId === zoneId
                ? {
                    ...z,
                    waiters: z.waiters.map((a) =>
                      a.assignmentId === tempId ? { ...a, assignmentId } : a,
                    ),
                  }
                : z,
            )
          : prev,
      );
    } catch (e) {
      setZones((prev) =>
        prev
          ? prev.map((z) =>
              z.zoneId === zoneId
                ? { ...z, waiters: z.waiters.filter((a) => a.assignmentId !== tempId) }
                : z,
            )
          : prev,
      );
      setZonesActionError(
        e instanceof Error && e.message
          ? e.message
          : `Não deu pra atribuir ${waiter.name}. Tente de novo.`,
      );
    }
  };

  const handleRemoveAssignment = async (zoneId: string, assignmentId: string) => {
    if (!zones || assignmentId.startsWith('temp-')) return;
    // Otimista: chip some na hora; rollback + erro visível se o DELETE falhar.
    const snapshot = zones;
    setZonesActionError(null);
    setZones((prev) =>
      prev
        ? prev.map((z) =>
            z.zoneId === zoneId
              ? { ...z, waiters: z.waiters.filter((a) => a.assignmentId !== assignmentId) }
              : z,
          )
        : prev,
    );
    try {
      await zoneAssignmentsApi(tenantSlug).remove(assignmentId);
    } catch (e) {
      setZones(snapshot);
      setZonesActionError(
        e instanceof Error && e.message ? e.message : 'Não deu pra remover. Tente de novo.',
      );
    }
  };

  // Carga real por garçom atribuído hoje: soma das mesas ocupadas /
  // total das zonas dele. Base dos tiles Sobrecarga (≥ 80% de ocupação)
  // e Carga média (mesas ocupadas por garçom atribuído).
  const assignedLoads = useMemo(() => {
    if (!zones) return [];
    const byStaff = new Map<string, { name: string; occupied: number; total: number }>();
    for (const z of zones) {
      for (const w of z.waiters) {
        const cur = byStaff.get(w.staffId) ?? { name: w.name, occupied: 0, total: 0 };
        cur.occupied += z.occupiedTables;
        cur.total += z.totalTables;
        byStaff.set(w.staffId, cur);
      }
    }
    return Array.from(byStaff.values());
  }, [zones]);
  const overloadedCount = assignedLoads.filter(
    (w) => w.total > 0 && w.occupied / w.total >= 0.8,
  ).length;
  const avgLoad =
    assignedLoads.length > 0
      ? assignedLoads.reduce((acc, w) => acc + w.occupied, 0) / assignedLoads.length
      : null;
  const loadTileSub = zonesLoadError
    ? 'erro ao carregar'
    : zones === null
      ? 'carregando…'
      : assignedLoads.length === 0
        ? 'sem atribuições hoje'
        : null;

  // ─── Stats agregados ────────────────────────────────────────────
  // "Em campo" vem do roster ativo. Sobrecarga e Carga média vêm das
  // atribuições de zona de HOJE (zone-assignments) — sem garçom
  // atribuído mostram '—' com "sem atribuições hoje" (anti-placebo),
  // nunca número fabricado.
  const inField = team.filter((p) => p.status === 'on').length;
  const totalCount = team.length;

  // ─── Filtragem ──────────────────────────────────────────────────
  const filtered = team.filter((p) => {
    if (statusFilter === 'em_turno' && p.status !== 'on') return false;
    if (statusFilter === 'folga' && p.status !== 'off') return false;
    if (statusFilter === 'fora' && p.status === 'on') return false;
    if (roleFilter !== 'todos') {
      if (roleFilter === 'cozinha+bar') {
        if (p.role !== 'Cozinheiro' && p.role !== 'Bartender') return false;
      } else if (p.role !== roleFilter) return false;
    }
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });
  const isEmptyResult =
    filtered.length === 0 &&
    (search.trim() !== '' || statusFilter !== 'todos' || roleFilter !== 'todos');

  // ─── Turnos do dia ──────────────────────────────────────────────
  // Membership real via `default_shift` do roster (Manhã/Tarde/Noite).
  // "Atual" vem do relógio real, calculado pós-mount (SSR-safe — evita
  // hydration mismatch server UTC vs client Brasília).
  const [hourNow, setHourNow] = useState<number | null>(null);
  useEffect(() => {
    setHourNow(new Date().getHours());
  }, []);
  const statusFor = (start: number, end: number): ShiftStatus => {
    if (hourNow == null) return 'soon';
    if (hourNow >= start && hourNow < end) return 'now';
    return hourNow >= end ? 'past' : 'soon';
  };
  const derivedShifts: ShiftRow[] = [
    {
      id: 'manha',
      label: 'MANHÃ',
      range: 'ATÉ 12H',
      status: statusFor(0, 12),
      members: team.filter((p) => p.shift === 'Manhã'),
    },
    {
      id: 'tarde',
      label: 'TARDE',
      range: '12H – 17H',
      status: statusFor(12, 17),
      members: team.filter((p) => p.shift === 'Tarde'),
    },
    {
      id: 'noite',
      label: 'NOITE',
      range: '17H – 23H',
      status: statusFor(17, 24),
      members: team.filter((p) => p.shift === 'Noite'),
    },
  ];
  const shifts = shiftsOverride ?? derivedShifts;
  const nextEvents = nextEventsOverride ?? [];

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          paddingBottom: 'calc(140px + max(0px, env(safe-area-inset-bottom, 0px) - 14px))',
        }}
      >
        <MAppHeader dark={dark} title="Equipe" />

        {/* 2 · 3 KPIs Compact — Round 18 Onda 4: tap navega pro drill-down V9.
            Cada MStat agora vive dentro de um <button> resetado pra preservar
            visual + tornar o tile clicável. O `?` tooltip vira `onHelp` que
            também navega (mesmo destino) — antes era só tooltip. */}
        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
          <StatButton onClick={() => router.push('/manager/equipe/em-campo')}>
            <MStat
              dark={dark}
              compact
              label="Em campo"
              value={
                <span>
                  {inField}
                  <span style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>
                    /{totalCount}
                  </span>
                </span>
              }
              sub={totalCount - inField > 0 ? `${totalCount - inField} fora` : 'todos OK'}
              help="Funcionários logados com status 'em turno' agora · não inclui pausados ou fora."
              onHelp={() => router.push('/manager/equipe/em-campo')}
            />
          </StatButton>
          <StatButton onClick={() => router.push('/manager/equipe/sobrecarga')}>
            <MStat
              dark={dark}
              compact
              label="Sobrecarga"
              value={loadTileSub ? '—' : String(overloadedCount)}
              accent={!loadTileSub && overloadedCount > 0 ? '#A12626' : undefined}
              sub={loadTileSub ?? (overloadedCount > 0 ? 'realocar' : 'tudo certo')}
              help="Garçons atribuídos a zonas hoje com 80%+ das mesas dessas zonas ocupadas · atribua na seção Zonas de hoje."
              onHelp={() => router.push('/manager/equipe/sobrecarga')}
            />
          </StatButton>
          <StatButton onClick={() => router.push('/manager/equipe/carga-media')}>
            <MStat
              dark={dark}
              compact
              label="Carga média"
              value={loadTileSub || avgLoad == null ? '—' : avgLoad.toFixed(1).replace('.', ',')}
              sub={loadTileSub ?? 'mesas/garçom'}
              help="Mesas ocupadas das zonas atribuídas divididas pelos garçons atribuídos hoje · atribua na seção Zonas de hoje."
              onHelp={() => router.push('/manager/equipe/carga-media')}
            />
          </StatButton>
        </div>

        {/* 3 · Banner sugestão IA · oculto quando bannerHidden ou null */}
        {!bannerHidden && iaSuggestion?.text && (
          <div style={{ padding: '12px 16px 0' }}>
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
                {Icon.flame(14)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#1d1c19', lineHeight: 1.4, fontWeight: 500 }}>
                  {iaSuggestion.text}
                </div>
                <button
                  type="button"
                  onClick={iaSuggestion.onApply}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    marginTop: 8,
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: C.ink,
                    color: C.bg,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: -0.1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {iaSuggestion.cta ?? 'Aplicar sugestão'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4 · Busca + 2 rows de chips (status + categoria) */}
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
              placeholder="Buscar por nome ou CPF"
              aria-label="Buscar funcionário"
              style={{ all: 'unset', flex: 1, fontFamily: G_FONT, fontSize: 13, color: C.ink }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: C.faint,
                  fontWeight: 600,
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            )}
          </label>
        </div>

        <div style={{ padding: '8px 16px 0' }}>
          <ChipRow
            dark={dark}
            items={[
              { id: 'todos', label: 'Todos', count: totalCount, active: statusFilter === 'todos' },
              {
                id: 'em_turno',
                label: 'Em turno',
                count: inField,
                active: statusFilter === 'em_turno',
              },
              {
                id: 'folga',
                label: 'Folga',
                count: team.filter((p) => p.status === 'off').length,
                active: statusFilter === 'folga',
              },
              {
                id: 'fora',
                label: 'Fora',
                count: totalCount - inField,
                active: statusFilter === 'fora',
              },
            ]}
            onClick={(id) => setStatusFilter(id as 'todos' | 'em_turno' | 'folga' | 'fora')}
          />
          <div style={{ height: 6 }} />
          <ChipRow
            dark={dark}
            items={[
              { id: 'todos', label: 'Todos', active: roleFilter === 'todos' },
              {
                id: 'Garçom',
                label: 'Garçons',
                count: team.filter((p) => p.role === 'Garçom').length,
                active: roleFilter === 'Garçom',
              },
              {
                id: 'cozinha+bar',
                label: 'Cozinha+Bar',
                count: team.filter((p) => p.role === 'Cozinheiro' || p.role === 'Bartender').length,
                active: roleFilter === 'cozinha+bar',
              },
              {
                id: 'Caixa',
                label: 'Caixa',
                count: team.filter((p) => p.role === 'Caixa').length,
                active: roleFilter === 'Caixa',
              },
            ]}
            onClick={(id) => setRoleFilter(id as 'todos' | StaffMember['role'] | 'cozinha+bar')}
          />
        </div>

        {/* 5 · Lista de funcionários (ou empty state) */}
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isEmptyResult ? (
            <div
              style={{
                padding: '28px 20px',
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
                Nenhum funcionário encontrado
              </div>
              <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 6 }}>
                Tente outro nome ou{' '}
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('todos');
                    setRoleFilter('todos');
                  }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    color: C.ink,
                    textDecoration: 'underline',
                    fontWeight: 700,
                  }}
                >
                  limpar busca
                </button>
                .
              </div>
            </div>
          ) : filtered.length === 0 ? (
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
              Nenhum funcionário cadastrado.
            </div>
          ) : (
            filtered.map((p) => (
              <StaffCard key={p.id} dark={dark} p={p} onContact={(t) => setContactTarget(t)} />
            ))
          )}
        </div>

        {/* 5b · Zonas de hoje — atribuição garçom→zona (decisão Caleb
            2026-07-04). Carga REAL por zona (mesas ocupadas/total via
            table_sessions), chips com × (DELETE otimista + rollback) e
            select+Atribuir (POST otimista + rollback). Erros visíveis. */}
        <MSection
          dark={dark}
          title="Zonas de hoje"
          sub="Garçons por zona · a carga vem das mesas ocupadas agora."
        >
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {zonesLoadError ? (
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
                <span style={{ flex: 1 }}>Não deu pra carregar as zonas de hoje.</span>
                <button
                  type="button"
                  onClick={() => void loadZones()}
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
            ) : zones === null ? (
              <div
                style={{
                  padding: '16px 14px',
                  borderRadius: 12,
                  border: `1px solid ${C.borderSoft}`,
                  background: C.bg,
                  fontSize: 12.5,
                  color: C.faint,
                  fontWeight: 500,
                }}
              >
                Carregando zonas…
              </div>
            ) : zones.length === 0 ? (
              <div
                style={{
                  padding: '20px 16px',
                  textAlign: 'center',
                  background: C.bg,
                  border: `1.5px dashed ${C.borderSoft}`,
                  borderRadius: 14,
                  color: C.mute,
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                Nenhuma zona ativa cadastrada.
              </div>
            ) : (
              zones.map((z) => (
                <ZoneAssignCard
                  key={z.zoneId}
                  dark={dark}
                  zone={z}
                  waiterOptions={team
                    .filter((p) => p.role === 'Garçom' && p.status === 'on')
                    .map((p) => ({ id: p.id, name: p.name }))}
                  selected={selectedByZone[z.zoneId] ?? ''}
                  onSelect={(staffId) =>
                    setSelectedByZone((prev) => ({ ...prev, [z.zoneId]: staffId }))
                  }
                  onAssign={() => void handleAssignZone(z.zoneId)}
                  onRemove={(assignmentId) => void handleRemoveAssignment(z.zoneId, assignmentId)}
                />
              ))
            )}
            {zonesActionError && (
              <div
                role="alert"
                style={{ fontSize: 12, color: '#A12626', fontWeight: 600, padding: '2px 2px 0' }}
              >
                {zonesActionError}
              </div>
            )}
          </div>
        </MSection>

        {/* 6 · Turnos de hoje · expansível inline */}
        <MSection
          dark={dark}
          title={`Turnos de hoje${shiftDate ? ` · ${shiftDate}` : ''}`}
          action="Editar turnos →"
          onAction={() => router.push('/manager/equipe/turnos')}
        >
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shifts.map((sh) => {
              const isOpen = openShift === sh.id;
              return (
                <div key={sh.id}>
                  <button
                    type="button"
                    onClick={() => setOpenShift(isOpen ? null : sh.id)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: isOpen ? '12px 12px 0 0' : 12,
                      borderBottom: isOpen
                        ? `1px dashed ${C.borderSoft}`
                        : `1px solid ${C.borderSoft}`,
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
                        fontFamily: MONO_FONT,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {sh.label} · {sh.range}
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: C.mute, fontWeight: 600 }}>
                      {sh.members.length} {sh.members.length === 1 ? 'funcionário' : 'funcionários'}
                    </div>
                    {sh.status === 'now' && (
                      <MPill tone="success" dot dark={dark}>
                        Atual
                      </MPill>
                    )}
                    <span
                      style={{
                        color: C.faint,
                        opacity: 0.7,
                        transform: isOpen ? 'rotate(90deg)' : 'none',
                        transition: 'transform 120ms ease',
                      }}
                    >
                      {Icon.arrow(14)}
                    </span>
                  </button>
                  {isOpen && (
                    <div
                      style={{
                        padding: '10px 12px',
                        border: `1px solid ${C.borderSoft}`,
                        borderTop: 'none',
                        borderRadius: '0 0 12px 12px',
                        background: C.bg,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {sh.members.length === 0 ? (
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 500 }}>
                          Ninguém escalado pra esse turno.
                        </div>
                      ) : (
                        sh.members.map((m) => (
                          <div
                            key={m.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                          >
                            <MAvatar name={m.name} init={m.init} color={m.color} size={28} />
                            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>
                              {m.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: C.faint,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                textTransform: 'uppercase',
                                fontFamily: MONO_FONT,
                              }}
                            >
                              {m.role}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </MSection>

        {/* 7 · Próximos eventos do turno (oculto quando vazio) */}
        {nextEvents.length > 0 && (
          <MSection dark={dark} title="Próximos eventos do turno">
            <div
              style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {nextEvents.map((e, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `1px solid ${C.borderSoft}`,
                    background: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color:
                        e.tone === 'success' ? '#1E8C5A' : e.tone === 'warn' ? '#9A7212' : C.ink,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: 0.2,
                      minWidth: 44,
                      fontFamily: MONO_FONT,
                    }}
                  >
                    {e.time}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: C.ink,
                      fontWeight: 600,
                      letterSpacing: -0.1,
                    }}
                  >
                    {e.txt}
                  </div>
                </div>
              ))}
            </div>
          </MSection>
        )}
      </div>

      {/* 8 · CTA fixa "+ Adicionar funcionário" — sobre o bottom-nav.
          Wrapper vai até `bottom: 0` (debaixo do nav). O nav tem z-index 4
          e cobre a porção sob ele, então a blur visualmente termina
          EXATAMENTE no topo do nav, sem gap.
          `paddingBottom` soma a altura do nav (76px em macOS, ~96 em iOS
          via env) + 16px de respiro pra posicionar o botão logo acima do
          nav. Halo blur full-width com fade-in vertical suave em cima e
          blur denso na base do botão pra cobrir o respiro até o nav. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 40,
          paddingBottom: 'calc(92px + max(0px, env(safe-area-inset-bottom, 0px) - 14px))',
          paddingLeft: 16,
          paddingRight: 16,
          pointerEvents: 'none',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            maskImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 14%, rgba(0,0,0,0.7) 28%, black 45%, black 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 14%, rgba(0,0,0,0.7) 28%, black 45%, black 100%)',
            pointerEvents: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => router.push('/manager/equipe/novo')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box',
            padding: '14px 16px',
            background: C.ink,
            color: C.bg,
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: -0.1,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            position: 'relative',
          }}
        >
          {Icon.plus(18)} Adicionar funcionário
        </button>
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

// ─── StatButton — wraps MStat pra virar nav target.
// USA `div role="button"` em vez de `<button>` porque o MStat interno
// já contém um `<button>` (o ícone `?` de help tooltip), e nesting de
// button dentro de button é HTML inválido + causa hydration error.
// Keyboard handler dá Enter/Space pra a11y, igual a um `<button>` nativo.
function StatButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        cursor: 'pointer',
        flex: 1,
        display: 'flex',
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

// ─── ZoneAssignCard — 1 zona · carga real + chips de garçons + add ─
// Chips com × removem via DELETE otimista (rollback no pai). O select
// só lista garçons ativos ainda não atribuídos à zona; "Atribuir" faz
// POST otimista (chip pendente fica translúcido até o id real chegar).
function ZoneAssignCard({
  zone,
  waiterOptions,
  selected,
  onSelect,
  onAssign,
  onRemove,
  dark,
}: {
  zone: ZoneAssignmentRow;
  waiterOptions: { id: string; name: string }[];
  selected: string;
  onSelect: (staffId: string) => void;
  onAssign: () => void;
  onRemove: (assignmentId: string) => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  const hot = zone.totalTables > 0 && zone.occupiedTables / zone.totalTables >= 0.8;
  const assignedIds = new Set(zone.waiters.map((w) => w.staffId));
  const options = waiterOptions.filter((w) => !assignedIds.has(w.id));
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14.5,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: -0.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {zone.zoneName}
        </div>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            color: hot ? '#A12626' : C.ink,
            fontFamily: MONO_FONT,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.2,
            whiteSpace: 'nowrap',
          }}
        >
          {zone.occupiedTables}/{zone.totalTables}{' '}
          <span style={{ color: C.faint, fontWeight: 700, fontSize: 9.5, letterSpacing: 0.5 }}>
            OCUPADAS
          </span>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {zone.waiters.length === 0 ? (
          <div style={{ fontSize: 12, color: C.faint, fontWeight: 500 }}>
            Nenhum garçom atribuído.
          </div>
        ) : (
          zone.waiters.map((w) => {
            const pending = w.assignmentId.startsWith('temp-');
            return (
              <span
                key={w.assignmentId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 6px 5px 10px',
                  borderRadius: 999,
                  border: `1px solid ${C.borderSoft}`,
                  background: C.surface,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.ink,
                  opacity: pending ? 0.55 : 1,
                }}
              >
                {w.name}
                <button
                  type="button"
                  onClick={() => onRemove(w.assignmentId)}
                  disabled={pending}
                  aria-label={`Remover ${w.name} da zona ${zone.zoneName}`}
                  style={{
                    all: 'unset',
                    cursor: pending ? 'default' : 'pointer',
                    boxSizing: 'border-box',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: C.faint,
                    background: C.bg,
                    border: `1px solid ${C.borderFaint}`,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          aria-label={`Escolher garçom pra zona ${zone.zoneName}`}
          style={{
            flex: 1,
            minWidth: 0,
            boxSizing: 'border-box',
            height: 34,
            padding: '0 10px',
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            background: C.bg,
            color: selected ? C.ink : C.faint,
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: G_FONT,
          }}
        >
          <option value="">
            {options.length === 0 ? 'Sem garçons disponíveis' : 'Escolher garçom…'}
          </option>
          {options.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAssign}
          disabled={!selected}
          style={{
            all: 'unset',
            cursor: selected ? 'pointer' : 'default',
            boxSizing: 'border-box',
            height: 34,
            padding: '0 14px',
            borderRadius: 10,
            background: selected ? C.ink : C.surface,
            color: selected ? C.bg : C.faint,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: -0.1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Atribuir
        </button>
      </div>
    </div>
  );
}

// ─── ChipRow — 2 rows usadas pra status + categoria ──────────────
function ChipRow({
  items,
  onClick,
  dark,
}: {
  items: { id: string; label: string; count?: number; active?: boolean }[];
  onClick?: (id: string) => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <div
      data-hide-scrollbar
      style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onClick?.(it.id)}
          style={{
            all: 'unset',
            cursor: onClick ? 'pointer' : 'default',
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${it.active ? C.ink : C.borderSoft}`,
            background: it.active ? C.ink : 'transparent',
            color: it.active ? C.bg : C.ink,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {it.label}
          {it.count != null && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: it.active ? C.bg : C.faint,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: 0.2,
              }}
            >
              · {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── StaffCard — header + métricas + 2 actions condicionais ──────
function StaffCard({
  p,
  onContact,
  dark,
}: {
  p: StaffMember;
  onContact: (t: ManagerStaffTarget) => void;
  dark?: boolean;
}) {
  const router = useRouter();
  const C = useG(!!dark);
  // Sem fonte de mesas-por-garçom não dá pra afirmar sobrecarga —
  // status honesto é só Em turno / Folga.
  const status =
    p.status === 'off'
      ? { id: 'folga' as const, tone: 'mute' as const, label: 'Folga' }
      : { id: 'ok' as const, tone: 'success' as const, label: 'Em turno' };

  // Round 18 (Onda 2): clique no card abre StaffDetail. Antes o card
  // era render-only.
  const openDetail = () => {
    const search = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const slug = search.get('slug') ?? '';
    router.push(`/manager/equipe/${p.id}${slug ? `?slug=${slug}` : ''}`);
  };
  const withSlug = (path: string) => {
    const search = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const slug = search.get('slug');
    return slug ? `${path}?slug=${slug}` : path;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail();
        }
      }}
      style={{
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: status.id === 'folga' ? C.surface : C.bg,
        opacity: status.id === 'folga' ? 0.78 : 1,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MAvatar name={p.name} init={p.init} color={p.color} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.ink,
              letterSpacing: -0.15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {p.name}
          </div>
          <div style={{ fontSize: 12, color: C.faint, fontWeight: 500, marginTop: 2 }}>
            {p.role}
            {p.shift ? ` · ${p.shift}` : ''}
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
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0,
          }}
        >
          {[
            // Só métricas com fonte real (dashboard/team-kpis · HOJE).
            // Rating e vendas por garçom saíram — sem fonte, sem número.
            { lbl: 'CHAMADOS HOJE', val: String(p.calls) },
            {
              lbl: 'RESPOSTA',
              val: p.respMin != null ? `${p.respMin.toFixed(1).replace('.', ',')}m` : '—',
            },
            { lbl: 'ENTREGAS HOJE', val: String(p.deliveries) },
            {
              // Decisão Caleb 2026-07-04: nota do pedido conta pro garçom
              // que ENTREGOU (últimos 7 dias). Sem avaliação, '—'.
              lbl: 'NOTA 7D',
              val:
                p.rating != null
                  ? `★ ${p.rating.toFixed(1).replace('.', ',')} (${p.ratingsCount})`
                  : '—',
            },
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
                  fontFamily: MONO_FONT,
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
          <ActionPill
            dark={dark}
            onClick={() => router.push(withSlug('/manager/operacoes/mesas-ativas'))}
          >
            Ver mesas
          </ActionPill>
          <ActionPill
            dark={dark}
            onClick={() =>
              onContact({
                staffId: p.id,
                name: p.name,
                init: p.init,
                color: p.color,
                role: p.role,
                contextHint:
                  p.calls > 0
                    ? `${p.calls} ${p.calls === 1 ? 'chamado atendido' : 'chamados atendidos'} hoje`
                    : undefined,
              })
            }
          >
            Mensagem direta
          </ActionPill>
        </div>
      )}
    </div>
  );
}

// ─── ActionPill — 36px full-width usado nas 2 actions de cada card.
function ActionPill({
  filled,
  children,
  onClick,
  dark,
}: {
  filled?: boolean;
  children: ReactNode;
  onClick?: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        flex: 1,
        height: 36,
        padding: '0 12px',
        borderRadius: 9,
        border: filled ? 'none' : `1px solid ${C.borderSoft}`,
        background: filled ? C.ink : 'transparent',
        color: filled ? C.bg : C.ink,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: -0.1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}
