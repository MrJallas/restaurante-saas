// ============================================================
// V16 GARÇOM · ROUND 8b · NOTIFICAÇÃO PASSIVA DE LATE-ARRIVAL
// ────────────────────────────────────────────────────────────
// Round 8b é principalmente customer-side (ver app-cliente-canvas-v15).
// Do lado staff, o único impacto é uma NOTIFICAÇÃO PASSIVA depois que
// o customer-host aprovou: o staff vê que a mesa expandiu (3 → 4
// pessoas) e pode ajustar capacidade · disposição · próxima rodada de
// pratos. NÃO é alerta · NÃO é decisão · só info.
//
// Por que isso e não cascata pro staff aprovar:
//   Decisão social entre clientes (alguém quer juntar à mesa) é melhor
//   resolvida entre clientes. Se host não responde → cliente B chama
//   recepcionista presencialmente (waiter-call existente · humano
//   resolve com humano). Software não escala automaticamente.
//
// EXPORT: window.GARCOM_LATE_ARRIVAL_INFO_SECTIONS · 1 DCSection
//   2 frames · iOS + Android (paridade) do Painel · Em curso com
//   MInProgressCard kind="info-late-arrival" no topo.
//
// LINGUAGEM:
//   - border-left ink (não mostarda · não vermelho) · é só info
//   - eyebrow ink-mute · "INFO · MESA 14 EXPANDIU"
//   - sem CTA primário (já tá resolvido) · só "Dispensar" outline
//   - auto-some em 60 s (representado em prosa na nota)
// ============================================================

const { useState: laUseState } = React;

// ─────────────────────────────────────────────────────────────
// Frames locais ao módulo (Babel escopa cada <script>)
// ─────────────────────────────────────────────────────────────
const LaIOSFrame = ({ children, style }) => {
  const ink = '#0a0a0a';
  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: '#ffffff',
        color: ink,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: `1.5px solid ${ink}`,
        borderRadius: 44,
        ...style,
      }}
    >
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
            background: ink,
          }}
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
          <svg width="17" height="11" viewBox="0 0 17 11">
            <rect x="0" y="6" width="3" height="4" rx="0.6" fill={ink} />
            <rect x="4.5" y="4" width="3" height="6" rx="0.6" fill={ink} />
            <rect x="9" y="2" width="3" height="8" rx="0.6" fill={ink} />
            <rect x="13.5" y="0" width="3" height="10" rx="0.6" fill={ink} />
          </svg>
          <svg width="15" height="11" viewBox="0 0 15 11">
            <path
              d="M7.5 2.5C9.6 2.5 11.5 3.4 12.8 4.8L13.8 3.8C12.2 2.2 10 1 7.5 1 5 1 2.8 2.2 1.2 3.8L2.2 4.8C3.5 3.4 5.4 2.5 7.5 2.5Z"
              fill={ink}
            />
            <path
              d="M7.5 5.8C8.8 5.8 9.9 6.3 10.7 7.1L11.7 6.1C10.6 5 9.1 4.3 7.5 4.3 5.9 4.3 4.4 5 3.3 6.1L4.3 7.1C5.1 6.3 6.2 5.8 7.5 5.8Z"
              fill={ink}
            />
            <circle cx="7.5" cy="9" r="1.3" fill={ink} />
          </svg>
          <svg width="24" height="11" viewBox="0 0 24 11">
            <rect
              x="0.5"
              y="0.5"
              width="20"
              height="10"
              rx="2.8"
              stroke={ink}
              strokeOpacity="0.4"
              fill="none"
            />
            <rect x="2" y="2" width="17" height="7" rx="1.5" fill={ink} />
          </svg>
        </div>
      </div>
      {children}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 134,
          height: 5,
          borderRadius: 3,
          background: ink,
          opacity: 0.85,
        }}
      />
    </div>
  );
};

