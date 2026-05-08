// ============================================================
// LINGUAGEM DA CASA — APP DO CLIENTE (canônica)
// Mirror dos tokens já aceitos em screens.jsx — branco puro, ink quase
// preto, Inter sans, mono caps tiny labels, pill outline/filled.
// NÃO usar serif/terracota/creme — esses foram um desvio.
// ============================================================
//
// # V20 · diff vs V19 · cliente-tokens.jsx
// Round cirúrgico · alinha 7 primitivos canvas → produção (web-customer/src).
//
//  · A.1 LiquidInput → SoftInput · sólido bg-surface · sem backdrop-filter
//        · borda transparente focus-within ink/20 · shadow 1px 4% · seta
//          42×42 ink·white · placeholder mute (não faint)
//  · A.2 CustomerBubble · radius 18 + br 4px (tail) · padding 12/16
//        · timestamp mono externo MANTIDO (Claude Code implementa em prod)
//  · A.3 TopBar · hamburger border ink (não borderSoft) · bottom hairline
//          0.5px borderSoft · sticky + safe-area top
//  · A.4 PillButton · variant ghost REMOVIDO (prod tem só outline/filled)
//  · A.5 AssistantBlock · kicker Inter uppercase tracking-1px (não MonoLabel)
//  · A.6 MonoLabel · fontFamily FONT (Inter) · weight 600 · tracking 1.5
//        (visualmente "mono caps tiny tracked", não literalmente monospace)
//
// HAND-OFF Claude Code · ver bloco no fim deste arquivo.
// ============================================================

const C = {
  bg:          '#ffffff',     // canvas — branco
  surface:     '#f6f5f2',     // off-white levemente quente p/ surfaces
  ink:         '#0a0a0a',     // borda + texto principal (near-black)
  border:      '#0a0a0a',     // bordas fortes (frame, CTA outline)
  borderSoft:  '#e5e5e5',     // divisores
  mute:        '#6b6b6b',     // texto secundário
  faint:       '#a3a3a3',     // texto terciário / metadata
  accent:      '#0a0a0a',     // monocromático: preto É o accent
  // semânticos discretos — só usados em status/alerta
  danger:      '#c43a3a',     // brick red (alertas, chamado, error)
  dangerWash:  '#fbe9e7',     // bg lavado p/ alertas
  success:     '#2f7d4f',     // moss green (entregue, pago)
  successWash: '#e3efe7',
  warning:     '#b88a1a',     // mustard (preparando, novo)
  warningWash: '#fbf1d8',
};

const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace";

