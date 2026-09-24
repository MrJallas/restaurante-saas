// ============================================================
// GARÇOM — TELAS DO APP (login, home, chamados, mesa, etc.)
// ============================================================

// ─── PRIMITIVES ──────────────────────────────────────────────
const GBadge = ({ tone = 'ink', children, dark = false, dot, pulse }) => {
  const C = useG(dark);
  const map = {
    ink: {
      bg: dark ? C.ink + '22' : '#0a0a0a',
      fg: dark ? C.ink : '#fff',
      bd: dark ? C.ink : '#0a0a0a',
    },
    danger: { bg: C.dangerBg, fg: C.danger, bd: C.danger },
    success: { bg: C.successBg, fg: C.success, bd: C.success },
    info: { bg: C.infoBg, fg: C.info, bd: C.info },
    warn: { bg: C.warnBg, fg: C.warn, bd: C.warn },
    soft: { bg: 'transparent', fg: C.mute, bd: C.borderSoft },
  };
  const t = map[tone] || map.ink;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 100,
        fontSize: 11,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
      }}
    >
      {dot && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            background: 'currentColor',
            animation: pulse ? 'gPulse 1.4s infinite' : 'none',
          }}
        />
      )}
      {children}
    </span>
  );
};

const GButton = ({ children, full, kind = 'primary', dark = false, icon, onClick }) => {
  const C = useG(dark);
  const styles = {
    primary: { bg: C.ink, fg: C.bg, bd: C.ink },
    secondary: { bg: 'transparent', fg: C.ink, bd: C.ink },
    danger: { bg: C.danger, fg: '#fff', bd: C.danger },
    success: { bg: C.success, fg: '#fff', bd: C.success },
    ghost: { bg: 'transparent', fg: C.mute, bd: 'transparent' },
  };
  const s = styles[kind];
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 20px',
        borderRadius: 14,
        cursor: 'pointer',
        fontFamily: G_FONT,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: -0.1,
        background: s.bg,
        color: s.fg,
        border: `1.5px solid ${s.bd}`,
        width: full ? '100%' : 'auto',
        minHeight: 48,
        textAlign: 'center',
      }}
    >
      {icon}
      {children}
    </button>
  );
};

