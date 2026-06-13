const { useState, useEffect } = React;

// ============ TOKENS — white theme, black borders ============
const C = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  border: '#0a0a0a',
  borderSoft: '#e5e5e5',
  mute: '#6b6b6b',
  faint: '#a3a3a3',
  surface: '#f6f5f2',
  danger: '#c43a3a',
  success: '#2f7d4f',
};

const FONT = "'Inter', system-ui, -apple-system, sans-serif";

// ============ iPhone Frame ============
const Frame = ({ children, style, hideStatusBar }) => (
  <div
    style={{
      width: 390,
      height: 844,
      background: C.bg,
      color: C.ink,
      fontFamily: FONT,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      border: `1.5px solid ${C.border}`,
      borderRadius: 44,
      ...style,
    }}
  >
    {!hideStatusBar && (
      <div
        style={{
          height: 44,
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 10,
            transform: 'translateX(-50%)',
            width: 110,
            height: 30,
            borderRadius: 15,
            background: C.ink,
          }}
        />
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
          <span>●●●●</span>
          <span>􀙇</span>
          <span>100%</span>
        </div>
      </div>
    )}
    {children}
  </div>
);

// ============ SCREEN 1: Splash (carregamento ao escanear QR) ============
const S1_Splash = () => (
  <Frame>
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          border: `1.5px solid ${C.ink}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        TL
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Trattoria Luna</div>
        <div style={{ fontSize: 11, color: C.mute, letterSpacing: 2, marginTop: 4 }}>MESA 12</div>
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                background: C.ink,
                animation: `bounce 1s ${d}ms infinite`,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 13, color: C.mute, textAlign: 'center' }}>
          Preparando sua experiência
        </div>
      </div>
    </div>
    <style>{`@keyframes bounce {
      0%,100% { transform: translateY(0); opacity: 0.3; }
      50% { transform: translateY(-6px); opacity: 1; }
    }`}</style>
  </Frame>
);

// ============ SCREEN 2a: Welcome Modal — estado vazio ============
const S2a_WelcomeEmpty = () => (
  <Frame>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 18,
        right: 18,
        top: '50%',
        transform: 'translateY(-50%)',
        background: '#fff',
        border: `1.5px solid ${C.ink}`,
        borderRadius: 24,
        padding: 26,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          textAlign: 'center',
          color: C.ink,
          marginBottom: 6,
          letterSpacing: -0.5,
          textWrap: 'pretty',
        }}
      >
        Bem-vindo ao Trattoria Luna
      </div>
      <div
        style={{
          fontSize: 13,
          color: C.mute,
          textAlign: 'center',
          marginBottom: 22,
          textWrap: 'pretty',
          lineHeight: 1.45,
        }}
      >
        Para personalizar sua experiência, informe seu nome e CPF.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          Nome
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.borderSoft}`,
            fontSize: 15,
            color: C.faint,
          }}
        >
          Como devemos te chamar?
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          CPF
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.borderSoft}`,
            fontSize: 15,
            color: C.faint,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          000.000.000-00
        </div>
      </div>

      <button
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 999,
          background: C.ink,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          border: 'none',
          opacity: 0.4,
          fontFamily: FONT,
          letterSpacing: -0.1,
        }}
        disabled
      >
        Continuar
      </button>
    </div>
  </Frame>
);

// ============ SCREEN 2b: Welcome Modal — preenchido ============
const S2b_WelcomeFilled = () => (
  <Frame>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 18,
        right: 18,
        top: '50%',
        transform: 'translateY(-50%)',
        background: '#fff',
        border: `1.5px solid ${C.ink}`,
        borderRadius: 24,
        padding: 26,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          textAlign: 'center',
          color: C.ink,
          marginBottom: 6,
          letterSpacing: -0.5,
          textWrap: 'pretty',
        }}
      >
        Bem-vindo ao Trattoria Luna
      </div>
      <div
        style={{
          fontSize: 13,
          color: C.mute,
          textAlign: 'center',
          marginBottom: 22,
          textWrap: 'pretty',
          lineHeight: 1.45,
        }}
      >
        Para personalizar sua experiência, informe seu nome e CPF.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          Nome
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.ink}`,
            fontSize: 15,
            color: C.ink,
          }}
        >
          Caleb Medeiros
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          CPF
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.ink}`,
            fontSize: 15,
            color: C.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          123.456.789-09
        </div>
      </div>

      <button
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 999,
          background: C.ink,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          border: 'none',
          fontFamily: FONT,
          letterSpacing: -0.1,
        }}
      >
        Continuar
      </button>
    </div>
  </Frame>
);

// ============ SCREEN 2c: Welcome Modal — CPF inválido ============
const S2c_WelcomeError = () => (
  <Frame>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 18,
        right: 18,
        top: '50%',
        transform: 'translateY(-50%)',
        background: '#fff',
        border: `1.5px solid ${C.ink}`,
        borderRadius: 24,
        padding: 26,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          textAlign: 'center',
          color: C.ink,
          marginBottom: 6,
          letterSpacing: -0.5,
          textWrap: 'pretty',
        }}
      >
        Bem-vindo ao Trattoria Luna
      </div>
      <div
        style={{
          fontSize: 13,
          color: C.mute,
          textAlign: 'center',
          marginBottom: 22,
          textWrap: 'pretty',
          lineHeight: 1.45,
        }}
      >
        Para personalizar sua experiência, informe seu nome e CPF.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          Nome
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.ink}`,
            fontSize: 15,
            color: C.ink,
          }}
        >
          Caleb Medeiros
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          CPF
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.danger}`,
            fontSize: 15,
            color: C.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          123.456.789-0_
        </div>
        <div style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>
          CPF inválido. Verifique os números digitados.
        </div>
      </div>

      <button
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 999,
          background: C.ink,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          border: 'none',
          fontFamily: FONT,
          letterSpacing: -0.1,
        }}
      >
        Continuar
      </button>
    </div>
  </Frame>
);

// ============ APP — layout simples lado a lado ============
const App = () => (
  <div
    style={{
      minHeight: '100vh',
      background: '#f0efe9',
      padding: '40px 20px',
      fontFamily: FONT,
    }}
  >
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 11,
            color: C.mute,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Restaurante SaaS · Handoff
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1, margin: 0 }}>
          Entrada & Identidade
        </h1>
        <p style={{ fontSize: 15, color: C.mute, maxWidth: 640, marginTop: 8, lineHeight: 1.5 }}>
          Telas iniciais do fluxo: ao escanear o QR Code da mesa, o cliente vê o splash de
          carregamento e em seguida o modal de identificação (nome + CPF). Estados: vazio,
          preenchido válido, CPF inválido.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        <Card label="01 · Splash" sub="Carregamento ao escanear QR (~1.5s)">
          <S1_Splash />
        </Card>
        <Card label="02a · Modal vazio" sub="Estado inicial · botão desabilitado">
          <S2a_WelcomeEmpty />
        </Card>
        <Card label="02b · Modal preenchido" sub="CPF válido · pronto para enviar">
          <S2b_WelcomeFilled />
        </Card>
        <Card label="02c · Modal com erro" sub="CPF incompleto · feedback inline">
          <S2c_WelcomeError />
        </Card>
      </div>

      <div
        style={{
          marginTop: 48,
          padding: 28,
          background: '#fff',
          border: `1.3px solid ${C.borderSoft}`,
          borderRadius: 18,
          maxWidth: 720,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: C.mute,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Specs para implementação
        </div>
        <Spec
          k="Viewport"
          v="iPhone 14 baseline (390×844). Suportar SE (375×667) e Pro Max (430×932)."
        />
        <Spec
          k="Tema"
          v="Branco puro (#ffffff) · texto e bordas pretas (#0a0a0a) · superfícies #f6f5f2."
        />
        <Spec k="Tipografia" v="Inter 400/500/600/700 · letter-spacing -0.4 a -0.6 em títulos." />
        <Spec
          k="Bordas"
          v="1.3–1.5px sólidas · border-radius 14 (campo), 24 (modal), 44 (frame)."
        />
        <Spec
          k="Inputs CPF"
          v="Máscara 000.000.000-00 · validação dígito verificador BR · erro vermelho #c43a3a inline."
        />
        <Spec
          k="Splash → Modal"
          v="Splash mostra ~1500ms, depois faz fade do modal sobre fundo blur(4px)."
        />
        <Spec
          k="Backdrop"
          v="rgba(0,0,0,0.25) + backdropFilter blur(4px) · sombra modal 0 24px 60px rgba(0,0,0,0.25)."
        />
        <Spec
          k="Botão Continuar"
          v="Pill 999, padding 14, fundo preto · disabled opacity 0.4 quando inválido."
        />
        <Spec
          k="Acessibilidade"
          v="Mínimo 44×44px hit target · font-size 15+ em campos para evitar zoom iOS."
        />
        <Spec
          k="iOS Safari"
          v="Usar 100dvh em vez de 100vh · respeitar env(safe-area-inset-bottom)."
        />
        <Spec
          k="LGPD"
          v="Texto explicativo sobre uso do CPF deve ficar acessível via link 'por que pedimos?'."
        />
      </div>
    </div>
  </div>
);

const Card = ({ label, sub, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div>{children}</div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>{sub}</div>
    </div>
  </div>
);

const Spec = ({ k, v }) => (
  <div
    style={{
      display: 'flex',
      gap: 14,
      padding: '10px 0',
      borderBottom: `1px solid ${C.borderSoft}`,
    }}
  >
    <div style={{ width: 130, fontSize: 12, fontWeight: 600, color: C.ink, flexShrink: 0 }}>
      {k}
    </div>
    <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, textWrap: 'pretty', flex: 1 }}>
      {v}
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
