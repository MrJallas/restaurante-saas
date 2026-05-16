'use client';

// ScreenManagerShiftEditor — V8 canon (canvas garcom-screens-c.jsx:1351).
//
// Pareou com link em `ScreenManagerStaff` (Equipe > Editar turnos) que
// ate round 17 caia em 404 — `/manager/equipe/turnos` simplesmente nao
// existia.
//
// Layout V8:
//   • MTopBar "Editar turnos" + back + right CTA "+ Novo turno"
//   • Dirty banner (mostarda) quando ha mudancas pendentes
//   • Date eyebrow MONO ("Quarta-feira · 06 mai")
//   • 3 ShiftCards collapsible (manha 06-12 / tarde 12-17 / noite 17-23):
//       - eyebrow MONO "MANHÃ · 06H – 12H"
//       - sub-line "X funcionarios · contagem por role"
//       - pill "Atual" (success tone) no turno corrente
//       - chevron rotate (140ms ease)
//       - expanded: MemberRow com avatar+nome+role+more button + linha
//         "Adicionar funcionário a este turno"
//       - empty state: dashed card "Turno vazio"
//   • Footer absolute: "Duplicar pra próxima semana" (ghost) + (when
//     dirty) "Salvar alterações" (filled)
//   • MoreSheet do membro: 3 actions (Mover / Hora extra / Remover)
//
// Backend: endpoints `/staff/shifts/edit`, `/staff/member/move-shift`,
// `/staff/member/overtime`, `/staff/member/add-to-shift`,
// `DELETE /staff/member/remove-shift` ainda nao existem. Mock data
// inline ate o backend shipar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  MAvatar,
  MPill,
  GIconBtn,
  Icon,
} from '../../components/manager';
import {
  manager,
  type ShiftMemberEntry,
} from '../../lib/api/manager';
import { staffGet } from '../../lib/api';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

interface ShiftMember {
  assignmentId: string;
  staffId: string;
  name: string;
  init: string;
  role: string;
  color: string;
}

interface Shift {
  id: string;
  label: string;
  range: string;
  members: ShiftMember[];
  isCurrent?: boolean;
}

// Stable color per staffId (canvas usa cor fixa por funcionário).
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
function roleBucket(role: string): 'Garçom' | 'Cozinha' | 'Bartender' | 'Caixa' | 'Outros' {
  const r = role.toLowerCase();
  if (r === 'waiter' || r === 'garçom') return 'Garçom';
  if (r === 'cook' || r === 'cozinha' || r === 'cozinheiro' || r === 'cozinheira') return 'Cozinha';
  if (r === 'bartender') return 'Bartender';
  if (r === 'cashier' || r === 'caixa') return 'Caixa';
  return 'Outros';
}
function shiftRoleCount(members: ShiftMember[]): string {
  const buckets = { 'Garçom': 0, 'Cozinha': 0, 'Bartender': 0, 'Caixa': 0, 'Outros': 0 };
  for (const m of members) buckets[roleBucket(m.role)] += 1;
  const order: [number, [string, string]][] = [
    [buckets['Garçom'], ['GARÇOM', 'GARÇONS']],
    [buckets['Cozinha'], ['COZINHA', 'COZINHA']],
    [buckets['Bartender'], ['BAR', 'BAR']],
    [buckets['Caixa'], ['CAIXA', 'CAIXA']],
  ];
  return order
    .filter(([n]) => n > 0)
    .map(([n, [s, p]]) => `${n} ${n === 1 ? s : p}`)
    .join(' · ');
}

