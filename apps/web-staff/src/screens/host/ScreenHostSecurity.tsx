'use client';

// ScreenHostSecurity — segurança e senha do host.
// 3 blocos canon: Senha (sheet Trocar PIN real) · 2FA (em breve, honesto) ·
// Sessão deste dispositivo (Encerrar = logout real que revoga a sessão).
//
// TROCAR-PIN / logout são features REAIS agora (reusam o staff-auth que o
// manager e o /trocar-pin já usam):
//   - `staffAuthChangePin` → POST /staff-auth/change-pin (revoga sessões
//     antigas; o proxy troca o cookie httpOnly pelo token novo).
//   - `performStaffLogout` → POST /staff-auth/logout (revoga a sessão no
//     Redis + limpa o cookie) e limpa o localStorage.
// Não há endpoint staff-auth de "sessões ativas" nem de 2FA pro host, então
// aqui NÃO se inventa lista mock nem toggle placebo: sessão = este dispositivo,
// e 2FA fica honestamente desabilitado ("em breve").

import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GButton, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { useStaffTheme } from '../../lib/theme';
import { staffAuthChangePin } from '../../lib/api';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface ScreenHostSecurityProps {
  /** Slug do tenant — necessário pro change-pin/logout real. */
  tenantSlug: string;
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
  /** Logout real: revoga a sessão server-side e redireciona pro login. */
  onLogout?: () => void | Promise<void>;
}

type Toast = { kind: 'info' | 'success' | 'danger'; text: string } | null;

export const ScreenHostSecurity: React.FC<ScreenHostSecurityProps> = ({
  tenantSlug,
  onBack,
  onTabChange,
  onLogout,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [showPinSheet, setShowPinSheet] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const tid = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(tid);
  }, [toast]);

  const handleEndSession = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // performStaffLogout NUNCA rejeita (engole falha de rede), mas o
      // redirect fica com o caller (route) via onLogout.
      await onLogout?.();
    } finally {
      setLoggingOut(false);
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
        <h1
          style={{
            flex: 1,
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: -0.2,
          }}
        >
          Segurança e senha
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 24 }}>
        {/* SENHA */}
        <SectionTitle dark={dark}>Senha</SectionTitle>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionRow
            dark={dark}
            icon={Icon.shield(18)}
            lbl="Trocar PIN"
            sub="4 a 6 dígitos"
            onClick={() => setShowPinSheet(true)}
          />
        </div>

        {/* 2FA — sem backend staff-auth ainda; honesto "em breve", desabilitado. */}
        <SectionTitle dark={dark}>Autenticação em 2 fatores</SectionTitle>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              background: C.bg,
              opacity: 0.62,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#F4F0E8',
                color: C.ink,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {Icon.shield(18)}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                Pedir código a cada login
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: C.faint,
                  marginTop: 2,
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                Adiciona uma camada extra no login do app
              </div>
            </div>
            <span
              style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: 100,
                background: '#F4F0E8',
                color: C.faint,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                fontFamily: MONO_FONT,
              }}
            >
              Em breve
            </span>
          </div>
        </div>

        {/* SESSÃO — só este dispositivo é conhecido do lado do host (não há
            endpoint staff-auth de sessões ativas). Encerrar = logout real. */}
        <SectionTitle dark={dark}>Sessão deste dispositivo</SectionTitle>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              padding: '12px 14px',
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
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#F4F0E8',
                color: C.ink,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {Icon.user(18)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                Este dispositivo
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 100,
                    background: '#E5F2EA',
                    color: '#0F5A37',
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                  }}
                >
                  Você
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500 }}>
                Ativo agora · encerrar sai do app e revoga a sessão
              </div>
            </div>
            <button
              type="button"
              onClick={handleEndSession}
              disabled={loggingOut}
              aria-label="Encerrar sessão deste dispositivo"
              style={{
                all: 'unset',
                cursor: loggingOut ? 'progress' : 'pointer',
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid #F4C7C7`,
                background: '#FFF1F1',
                color: '#A12626',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                opacity: loggingOut ? 0.6 : 1,
              }}
            >
              {loggingOut ? 'Saindo…' : 'Encerrar'}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, padding: '2px 4px', lineHeight: 1.4 }}>
            Só é possível ver e encerrar a sessão deste aparelho por aqui.
          </div>
        </div>
      </div>

      {/* Toast in-screen · 3.2s */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 96,
            left: 16,
            right: 16,
            padding: '12px 14px',
            borderRadius: 12,
            background:
              toast.kind === 'danger'
                ? '#FFE6E6'
                : toast.kind === 'success'
                  ? '#E5F2EA'
                  : '#F4F0E8',
            color:
              toast.kind === 'danger' ? '#A12626' : toast.kind === 'success' ? '#0F5A37' : C.ink,
            border: `1px solid ${
              toast.kind === 'danger'
                ? '#F4C7C7'
                : toast.kind === 'success'
                  ? '#BFE3CC'
                  : C.borderSoft
            }`,
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.4,
            zIndex: 30,
            boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
          }}
        >
          {toast.text}
        </div>
      )}

      <HBottomNav active="me" dark={dark} onTabChange={(id) => onTabChange?.(id)} />

      {showPinSheet && (
        <ChangePinSheet
          dark={dark}
          onClose={() => setShowPinSheet(false)}
          onSubmit={async (currentPin, newPin) => {
            // change-pin REAL — revoga sessões antigas; o proxy troca o cookie
            // httpOnly pelo token novo, então a sessão atual segue válida.
            try {
              const res = await staffAuthChangePin(tenantSlug, { currentPin, newPin });
              setShowPinSheet(false);
              setToast({ kind: 'success', text: res.message_user || 'PIN atualizado.' });
            } catch (err) {
              // Deixa a sheet aberta; propaga o erro pro sheet exibir inline.
              throw err instanceof Error ? err : new Error('Não foi possível trocar o PIN.');
            }
          }}
        />
      )}
    </div>
  );
};

