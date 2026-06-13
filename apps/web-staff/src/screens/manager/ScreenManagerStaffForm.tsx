'use client';

// ScreenManagerStaffForm — V5/V6 canon (canvas garcom-screens-c.jsx:1763).
//
// Pareou com link em `ScreenManagerStaff` (Equipe > "+ Novo funcionário")
// que ate round 17 caia em 404 — `/manager/equipe/novo` simplesmente nao
// existia.
//
// Layout:
//   • MTopBar dinamico ("Novo funcionário" / "Editar funcionário") +
//     close button (X) — fecha = volta pra /manager/equipe
//   • (edit only) Hero com avatar 56px + nome + "Cadastrada em DD/MM" +
//     pill "Ativo" (success)
//   • Campos: Nome / CPF / Telefone / E-mail (text inputs controlados)
//   • Funcao: chips multi-select (Garçom, Cozinheiro, Bartender, Caixa,
//     Gerente)
//   • Turno padrao: 3 chips equal-width (Manhã, Tarde, Noite)
//   • Hint mostarda "Senha provisória" (so create)
//   • CTAs:
//       - create: "Cadastrar e enviar acesso" (primary, full)
//       - edit:   "Salvar alterações" (primary) + "Desativar funcionário"
//                 (ghost)
//
// Backend: `POST /staff/create` e `PUT /staff/:id/edit` ainda nao
// existem. Form mantem state local e simula confirmation; quando o
// endpoint shipar, basta wirar `manager.staff.create(...)`.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MTopBar,
  MAvatar,
  MPill,
  GIconBtn,
  GButton,
  Icon,
} from '../../components/manager';
import { manager, type CreateStaffPayload } from '../../lib/api/manager';

export type StaffFormMode = 'create' | 'edit';
export type StaffRole = 'Garçom' | 'Cozinheiro' | 'Bartender' | 'Caixa' | 'Gerente';
export type StaffShift = 'Manhã' | 'Tarde' | 'Noite';

export interface StaffFormSeed {
  name?: string;
  cpf?: string;
  phone?: string;
  email?: string;
  role?: StaffRole;
  shift?: StaffShift;
  /** Display only (edit mode hero). */
  avatarInit?: string;
  avatarColor?: string;
  createdAt?: string;
  active?: boolean;
}

const ROLES: StaffRole[] = ['Garçom', 'Cozinheiro', 'Bartender', 'Caixa', 'Gerente'];
const SHIFTS: StaffShift[] = ['Manhã', 'Tarde', 'Noite'];

const EDIT_DEMO_SEED: Required<StaffFormSeed> = {
  name: 'Olivia Martins',
  cpf: '123.456.789-00',
  phone: '(11) 98765-4321',
  email: 'olivia@trattorialuna.com',
  role: 'Garçom',
  shift: 'Noite',
  avatarInit: 'OM',
  avatarColor: '#E37D2F',
  createdAt: '12/03/2024',
  active: true,
};

export interface ScreenManagerStaffFormProps {
  dark?: boolean;
  mode?: StaffFormMode;
  seed?: StaffFormSeed;
  /** Tenant slug pra API. Default lê de NEXT_PUBLIC_TENANT_SLUG. */
  tenantSlug?: string;
  /** Edit mode: id do staff sendo editado (necessario pra PUT). */
  staffId?: string;
}

// Round 18 (Onda 1 wiring): mapping FE roles (canvas portuguese) ->
// backend roles (DB). Cobre todos os 6 roles do canvas; backend foi
// expandido na migration 041 + DTO update pra aceitar bartender/cashier.
const ROLE_MAP: Record<StaffRole, CreateStaffPayload['role']> = {
  Garçom: 'waiter',
  Cozinheiro: 'cook',
  Bartender: 'bartender',
  Caixa: 'cashier',
  Gerente: 'manager',
};

