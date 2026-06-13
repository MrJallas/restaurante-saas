'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  Icon,
  MTopBar,
  GIconBtn,
  GButton,
  MBottomNav,
} from '../../components/manager';
import { useStaffTheme, type StaffThemeMode } from '../../lib/theme';
import { manager, type ManagerSecuritySession, type ManagerShiftLog } from '../../lib/api/manager';

type Toast = { tone: 'success' | 'danger' | 'info'; text: string } | null;

const NOTIFICATION_ROWS = [
  {
    id: 'turn.alerts',
    label: 'Avisos do turno',
    sub: 'Chamados, reclamações e alertas críticos',
    defaultOn: true,
  },
  { id: 'turn.push', label: 'Push', sub: 'Notificação no dispositivo', defaultOn: true },
  { id: 'turn.sound', label: 'Sons', sub: 'Toque curto em eventos urgentes', defaultOn: true },
  {
    id: 'turn.lockScreen',
    label: 'Lock screen',
    sub: 'Prévia na tela bloqueada',
    defaultOn: false,
  },
  {
    id: 'critical.complaints',
    label: 'Reclamações críticas',
    sub: 'Prioridade alta no painel',
    defaultOn: true,
  },
];

const THEME_OPTIONS: Array<{ id: StaffThemeMode; label: string; sub: string }> = [
  { id: 'light', label: 'Claro', sub: 'Tema claro' },
  { id: 'dark', label: 'Escuro', sub: 'Tema escuro' },
  { id: 'auto', label: 'Automático', sub: 'Acompanha o sistema' },
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScreenManagerNotificationPrefs({ tenantSlug }: { tenantSlug: string }) {
  const { dark } = useStaffTheme();
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_ROWS.map((r) => [r.id, r.defaultOn])),
  );
  const [toast, setToast] = useToast();

  useEffect(() => {
    api.account
      .getPreferences()
      .then((p) => setPrefs({ ...prefs, ...p.notifications }))
      .catch((e) => setToast({ tone: 'danger', text: (e as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const toggle = (id: string) => {
    const nextValue = !prefs[id];
    setPrefs((prev) => ({ ...prev, [id]: nextValue }));
    api.account
      .updatePreferences({ notifications: { [id]: nextValue } })
      .then(() => setToast({ tone: 'success', text: 'Preferência salva.' }))
      .catch((e) => {
        setPrefs((prev) => ({ ...prev, [id]: !nextValue }));
        setToast({ tone: 'danger', text: (e as Error).message });
      });
  };

  return (
    <SettingsShell title="Notificações" dark={dark} onBack={() => router.back()} active="me">
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {NOTIFICATION_ROWS.map((row) => (
          <ToggleRow
            key={row.id}
            dark={dark}
            label={row.label}
            sub={row.sub}
            checked={!!prefs[row.id]}
            onChange={() => toggle(row.id)}
          />
        ))}
      </div>
      {toast && <ToastView dark={dark} toast={toast} />}
    </SettingsShell>
  );
}

export function ScreenManagerAppearance({ tenantSlug }: { tenantSlug: string }) {
  const { mode, dark, setMode } = useStaffTheme();
  const C = useG(dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [toast, setToast] = useToast();

  useEffect(() => {
    api.account
      .getPreferences()
      .then((p) => {
        if (p.theme) setMode(p.theme);
      })
      .catch(() => undefined);
  }, [api, setMode]);

  const choose = (next: StaffThemeMode) => {
    setMode(next);
    api.account
      .updatePreferences({ theme: next })
      .then(() => setToast({ tone: 'success', text: 'Tema aplicado.' }))
      .catch((e) => setToast({ tone: 'danger', text: (e as Error).message }));
  };

  return (
    <SettingsShell title="Aparência" dark={dark} onBack={() => router.back()} active="me">
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {THEME_OPTIONS.map((opt) => {
          const selected = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt.id)}
              aria-pressed={selected}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '14px',
                borderRadius: 12,
                border: `1.5px solid ${selected ? C.ink : C.borderSoft}`,
                background: selected ? C.surface : C.bg,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: `2px solid ${selected ? C.ink : C.borderSoft}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {selected && (
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.ink }} />
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{opt.label}</span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontSize: 11.5,
                    color: C.faint,
                    fontWeight: 600,
                  }}
                >
                  {opt.sub}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {toast && <ToastView dark={dark} toast={toast} />}
    </SettingsShell>
  );
}

export function ScreenManagerSecurity({ tenantSlug }: { tenantSlug: string }) {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessions, setSessions] = useState<ManagerSecuritySession[]>([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [toast, setToast] = useToast();

  const refresh = () => {
    Promise.all([api.account.getPreferences(), api.account.sessions()])
      .then(([prefs, sessionRes]) => {
        setTwoFactor(prefs.twoFactorEnabled);
        setSessions(sessionRes.sessions);
      })
      .catch((e) => setToast({ tone: 'danger', text: (e as Error).message }));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const toggle2fa = () => {
    const next = !twoFactor;
    setTwoFactor(next);
    api.account
      .updatePreferences({ twoFactorEnabled: next })
      .then(() => setToast({ tone: 'success', text: next ? '2FA ativo.' : '2FA inativo.' }))
      .catch((e) => {
        setTwoFactor(!next);
        setToast({ tone: 'danger', text: (e as Error).message });
      });
  };

  const revoke = (id: string) => {
    api.account
      .revokeSession(id)
      .then(() => {
        setToast({ tone: 'success', text: 'Sessão encerrada.' });
        refresh();
      })
      .catch((e) => setToast({ tone: 'danger', text: (e as Error).message }));
  };

  return (
    <SettingsShell title="Segurança e senha" dark={dark} onBack={() => router.back()} active="me">
      <SectionLabel dark={dark}>Senha</SectionLabel>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ActionRow
          dark={dark}
          icon={Icon.shield(18)}
          label="Trocar PIN"
          sub="4 a 6 dígitos"
          onClick={() => setPinOpen(true)}
        />
      </div>
      <SectionLabel dark={dark}>Autenticação em 2 fatores</SectionLabel>
      <div style={{ padding: '0 16px' }}>
        <ToggleRow
          dark={dark}
          label="Pedir código a cada login"
          sub="Camada extra de acesso"
          checked={twoFactor}
          onChange={toggle2fa}
        />
      </div>
      <SectionLabel dark={dark}>Sessões ativas</SectionLabel>
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sessions.map((s) => (
          <div
            key={s.id}
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              background: C.bg,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: C.surface,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {Icon.user(18)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                {s.label}
                {s.current && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: '#1E8C5A', fontWeight: 900 }}>
                    VOCÊ
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 600 }}>
                {s.ip} · {formatDateTime(s.lastSeenAt)}
              </div>
            </div>
            <button
              type="button"
              disabled={s.current}
              onClick={() => revoke(s.id)}
              style={{
                all: 'unset',
                cursor: s.current ? 'not-allowed' : 'pointer',
                padding: '8px 10px',
                borderRadius: 10,
                border: `1px solid ${s.current ? C.borderSoft : '#F4C7C7'}`,
                background: s.current ? 'transparent' : '#FFF1F1',
                color: s.current ? C.faint : '#A12626',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Encerrar
            </button>
          </div>
        ))}
      </div>
      {pinOpen && (
        <ChangePinSheet
          dark={dark}
          onClose={() => setPinOpen(false)}
          onSubmit={(currentPin, nextPin) => {
            api.account
              .changePin({ currentPin, nextPin })
              .then(() => {
                setPinOpen(false);
                setToast({ tone: 'success', text: 'PIN atualizado.' });
              })
              .catch((e) => setToast({ tone: 'danger', text: (e as Error).message }));
          }}
        />
      )}
      {toast && <ToastView dark={dark} toast={toast} />}
    </SettingsShell>
  );
}

export function ScreenManagerShiftHistory({ tenantSlug }: { tenantSlug: string }) {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [filters, setFilters] = useState({ date: '', staff: '', shift: '' });
  const [shifts, setShifts] = useState<ManagerShiftLog[]>([]);
  const [toast, setToast] = useToast();

  useEffect(() => {
    api.account
      .shiftLogs({
        date: filters.date || undefined,
        staff: filters.staff || undefined,
        shift: filters.shift || undefined,
      })
      .then((r) => setShifts(r.shifts))
      .catch((e) => setToast({ tone: 'danger', text: (e as Error).message }));
  }, [api, filters.date, filters.staff, filters.shift, setToast]);

  return (
    <SettingsShell title="Histórico de turnos" dark={dark} onBack={() => router.back()} active="me">
      <div
        style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
      >
        <FilterInput
          dark={dark}
          label="Data"
          type="date"
          value={filters.date}
          onChange={(date) => setFilters((p) => ({ ...p, date }))}
        />
        <FilterInput
          dark={dark}
          label="Turno"
          value={filters.shift}
          onChange={(shift) => setFilters((p) => ({ ...p, shift }))}
        />
      </div>
      <div style={{ padding: '8px 16px 0' }}>
        <FilterInput
          dark={dark}
          label="Gerente ou garçom"
          value={filters.staff}
          onChange={(staff) => setFilters((p) => ({ ...p, staff }))}
        />
      </div>
      <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shifts.length === 0 ? (
          <div
            style={{
              padding: 24,
              border: `1.5px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Nenhum turno encontrado.
          </div>
        ) : (
          shifts.map((shift) => (
            <div
              key={shift.id}
              style={{
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${C.borderSoft}`,
                background: C.bg,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{shift.staffName}</div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 600 }}>
                    {shift.shiftLabel} · {formatDateTime(shift.endedAt)}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(shift.salesCents)}
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <MiniKpi dark={dark} label="Mesas" value={shift.tablesServed} />
                <MiniKpi dark={dark} label="Pedidos" value={shift.orders} />
                <MiniKpi dark={dark} label="Críticos" value={shift.criticalAlerts} />
              </div>
              {shift.waitersOnShift.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11.5,
                    color: C.faint,
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  Equipe: {shift.waitersOnShift.slice(0, 5).join(', ')}
                  {shift.waitersOnShift.length > 5 ? ` +${shift.waitersOnShift.length - 5}` : ''}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {toast && <ToastView dark={dark} toast={toast} />}
    </SettingsShell>
  );
}

function SettingsShell({
  title,
  dark,
  onBack,
  active,
  children,
}: {
  title: string;
  dark: boolean;
  onBack: () => void;
  active: 'me';
  children: React.ReactNode;
}) {
  const C = useG(dark);
  const router = useRouter();
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
        title={title}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
      />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 96 }}>{children}</div>
      <MBottomNav active={active} dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
  dark,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: () => void;
  dark: boolean;
}) {
  const C = useG(dark);
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{label}</span>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontSize: 11.5,
            color: C.faint,
            fontWeight: 600,
          }}
        >
          {sub}
        </span>
      </span>
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-label={label}
          style={{ position: 'absolute', inset: 0, opacity: 0, margin: 0, cursor: 'pointer' }}
        />
        <span
          aria-hidden
          style={{
            width: 44,
            height: 26,
            borderRadius: 999,
            background: checked ? C.ink : C.borderSoft,
            position: 'relative',
            display: 'inline-block',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: checked ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 140ms ease',
            }}
          />
        </span>
      </span>
    </label>
  );
}

function SectionLabel({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  const C = useG(dark);
  return (
    <div
      style={{
        padding: '18px 16px 8px',
        fontSize: 11,
        color: C.faint,
        fontWeight: 900,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
      }}
    >
      {children}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  sub,
  onClick,
  dark,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  dark: boolean;
}) {
  const C = useG(dark);
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
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: C.surface,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{label}</span>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontSize: 11.5,
            color: C.faint,
            fontWeight: 600,
          }}
        >
          {sub}
        </span>
      </span>
      <span style={{ color: C.faint, flexShrink: 0 }}>{Icon.arrow(16)}</span>
    </button>
  );
}

function ChangePinSheet({
  dark,
  onClose,
  onSubmit,
}: {
  dark: boolean;
  onClose: () => void;
  onSubmit: (currentPin: string, nextPin: string) => void;
}) {
  const C = useG(dark);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!/^\d{4,6}$/.test(currentPin) || !/^\d{4,6}$/.test(nextPin)) {
      setError('Use 4 a 6 dígitos.');
      return;
    }
    if (nextPin !== confirm) {
      setError('Confirmação não confere.');
      return;
    }
    onSubmit(currentPin, nextPin);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '18px 16px 24px',
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: C.borderSoft,
            margin: '0 auto 14px',
          }}
        />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Trocar PIN</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <PinField dark={dark} label="PIN atual" value={currentPin} onChange={setCurrentPin} />
          <PinField dark={dark} label="Novo PIN" value={nextPin} onChange={setNextPin} />
          <PinField dark={dark} label="Confirmar novo PIN" value={confirm} onChange={setConfirm} />
        </div>
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              background: '#FFF1F1',
              color: '#A12626',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <GButton dark={dark} full kind="ghost" onClick={onClose}>
            Cancelar
          </GButton>
          <GButton dark={dark} full kind="primary" onClick={submit}>
            Salvar
          </GButton>
        </div>
      </div>
    </div>
  );
}

function PinField({
  dark,
  label,
  value,
  onChange,
}: {
  dark: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const C = useG(dark);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          color: C.faint,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        style={{
          padding: '12px 12px',
          borderRadius: 10,
          border: `1px solid ${C.borderSoft}`,
          background: C.surface,
          color: C.ink,
          fontSize: 18,
          fontFamily: MONO_FONT,
          letterSpacing: 2,
        }}
      />
    </label>
  );
}

function FilterInput({
  dark,
  label,
  value,
  onChange,
  type = 'text',
}: {
  dark: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const C = useG(dark);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontSize: 10,
          color: C.faint,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          minWidth: 0,
          padding: '10px 11px',
          borderRadius: 10,
          border: `1px solid ${C.borderSoft}`,
          background: C.bg,
          color: C.ink,
          fontSize: 13,
          fontFamily: G_FONT,
        }}
      />
    </label>
  );
}

function MiniKpi({ dark, label, value }: { dark: boolean; label: string; value: number | string }) {
  const C = useG(dark);
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        background: C.surface,
        border: `1px solid ${C.borderFaint}`,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          color: C.faint,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </div>
      <div
        style={{ marginTop: 4, fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

function ToastView({ dark, toast }: { dark: boolean; toast: NonNullable<Toast> }) {
  const C = useG(dark);
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 96,
        zIndex: 80,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${toast.tone === 'danger' ? '#F4C7C7' : C.borderSoft}`,
        background: toast.tone === 'danger' ? '#FFF1F1' : C.bg,
        color: toast.tone === 'danger' ? '#A12626' : C.ink,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {toast.text}
    </div>
  );
}

function useToast(): [Toast, (toast: Toast) => void] {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return undefined;
    const tid = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(tid);
  }, [toast]);
  return [toast, setToast];
}
