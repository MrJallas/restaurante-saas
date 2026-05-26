'use client';

// ScreenHostSecurity — segurança e senha do host.
// 3 blocos canon: Senha (sheet com current/new/confirm) · 2FA (toggle) ·
// Sessões ativas (mock list + Encerrar). Trocar senha e encerrar sessão
// são stubs anunciados — endpoint chega no round 19.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GButton, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { useStaffTheme } from '../../lib/theme';

const STORAGE_2FA = 'host:security:2fa';

interface SessionRow {
  id: string;
  label: string;
  sub: string;
  current: boolean;
}

const MOCK_SESSIONS: SessionRow[] = [
  { id: 'self', label: 'Este dispositivo', sub: 'Ativo agora · Safari iOS', current: true },
  { id: 'iphone', label: 'iPhone — sala dos garçons', sub: 'Há 2h · Safari iOS', current: false },
];

interface ScreenHostSecurityProps {
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
}

type Toast = { kind: 'info' | 'success' | 'danger'; text: string } | null;

export const ScreenHostSecurity: React.FC<ScreenHostSecurityProps> = ({ onBack, onTabChange }) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [showPassSheet, setShowPassSheet] = useState(false);
  const [twoFa, setTwoFa] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [sessions, setSessions] = useState<SessionRow[]>(MOCK_SESSIONS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_2FA);
      if (raw === '1') setTwoFa(true);
    } catch {
      /* swallow */
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const tid = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(tid);
  }, [toast]);

  const handle2fa = () => {
    setTwoFa((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_2FA, next ? '1' : '0');
      } catch {
        /* swallow */
      }
      setToast({
        kind: 'info',
        text: next
          ? '2FA marcado como ativo (stub). Endpoint POST /auth/2fa/enable chega no round 19.'
          : '2FA marcado como inativo (stub). Endpoint POST /auth/2fa/disable chega no round 19.',
      });
      return next;
    });
  };

  const handleEndSession = (id: string) => {
    const row = sessions.find((s) => s.id === id);
    if (!row) return;
    if (row.current) {
      setToast({ kind: 'danger', text: 'Não é possível encerrar esta sessão por aqui — use Sair do app.' });
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setToast({
      kind: 'info',
      text: `${row.label} encerrada localmente (stub). Endpoint DELETE /auth/sessions/:id chega no round 19.`,
    });
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
        <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
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
            lbl="Trocar senha"
            sub="Defina uma nova senha de acesso"
            onClick={() => setShowPassSheet(true)}
          />
        </div>

        {/* 2FA */}
        <SectionTitle dark={dark}>Autenticação em 2 fatores</SectionTitle>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
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
              cursor: 'pointer',
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
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>
                Adiciona uma camada extra no login do app
              </div>
            </div>
            <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={twoFa}
                onChange={handle2fa}
                aria-label="Pedir código a cada login"
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  margin: 0,
                  cursor: 'pointer',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 999,
                  background: twoFa ? C.ink : C.borderSoft,
                  transition: 'background 120ms ease',
                  display: 'inline-block',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: twoFa ? 21 : 3,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 140ms ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                  }}
                />
              </span>
            </span>
          </label>
        </div>

        {/* SESSÕES */}
        <SectionTitle dark={dark}>Sessões ativas</SectionTitle>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map((s) => (
            <div
              key={s.id}
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
                  {s.label}
                  {s.current && (
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
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500 }}>
                  {s.sub}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleEndSession(s.id)}
                aria-label={`Encerrar sessão ${s.label}`}
                style={{
                  all: 'unset',
                  cursor: s.current ? 'not-allowed' : 'pointer',
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${s.current ? C.borderSoft : '#F4C7C7'}`,
                  background: s.current ? 'transparent' : '#FFF1F1',
                  color: s.current ? C.faint : '#A12626',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                Encerrar
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div style={{ fontSize: 12, color: C.faint, padding: '8px 4px' }}>
              Nenhuma sessão ativa além desta.
            </div>
          )}
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
            background: toast.kind === 'danger' ? '#FFE6E6' : '#F4F0E8',
            color: toast.kind === 'danger' ? '#A12626' : C.ink,
            border: `1px solid ${toast.kind === 'danger' ? '#F4C7C7' : C.borderSoft}`,
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

      {showPassSheet && (
        <ChangePasswordSheet
          dark={dark}
          onClose={() => setShowPassSheet(false)}
          onStubSubmit={() => {
            setShowPassSheet(false);
            setToast({
              kind: 'info',
              text: 'Em desenvolvimento — endpoint POST /auth/change-password chega no round 19.',
            });
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
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ color: C.faint, opacity: 0.5, flexShrink: 0 }}>{Icon.arrow(16)}</div>
    </button>
  );
}

// ─── ChangePasswordSheet — modal simples, validação local antes do stub.
function ChangePasswordSheet({
  onClose,
  onStubSubmit,
  dark,
}: {
  onClose: () => void;
  onStubSubmit: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    if (!current.trim()) {
      setErr('Informe a senha atual.');
      return;
    }
    if (next.length < 8) {
      setErr('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (next !== confirm) {
      setErr('Nova senha e confirmação não conferem.');
      return;
    }
    onStubSubmit();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trocar senha"
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
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
          Trocar senha
        </h2>
        <div style={{ fontSize: 12.5, color: C.mute, marginTop: 4, fontWeight: 500, lineHeight: 1.4 }}>
          Defina uma senha forte com pelo menos 8 caracteres.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <Field
            dark={dark}
            label="Senha atual"
            value={current}
            onChange={setCurrent}
            type="password"
            autoComplete="current-password"
          />
          <Field
            dark={dark}
            label="Nova senha"
            value={next}
            onChange={setNext}
            type="password"
            autoComplete="new-password"
          />
          <Field
            dark={dark}
            label="Confirmar nova senha"
            value={confirm}
            onChange={setConfirm}
            type="password"
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
          <GButton dark={dark} full kind="primary" onClick={submit}>
            Trocar senha
          </GButton>
        </div>
      </div>
    </div>
  );
}

// ─── Field — input padronizado pra sheet de senha.
function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  dark,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
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
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        style={{
          padding: '12px 12px',
          borderRadius: 10,
          border: `1px solid ${C.borderSoft}`,
          background: C.surface,
          color: C.ink,
          fontSize: 14,
          fontFamily: G_FONT,
          outline: 'none',
        }}
      />
    </label>
  );
}

export default ScreenHostSecurity;