function memberFromEntry(e: ShiftMemberEntry): ShiftMember {
  return {
    assignmentId: e.assignment_id,
    staffId: e.staff_id,
    name: e.staff_name,
    init: staffInitials(e.staff_name),
    role: e.staff_role,
    color: staffColor(e.staff_id),
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function nextWeekISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

interface StaffRosterEntry {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

// ─────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────

type ModalKind = 'more' | 'add' | null;

export interface ScreenManagerShiftEditorProps {
  dark?: boolean;
  defaultExpanded?: 'all' | 'manha' | 'tarde' | 'noite';
  tenantSlug?: string;
}

// Hour-of-day em SP (UTC-3) pra detectar turno corrente. Canvas mostra
// pill "Atual" no turno em curso.
function currentShiftLabel(): string {
  const d = new Date();
  const sp = new Date(d.getTime() - 3 * 3600 * 1000);
  const h = sp.getUTCHours();
  if (h >= 6 && h < 12) return 'MANHÃ';
  if (h >= 12 && h < 17) return 'TARDE';
  return 'NOITE';
}

export function ScreenManagerShiftEditor({
  dark = false,
  defaultExpanded = 'noite',
  tenantSlug,
}: ScreenManagerShiftEditorProps) {
  const C = useG(dark);
  const router = useRouter();
  const slug =
    tenantSlug ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('slug') ?? undefined
      : undefined) ??
    process.env.NEXT_PUBLIC_TENANT_SLUG ??
    'demo';
  const api = useMemo(() => manager(slug), [slug]);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staffRoster, setStaffRoster] = useState<StaffRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [targetMember, setTargetMember] = useState<ShiftMember | null>(null);
  const [targetShiftId, setTargetShiftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const workDate = todayISO();
  const currentLabel = currentShiftLabel();

  const refresh = useCallback(async () => {
    try {
      setErrorMsg(null);
      const data = await api.shifts.list(workDate);
      const ui: Shift[] = data.map((sh) => ({
        id: sh.id,
        label: sh.label,
        range: sh.range_label,
        members: sh.members.map(memberFromEntry),
        isCurrent: sh.label === currentLabel,
      }));
      setShifts(ui);
      // Open default
      setOpen((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const next: Record<string, boolean> = {};
        for (const sh of ui) {
          const isMatch =
            defaultExpanded === 'all' ||
            (defaultExpanded === 'manha' && sh.label === 'MANHÃ') ||
            (defaultExpanded === 'tarde' && sh.label === 'TARDE') ||
            (defaultExpanded === 'noite' && sh.label === 'NOITE');
          next[sh.id] = isMatch;
        }
        return next;
      });
      setLoading(false);
    } catch (e) {
      setErrorMsg((e as Error).message || 'Erro ao carregar turnos.');
      setLoading(false);
    }
  }, [api, currentLabel, defaultExpanded, workDate]);

  useEffect(() => {
    refresh();
    // staff roster pra AddSheet
    staffGet<{ staff: StaffRosterEntry[] }>(`/${slug}/staff?activeOnly=true`)
      .then((r) => setStaffRoster(r.staff ?? []))
      .catch(() => setStaffRoster([]));
  }, [refresh, slug]);

  const toggle = (id: string) =>
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  // ─── Mutations ─────────────────────────────────────────────
  const onMoveTo = async (toShiftId: string) => {
    if (!targetMember) return;
    setBusy(true);
    try {
      await api.shifts.moveMember(targetMember.assignmentId, toShiftId);
      await refresh();
      setActiveModal(null);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onOvertime = async (minutes: number) => {
    if (!targetMember) return;
    setBusy(true);
    try {
      await api.shifts.setOvertime(targetMember.assignmentId, minutes);
      await refresh();
      setActiveModal(null);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onRemove = async () => {
    if (!targetMember) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Remover ${targetMember.name} do turno? As mesas dele precisam ser realocadas manualmente.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.shifts.removeMember(targetMember.assignmentId);
      await refresh();
      setActiveModal(null);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onAdd = async (staffId: string) => {
    const shiftId = targetShiftId ?? shifts.find((s) => s.isCurrent)?.id;
    if (!shiftId) return;
    setBusy(true);
    try {
      await api.shifts.addMember({ shiftId, staffId, workDate });
      await refresh();
      setActiveModal(null);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onDuplicateWeek = async () => {
    setBusy(true);
    try {
      const r = await api.shifts.duplicateWeek(workDate, nextWeekISO());
      setErrorMsg(
        r.duplicated > 0
          ? `${r.duplicated} escala(s) duplicada(s) pra próxima semana.`
          : 'Nada pra duplicar — a próxima semana já tem essas escalas.',
      );
      setTimeout(() => setErrorMsg(null), 3500);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
        position: 'relative',
      }}
    >
      <MTopBar
        dark={dark}
        title="Editar turnos"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push('/manager/equipe')}
            ariaLabel="Voltar"
          />
        }
        right={
          <button
            type="button"
            onClick={() => setActiveModal('add')}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              padding: '7px 12px',
              borderRadius: 999,
              border: `1px solid ${C.borderSoft}`,
              background: 'transparent',
              color: C.ink,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: -0.1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {Icon.plus(13)} Novo turno
          </button>
        }
      />

      <style>{`@keyframes shift-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 110px' }}>
        <div
          style={{
            fontSize: 11,
            color: C.faint,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            fontFamily: MONO_FONT,
            marginBottom: 8,
          }}
        >
          {workDate}
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.faint, fontSize: 13 }}>
            Carregando turnos…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shifts.map((sh) => (
              <ShiftCard
                key={sh.id}
                C={C}
                sh={sh}
                isOpen={!!open[sh.id]}
                onToggle={() => toggle(sh.id)}
                onMoreFor={(m) => {
                  setTargetMember(m);
                  setActiveModal('more');
                }}
                onAdd={() => {
                  setTargetShiftId(sh.id);
                  setActiveModal('add');
                }}
                dark={dark}
              />
            ))}
          </div>
        )}
        {errorMsg && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#FFF7E6',
              border: '1px solid #F0DCB6',
              color: '#7A4D10',
              fontSize: 12.5,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            {errorMsg}
          </div>
        )}
      </div>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '10px 14px 18px',
          background: C.surface,
          borderTop: `1px solid ${C.borderSoft}`,
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onDuplicateWeek}
          disabled={busy}
          style={{
            all: 'unset',
            cursor: busy ? 'not-allowed' : 'pointer',
            boxSizing: 'border-box',
            flex: 1,
            height: 44,
            padding: '0 12px',
            borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            background: 'transparent',
            color: C.ink,
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: -0.1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            textAlign: 'center',
            opacity: busy ? 0.5 : 1,
          }}
        >
          {Icon.history(14)} Duplicar pra próxima semana
        </button>
      </div>

      {activeModal === 'more' && targetMember && (
        <MoreSheet
          C={C}
          dark={dark}
          member={targetMember}
          shifts={shifts}
          busy={busy}
          onClose={() => setActiveModal(null)}
          onMove={onMoveTo}
          onOvertime={onOvertime}
          onRemove={onRemove}
        />
      )}

      {activeModal === 'add' && (
        <AddSheet
          C={C}
          dark={dark}
          shiftLabel={shifts.find((s) => s.id === targetShiftId)?.label ?? ''}
          candidates={
            // Funcionários ativos que ainda não estão escalados nesse turno+data
            staffRoster.filter(
              (st) =>
                !shifts
                  .find((sh) => sh.id === targetShiftId)
                  ?.members.some((m) => m.staffId === st.id),
            )
          }
          busy={busy}
          onClose={() => setActiveModal(null)}
          onAdd={onAdd}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ShiftCard
// ─────────────────────────────────────────────────────────────

function ShiftCard({
  C,
  sh,
  isOpen,
  onToggle,
  onMoreFor,
  onAdd,
  dark,
}: {
  C: ReturnType<typeof useG>;
  sh: Shift;
  isOpen: boolean;
  onToggle: () => void;
  onMoreFor: (m: ShiftMember) => void;
  onAdd: () => void;
  dark: boolean;
}) {
  const empty = sh.members.length === 0;
  const count = sh.members.length;
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: 'unset',
          cursor: 'pointer',
          boxSizing: 'border-box',
          width: '100%',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
            }}
          >
            {sh.label} · {sh.range}
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.mute,
              fontWeight: 500,
              marginTop: 4,
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {empty
              ? 'Ninguém escalado'
              : `${count} ${count === 1 ? 'funcionário' : 'funcionários'} · ${shiftRoleCount(sh.members)}`}
          </div>
        </div>
        {sh.isCurrent && (
          <MPill tone="success" dot dark={dark}>
            Atual
          </MPill>
        )}
        <span
          style={{
            color: C.faint,
            opacity: 0.7,
            transform: isOpen ? 'rotate(90deg)' : 'none',
            transition: 'transform 140ms ease',
            flexShrink: 0,
          }}
        >
          {Icon.arrow(14)}
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: '4px 14px 12px', borderTop: `1px dashed ${C.borderSoft}` }}>
          {empty ? (
            <div
              style={{
                margin: '14px 0 8px',
                padding: '20px 14px',
                textAlign: 'center',
                borderRadius: 12,
                border: `1.5px dashed ${C.borderSoft}`,
                background: C.surface,
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
                }}
              >
                Turno vazio
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: C.mute,
                  fontWeight: 500,
                  marginTop: 6,
                  lineHeight: 1.45,
                }}
              >
                Ninguém está escalado pra esse turno ainda.
              </div>
            </div>
          ) : (
            sh.members.map((m) => (
              <MemberRow key={m.assignmentId} C={C} m={m} onMore={() => onMoreFor(m)} />
            ))
          )}
          <button
            type="button"
            onClick={onAdd}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 4px',
              marginTop: 4,
              borderTop: empty ? 'none' : `1px solid ${C.borderFaint}`,
              fontSize: 13,
              fontWeight: 600,
              color: C.mute,
              width: '100%',
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: `1px dashed ${C.borderSoft}`,
                color: C.mute,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.plus(14)}
            </span>
            Adicionar funcionário a este turno
          </button>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  C,
  m,
  onMore,
}: {
  C: ReturnType<typeof useG>;
  m: ShiftMember;
  onMore: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 4px',
        borderTop: `1px solid ${C.borderFaint}`,
      }}
    >
      <MAvatar name={m.name} init={m.init} color={m.color} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {m.name}
        </div>
        <div
          style={{
            fontSize: 9.5,
            color: C.faint,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            fontFamily: MONO_FONT,
            marginTop: 1,
          }}
        >
          {m.role}
        </div>
      </div>
      <button
        type="button"
        onClick={onMore}
        aria-label={`Ações para ${m.name}`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: 32,
          height: 32,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.faint,
        }}
      >
        {Icon.more(18)}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sheets / Modals
// ─────────────────────────────────────────────────────────────

function MoreSheet({
  C,
  dark,
  member,
  shifts,
  busy,
  onClose,
  onMove,
  onOvertime,
  onRemove,
}: {
  C: ReturnType<typeof useG>;
  dark: boolean;
  member: ShiftMember;
  shifts: Shift[];
  busy: boolean;
  onClose: () => void;
  onMove: (toShiftId: string) => void;
  onOvertime: (minutes: number) => void;
  onRemove: () => void;
}) {
  const [step, setStep] = useState<'list' | 'move' | 'overtime'>('list');

  if (step === 'move') {
    const otherShifts = shifts.filter((s) => !s.members.some((m) => m.assignmentId === member.assignmentId));
    return (
      <SheetBase C={C} dark={dark} onClose={onClose} title={`Mover ${member.name} para…`} subtitle="Escolha o turno destino">
        {otherShifts.map((sh) => (
          <button
            key={sh.id}
            type="button"
            disabled={busy}
            onClick={() => onMove(sh.id)}
            style={{
              all: 'unset',
              cursor: busy ? 'not-allowed' : 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              background: C.bg,
              marginBottom: 8,
              display: 'flex',
              flexDirection: 'column',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: MONO_FONT }}>
              {sh.label} · {sh.range}
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
              {sh.members.length} funcionário{sh.members.length === 1 ? '' : 's'}
            </div>
          </button>
        ))}
      </SheetBase>
    );
  }

  if (step === 'overtime') {
    const presets = [30, 60, 120];
    return (
      <SheetBase C={C} dark={dark} onClose={onClose} title="Autorizar hora extra" subtitle={`${member.name} · turno termina conforme escalado`}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {presets.map((min) => (
            <button
              key={min}
              type="button"
              disabled={busy}
              onClick={() => onOvertime(min)}
              style={{
                all: 'unset',
                cursor: busy ? 'not-allowed' : 'pointer',
                padding: '10px 16px',
                borderRadius: 999,
                border: `1.5px solid ${C.borderSoft}`,
                background: C.bg,
                fontSize: 13,
                fontWeight: 700,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {min === 60 ? '1 H' : min === 120 ? '2 H' : `${min} MIN`}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 14, lineHeight: 1.5 }}>
          Termo de hora extra fica gravado no histórico. Cliente paga ou abate na escala da semana seguinte.
        </div>
      </SheetBase>
    );
  }

  return (
    <SheetBase C={C} dark={dark} onClose={onClose} title={`${member.name} · ${member.role}`}>
      <SheetAction
        C={C}
        icon={Icon.arrow(18)}
        label="Mover para outro turno"
        sub="Escolher turno destino"
        onClick={() => setStep('move')}
      />
      <SheetAction
        C={C}
        icon={Icon.clock(18)}
        label="Autorizar hora extra"
        sub="Estende além do horário"
        onClick={() => setStep('overtime')}
      />
      <SheetAction
        C={C}
        icon={Icon.trash(18)}
        label="Remover do turno"
        sub="Tira da escala de hoje"
        onClick={onRemove}
        tone="danger"
      />
    </SheetBase>
  );
}

function AddSheet({
  C,
  dark,
  shiftLabel,
  candidates,
  busy,
  onClose,
  onAdd,
}: {
  C: ReturnType<typeof useG>;
  dark: boolean;
  shiftLabel: string;
  candidates: StaffRosterEntry[];
  busy: boolean;
  onClose: () => void;
  onAdd: (staffId: string) => void;
}) {
  return (
    <SheetBase
      C={C}
      dark={dark}
      onClose={onClose}
      title={`Adicionar ao turno ${shiftLabel || ''}`.trim()}
      subtitle={
        candidates.length === 0
          ? 'Todos os funcionários ativos já estão nesse turno.'
          : 'Funcionários ativos que não estão nesse turno hoje'
      }
    >
      {candidates.map((p) => (
        <div
          key={p.id}
          style={{
            padding: 10,
            borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 6,
          }}
        >
          <MAvatar name={p.name} init={staffInitials(p.name)} color={staffColor(p.id)} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
              {p.name}
            </div>
            <div
              style={{
                fontSize: 10,
                color: C.faint,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                fontFamily: MONO_FONT,
                marginTop: 1,
              }}
            >
              {p.role}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onAdd(p.id)}
            disabled={busy}
            style={{
              all: 'unset',
              cursor: busy ? 'not-allowed' : 'pointer',
              boxSizing: 'border-box',
              padding: '7px 11px',
              borderRadius: 8,
              background: C.ink,
              color: C.bg,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: -0.1,
              opacity: busy ? 0.5 : 1,
            }}
          >
            Adicionar
          </button>
        </div>
      ))}
    </SheetBase>
  );
}

function SheetBase({
  C,
  dark: _dark,
  title,
  subtitle,
  children,
  onClose,
}: {
  C: ReturnType<typeof useG>;
  dark: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Round 18 (Onda 1 wiring): drag-to-dismiss state. Antes o handle
  // era afordância falsa.
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const onDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    setDragOffsetY(Math.max(0, dy));
  };
  const onDragPointerUp = () => {
    if (dragStartY.current == null) return;
    const dy = dragOffsetY;
    dragStartY.current = null;
    if (dy > 120) {
      onClose();
    } else {
      setDragOffsetY(0);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.42)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: '0 18px 22px',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '80vh',
          overflow: 'auto',
          transform: `translateY(${dragOffsetY}px)`,
          transition: dragOffsetY === 0 ? 'transform 180ms cubic-bezier(.2,.8,.2,1)' : 'none',
          touchAction: 'pan-y',
        }}
      >
        <div
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '12px 0 8px',
            cursor: 'grab',
            touchAction: 'none',
          }}
          aria-label="Arraste para fechar"
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: '#dcdcdc',
            }}
          />
        </div>
        <div style={{ marginBottom: 14 }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 13,
              color: C.mute,
              fontWeight: 500,
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            {subtitle}
          </div>
        )}
        <div style={{ marginTop: 14 }}>{children}</div>
        <button
          type="button"
          onClick={onClose}
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            width: '100%',
            height: 44,
            padding: '0 14px',
            marginTop: 10,
            borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            color: C.ink,
            fontSize: 13.5,
            fontWeight: 700,
            letterSpacing: -0.1,
            textAlign: 'center',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SheetAction({
  C,
  icon,
  label,
  sub,
  onClick,
  tone,
}: {
  C: ReturnType<typeof useG>;
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  tone?: 'danger';
}) {
  const fg = tone === 'danger' ? C.danger : C.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        padding: '12px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: `1px solid ${C.borderFaint}`,
      }}
    >
      <span style={{ color: fg }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: fg }}>{label}</div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ color: C.faint }}>{Icon.arrow(14)}</span>
    </button>
  );
}