function generateProvisionalPin(): string {
  // Round 18: 4 digitos aleatorios. Em prod isso seria gerado server-side
  // + enviado por SMS (canvas footer "Senha provisoria" promete isso).
  // Por ora cliente gera e exibe — o staff troca no primeiro acesso via
  // verifyPin -> change-pin flow (TODO).
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function ScreenManagerStaffForm({
  dark = false,
  mode = 'create',
  seed,
  tenantSlug,
  staffId,
}: ScreenManagerStaffFormProps) {
  const C = useG(dark);
  const router = useRouter();
  const isEdit = mode === 'edit';
  const init: Required<StaffFormSeed> = isEdit
    ? { ...EDIT_DEMO_SEED, ...(seed ?? {}) }
    : {
        name: seed?.name ?? '',
        cpf: seed?.cpf ?? '',
        phone: seed?.phone ?? '',
        email: seed?.email ?? '',
        role: seed?.role ?? 'Garçom',
        shift: seed?.shift ?? 'Noite',
        avatarInit: seed?.avatarInit ?? '',
        avatarColor: seed?.avatarColor ?? '#777',
        createdAt: seed?.createdAt ?? '',
        active: seed?.active ?? true,
      };

  const [name, setName] = useState(init.name);
  const [cpf, setCpf] = useState(init.cpf);
  const [phone, setPhone] = useState(init.phone);
  const [email, setEmail] = useState(init.email);
  const [role, setRole] = useState<StaffRole>(init.role);
  const [shift, setShift] = useState<StaffShift>(init.shift);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedPin, setSavedPin] = useState<string | null>(null);

  const slug =
    tenantSlug ??
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('slug') ?? undefined)
      : undefined) ??
    process.env.NEXT_PUBLIC_TENANT_SLUG ??
    'demo';
  const api = manager(slug);

  const close = () => router.push('/manager/equipe');

  const validate = (): string | null => {
    if (!name.trim()) return 'Nome obrigatório.';
    if (name.trim().length < 3) return 'Nome muito curto (mínimo 3 caracteres).';
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      if (isEdit && staffId) {
        await api.staffRoster.update(staffId, {
          name: name.trim(),
          role: ROLE_MAP[role],
          cpf: cpf.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          default_shift: shift,
        });
      } else {
        const pin = generateProvisionalPin();
        await api.staffRoster.create({
          name: name.trim(),
          role: ROLE_MAP[role],
          pin,
          cpf: cpf.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          default_shift: shift,
        });
        setSavedPin(pin);
      }
      // Pequena pausa pra usuario ver o PIN antes de redirecionar
      // (so em create — em edit volta direto).
      if (isEdit) close();
      else setTimeout(close, 4000);
    } catch (e) {
      const msg = (e as Error).message || 'Erro ao salvar.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onDeactivate = async () => {
    if (!staffId) {
      setErrorMsg('ID do funcionário ausente.');
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Desativar ${name}? Ele não conseguirá mais entrar no app.`)
    )
      return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.staffRoster.deactivate(staffId);
      close();
    } catch (e) {
      setErrorMsg((e as Error).message || 'Erro ao desativar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        height: '100dvh',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <MTopBar
        dark={dark}
        title={isEdit ? 'Editar funcionário' : 'Novo funcionário'}
        left={<GIconBtn dark={dark} icon={Icon.x(20)} onClick={close} ariaLabel="Fechar" />}
      />

      {isEdit && (
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
          <MAvatar name={init.name} init={init.avatarInit} color={init.avatarColor} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{init.name}</div>
            <div
              style={{
                fontSize: 12,
                color: C.faint,
                marginTop: 2,
                fontWeight: 500,
              }}
            >
              Cadastrada em {init.createdAt}
            </div>
          </div>
          {init.active ? (
            <MPill tone="success" dot dark={dark}>
              Ativo
            </MPill>
          ) : (
            <MPill tone="warn" dark={dark}>
              Inativo
            </MPill>
          )}
        </div>
      )}

      {/* Round 18 sticky-footer fix: overflow:auto + minHeight:0 são
          obrigatórios pra que `flex: 1` no middle limite a tela; sem
          eles a página inteira cresce e CTAs ficam off-screen no
          viewport mobile (audit round18-sticky-footer-audit P0/P1). */}
      <div style={{ padding: 16, flex: 1, overflow: 'auto', minHeight: 0 }}>
        <Field
          C={C}
          label="Nome completo"
          value={name}
          onChange={setName}
          placeholder="Ex.: Maria Silva"
          autoComplete="name"
        />
        <Field
          C={C}
          label="CPF"
          value={cpf}
          onChange={setCpf}
          placeholder="000.000.000-00"
          inputMode="numeric"
        />
        <Field
          C={C}
          label="Telefone"
          value={phone}
          onChange={setPhone}
          placeholder="(00) 00000-0000"
          inputMode="tel"
          autoComplete="tel"
        />
        <Field
          C={C}
          label="E-mail"
          value={email}
          onChange={setEmail}
          placeholder="email@trattoria.com"
          inputMode="email"
          autoComplete="email"
        />

        <ChipGroup
          C={C}
          label="Função"
          options={ROLES}
          value={role}
          onChange={(v) => setRole(v as StaffRole)}
          wrap
        />

        <ChipGroup
          C={C}
          label="Turno padrão"
          options={SHIFTS}
          value={shift}
          onChange={(v) => setShift(v as StaffShift)}
          equalWidth
        />

        {!isEdit && !savedPin && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: '#FFF7EC',
              border: '1px solid #F0DCB6',
              fontSize: 12,
              color: '#7a4d10',
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Senha provisória</div>
            Será gerada automaticamente. O funcionário troca no primeiro acesso.
          </div>
        )}

        {savedPin && (
          <div
            role="status"
            style={{
              padding: 14,
              borderRadius: 10,
              background: '#EFF5EC',
              border: '1px solid #C0DEC9',
              fontSize: 13,
              color: '#0F5A37',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 14 }}>
              Cadastrado com sucesso!
            </div>
            <div>
              PIN provisório:{' '}
              <strong style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 18 }}>
                {savedPin}
              </strong>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>
              Anote ou repasse pro funcionário. Ele troca no primeiro acesso.
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: 12,
              borderRadius: 10,
              background: '#FFF1F1',
              border: '1px solid #F4C7C7',
              fontSize: 13,
              color: '#A12626',
              lineHeight: 1.45,
              fontWeight: 500,
            }}
          >
            {errorMsg}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 18,
          }}
        >
          <GButton
            dark={dark}
            full
            kind="primary"
            onClick={onSave}
            disabled={submitting || !!savedPin}
          >
            {submitting
              ? 'Salvando…'
              : savedPin
                ? 'Redirecionando…'
                : isEdit
                  ? 'Salvar alterações'
                  : 'Cadastrar e enviar acesso'}
          </GButton>
          {isEdit && (
            <GButton dark={dark} full kind="ghost" onClick={onDeactivate} disabled={submitting}>
              Desativar funcionário
            </GButton>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Form atoms
// ─────────────────────────────────────────────────────────────

function Field({
  C,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  autoComplete,
}: {
  C: ReturnType<typeof useG>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  autoComplete?: string;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          width: '100%',
          padding: '12px 14px',
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 10,
          fontSize: 15,
          color: C.ink,
          background: C.bg,
          fontWeight: value ? 500 : 400,
        }}
      />
    </label>
  );
}

function ChipGroup({
  C,
  label,
  options,
  value,
  onChange,
  wrap,
  equalWidth,
}: {
  C: ReturnType<typeof useG>;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  wrap?: boolean;
  equalWidth?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: wrap ? 'wrap' : 'nowrap',
          gap: 6,
        }}
      >
        {options.map((o) => {
          const active = o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              aria-pressed={active}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                flex: equalWidth ? 1 : undefined,
                textAlign: 'center',
                padding: equalWidth ? '10px' : '8px 14px',
                borderRadius: equalWidth ? 10 : 999,
                border: `1px solid ${active ? C.ink : C.borderSoft}`,
                background: active ? C.ink : 'transparent',
                color: active ? C.bg : C.ink,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