// ─── SectionTitle ──────────────────────────────────────────────────
function SectionTitle({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const C = useG(!!dark);
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          padding: '0 16px 8px',
          fontSize: 11,
          fontWeight: 700,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── ActionRow (igual ao ScreenHostProfile, copiado pra evitar dep cruzada) ─
function ActionRow({
  icon,
  lbl,
  sub,
  onClick,
  dark,
}: {
  icon: React.ReactNode;
  lbl: string;
  sub?: string;
  onClick?: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: onClick ? 'pointer' : 'default',
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px 14px',
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
          width: 36,
          height: 36,
          borderRadius: 10,
          background: '#F4F0E8',
          color: C.ink,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
          {lbl}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: C.faint,
              marginTop: 2,
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div style={{ color: C.faint, opacity: 0.5, flexShrink: 0 }}>{Icon.arrow(16)}</div>
    </button>
  );
}

// ─── ChangePinSheet — PIN numérico 4-6 dígitos, validação local antes do
// change-pin real. onSubmit é async e pode rejeitar (erro do backend) → a
// sheet exibe a mensagem inline e permanece aberta.
function ChangePinSheet({
  onClose,
  onSubmit,
  dark,
}: {
  onClose: () => void;
  onSubmit: (currentPin: string, newPin: string) => Promise<void>;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);

  const submit = async () => {
    setErr(null);
    if (!/^\d{4,6}$/.test(current)) {
      setErr('Informe o PIN atual (4 a 6 dígitos).');
      return;
    }
    if (!/^\d{4,6}$/.test(next)) {
      setErr('O novo PIN precisa ter de 4 a 6 dígitos.');
      return;
    }
    if (next === current) {
      setErr('O novo PIN precisa ser diferente do atual.');
      return;
    }
    if (next !== confirm) {
      setErr('Novo PIN e confirmação não conferem.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(current, next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível trocar o PIN.');
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 16px 24px',
          maxHeight: '88vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: C.borderSoft,
            margin: '4px auto 14px',
          }}
        />
        <h2
          id={titleId}
          style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}
        >
          Trocar PIN
        </h2>
        <div
          id={descriptionId}
          style={{ fontSize: 12.5, color: C.mute, marginTop: 4, fontWeight: 500, lineHeight: 1.4 }}
        >
          Use de 4 a 6 dígitos. Ao trocar, as outras sessões são desconectadas.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <PinField
            dark={dark}
            label="PIN atual"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
          <PinField
            dark={dark}
            label="Novo PIN"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />
          <PinField
            dark={dark}
            label="Confirmar novo PIN"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
        </div>

        {err && (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#FFE6E6',
              color: '#A12626',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <GButton dark={dark} full kind="ghost" onClick={onClose}>
            Cancelar
          </GButton>
          <GButton dark={dark} full kind="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Salvando…' : 'Trocar PIN'}
          </GButton>
        </div>
      </div>
    </div>
  );
}

// ─── PinField — input numérico (4-6 dígitos) padronizado pra sheet de PIN.
function PinField({
  label,
  value,
  onChange,
  autoComplete,
  dark,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </span>
      <input
        type="password"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        autoComplete={autoComplete}
        style={{
          padding: '12px 12px',
          borderRadius: 10,
          border: `1px solid ${C.borderSoft}`,
          background: C.surface,
          color: C.ink,
          fontSize: 18,
          fontFamily: MONO_FONT,
          letterSpacing: 2,
          outline: 'none',
        }}
      />
    </label>
  );
}

export default ScreenHostSecurity;
