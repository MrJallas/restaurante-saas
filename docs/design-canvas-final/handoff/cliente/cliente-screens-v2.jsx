// ============================================================
// V12 · APP DO CLIENTE — FLUXO DE AVALIAÇÃO E RECLAMAÇÃO
// 8 frames cobrindo o trigger do push até a resposta da gerente
// chegar no chat IA com chip-action.
// LINGUAGEM: idêntica ao cliente-tokens.jsx (branco · ink near-black ·
// Inter sans · mono caps tiny labels · pill outline/filled).
// ============================================================

const { useState: clUseState_v2 } = React;

// helper builder mesmo padrão de cliente-screens.jsx
const f2 = ({ label, platform = 'iOS', screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard
      key={label + platform}
      id={'v12-' + label + '-' + platform}
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
        {note && <Caption>{note}</Caption>}
      </div>
    </DCArtboard>
  );
};

// ─────────────────────────────────────────────────────────────
// MANAGER BUBBLE com chip-action — extensão do componente do V4
// inset row separada por divisor + eyebrow mono caps. Tipos:
//   on-the-way      → "Renata avisou: chega em 3 min" + clock
//   kitchen-check   → "Foi falar com a cozinha" + checkmark
//   courtesy        → "Cortesia a caminho" + giftSeal
// Render NÃO floating — vive dentro do mesmo card border-left ink.
// ─────────────────────────────────────────────────────────────
const ChipActionInset = ({ kind = 'on-the-way' }) => {
  const config = {
    'on-the-way': { eyebrow: 'Renata avisou', label: 'Chega em 3 min', icon: Ico.clock(15, C.ink) },
    'kitchen-check': {
      eyebrow: 'Renata avisou',
      label: 'Foi falar com a cozinha',
      icon: Ico.check(15, C.ink),
    },
    courtesy: {
      eyebrow: 'Renata avisou',
      label: 'Cortesia a caminho',
      icon: Ico.giftSeal(15, C.ink),
    },
  }[kind];
  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: `1px solid ${C.borderSoft}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          background: '#fff',
          border: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: C.ink,
        }}
      >
        {config.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            fontWeight: 500,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: C.faint,
            display: 'block',
            marginBottom: 2,
          }}
        >
          Atalho pra ação · {config.eyebrow}
        </span>
        <span
          style={{
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.15,
          }}
        >
          {config.label}
        </span>
      </div>
    </div>
  );
};

const ManagerBubbleWithAction = ({
  name = 'Renata',
  role = 'Gerente',
  when = 'há 1 min',
  children,
  chipAction,
}) => (
  <div
    style={{
      background: '#fafaf8',
      border: `1px solid ${C.borderSoft}`,
      borderLeft: `3px solid ${C.ink}`,
      borderRadius: 10,
      padding: '14px 16px 14px 14px',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          background: C.ink,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: -0.5,
        }}
      >
        {name[0]}
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: C.ink,
        }}
      >
        {name} · {role}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{when}</span>
    </div>
    <div style={{ fontSize: 15, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink }}>
      {children}
    </div>
    {chipAction && <ChipActionInset kind={chipAction} />}
  </div>
);

// ─────────────────────────────────────────────────────────────
// PUSH LOCKSCREEN · "Como foi o pedido?" — 3-5 min após delivered
// Frame iOS + Android (paridade)
// ─────────────────────────────────────────────────────────────
const RatingPushLockBg = ({ children }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(160deg, #1f1a25 0%, #14131a 60%, #0a0810 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    {children}
  </div>
);

const RatingPushNotif = ({ urgent = false }) => (
  <div style={{ margin: '0 12px' }}>
    <div
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 4px 16px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 12 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            flexShrink: 0,
            background: '#0a0a0a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: -0.5,
          }}
        >
          TL
        </div>
        <div
          style={{ flex: 1, minWidth: 0, fontFamily: '-apple-system, system-ui', color: '#000' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
              Como foi o pedido?
            </div>
            <div
              style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)', flexShrink: 0, marginLeft: 8 }}
            >
              agora
            </div>
          </div>
          <div
            style={{
              fontSize: 15,
              lineHeight: '20px',
              color: '#000',
              marginTop: 1,
              letterSpacing: -0.2,
            }}
          >
            Trattoria Luna · mesa 14 · ajuda a melhorar
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ComplaintResponsePushNotif = () => (
  <div style={{ margin: '0 12px' }}>
    <div
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 0 0 2px rgba(10,10,10,0.85), 0 8px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 12 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            flexShrink: 0,
            background: '#0a0a0a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: -0.5,
          }}
        >
          TL
        </div>
        <div
          style={{ flex: 1, minWidth: 0, fontFamily: '-apple-system, system-ui', color: '#000' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
              Renata respondeu
            </div>
            <div
              style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)', flexShrink: 0, marginLeft: 8 }}
            >
              agora
            </div>
          </div>
          <div
            style={{
              fontSize: 15,
              lineHeight: '20px',
              color: '#000',
              marginTop: 1,
              letterSpacing: -0.2,
            }}
          >
            "Vi que o risoto demorou — peço desculpas. Estou indo até aí em 3 min."
          </div>
        </div>
      </div>
    </div>
  </div>
);

// IOS Lockscreen wrapper só pro push de avaliação/resposta
const RatingPushScreen = ({ andro = false, kind = 'rating' }) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  const Notif =
    kind === 'rating' ? (
      <RatingPushNotif />
    ) : kind === 'response' ? (
      <ComplaintResponsePushNotif />
    ) : (
      <RatingPushNotif />
    );
  return (
    <Frame style={{ background: '#0e0c12' }}>
      {/* sobrescreve o conteúdo do frame com lockscreen */}
      <div style={{ position: 'absolute', inset: 0, top: 44, bottom: andro ? 18 : 8 }}>
        <RatingPushLockBg>
          {/* relógio iOS / Android */}
          <div
            style={{
              textAlign: 'center',
              color: '#fff',
              paddingTop: andro ? 32 : 60,
              fontFamily: '-apple-system, "SF Pro Display", system-ui',
            }}
          >
            <div
              style={{
                fontSize: andro ? 16 : 21,
                fontWeight: andro ? 400 : 500,
                opacity: 0.95,
                letterSpacing: 0.3,
              }}
            >
              Quinta-feira, 7 de maio
            </div>
            <div
              style={{
                fontSize: andro ? 78 : 96,
                fontWeight: andro ? 300 : 200,
                lineHeight: '0.95',
                letterSpacing: -3,
                marginTop: 4,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              21:18
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 110 }}>
            {Notif}
          </div>
          {!andro && (
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 139,
                height: 5,
                borderRadius: 100,
                background: 'rgba(255,255,255,0.7)',
              }}
            />
          )}
        </RatingPushLockBg>
      </div>
    </Frame>
  );
};

// ─────────────────────────────────────────────────────────────
// SCREEN — `ScreenCustomerOrderRating`
// 5 estrelas + textarea opcional + 2 CTAs + skip
// ─────────────────────────────────────────────────────────────
const Star = ({ filled = false, size = 38 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? C.ink : 'none'}
    stroke={filled ? C.ink : C.faint}
    strokeWidth="1.6"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    <path d="M12 2.5l2.93 6.06 6.7.97-4.85 4.69 1.15 6.66L12 17.78l-5.93 3.1 1.15-6.66L2.37 9.53l6.7-.97L12 2.5z" />
  </svg>
);

const StarRow = ({ count = 0 }) => (
  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '8px 0' }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} filled={i <= count} size={42} />
    ))}
  </div>
);

const RatingTextarea = ({ value = '', placeholder = 'Conte mais (opcional)…' }) => (
  <div
    style={{
      border: `1px solid ${C.borderSoft}`,
      borderRadius: 14,
      padding: '14px 16px',
      background: '#fff',
      minHeight: 96,
    }}
  >
    <div
      style={{
        fontSize: 14,
        lineHeight: 1.5,
        color: value ? C.ink : C.faint,
        fontFamily: FONT,
        letterSpacing: -0.05,
        whiteSpace: 'pre-wrap',
      }}
    >
      {value || placeholder}
    </div>
  </div>
);

const ScreenCustomerOrderRating = ({ stars = 0, comment = '', andro = false }) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  const sendEnabled = stars > 0;
  return (
    <Frame>
      <TopBar leftIcon="back" rightIcon={null} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 28px 22px',
          overflow: 'hidden',
        }}
      >
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <MonoLabel size={10.5} color={C.mute}>
            Mesa 14 · pedido entregue há 4 min
          </MonoLabel>
        </div>

        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: -0.6,
            lineHeight: 1.15,
            textAlign: 'center',
            color: C.ink,
            marginTop: 18,
            textWrap: 'balance',
          }}
        >
          Como foi seu pedido?
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: C.mute,
            textAlign: 'center',
            marginTop: 6,
            letterSpacing: -0.05,
          }}
        >
          Sua nota ajuda a Luna a melhorar.
        </div>

        {/* RESUMO DO PEDIDO */}
        <div
          style={{
            marginTop: 22,
            padding: '14px 16px',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: '#fff',
          }}
        >
          <MonoLabel
            size={9.5}
            color={C.faint}
            style={{ display: 'block', marginBottom: 8, letterSpacing: 1.2 }}
          >
            Risoto cogumelos · bruschetta · espresso
          </MonoLabel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 19, fontWeight: 600, color: C.ink, letterSpacing: -0.4 }}>
              R$ 142,90
            </div>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                fontWeight: 500,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                color: C.success,
              }}
            >
              32 min · dentro da meta
            </span>
          </div>
        </div>

        {/* STARS */}
        <div style={{ marginTop: 26 }}>
          <StarRow count={stars} />
        </div>

        {/* TEXTAREA */}
        <div style={{ marginTop: 18 }}>
          <RatingTextarea value={comment} />
        </div>

        <div style={{ flex: 1 }} />

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <PillButton variant="filled" size="lg" disabled={!sendEnabled} style={{ width: '100%' }}>
            Enviar avaliação
          </PillButton>
          <PillButton variant="outline" size="lg" style={{ width: '100%' }}>
            Reportar um problema
          </PillButton>
        </div>

        {/* SKIP */}
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: MONO,
              fontSize: 10,
              color: C.faint,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              textDecoration: 'underline',
              padding: '6px 0',
            }}
          >
            Pular esta avaliação
          </button>
        </div>
      </div>
    </Frame>
  );
};

// ─────────────────────────────────────────────────────────────
// SCREEN — `ScreenCustomerComplaintCompose`
// Chips de tipo + textarea obrigatória + indicador "RENATA ON-LINE"
// ─────────────────────────────────────────────────────────────
const ProblemChip = ({ label, hint, selected = false }) => (
  <div
    style={{
      padding: '14px 16px',
      borderRadius: 14,
      border: `1.3px solid ${selected ? C.ink : C.borderSoft}`,
      background: selected ? '#fafaf8' : '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: C.ink, letterSpacing: -0.2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{hint}</div>
    </div>
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        border: `1.4px solid ${selected ? C.ink : C.faint}`,
        background: '#fff',
        position: 'relative',
      }}
    >
      {selected && (
        <div style={{ position: 'absolute', inset: 3, borderRadius: 6, background: C.ink }} />
      )}
    </div>
  </div>
);

const ScreenCustomerComplaintCompose = ({ selectedType = 'demora', body = '' }) => {
  const problems = [
    { id: 'demora', label: 'Demora', hint: 'pedido demorou demais' },
    { id: 'item-errado', label: 'Item errado', hint: 'veio diferente do que pedi' },
    { id: 'item-faltando', label: 'Item faltando', hint: 'uma coisa não chegou' },
    { id: 'comida-fria', label: 'Comida fria', hint: 'já chegou sem temperatura' },
    { id: 'outro', label: 'Outro', hint: 'descrevo abaixo' },
  ];
  return (
    <IOSFrame>
      <TopBar leftIcon="back" rightIcon={null} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 24px 22px',
          overflow: 'hidden',
        }}
      >
        <MonoLabel size={10.5} color={C.mute}>
          Reportar um problema
        </MonoLabel>

        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: -0.5,
            color: C.ink,
            marginTop: 8,
            lineHeight: 1.2,
          }}
        >
          O que aconteceu?
        </div>
        <div style={{ fontSize: 13.5, color: C.mute, marginTop: 6, letterSpacing: -0.05 }}>
          A gerente da Luna lê em tempo real.
        </div>

        {/* CHIPS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
          {problems.map((p) => (
            <ProblemChip
              key={p.id}
              label={p.label}
              hint={p.hint}
              selected={p.id === selectedType}
            />
          ))}
        </div>

        {/* TEXTAREA */}
        <div
          style={{
            marginTop: 14,
            padding: '14px 16px',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: '#fff',
            minHeight: 96,
          }}
        >
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: body ? C.ink : C.faint,
              fontFamily: FONT,
              letterSpacing: -0.05,
              whiteSpace: 'pre-wrap',
            }}
          >
            {body || 'Pode escrever do seu jeito · a gerente vai ler agora…'}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* RENATA STATUS */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 10,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              background: C.success,
              animation: 'cPulseDot 1.4s infinite',
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: C.mute,
            }}
          >
            Renata · gerente · on-line agora
          </span>
        </div>

        <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
          Enviar pra gerente
        </PillButton>
      </div>
      <style>{`@keyframes cPulseDot { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
    </IOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// SCREEN — `ScreenCustomerComplaintWaiting`
// Spinner discreto + mensagem reassurance + CTA voltar
// ─────────────────────────────────────────────────────────────
const ScreenCustomerComplaintWaiting = ({ andro = false }) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  return (
    <Frame>
      <TopBar leftIcon="back" rightIcon={null} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '40px 28px 22px',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* CHAT BALLOON PULSANTE */}
        <div style={{ position: 'relative', marginBottom: 32 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              border: `1.4px solid ${C.borderSoft}`,
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.ink,
              animation: 'cBalloonPulse 1.8s ease-in-out infinite',
            }}
          >
            {Ico.chat(34, C.ink)}
          </div>
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: 14,
              height: 14,
              borderRadius: 7,
              background: C.success,
              border: `2.5px solid #fff`,
            }}
          />
        </div>

        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: C.ink,
            textAlign: 'center',
            textWrap: 'balance',
            marginBottom: 8,
          }}
        >
          Renata recebeu sua mensagem
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: C.mute,
            textAlign: 'center',
            textWrap: 'pretty',
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          Ela vai responder logo · você verá a resposta no chat
        </div>

        <div style={{ flex: 1 }} />

        <PillButton variant="outline" size="lg" style={{ width: '100%' }}>
          Voltar pra mesa
        </PillButton>
      </div>
      <style>{`@keyframes cBalloonPulse {
        0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(10,10,10,0.05); }
        50% { transform: scale(1.04); box-shadow: 0 0 0 12px rgba(10,10,10,0.0); }
      }`}</style>
    </Frame>
  );
};