// ============ ÍCONES — peso 1.4, pareados com sans neutro ============
const Ico = {
  arrow:    (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  back:     (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M11 4l-5 5 5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  menu:     (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M3 5h12M3 9h12M3 13h12" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  x:        (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M5 5l8 8M13 5l-8 8" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  hand:     (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M7 8.5V4.5a1 1 0 012 0v4M9 8V3.5a1 1 0 012 0V8M11 8V5a1 1 0 012 0v6c0 3-2 5.5-5 5.5-2 0-3.5-1-4.5-2.5L2.5 11a1 1 0 011.6-1.2L5.5 11.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  book:     (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M3 3h5a2 2 0 012 2v10a1.5 1.5 0 00-1.5-1.5H3z M15 3h-5a2 2 0 00-2 2v10a1.5 1.5 0 011.5-1.5H15z" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  notepad:  (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <rect x="4" y="2.5" width="10" height="13" rx="1.5" stroke={c} strokeWidth="1.4"/>
      <path d="M7 6h4M7 9h4M7 12h3" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  glass:    (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M5 2.5h8l-1 7a3 3 0 01-6 0z M9 13v2.5M7 15.5h4" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  receipt:  (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M4 2l1.3.8L7 2l1.7.8L10.3 2l1.7.8L13.7 2 15 2.8v12.4L13.7 16 12 15.2 10.3 16 8.7 15.2 7 16 5.3 15.2 4 16z M6 6h6M6 9h6M6 12h4" stroke={c} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  ),
  chat:     (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M15 9a6 6 0 01-9.3 5L2.5 15l1-3.2A6 6 0 1115 9z" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  giftSeal: (s = 28, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" stroke={c} strokeWidth="1.3"/>
      <circle cx="16" cy="16" r="10.2" stroke={c} strokeWidth="0.7" strokeDasharray="1.6 1.6"/>
      <path d="M16 9v14M9 16h14" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M12 9c0-1.5 1.3-2.5 2.5-2.5S16 7.5 16 9 14.5 11 14.5 11M20 9c0-1.5-1.3-2.5-2.5-2.5S15.5 7.5 16 9c.4 1.4 1.5 2 1.5 2" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  check:    (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M3.5 9.5l3.5 3.5L14 5" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  clock:    (s = 14, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke={c} strokeWidth="1.3"/>
      <path d="M7 4v3.2L9 9" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  send:     (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <path d="M2.5 7.5L13.5 3 11 14l-2.5-5.5z" stroke={c} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  ),
};

// ============ MONO LABEL (caps + tracking aberto) ============
// V20 · agora roda em FONT (Inter) · weight 600 · tracking 1.5 — alinha a
// produção (`text-[11px] font-medium uppercase tracking-[1px]` em
// HomeHero.tsx + `text-[11px] font-semibold uppercase tracking-[1.5px]`
// em MenuDrawer.tsx · prod tem 2 sub-variantes 1px e 1.5px · canvas usa
// 1.5 como canônico). Mantém o nome `MonoLabel` por enquanto · refactor
// de naming pro Claude Code resolver (sugestão: `Eyebrow`).
const MonoLabel = ({ children, color, size = 11, style }) => (
  <span style={{
    fontFamily: FONT, fontSize: size, fontWeight: 600,
    letterSpacing: 1.5, textTransform: 'uppercase',
    color: color || C.mute, ...style,
  }}>{children}</span>
);

// ============ STATUS DOT + LABEL pill ============
const StatusPill = ({ label, tone = 'mute' }) => {
  const colors = {
    mute:    { dot: C.faint,   text: C.mute    },
    success: { dot: C.success, text: C.success },
    warning: { dot: C.warning, text: C.warning },
    danger:  { dot: C.danger,  text: C.danger  },
  };
  const c = colors[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: MONO, fontSize: 10.5, fontWeight: 500,
      letterSpacing: 1.1, textTransform: 'uppercase',
      color: c.text,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: c.dot }} />
      {label}
    </span>
  );
};

// ============ PILL BUTTON — outline / filled ============
// V20 · variant `ghost` REMOVIDO · prod tem só outline/filled (ver
// PillButton.tsx em web-customer/src/components/ui). Use ContextualChip
// pro lugar onde ghost fazia sentido (chips contextuais já são pill
// outline 1.2px borderSoft sem fundo · ortogonal a CTA).
const PillButton = ({ children, variant = 'outline', size = 'md', style, disabled }) => {
  const variants = {
    outline: { background: '#fff', border: `1.3px solid ${C.border}`, color: C.ink },
    filled:  { background: C.ink,  border: `1.3px solid ${C.ink}`,    color: '#fff' },
  };
  const sizes = {
    sm: { padding: '10px 18px', fontSize: 13 },
    md: { padding: '14px 26px', fontSize: 15 },
    lg: { padding: '16px 28px', fontSize: 16 },
  };
  return (
    <button style={{
      borderRadius: 999, fontWeight: 500, fontFamily: FONT, cursor: 'pointer',
      letterSpacing: -0.1, opacity: disabled ? 0.5 : 1,
      ...variants[variant], ...sizes[size], ...style,
    }}>{children}</button>
  );
};

// ============ iOS FRAME (390×844, dynamic island) ============
const IOSFrame = ({ children, style }) => (
  <div style={{
    width: 390, height: 844, background: C.bg, color: C.ink,
    fontFamily: FONT, position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    border: `1.5px solid ${C.border}`, borderRadius: 44, ...style,
  }}>
    <div style={{
      height: 44, padding: '0 32px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', fontSize: 13, fontWeight: 600, flexShrink: 0,
    }}>
      <span>9:41</span>
      <div style={{
        position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)',
        width: 110, height: 30, borderRadius: 15, background: C.ink,
      }} />
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
        <svg width="17" height="11" viewBox="0 0 17 11">
          <rect x="0" y="6" width="3" height="4" rx="0.6" fill={C.ink}/>
          <rect x="4.5" y="4" width="3" height="6" rx="0.6" fill={C.ink}/>
          <rect x="9" y="2" width="3" height="8" rx="0.6" fill={C.ink}/>
          <rect x="13.5" y="0" width="3" height="10" rx="0.6" fill={C.ink}/>
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11">
          <path d="M7.5 2.5C9.6 2.5 11.5 3.4 12.8 4.8L13.8 3.8C12.2 2.2 10 1 7.5 1 5 1 2.8 2.2 1.2 3.8L2.2 4.8C3.5 3.4 5.4 2.5 7.5 2.5Z" fill={C.ink}/>
          <path d="M7.5 5.8C8.8 5.8 9.9 6.3 10.7 7.1L11.7 6.1C10.6 5 9.1 4.3 7.5 4.3 5.9 4.3 4.4 5 3.3 6.1L4.3 7.1C5.1 6.3 6.2 5.8 7.5 5.8Z" fill={C.ink}/>
          <circle cx="7.5" cy="9" r="1.3" fill={C.ink}/>
        </svg>
        <svg width="24" height="11" viewBox="0 0 24 11">
          <rect x="0.5" y="0.5" width="20" height="10" rx="2.8" stroke={C.ink} strokeOpacity="0.4" fill="none"/>
          <rect x="2" y="2" width="17" height="7" rx="1.5" fill={C.ink}/>
        </svg>
      </div>
    </div>
    {children}
    <div style={{
      position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
      width: 134, height: 5, borderRadius: 3, background: C.ink, opacity: 0.85,
    }} />
  </div>
);

// ============ ANDROID FRAME (390×844 mantém a malha) ============
const AndroidFrame = ({ children, style }) => (
  <div style={{
    width: 390, height: 844, background: C.bg, color: C.ink,
    fontFamily: FONT, position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    border: `1.5px solid ${C.border}`, borderRadius: 36, ...style,
  }}>
    <div style={{
      height: 32, padding: '0 18px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', fontSize: 13, fontWeight: 500,
      flexShrink: 0, position: 'relative',
    }}>
      <span>9:30</span>
      <div style={{
        position: 'absolute', left: '50%', top: 8, transform: 'translateX(-50%)',
        width: 18, height: 18, borderRadius: 9, background: C.ink,
      }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="14" height="11" viewBox="0 0 14 11"><path d="M7 10L0 3a9 9 0 0114 0L7 10z" fill={C.ink}/></svg>
        <svg width="14" height="11" viewBox="0 0 14 11"><path d="M13 10V0L1 10h12z" fill={C.ink}/></svg>
        <svg width="20" height="11" viewBox="0 0 20 11">
          <rect x="2" y="1.5" width="14" height="8" rx="1.2" fill="none" stroke={C.ink}/>
          <rect x="3.5" y="3" width="11" height="5" rx="0.6" fill={C.ink}/>
          <rect x="16.5" y="4" width="1.5" height="3" rx="0.4" fill={C.ink}/>
        </svg>
      </div>
    </div>
    {children}
    <div style={{
      height: 18, display: 'flex', justifyContent: 'center', alignItems: 'center',
      flexShrink: 0,
    }}>
      <div style={{ width: 100, height: 3, borderRadius: 2, background: C.ink, opacity: 0.7 }} />
    </div>
  </div>
);

// ============ TOP BAR (igual TopBar.tsx em prod) ============
// V20 · alinha 3 atributos:
//   · hamburger/back border = 1.2px ink (era borderSoft)
//   · bottom hairline 0.5px borderSoft
//   · sticky top-0 + paddingTop calc(max(env(safe-area-inset-top), 12px) + 8px)
//     pra que botão Voltar/menu fique abaixo do Dynamic Island do iPhone 16
//     (bug-hunter encontrou tap caindo sob a ilha).
//
// NOTA z-index: prod usa `z-30` (TopBar.tsx:28) pra cobrir conteúdo do chat
// quando rola. No canvas NÃO setamos zIndex aqui pra que overlays internos
// do IOSFrame (MenuOverlay, PaymentScreenOverlay, OverlaySalonMap) que
// usam `position:absolute, inset:0` continuem rendendo acima da TopBar
// na ordem natural do DOM (já vêm depois na árvore). Ver HAND-OFF B.2.
const TopBar = ({ table = 'Mesa 12', restaurant = 'Trattoria Luna', leftIcon, rightIcon = 'menu' }) => (
  <div style={{
    padding: '8px 22px 14px',
    paddingTop: 'calc(max(env(safe-area-inset-top), 12px) + 8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
    position: 'sticky', top: 0,
    background: C.bg,
    borderBottom: `0.5px solid ${C.borderSoft}`,
  }}>
    {leftIcon === 'back' ? (
      <div style={{
        width: 36, height: 36, borderRadius: 18, border: `1.2px solid ${C.ink}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{Ico.back(18, C.ink)}</div>
    ) : (
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{restaurant}</div>
        <div style={{ fontSize: 11, color: C.mute, marginTop: 1, letterSpacing: 0.5 }}>{table}</div>
      </div>
    )}
    {rightIcon === 'menu' && (
      <div style={{
        width: 36, height: 36, borderRadius: 18, border: `1.2px solid ${C.ink}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{Ico.menu(18, C.ink)}</div>
    )}
  </div>
);

// ============ SOFT INPUT (V20 · alinha SoftInput.tsx em prod) ============
// V20 · LiquidInput abandonado · prod usa pill sólido sem backdrop-filter
// porque o app roda em Safari iOS direto (não é PWA) e o blur era caro /
// causava jank ao abrir teclado.
//
// Specs (alinha bg-surface · sem filter · borda transparente focus-within
// ink/20 · shadow 1px 4% · seta send 42×42 ink·white opcional):
//   - background       : C.surface (#f6f5f2) sólido
//   - filter           : nenhum (sem backdrop-blur · sem saturate)
//   - border           : 1px transparent · focused → 1px ink/20
//   - box-shadow       : 0 1px 2px rgba(0,0,0,0.04) (ancora visual sutil)
//   - PlayIcon         : opcional · só renderiza com onPlayClick
//                        (em prod era pegadinha de UX visível sem handler)
//   - Send button      : 42×42 ink·white · active:scale-95
//   - Placeholder color: C.mute (#6b6b6b · não faint #a3a3a3)
//
// `playable` controla se mostra ícone de áudio à esquerda · default false.
// `value` continua aceito pra renderização estática em frames.
const SoftInput = ({
  placeholder = 'Digite aqui',
  value,
  playable = false,
  focused = false,
}) => (
  <div style={{
    position: 'relative', borderRadius: 999,
    padding: 8,
    background: C.surface,
    border: focused ? `1px solid rgba(10,10,10,0.20)` : '1px solid transparent',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    display: 'flex', alignItems: 'center', gap: 12,
    transition: 'border-color 150ms ease',
  }}>
    {playable && (
      <div style={{
        width: 42, height: 42, borderRadius: 21, background: '#fff',
        border: `${42 * 0.08}px solid ${C.ink}`,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M3.5 2.5 L11 7 L3.5 11.5 Z" fill={C.ink}/>
        </svg>
      </div>
    )}
    <span style={{
      flex: 1, paddingLeft: playable ? 0 : 6,
      fontSize: 16, fontWeight: 400, letterSpacing: -0.16,
      color: value ? C.ink : C.mute,
    }}>
      {value || placeholder}
    </span>
    <div style={{
      width: 42, height: 42, borderRadius: 21,
      background: C.ink, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 9h12m0 0-4-4m4 4-4 4"
          stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  </div>
);

// V20 · alias de migração · `LiquidInput` redirecionado pra SoftInput.
// Mantém callsites antigos que ainda não foram migrados (ex: ChatFrame
// em cliente-screens-v14.jsx) sem quebrar render. Refactor de naming
// completo fica pro Claude Code (ver HAND-OFF · B.2).
const LiquidInput = SoftInput;

// ============ ASSISTENTE BLOCK (sem bubble, inline) ============
// V20 · kicker agora é Inter uppercase tracking 1px (alinha HomeHero.tsx)
// · NÃO usa MonoLabel (que é tracking 1.5 · sub-variante separada).
// Hero inline sem container · tipo print-magazine-style. Diferente da
// bubble do assistente em ChatFrame (com border + corner-cut) — a inline
// é a expressão do hero / typing-on-arrival. As 2 são ortogonais.
const AssistantBlock = ({ label = 'Assistente', children, typing }) => (
  <div>
    <div style={{
      fontFamily: FONT, fontSize: 11, fontWeight: 500,
      letterSpacing: 1, textTransform: 'uppercase',
      color: C.mute, marginBottom: 8,
    }}>{label}</div>
    <div style={{
      fontSize: 20, lineHeight: 1.4, letterSpacing: -0.3,
      color: C.ink, maxWidth: 320,
      textWrap: 'pretty',
    }}>
      {children}
      {typing && (
        <span style={{
          display: 'inline-block', width: 2, height: 20, background: C.ink,
          marginLeft: 3, verticalAlign: 'middle',
          animation: 'cursor-blink 1s infinite',
        }} />
      )}
    </div>
    <style>{`@keyframes cursor-blink { 50% { opacity: 0; } }`}</style>
  </div>
);

// ============ MANAGER BUBBLE (4.5) — visualmente diferente da IA ============
const ManagerBubble = ({ name = 'Renata', role = 'Gerente', children, when = 'há 1 min' }) => (
  <div style={{
    background: '#fafaf8', border: `1px solid ${C.borderSoft}`,
    borderLeft: `3px solid ${C.ink}`, borderRadius: 10,
    padding: '14px 16px 14px 14px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 12, background: C.ink, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, letterSpacing: -0.5,
      }}>{name[0]}</div>
      <MonoLabel size={10} color={C.ink}>{name} · {role}</MonoLabel>
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{when}</span>
    </div>
    <div style={{ fontSize: 15, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink }}>
      {children}
    </div>
  </div>
);

const Caption = ({ children }) => (
  <div style={{
    marginTop: 14, maxWidth: 420, fontSize: 12, color: C.mute, lineHeight: 1.5,
    fontFamily: FONT, letterSpacing: -0.05,
  }}>{children}</div>
);

// ============================================================
// V13 · NAVEGAÇÃO CONVERSACIONAL — chips contextuais + LLM tools
// ============================================================

// ────────────────────────────────────────────────────────────
// ContextualChip · pill outline · 1 toque · ≤ 22 chars
// ────────────────────────────────────────────────────────────
const ContextualChip = ({ label, primary = false, destructive = false, requiresText = false, style }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
    padding: '8px 14px', borderRadius: 999,
    fontFamily: FONT, fontSize: 13, fontWeight: 500, letterSpacing: -0.05,
    cursor: 'pointer', whiteSpace: 'nowrap',
  };
  const tone = destructive
    ? { background: C.ink,    color: '#fff',    border: `1.2px solid ${C.ink}` }
    : primary
      ? { background: C.ink,    color: '#fff',    border: `1.2px solid ${C.ink}` }
      : { background: '#fff',   color: C.ink,    border: `1.2px solid ${C.borderSoft}` };
  return (
    <span style={{ ...base, ...tone, ...style }}>
      {label}
      {requiresText && (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.6 }}>
          <path d="M2 2h6M2 5h4M2 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )}
    </span>
  );
};

// ────────────────────────────────────────────────────────────
// ContextualChips row · 2-4 chips · scroll horizontal se exceder
// ordem: primário esquerda · destrutivo/cancelar direita
// ────────────────────────────────────────────────────────────
const ContextualChips = ({ chips = [], align = 'left' }) => (
  <div style={{
    display: 'flex', gap: 8, marginTop: 12, flexWrap: 'nowrap', overflowX: 'auto',
    paddingBottom: 2, justifyContent: align === 'left' ? 'flex-start' : align,
  }}>
    {chips.map((c, i) => (
      <ContextualChip key={(c.label || c) + i} {...(typeof c === 'string' ? { label: c } : c)} />
    ))}
  </div>
);

// ────────────────────────────────────────────────────────────
// ToolCallIndicator · "··· USANDO {name} ···"
// 5 categorias de cor · animação dotPulse 1.2s
// ────────────────────────────────────────────────────────────
const TOOL_CATEGORY_COLORS = {
  menu:    C.mute,     // cardápio · pedido · sessão · restaurante info
  order:   C.mute,
  session: C.mute,
  info:    C.mute,
  staff:   C.warning,  // mostarda mute · comunicação com staff
  payment: C.mute,
  destructive: C.danger, // brick mute · delete_chat / delete_all_chats
  lgpd:    C.mute,
};

const ToolCallIndicator = ({ name = 'add_to_order', category = 'menu' }) => {
  const color = TOOL_CATEGORY_COLORS[category] || C.mute;
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 500,
      letterSpacing: 1.5, textTransform: 'uppercase',
      color, display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 0', opacity: 0.9,
      animation: 'cToolFade 200ms ease-out',
    }}>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 3, height: 3, borderRadius: 2, background: 'currentColor',
            animation: `cDotPulse 1.2s ${i * 0.16}s infinite ease-in-out`,
          }} />
        ))}
      </span>
      <span>USANDO {name}</span>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 3, height: 3, borderRadius: 2, background: 'currentColor',
            animation: `cDotPulse 1.2s ${i * 0.16}s infinite ease-in-out`,
          }} />
        ))}
      </span>
      <style>{`
        @keyframes cDotPulse  { 0%,100%{opacity:.25;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes cToolFade  { from{opacity:0} to{opacity:.9} }
      `}</style>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// ContextualInputExpand · expand inline quando chip exige texto