const LaAndroidFrame = ({ children, style }) => {
  const ink = '#0a0a0a';
  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: '#ffffff',
        color: ink,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: `1.5px solid ${ink}`,
        borderRadius: 36,
        ...style,
      }}
    >
      <div
        style={{
          height: 32,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 500,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <span>9:30</span>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 8,
            transform: 'translateX(-50%)',
            width: 18,
            height: 18,
            borderRadius: 9,
            background: ink,
          }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="14" height="11" viewBox="0 0 14 11">
            <path d="M7 10L0 3a9 9 0 0114 0L7 10z" fill={ink} />
          </svg>
          <svg width="14" height="11" viewBox="0 0 14 11">
            <path d="M13 10V0L1 10h12z" fill={ink} />
          </svg>
          <svg width="20" height="11" viewBox="0 0 20 11">
            <rect x="2" y="1.5" width="14" height="8" rx="1.2" fill="none" stroke={ink} />
            <rect x="3.5" y="3" width="11" height="5" rx="0.6" fill={ink} />
            <rect x="16.5" y="4" width="1.5" height="3" rx="0.4" fill={ink} />
          </svg>
        </div>
      </div>
      {children}
      <div
        style={{
          height: 18,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ width: 100, height: 3, borderRadius: 2, background: ink, opacity: 0.7 }} />
      </div>
    </div>
  );
};

// helper builder
const fLA = ({ label, platform = 'iOS', screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard
      key={'v16g-' + label + '-' + platform}
      id={'v16g-' + label + '-' + platform}
      label={`${label} · ${platform}`}
      width={414}
      height={844 + captionH + 24}
      style={{ background: '#f0eee9', borderRadius: 4 }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 12px',
          gap: 18,
        }}
      >
        {screen}
        {note && (
          <div
            style={{
              marginTop: 14,
              maxWidth: 420,
              fontSize: 12,
              color: '#6b6b6b',
              lineHeight: 1.5,
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: -0.05,
            }}
          >
            {note}
          </div>
        )}
      </div>
    </DCArtboard>
  );
};