// ─── STATUS BAR APP (não lockscreen) — barra superior simples
const GAppHeader = ({ left, title, right, dark = false, sub }) => {
  const C = useG(dark);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${C.borderFaint}`,
        background: C.bg,
      }}
    >
      <div style={{ width: 40 }}>{left}</div>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: C.ink }}>
          {title}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div style={{ width: 40, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
};

const GIconBtn = ({ icon, dark = false, badge }) => {
  const C = useG(dark);
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        border: `1.2px solid ${C.borderSoft}`,
        color: C.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: C.bg,
      }}
    >
      {icon}
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: C.danger,
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            border: `2px solid ${C.bg}`,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
};

// ─── BOTTOM NAV
// V3 (2026-05): aba "Novo" virou a entrada PRINCIPAL pro scanner.
// V4 (2026-05): aba "Novo" abre ScreenWaiterNewEntry (chooser de 2
// caminhos: escanear OU número), não vai mais direto pro scanner.
// Por isso o callback foi renomeado de `onScan` pra `onNewEntry`.
// Tap no Novo abre o chooser em modal fullscreen sobre a aba ativa —
// não substitui a aba. Ao fechar, volta pra aba que estava antes.
// `active="scan"` ainda existe pra renderização durante o modal.
const GBottomNav = ({ active = 'home', dark = false, onNewEntry = () => {} }) => {
  const C = useG(dark);
  const items = [
    { id: 'home', label: 'Mesas', icon: Icon.table },
    { id: 'calls', label: 'Chamados', icon: Icon.bell, badge: 3 },
    { id: 'scan', label: 'Novo', icon: Icon.qr, action: 'newEntry' },
    { id: 'shift', label: 'Turno', icon: Icon.history },
    { id: 'me', label: 'Eu', icon: Icon.user },
  ];
  return (
    <div
      style={{
        borderTop: `1px solid ${C.borderFaint}`,
        background: C.bg,
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 4px 14px',
      }}
    >
      {items.map((it) => {
        const isActive = it.id === active;
        const isAction = it.action === 'newEntry';
        const onClick = isAction ? onNewEntry : undefined;
        return (
          <button
            key={it.id}
            onClick={onClick}
            style={{
              all: 'unset',
              cursor: isAction ? 'pointer' : 'default',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 2px',
              position: 'relative',
              color: isActive ? C.ink : C.faint,
            }}
          >
            <div style={{ position: 'relative' }}>
              {it.icon(22)}
              {it.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: C.danger,
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                  }}
                >
                  {it.badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500, letterSpacing: 0.2 }}>
              {it.label}
            </span>
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 28,
                  height: 2,
                  borderRadius: 1,
                  background: C.ink,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

// ============================================================
// LOGIN — campo de input reutilizável
// ============================================================
const GField = ({
  label,
  value,
  placeholder,
  dark,
  type = 'text',
  error,
  hint,
  right,
  focused,
}) => {
  const C = useG(dark);
  const isPwd = type === 'password';
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: 700,
          color: error ? C.danger : C.mute,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 14px',
          borderRadius: 12,
          border: `1.5px solid ${error ? C.danger : focused ? C.ink : C.borderSoft}`,
          background: C.bg,
          color: C.ink,
          boxShadow: focused
            ? `0 0 0 3px ${dark ? 'rgba(244,244,244,0.08)' : 'rgba(10,10,10,0.06)'}`
            : 'none',
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: value ? C.ink : C.faint,
            flex: 1,
            letterSpacing: isPwd && value ? 4 : -0.2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value ? (isPwd ? '●'.repeat(value.length) : value) : placeholder}
        </span>
        {focused && (
          <span
            style={{
              display: 'inline-block',
              width: 1.5,
              height: 20,
              background: C.ink,
              animation: 'gBlink 1s infinite',
            }}
          />
        )}
        {right}
      </div>
      {(error || hint) && (
        <div
          style={{
            fontSize: 12,
            marginTop: 6,
            color: error ? C.danger : C.mute,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {error && <span>⚠</span>}
          {error || hint}
        </div>
      )}
    </div>
  );
};

// ============================================================
// LOGIN — primeiro acesso com CPF + senha
// ============================================================
const ScreenLogin = ({ dark = false, error = false, firstTime = false }) => {
  const C = useG(dark);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 24px 28px',
        overflow: 'auto',
      }}
    >
      {/* header / brand */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: C.ink,
          color: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 19,
          letterSpacing: -0.5,
        }}
      >
        TL
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          fontWeight: 600,
          color: C.mute,
          marginTop: 22,
        }}
      >
        Trattoria Luna · App do garçom
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: -0.8,
          marginTop: 4,
          lineHeight: 1.15,
        }}
      >
        {firstTime ? 'Vamos começar.' : 'Entre na sua conta.'}
      </div>
      <div style={{ fontSize: 14, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>
        {firstTime
          ? 'Use o CPF cadastrado pelo gerente e a senha provisória que você recebeu.'
          : 'Identifique-se para começar a receber os chamados das mesas.'}
      </div>

      {/* form */}
      <div style={{ marginTop: 28 }}>
        <GField dark={dark} label="CPF" placeholder="000.000.000-00" value="345.218.907-44" />
        <GField
          dark={dark}
          label="Senha"
          type="password"
          placeholder="Sua senha"
          value={error ? '12345' : '12345678'}
          focused={!error}
          error={error ? 'CPF ou senha incorretos. Restam 2 tentativas.' : null}
          right={
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.mute,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              mostrar
            </span>
          }
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 4,
            marginBottom: 22,
          }}
        >
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                border: `1.5px solid ${C.ink}`,
                background: C.ink,
                color: C.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.check(12)}
            </span>
            Manter conectado
          </label>
          <span
            style={{ fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: 'underline' }}
          >
            Esqueci a senha
          </span>
        </div>

        <GButton kind="primary" dark={dark} full icon={Icon.arrow(18)}>
          {firstTime ? 'Entrar e cadastrar nova senha' : 'Entrar'}
        </GButton>

        <div
          style={{
            margin: '20px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: C.faint,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <div style={{ flex: 1, height: 1, background: C.borderFaint }} />
          ou
          <div style={{ flex: 1, height: 1, background: C.borderFaint }} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '14px 16px',
            borderRadius: 14,
            border: `1.5px solid ${C.borderSoft}`,
            color: C.ink,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
            <circle cx="12" cy="16" r="1.5" fill="currentColor" />
          </svg>
          Entrar com biometria
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 24 }} />

      <div style={{ textAlign: 'center', fontSize: 12, color: C.mute, lineHeight: 1.5 }}>
        Sem conta? Peça ao seu gerente para te cadastrar.
        <br />
        <span style={{ color: C.faint }}>Trattoria Luna · v 2.4.1</span>
      </div>
    </div>
  );
};

// ============================================================
// ESQUECEU A SENHA — escolher canal (e-mail / SMS)
// ============================================================
const ScreenForgotPassword = ({ dark = false, step = 'choose' }) => {
  const C = useG(dark);

  if (step === 'choose') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: C.bg,
          color: C.ink,
          fontFamily: G_FONT,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <GAppHeader
          dark={dark}
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
          title="Recuperar senha"
        />
        <div style={{ flex: 1, padding: '24px 24px 16px', overflow: 'auto' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: C.surface,
              border: `1.5px solid ${C.borderSoft}`,
              color: C.ink,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 018 0" />
              <path d="M16 8l3-3M19 5h-3M19 5v3" />
            </svg>
          </div>

          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.2 }}>
            Esqueceu a senha?
          </div>
          <div style={{ fontSize: 14, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>
            Digite o CPF cadastrado e escolha como você quer receber o código de verificação.
          </div>

          <div style={{ marginTop: 24 }}>
            <GField
              dark={dark}
              label="CPF cadastrado"
              placeholder="000.000.000-00"
              value="345.218.907-44"
              focused
            />
          </div>

          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontWeight: 700,
              color: C.mute,
              marginTop: 14,
              marginBottom: 10,
            }}
          >
            Enviar código por
          </div>

          {[
            {
              id: 'sms',
              sel: true,
              title: 'SMS',
              sub: '(11) ●●●●●-●●44',
              icon: (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="2" width="14" height="20" rx="3" />
                  <path d="M11 18h2" />
                </svg>
              ),
            },
            {
              id: 'mail',
              sel: false,
              title: 'E-mail',
              sub: 'm●●●●●@trattorialuna.com.br',
              icon: (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              ),
            },
            {
              id: 'whatsapp',
              sel: false,
              title: 'WhatsApp',
              sub: '(11) ●●●●●-●●44',
              icon: (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 21l1.5-5A8 8 0 113 21z" />
                  <path d="M9 10c0 3 2 5 5 5l1-1c.5-.5 1-.3 1.5 0l1 .5c.4.2.5.6.3 1-.5 1-1.5 1.5-2.5 1.5-3 0-7-3-7-7 0-1 .5-2 1.5-2.5.4-.2.8-.1 1 .3l.5 1c.3.5.5 1 0 1.5l-1 1z" />
                </svg>
              ),
            },
          ].map((opt, i, arr) => (
            <div
              key={opt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 14,
                border: `1.5px solid ${opt.sel ? C.ink : C.borderSoft}`,
                background: opt.sel ? (dark ? 'rgba(244,244,244,0.04)' : '#fafafa') : 'transparent',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: opt.sel ? C.ink : C.surface,
                  color: opt.sel ? C.bg : C.mute,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {opt.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>
                  {opt.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: C.mute,
                    marginTop: 2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {opt.sub}
                </div>
              </div>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  border: `1.5px solid ${opt.sel ? C.ink : C.borderSoft}`,
                  background: opt.sel ? C.ink : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {opt.sel && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: C.bg,
                    }}
                  />
                )}
              </div>
            </div>
          ))}

          <div style={{ fontSize: 12, color: C.mute, marginTop: 14, lineHeight: 1.5 }}>
            Os dados aparecem mascarados por segurança. Se nenhum desses contatos for válido, fale
            com o gerente para atualizar seu cadastro.
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.borderFaint}`, padding: '12px 16px 14px' }}>
          <GButton kind="primary" dark={dark} full icon={Icon.arrow(18)}>
            Enviar código por SMS
          </GButton>
        </div>
      </div>
    );
  }

  // step === 'code' → tela de digitar o código de 6 dígitos
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Verificação"
      />
      <div style={{ flex: 1, padding: '24px 24px 16px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.2 }}>
          Digite o código
        </div>
        <div style={{ fontSize: 14, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>
          Enviamos um código de 6 dígitos via SMS para{' '}
          <b style={{ color: C.ink }}>(11) ●●●●●-●●44</b>. O código expira em 10 minutos.
        </div>

        {/* 6 dígitos */}
        <div style={{ display: 'flex', gap: 10, marginTop: 28, justifyContent: 'space-between' }}>
          {['4', '7', '2', '9', '', ''].map((d, i) => {
            const isActive = i === 4;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  aspectRatio: '1 / 1.15',
                  borderRadius: 12,
                  border: `1.5px solid ${isActive ? C.ink : d ? C.ink : C.borderSoft}`,
                  background: C.bg,
                  color: C.ink,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  position: 'relative',
                  boxShadow: isActive
                    ? `0 0 0 3px ${dark ? 'rgba(244,244,244,0.08)' : 'rgba(10,10,10,0.06)'}`
                    : 'none',
                }}
              >
                {d}
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      width: 2,
                      height: 28,
                      background: C.ink,
                      animation: 'gBlink 1s infinite',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, fontSize: 13, color: C.mute, textAlign: 'center' }}>
          Não recebeu?{' '}
          <span style={{ color: C.ink, fontWeight: 600, textDecoration: 'underline' }}>
            Reenviar em 0:42
          </span>
        </div>

        <div style={{ marginTop: 18, fontSize: 12, color: C.mute, textAlign: 'center' }}>
          <span style={{ textDecoration: 'underline' }}>Trocar para e-mail</span>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.borderFaint}`, padding: '12px 16px 14px' }}>
        <GButton kind="primary" dark={dark} full>
          Verificar código
        </GButton>
      </div>
    </div>
  );
};

// ============================================================
// DEFINIR NOVA SENHA — com requisitos visíveis
// ============================================================
const ScreenSetNewPassword = ({ dark = false }) => {
  const C = useG(dark);

  const reqs = [
    { ok: true, t: 'Mínimo de 8 caracteres' },
    { ok: true, t: 'Pelo menos uma letra maiúscula' },
    { ok: true, t: 'Pelo menos um número' },
    { ok: false, t: 'Pelo menos um caractere especial (!@#$...)' },
    { ok: true, t: 'Diferente da senha anterior' },
  ];
  const score = reqs.filter((r) => r.ok).length;
  const strengthLabel = score < 3 ? 'Fraca' : score < 5 ? 'Média' : 'Forte';
  const strengthColor = score < 3 ? C.danger : score < 5 ? C.warn : C.success;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Nova senha"
      />
      <div style={{ flex: 1, padding: '20px 24px 16px', overflow: 'auto' }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: C.successBg,
            color: C.success,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          {Icon.check(26)}
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.2 }}>
          Crie sua nova senha
        </div>
        <div style={{ fontSize: 14, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>
          Código verificado. Defina uma senha segura — você vai usar ela todo dia para entrar no
          app.
        </div>

        <div style={{ marginTop: 22 }}>
          <GField
            dark={dark}
            label="Nova senha"
            type="password"
            placeholder="Pelo menos 8 caracteres"
            value="Mariana2026"
            focused
            right={
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.mute,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                mostrar
              </span>
            }
          />

          {/* força da senha */}
          <div style={{ marginTop: -8, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background:
                      i < (score < 3 ? 1 : score < 5 ? 2 : 3) ? strengthColor : C.borderFaint,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontSize: 12,
                color: strengthColor,
                marginTop: 6,
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              Força: {strengthLabel}
            </div>
          </div>

          <GField
            dark={dark}
            label="Confirmar nova senha"
            type="password"
            placeholder="Digite novamente"
            value="Mariana2026"
            hint="As senhas conferem"
          />
        </div>

        {/* requisitos */}
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 14,
            background: C.surface,
            border: `1px solid ${C.borderFaint}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontWeight: 700,
              color: C.mute,
              marginBottom: 10,
            }}
          >
            Requisitos
          </div>
          {reqs.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '5px 0',
                fontSize: 13,
                color: r.ok ? C.ink : C.mute,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: r.ok ? C.success : 'transparent',
                  border: `1.5px solid ${r.ok ? C.success : C.borderSoft}`,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {r.ok && Icon.check(11)}
              </span>
              {r.t}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 12,
            background: C.warnBg,
            color: C.warn,
            fontSize: 12,
            lineHeight: 1.45,
            display: 'flex',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
          <div>
            Você será desconectado de todos os outros dispositivos depois de salvar a nova senha.
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.borderFaint}`, padding: '12px 16px 14px' }}>
        <GButton kind="primary" dark={dark} full icon={Icon.check(18)}>
          Salvar e entrar
        </GButton>
      </div>
    </div>
  );
};

// ============================================================
// HOME · MINHAS MESAS — única variação (era Grade · Lista · Mapa em V2;
// Lista e Mapa foram cortadas no V3). Entrada principal do garçom no
// turno: cards de mesa em 2 colunas. `fab` opcional liga um botão
// flutuante no canto inferior direito (fallback pra quem esquece da
// aba Novo). `onNewEntry` propaga pro GBottomNav e pro FAB · ambos
// abrem ScreenWaiterNewEntry (V4 · chooser de QR/número).
// ============================================================
const ScreenHomeGrid = ({ dark = false, fab = false, onNewEntry = () => {} }) => {
  const C = useG(dark);
  const statusMap = {
    novo: { tone: 'warn', label: 'Novo' },
    'aguardando-prato': { tone: 'info', label: 'Aguardando' },
    'em-andamento': { tone: 'soft', label: 'Em andamento' },
    livre: { tone: 'soft', label: 'Livre' },
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <GAppHeader
        dark={dark}
        left={
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: C.ink,
              color: C.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            MC
          </div>
        }
        title="Minhas mesas"
        sub="5 ABERTAS · 1 LIVRE"
        right={<GIconBtn icon={Icon.bell(20)} dark={dark} badge="3" />}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
        {/* faixa de chamados ativos */}
        <div
          style={{
            background: C.dangerBg,
            border: `1px solid ${C.danger}`,
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
            color: C.danger,
          }}
        >
          {Icon.hand(20)}
          <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: C.danger }}>
            Mesa 18 chamou · agora
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            Atender →
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          {G_TABLES.map((t) => {
            const s = statusMap[t.status];
            const isLivre = t.status === 'livre';
            const isNovo = t.status === 'novo';
            return (
              <div
                key={t.num}
                style={{
                  border: `1.5px solid ${isNovo ? C.warn : C.borderSoft}`,
                  borderRadius: 16,
                  padding: 14,
                  background: isLivre ? 'transparent' : C.bg,
                  opacity: isLivre ? 0.5 : 1,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        color: C.mute,
                        fontWeight: 600,
                      }}
                    >
                      Mesa
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 700,
                        letterSpacing: -1,
                        lineHeight: 1,
                        marginTop: 2,
                      }}
                    >
                      {String(t.num).padStart(2, '0')}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.mute,
                      textAlign: 'right',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {Icon.user(12)} {t.occupied}/{t.seats}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <GBadge tone={s.tone} dark={dark} dot pulse={isNovo}>
                    {s.label}
                  </GBadge>
                </div>
                <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8, lineHeight: 1.4 }}>
                  {t.last}
                </div>
                {!isLivre && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: `1px dashed ${C.borderFaint}`,
                    }}
                  >
                    <span style={{ fontSize: 11, color: C.faint }}>{t.openedMin} min</span>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                    >
                      R$ {t.ticket.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FAB flutuante · variação alternativa pra abrir nova interação.
          V4: vai pro ScreenWaiterNewEntry (chooser), não direto pro scanner. */}
      {fab && (
        <button
          onClick={onNewEntry}
          aria-label="Nova interação na mesa"
          style={{
            position: 'absolute',
            right: 16,
            bottom: 76,
            width: 56,
            height: 56,
            borderRadius: 28,
            background: C.ink,
            color: C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 24px -8px rgba(0,0,0,0.35)',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            zIndex: 3,
          }}
        >
          {Icon.qr(24)}
        </button>
      )}

      <GBottomNav active="home" dark={dark} onNewEntry={onNewEntry} />
    </div>
  );
};

// ============================================================
// REMOVIDO 2026-05 (V3) — ScreenHomeList + ScreenHomeMap
// ────────────────────────────────────────────────────────────
// Decisão: a Home tem só UMA variação (Grade). Lista por prioridade
// e Mapa do salão eram propostas paralelas que não pagaram a complexidade
// do toggle. Grade é suficiente — garçom pensa por mesa. CallRow ficou
// porque é reutilizado em screens-b.jsx (TablePicker, CallDetail).
// ============================================================

const CallRow = ({ table, type, sub, time, urgent, dark = false, accepted }) => {
  const C = useG(dark);
  const meta = CALL_TYPES[type];
  const tone = meta.tone;
  const tint =
    tone === 'danger'
      ? C.danger
      : tone === 'success'
        ? C.success
        : tone === 'info'
          ? C.info
          : C.warn;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderBottom: `1px solid ${C.borderFaint}`,
        background: urgent ? C.dangerBg + '99' : 'transparent',
        position: 'relative',
      }}
    >
      {urgent && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: C.danger,
          }}
        />
      )}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: tint + (dark ? '33' : '14'),
          color: tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {meta.icon(22)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>
            Mesa {String(table).padStart(2, '0')}
          </span>
          <span
            style={{
              fontSize: 11,
              color: C.mute,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {meta.label}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.mute,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sub}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: urgent ? C.danger : C.mute,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {time}
        </div>
        {accepted ? (
          <div style={{ fontSize: 11, color: C.success, marginTop: 4, fontWeight: 600 }}>
            Você ✓
          </div>
        ) : (
          <div
            style={{
              fontSize: 11,
              color: C.ink,
              marginTop: 4,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            atender {Icon.arrow(12)}
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, {
  ScreenLogin,
  ScreenForgotPassword,
  ScreenSetNewPassword,
  ScreenHomeGrid,
  GBadge,
  GButton,
  GField,
  GAppHeader,
  GIconBtn,
  GBottomNav,
  CallRow,
});