// ─────────────────────────────────────────────────────────────
// SCREEN — Home pós-redirect com continuation message especial
// Reusa o pattern de ContinuationHome (4.2) mas com chips contextuais
// "Ver chat · Pedir mais tarde"
// ─────────────────────────────────────────────────────────────
const ChipRowV2 = ({ chips }) => (
  <div
    style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}
  >
    {chips.map((c) => (
      <span
        key={c}
        style={{
          padding: '7px 14px',
          borderRadius: 999,
          fontSize: 12,
          border: `1px solid ${C.borderSoft}`,
          background: '#fff',
          color: C.ink,
          fontFamily: FONT,
          letterSpacing: -0.05,
        }}
      >
        {c}
      </span>
    ))}
  </div>
);

const ContinuationHomeAfterComplaint = () => (
  <IOSFrame>
    <TopBar />
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 24px',
        position: 'relative',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 10,
          paddingBottom: 30,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <PillButton>Chamar garçom</PillButton>
          <PillButton>Ver cardápio</PillButton>
        </div>

        <div style={{ marginTop: 22 }}>
          <span
            style={{
              display: 'block',
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: C.mute,
              marginBottom: 8,
            }}
          >
            Assistente · sua reclamação está com a gerente
          </span>
          <div
            style={{
              fontSize: 19,
              lineHeight: 1.45,
              letterSpacing: -0.3,
              color: C.ink,
              maxWidth: 320,
            }}
          >
            Sua reclamação está com a Renata. Ela respondeu em <b>~2 min</b> em média.
          </div>
          <ChipRowV2 chips={['Ver chat', 'Pedir mais tarde', 'Falar de novo']} />
        </div>
      </div>

      <div style={{ position: 'relative', paddingBottom: 26 }}>
        <LiquidInput placeholder="Mensagem para a casa" />
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// SCREEN — Chat IA com ManagerBubble + chip-action (resposta da gerente)
// ─────────────────────────────────────────────────────────────
const ChatWithManagerResponse = () => (
  <IOSFrame>
    <TopBar />
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          paddingTop: 16,
          paddingBottom: 24,
          overflow: 'auto',
        }}
      >
        {/* IA inline no topo */}
        <div>
          <span
            style={{
              display: 'block',
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: C.mute,
              marginBottom: 8,
            }}
          >
            Assistente · há 12 min
          </span>
          <div style={{ fontSize: 15.5, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink }}>
            Seu pedido foi entregue. Posso te ajudar com mais alguma coisa?
          </div>
        </div>

        {/* mensagem do cliente (a reclamação) — alinhada à direita */}
        <div style={{ alignSelf: 'flex-end', maxWidth: 280 }}>
          <div
            style={{
              background: C.ink,
              color: '#fff',
              borderRadius: 18,
              padding: '10px 14px',
              fontSize: 14,
              lineHeight: 1.4,
            }}
          >
            O risoto demorou muito · me trouxeram quando já tava esfriando
          </div>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, letterSpacing: 0.5 }}>
              Você · há 4 min
            </span>
          </div>
        </div>

        {/* RESPOSTA DA GERENTE com chip-action */}
        <ManagerBubbleWithAction name="Renata" role="Gerente" when="agora" chipAction="on-the-way">
          Vi a sua mensagem, Caleb — peço desculpas pela demora. <b>Já estou indo até a sua mesa</b>{' '}
          em 3 min e mando um café especial pela espera.
        </ManagerBubbleWithAction>
      </div>

      <div style={{ position: 'relative', paddingBottom: 26 }}>
        <LiquidInput placeholder="Responder Renata" />
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO PRA O CANVAS V12
// ─────────────────────────────────────────────────────────────
window.CLIENTE_COMPLAINT_SECTIONS = [
  {
    id: 'v12.1',
    title: 'Push de avaliação · trigger pós-entrega',
    subtitle:
      'Notif disparada 3-5 min após o garçom marcar o pedido como `delivered`. Som leve, não acorda no meio da refeição. Tap abre `ScreenCustomerOrderRating`.',
    frames: [
      f2({
        label: 'push avaliar · ios',
        screen: <RatingPushScreen kind="rating" />,
        note: 'Push iOS lockscreen · estilo glass blur · sem urgent border. Título "Como foi o pedido?" · sub "Trattoria Luna · mesa 14 · ajuda a melhorar". Tap abre /[slug]/avaliar/[orderId].',
      }),
      f2({
        label: 'push avaliar · android',
        platform: 'Android',
        screen: <RatingPushScreen kind="rating" andro />,
        note: 'Mesma cópia · Material You estilo. Tap dispara mesmo deeplink. Sem ações inline (a tela cheia que tem CTA).',
      }),
    ],
  },
  {
    id: 'v12.2',
    title: 'ScreenCustomerOrderRating · 5 estrelas + comentário opcional',
    subtitle:
      'Tela cheia. Rating ≥ 4 + textarea vazia → submete e finaliza. Rating ≤ 3 OU comentário negativo → vai pra `ScreenCustomerComplaintCompose`. "Reportar um problema" é atalho direto pro mesmo destino.',
    frames: [
      f2({
        label: 'rating · default',
        screen: <ScreenCustomerOrderRating stars={0} />,
        note: 'Estado inicial. Estrelas outline cinza. CTA "Enviar avaliação" desabilitado até 1+ estrela. "Reportar um problema" sempre habilitado. Skip mono caps tiny no rodapé.',
      }),
      f2({
        label: 'rating · 3 estrelas + texto',
        screen: (
          <ScreenCustomerOrderRating
            stars={3}
            comment="O risoto demorou muito. Quando chegou já tava sem o calor que tinha que ter."
          />
        ),
        note: 'Estado pré-validação. 3 estrelas filled ink + 2 outline mute. Textarea com texto real do cliente. Ao tocar Enviar → vai pro complaint compose (rating ≤ 3 OU comentário).',
      }),
    ],
  },
  {
    id: 'v12.3',
    title: 'ScreenCustomerComplaintCompose · 5 chips de tipo + textarea + status da Renata',
    subtitle:
      'Chips são radios stacked · pelo menos 1 obrigatório. Textarea obrigatória. Indicador "RENATA · ON-LINE AGORA" quando aplicável (presence via WS). CTA filled "Enviar pra gerente".',
    frames: [
      f2({
        label: 'compose · "demora" + texto',
        screen: (
          <ScreenCustomerComplaintCompose
            selectedType="demora"
            body="O risoto demorou muito · me trouxeram quando já tava esfriando"
          />
        ),
        note: 'Chip "Demora" selecionado (radio ink). Textarea preenchida. Bolinha success pulsante + label mono "RENATA · GERENTE · ON-LINE AGORA". CTA habilitado.',
      }),
    ],
  },
  {
    id: 'v12.4',
    title: 'ScreenCustomerComplaintWaiting · 10s spinner antes de redirect',
    subtitle:
      'Frame único de reassurance. Chat balloon pulsa 1.8s loop · success dot no canto. Após 10s OU tap "Voltar pra mesa" → redirige pra home com continuation message.',
    frames: [
      f2({
        label: 'waiting · ios',
        screen: <ScreenCustomerComplaintWaiting />,
        note: 'Sem CTAs primárias · só "Voltar pra mesa" outline. Animação cBalloonPulse (scale + halo). Status dot success indica "mensagem entregue ao staff".',
      }),
      f2({
        label: 'waiting · android',
        platform: 'Android',
        screen: <ScreenCustomerComplaintWaiting andro />,
        note: 'Paridade Android · status bar/gesture nav corretos. Animação igual.',
      }),
    ],
  },
  {
    id: 'v12.5',
    title: 'Home pós-redirect · continuation message especial',
    subtitle:
      'Eyebrow mono caps "ASSISTENTE · SUA RECLAMAÇÃO ESTÁ COM A GERENTE". Body com expectativa concreta ("respondeu em ~2 min em média"). Chips "Ver chat · Pedir mais tarde · Falar de novo".',
    frames: [
      f2({
        label: 'home · pós-reclamação',
        screen: <ContinuationHomeAfterComplaint />,
        note: 'Reusa o ContinuationHome do 4.2 mas com texto e chips contextuais. Chip "Ver chat" leva pro thread com a Renata; "Pedir mais tarde" volta pro fluxo normal sem perder o estado da reclamação.',
      }),
    ],
  },
  {
    id: 'v12.6',
    title: 'ManagerBubble com chip-action · resposta chega no chat IA',
    subtitle:
      '`ManagerBubble` extende o pattern V4 com sub-section opcional "ATALHO PRA AÇÃO". Border-left ink + bg #fafaf8 mantém · divisor 1px topa entre prosa e chip-action.',
    frames: [
      f2({
        label: 'chat · resposta + chip-action',
        screen: <ChatWithManagerResponse />,
        note: 'Convivência: IA inline (sem bubble) → cliente bubble preto à direita → ManagerBubble assinatura à esquerda com chip-action "chega em 3 min". Animação `cManagerArrive` (translateY 8→0 + fade 360ms) reusa V4.',
      }),
      f2({
        label: 'push resposta · ios',
        screen: <RatingPushScreen kind="response" />,
        note: 'Push da resposta · estilo distintivo (border ink 2px) · som "humano respondendo" diferente do som de IA. Mostra primeira frase em sneak preview.',
      }),
    ],
  },
];