// ─────────────────────────────────────────────────────────────
// MInProgressCard kind="info-late-arrival"
//   border-left ink (não mostarda · só info)
//   eyebrow ink-mute
//   1 ação outline · "Dispensar"
//   sub: "auto-some em 48 s"
// ─────────────────────────────────────────────────────────────
const MLateArrivalInfoCard = ({
  table = 14,
  before = 3,
  after = 4,
  receivedAgo = 'há 12 s',
  autoDismiss = '48 s',
}) => {
  const C = useG(false);
  return (
    <div
      style={{
        cursor: 'default',
        userSelect: 'none',
        position: 'relative',
        padding: '12px 12px 12px 14px',
        borderRadius: 14,
        border: `1px solid ${C.borderSoft}`,
        borderLeft: `3px solid ${C.ink}`,
        background: C.bg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 9.5,
          fontWeight: 800,
          color: C.faint,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}
      >
        <span
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            background: '#f0eee9',
            color: C.ink,
            letterSpacing: 0.7,
          }}
        >
          INFO
        </span>
        <span>MESA {table} EXPANDIU</span>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: C.ink,
          letterSpacing: -0.15,
          lineHeight: 1.35,
          marginTop: 8,
        }}
      >
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {before} → {after}
        </span>{' '}
        pessoas · host aprovou
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: C.faint,
          fontWeight: 500,
          marginTop: 3,
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          letterSpacing: 0.2,
        }}
      >
        {receivedAgo} · auto-some em {autoDismiss}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center' }}>
        <button
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            padding: '7px 12px',
            height: 32,
            borderRadius: 8,
            border: `1px solid ${C.borderSoft}`,
            background: 'transparent',
            color: C.ink,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: -0.1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Dispensar
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MgrPainelLateArrivalFrame · iOS / Android
// Reusa shape do Painel · Em curso (igual MgrPainelQrIssueFrame em V15)
// ─────────────────────────────────────────────────────────────
const MgrPainelLateArrivalFrame = ({ andro = false }) => {
  const C = useG(false);
  const Frame = andro ? LaAndroidFrame : LaIOSFrame;

  return (
    <Frame>
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          background: C.surface,
          fontFamily: G_FONT,
          color: C.ink,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 16px 12px',
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.surface,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
              Painel
            </div>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.ink,
                position: 'relative',
              }}
            >
              {Icon.bell(18)}
              <span
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  minWidth: 14,
                  height: 14,
                  borderRadius: 7,
                  background: C.ink,
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '0 3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                1
              </span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.faint, fontWeight: 500, marginTop: 6 }}>
            Boa noite,
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: -0.4,
              color: C.ink,
              marginTop: 2,
            }}
          >
            Renata Albuquerque
          </div>
          <div
            style={{
              display: 'inline-flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 10,
              fontSize: 11,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#1E8C5A',
                animation: 'gPulse 2s infinite',
              }}
            />
            AO VIVO · TURNO DA NOITE · 20:21
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ marginTop: 18 }}>
            <div style={{ padding: '0 16px 8px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Em curso · 3
              </div>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ★ NOVO V16 · MInProgressCard kind="info-late-arrival" no TOPO */}
              <MLateArrivalInfoCard
                table={14}
                before={3}
                after={4}
                receivedAgo="há 12 s"
                autoDismiss="48 s"
              />

              {/* placeholder · qr-issue (continua existindo de V15) · pra contexto */}
              <div
                style={{
                  padding: '12px 12px 12px 14px',
                  borderRadius: 14,
                  border: `1px solid ${C.borderSoft}`,
                  borderLeft: `3px solid #D98E2B`,
                  background: C.bg,
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    color: '#9A7212',
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}
                >
                  QR ILEGÍVEL · MESA 7
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.ink,
                    letterSpacing: -0.1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Marcos reportou · há 4 min
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: C.faint,
                    fontWeight: 500,
                    marginTop: 3,
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    letterSpacing: 0.2,
                  }}
                >
                  "QR descolou da mesa"
                </div>
              </div>

              {/* placeholder · cortesia */}
              <div
                style={{
                  padding: '12px 12px 12px 14px',
                  borderRadius: 14,
                  border: `1px solid ${C.borderSoft}`,
                  borderLeft: `3px solid #3B5FBE`,
                  background: C.bg,
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    color: '#3B5FBE',
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}
                >
                  CORTESIA · MESA 18 · AGUARDANDO ACEITAR
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.ink,
                    letterSpacing: -0.1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Sobremesa · Petit gâteau · 2 porções
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22, padding: '0 16px 8px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              Hoje no turno
            </div>
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${C.borderSoft}`,
                background: C.bg,
                fontSize: 12,
                color: C.faint,
                fontWeight: 500,
              }}
            >
              Mesa 14 · expansão aprovada · 3 → 4 pessoas
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ═════════════════════════════════════════════════════════════
// DCSection EXPORT
// ═════════════════════════════════════════════════════════════
window.GARCOM_LATE_ARRIVAL_INFO_SECTIONS = [
  {
    id: 'staff-late-arrival-info',
    title: 'Late-arrival · notificação passiva pro staff',
    subtitle:
      'Round 8b é majoritariamente customer-side (ver canvas cliente V15, seção customer-late-arrival-flow). ' +
      'No staff, o único frame novo é o MInProgressCard kind="info-late-arrival" — info, não alerta. ' +
      'border-left ink · auto-some em 60 s · sem CTA primário (já tá resolvido).',
    frames: [
      fLA({
        label: '01 Painel · Em curso · MInProgressCard info-late-arrival',
        platform: 'iOS',
        screen: <MgrPainelLateArrivalFrame />,
        note:
          'Card no TOPO de "Em curso" · 1 dos 3 cards atuais. border-left ink (não mostarda · não vermelho · só info). ' +
          'Eyebrow "INFO · MESA 14 EXPANDIU". Body "3 → 4 pessoas · host aprovou". Subline "há 12 s · auto-some em 48 s". ' +
          'Aparece pros 3 staff roles (recepcionista · manager · garçom da mesa). Single button outline "Dispensar" — não tem ' +
          'ação primária porque não há nada pra resolver: customer-host já decidiu e backend já gravou. Só awareness.',
      }),
      fLA({
        label: '02 Painel · Em curso · MInProgressCard info-late-arrival',
        platform: 'Android',
        screen: <MgrPainelLateArrivalFrame andro />,
        note:
          'Paridade Android. Mesma estrutura · só muda chrome do device (status bar 32 px · gesture bar inferior 18 px · ' +
          'borderRadius 36 vs 44). Card de info-late-arrival idêntico em ambos.',
      }),
    ],
  },
];