// V14: variante única · liquid morph (Apple Music card transition)
//   chips fade 200ms · clip-path do meio pra fora 380ms
//   cubic-bezier(.4,0,.2,1) · CTA fade 200ms · total ~580ms
// (variantes A/snappy e C/drape descartadas no round 9-bis)
//
// Prop `variant` ainda aceita pra compat com call sites antigos
// mas é ignorada — todos caem em liquid.
// ────────────────────────────────────────────────────────────
const ContextualInputExpand = ({
  placeholder = 'Conta o que aconteceu...',
  text = '',
  maxChars = 240,
  ctaLabel = 'Confirmar e enviar',
  showCounter = true,
}) => {
  const len = text.length;
  const ctaDisabled = len === 0;

  return (
    <div style={{
      marginTop: 14,
      animation: 'cInputLiquid 380ms cubic-bezier(.4,0,.2,1) both',
    }}>
      <div style={{
        position: 'relative',
        background: '#fafaf8', border: `1px solid ${C.borderSoft}`,
        borderRadius: 14, padding: '14px 14px 12px',
        boxShadow: '0 1px 0 rgba(255,255,255,.6) inset, 0 4px 14px rgba(0,0,0,.04)',
      }}>
        {/* botão X discreto · reverte pros chips */}
        <button style={{
          position: 'absolute', top: 8, right: 8, width: 24, height: 24,
          borderRadius: 12, border: 'none', background: 'transparent',
          color: C.faint, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 0,
        }} aria-label="Fechar e voltar pros chips">
          {Ico.x(13, 'currentColor')}
        </button>

        {/* textarea · Inter 14/500 · placeholder contextual */}
        <div style={{
          minHeight: 64, paddingRight: 24,
          fontFamily: FONT, fontSize: 14, fontWeight: 500, lineHeight: 1.45,
          color: text ? C.ink : C.faint, letterSpacing: -0.05,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {text || placeholder}
        </div>

        {/* contador discreto */}
        {showCounter && (
          <div style={{
            position: 'absolute', bottom: 8, right: 12,
            fontFamily: MONO, fontSize: 9.5, color: C.faint, letterSpacing: 0.5,
          }}>{len}/{maxChars}</div>
        )}
      </div>

      {/* CTA full-width filled na base · disabled enquanto vazio */}
      <div style={{
        marginTop: 10,
        animation: 'cCtaFade 200ms ease-out 280ms both',
      }}>
        <PillButton variant="filled" size="lg" disabled={ctaDisabled} style={{ width: '100%' }}>
          {ctaLabel}
        </PillButton>
      </div>

      <style>{`
        @keyframes cInputLiquid {
          0%   { opacity: 0; clip-path: inset(50% 0 50% 0 round 14px); }
          60%  { opacity: 1; clip-path: inset(0 0 0 0 round 14px); }
          100% { opacity: 1; clip-path: inset(0 0 0 0 round 14px); }
        }
        @keyframes cCtaFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// CustomerBubble · mensagem do próprio cliente · alinhada à direita
// V20 · alinha Bubble.tsx em prod:
//   - radius 18 + bottom-right 4px (tail visual)
//   - padding 12px 16px (era 10/14 · subiu pra bater com `px-4 py-3`)
//   - lineHeight 1.45 (era 1.4)
// Timestamp mono caps externo "Você · 14:32" MANTIDO no canvas — gap real
// em prod (Bubble.tsx não tem timestamp · vai como melhoria pro Claude
// Code · ver HAND-OFF · B.5).
// ────────────────────────────────────────────────────────────
const CustomerBubble = ({ children, when = 'agora', maxWidth = 280 }) => (
  <div style={{ alignSelf: 'flex-end', maxWidth }}>
    <div style={{
      background: C.ink, color: '#fff',
      borderRadius: 18, borderBottomRightRadius: 4,
      padding: '12px 16px', fontSize: 14, lineHeight: 1.45,
      letterSpacing: -0.05,
    }}>{children}</div>
    <div style={{ textAlign: 'right', marginTop: 4 }}>
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, letterSpacing: 0.5 }}>
        Você · {when}
      </span>
    </div>
  </div>
);

// ============================================================
// V16 (round 8c) · OverlaySalonMap — junção de mesas
// ────────────────────────────────────────────────────────────
// Sobe como overlay sobre o chat IA · backdrop 32% preto.
// Mini-mapa fixo · 3×3 grade espacial real · 6-8 mesas próximas
// à do cliente. Mesa do cliente (you) ganha badge "VOCÊ TÁ AQUI"
// + borda ink grossa. Mesas adjacentes ocupadas: tap selecionável
// (mostra hint do host). Mesas distantes ou livres: atenuadas.
// Bottom CTA aparece após seleção.
// ============================================================
const OverlaySalonMap = ({
  yourTable = 14,                         // mesa do cliente
  selectedTable = null,                   // mesa-alvo selecionada (ou null)
  // 8 mesas-mock em grade 3×3 (M14 central)
  layout = [
    { num: 11, st: 'occupied', host: 'André',     party: 4, distant: false },
    { num: 12, st: 'occupied', host: 'Casal Lima', party: 2, distant: false },
    { num: 13, st: 'free',     distant: true },
    { num: 16, st: 'occupied', host: 'Família Reis', party: 5, distant: false },
    /* center: M14 (you) */                             // injetada no render
    { num: 15, st: 'occupied', host: 'Casal Santos', party: 2, distant: false },
    { num: 19, st: 'free',     distant: true },
    { num: 17, st: 'occupied', host: 'Marcos',    party: 3, distant: false },
    { num: 18, st: 'occupied', host: 'Equipe Saraiva', party: 4, distant: true },
  ],
  hidePopup = false,                       // pra DCSection sem chat por baixo
}) => {
  // grade 3×3: índices 0..3 antes do centro · centro · 4..7 depois
  const cells = [
    layout[0], layout[1], layout[2],
    layout[3], { num: yourTable, st: 'you' }, layout[4],
    layout[5], layout[6], layout[7],
  ];

  const target = selectedTable
    ? layout.find(l => l && l.num === selectedTable)
    : null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30,
      background: 'rgba(0,0,0,0.32)',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      animation: hidePopup ? undefined : 'cOverlayFade 220ms ease-out',
    }}>
      <div style={{
        background: C.bg,
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
        paddingTop: 8, paddingBottom: 18,
        position: 'relative',
      }}>
        {/* drag handle */}
        <div style={{
          width: 38, height: 4, borderRadius: 2,
          background: '#dcdcdc', margin: '0 auto 6px',
        }} />

        {/* X discreto */}
        <button style={{
          position: 'absolute', top: 14, right: 14,
          width: 28, height: 28, borderRadius: 14,
          border: `1px solid ${C.borderSoft}`, background: '#fff',
          color: C.ink, cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} aria-label="Fechar">{Ico.x(13, 'currentColor')}</button>

        {/* Header */}
        <div style={{ padding: '6px 22px 14px' }}>
          <MonoLabel size={10} color={C.faint}>Mapa do salão · mesas perto de vocês</MonoLabel>
          <div style={{
            marginTop: 6, fontSize: 19, fontWeight: 700, color: C.ink,
            letterSpacing: -0.3, lineHeight: 1.25,
          }}>
            Com qual mesa vocês querem juntar?
          </div>
        </div>

        {/* Grid 3×3 espacial */}
        <div style={{
          padding: '0 22px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
        }}>
          {cells.map((t, i) => {
            if (t.st === 'you') {
              return (
                <div key={`you-${i}`} style={{
                  aspectRatio: '1 / 1',
                  borderRadius: 12,
                  border: `2.2px solid ${C.ink}`,
                  background: C.ink, color: '#fff',
                  padding: 10,
                  display: 'flex', flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                }}>
                  <div style={{
                    fontSize: 22, fontWeight: 800,
                    letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums',
                  }}>{t.num}</div>
                  <div style={{
                    fontFamily: MONO, fontSize: 8.5, fontWeight: 700,
                    letterSpacing: 1.1, textTransform: 'uppercase',
                    opacity: 0.9, lineHeight: 1.2,
                  }}>Você tá<br/>aqui</div>
                </div>
              );
            }
            const isFree = t.st === 'free';
            const isDistant = t.distant;
            const isSelected = !isFree && selectedTable === t.num;
            const isSelectable = !isFree && !isDistant;
            const dim = isFree || isDistant;
            return (
              <div key={`t-${i}`} style={{
                aspectRatio: '1 / 1',
                borderRadius: 12,
                border: isSelected
                  ? `2px solid ${C.ink}`
                  : isFree
                    ? `1px dashed ${C.borderSoft}`
                    : `1px solid ${C.borderSoft}`,
                background: isSelected ? C.surface : C.bg,
                opacity: dim ? 0.42 : 1,
                padding: 9,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: isSelectable ? 'pointer' : 'default',
                position: 'relative',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                }}>
                  <div style={{
                    fontSize: 18, fontWeight: 800, color: C.ink,
                    letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums',
                  }}>{t.num}</div>
                  {isSelected && (
                    <div style={{
                      width: 16, height: 16, borderRadius: 8, background: C.ink,
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{Ico.check(10, '#fff')}</div>
                  )}
                </div>
                {isFree ? (
                  <div style={{
                    fontFamily: MONO, fontSize: 8.5, fontWeight: 700,
                    letterSpacing: 1, textTransform: 'uppercase', color: C.faint,
                  }}>Livre</div>
                ) : (
                  <div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: C.ink,
                      letterSpacing: -0.05, lineHeight: 1.2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{t.host}</div>
                    <div style={{
                      fontFamily: MONO, fontSize: 8.5, fontWeight: 700,
                      letterSpacing: 0.8, color: C.faint, marginTop: 1,
                    }}>{t.party} pessoas</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Hint sobre mesas atenuadas */}
        <div style={{
          padding: '12px 22px 0',
          fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
          letterSpacing: 1, textTransform: 'uppercase', color: C.faint,
        }}>
          · mesas atenuadas estão livres ou distantes
        </div>

        {/* Bottom CTA · só aparece com seleção */}
        {target && (
          <div style={{
            padding: '14px 22px 4px',
            animation: 'cOverlayCta 220ms cubic-bezier(.4,0,.2,1) both',
          }}>
            <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
              Pedir pra juntar com mesa {target.num}
            </PillButton>
            <div style={{
              marginTop: 10, fontSize: 11.5, color: C.mute,
              lineHeight: 1.5, letterSpacing: -0.05, textAlign: 'center',
            }}>
              {target.host} ({target.party} pessoas) vai receber o pedido pra aprovar.
            </div>
          </div>
        )}

        <style>{`
          @keyframes cOverlayFade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes cOverlayCta {
            0%   { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
};

Object.assign(window, {
  C, FONT, MONO, Ico,
  MonoLabel, StatusPill, PillButton,
  IOSFrame, AndroidFrame, TopBar,
  // V20 · SoftInput é o canônico · LiquidInput é alias retrocompat
  SoftInput, LiquidInput,
  AssistantBlock, ManagerBubble,
  Caption,
  // V13
  ContextualChip, ContextualChips, ToolCallIndicator, ContextualInputExpand,
  CustomerBubble, TOOL_CATEGORY_COLORS,
  // V16 · round 8c
  OverlaySalonMap,
});

// ============================================================
// # HAND-OFF CLAUDE CODE · V20
// ────────────────────────────────────────────────────────────
// Lista pro Claude Code implementar · você (designer) só anota aqui ·
// não decide, não implementa. Ordem de prioridade sugerida embaixo.
//
// ## B.1 · Tokens novos pra adicionar em prod
// `apps/web-customer/src/app/globals.css` precisa receber:
//   --color-warning:      #b88a1a;
//   --color-danger-wash:  #fbe9e7;
//   --color-success-wash: #e3efe7;
//   --color-warning-wash: #fbf1d8;
// `tailwind.config.ts` faz o bridge correspondente. Necessário pra
// MergeTypewriterBubble (border-left mostarda 4px) · LGPD wash · etc.
//
// ## B.2 · Componentes novos do canvas pra implementar em prod
//   MonoLabel               · cliente-tokens.jsx:118       → components/ui/MonoLabel.tsx
//   StatusPill              · cliente-tokens.jsx:127       → components/ui/StatusPill.tsx
//   ContextualChip + Chips  · cliente-tokens.jsx:387/415   → components/ui/ContextualChip.tsx
//   ContextualInputExpand   · cliente-tokens.jsx:486       → components/ui/ContextualInputExpand.tsx
//   ToolCallIndicator       · cliente-tokens.jsx:441       → components/ui/ToolCallIndicator.tsx
//   AssistantTurn           · cliente-screens-v14.jsx:91   → components/assistant/AssistantTurn.tsx
//   ManagerBubble           · cliente-tokens.jsx:351       → components/assistant/ManagerBubble.tsx
//   MergeTypewriterBubble   · cliente-table-merge.jsx:125  → components/assistant/MergeTypewriterBubble.tsx
//   OverlaySalonMap         · cliente-tokens.jsx:587       → components/host/OverlaySalonMap.tsx
//   SystemJoinNotice        · cliente-late-arrival.jsx:631 → components/session/SystemJoinNotice.tsx
//   ScrollPill              · cliente-table-merge.jsx:210  → components/ui/ScrollPill.tsx
//   PersonChip              · cliente-late-arrival.jsx:48  → components/host/PersonChip.tsx
//   InputField              · cliente-late-arrival.jsx:262 → components/ui/InputField.tsx
//   MenuDrawerV20           · cliente-menu-drawer-v20.jsx  → components/ui/MenuDrawer.tsx (atualiza)
//
// ## B.3 · Features inteiras pra cabear em prod
//   - ManagerBubble + complaint flow (Pattern2A→2E em cliente-screens-v14)
//   - Table-merge inteiro (request → OverlaySalonMap → typewriter →
//     cooldown → ack-detection · ver cliente-table-merge.jsx)
//   - CourtesyArrival
//   - LGPD UI conversacional (LGPD1/LGPD2/LGPD3 em cliente-screens-v14)
//   - Histórico "Eu" (botão drawer) · delete_all_chats segue como tool LLM
//     sem frames dedicados · caminho conversacional de apagar passa pelo
//     flow LGPD (LGPD1/LGPD2/LGPD3)
//   - ContextualChips + ContextualInputExpand cabeados nos turns da IA
//
// ## B.4 · Decisões UX pendentes (Claude Code resolve com PM/usuário)
//   - Frame 05 cardápio:    overlay sheet (canvas) vs rota dedicada (prod)
//                           · default sugerido = manter rota
//   - Frame 06 add_to_order: chips multi-step (canvas) vs tela dedicada (prod)
//                           · default sugerido = híbrido (chat-first com
//                             fallback rota)
//   - Frame 07 chamar garçom: sheet vaul (canvas) vs rota fullscreen (prod)
//                           · default sugerido = rota
//   - Frame 08 pagamento:    step 1 chips (canvas) vs entrar direto (prod)
//                           · default sugerido = step 1 chips (canvas
//                             vence pra reduzir cliques sem volta)
//
// ## B.5 · Adicionar timestamp mono externo nos user bubbles
// Canvas tem "Você · 14:32" abaixo do bubble user (CustomerBubble).
// Prod (Bubble.tsx) não tem. Vai como melhoria pro Claude Code.
//
// ============================================================
// # COBERTURA DESIGN PENDENTE · V21+
// ────────────────────────────────────────────────────────────
// Coisas em prod que o canvas ainda não cobriu — round V21+:
//   - CommandPicker + DrinkDetail + FoodDetail (cardápio detalhe +
//     multi-step com qty/note/size/preferences)
//   - pedido/revisar + pedido/confirmando (countdown 15s) +
//     pedido/enviado (status steps)
//   - pagamento/pix com QR + countdown
//   - HostApprovalModal (lista de N pendentes simultâneos via WS)
//   - WelcomeModal first-time normal (canvas só tem versão late-arrival)
// ============================================================
