// ============================================================
// V14 · APP DO CLIENTE — round 9-bis · 4 correções sobre V13
//
//   1) Animação ContextualInputExpand · variante B (liquid morph)
//      vence · A e C apagadas · 4 keyframes (0/33/66/100%) documentam
//      o caminho da animação real (380ms clip-path + 200ms CTA fade).
//
//   2) view_menu · silent · não gera bubble assistente nem chips.
//      Tools "silent": view_menu, view_order, view_chat_history, view_courtesy,
//      open_payment_screen.
//
//   3) request_bill · 2-step router · pergunta canal antes de agir.
//      Nova tool: open_payment_screen (pagamento direto pelo app).
//      call_waiter aceita reason='ask_bill' como caminho do fluxo.
//
//   4) LGPD copy · deleção é IMEDIATA · sem "15 dias úteis" · protocolo
//      guardado por 90 dias pra comprovante.
// ============================================================
//
// # V20 · diff vs V19 · cliente-screens-v14.jsx
//   · ChatFrame agora usa <SoftInput> (era <LiquidInput>) · primitivo
//     canônico em cliente-tokens.jsx · alinha SoftInput.tsx em prod.
//     Visualmente: sólido bg-surface, sem backdrop-filter, seta send
//     ink·white 42×42 sempre visível, placeholder color C.mute.
//   · Nenhuma outra mudança · sections, tools, animações idênticas.
// ============================================================

// ─────────────────────────────────────────────────────────────
// TOOL REGISTRY · 25 tools em 6 grupos (V13 tinha 24 · +open_payment_screen)
// silent: true → não gera bubble assistente nem chips imediatos.
//                A IA só reaparece quando a UI dedicada fechar.
// ─────────────────────────────────────────────────────────────
const TOOL_REGISTRY = {
  // GRUPO A · CARDÁPIO · NAVEGAÇÃO (5)
  view_menu: { group: 'menu', requiresText: false, askIfMissing: false, silent: true },
  search_dish: { group: 'menu', requiresText: false, askIfMissing: false, silent: false },
  recommend_dish: { group: 'menu', requiresText: false, askIfMissing: true, silent: false },
  check_allergens: { group: 'menu', requiresText: false, askIfMissing: true, silent: false },
  compare_dishes: { group: 'menu', requiresText: false, askIfMissing: true, silent: false },

  // GRUPO B · PEDIDO (4)
  add_to_order: { group: 'order', requiresText: false, askIfMissing: true, silent: false },
  modify_order_item: { group: 'order', requiresText: false, askIfMissing: true, silent: false },
  remove_order_item: { group: 'order', requiresText: false, askIfMissing: true, silent: false },
  view_order: { group: 'order', requiresText: false, askIfMissing: false, silent: true },

  // GRUPO C · COMUNICAÇÃO COM STAFF (3) · TODAS exigem texto não-vazio
  call_waiter: {
    group: 'staff',
    requiresText: false,
    askIfMissing: true,
    silent: false,
    accepts: { reason: ['ask_bill', 'help', 'silverware', 'water', 'custom'] },
  },
  send_complaint: { group: 'staff', requiresText: true, askIfMissing: true, silent: false },
  send_message_to_manager: {
    group: 'staff',
    requiresText: true,
    askIfMissing: true,
    silent: false,
  },

  // GRUPO D · PAGAMENTO (5) · ★ +open_payment_screen ★
  request_bill: {
    group: 'payment',
    requiresText: false,
    askIfMissing: false,
    silent: false,
    router: true, // chama open_payment_screen OU call_waiter(reason='ask_bill')
    choices: ['open_payment_screen', 'call_waiter'],
  },
  open_payment_screen: { group: 'payment', requiresText: false, askIfMissing: false, silent: true }, // ★ NOVO
  split_bill: { group: 'payment', requiresText: false, askIfMissing: true, silent: false },
  pay_individual: { group: 'payment', requiresText: false, askIfMissing: true, silent: false },
  pay_full: { group: 'payment', requiresText: false, askIfMissing: true, silent: false },

  // GRUPO E · SESSÃO / UTILIDADE (6)
  view_chat_history: { group: 'session', requiresText: false, askIfMissing: false, silent: true },
  delete_chat: { group: 'destructive', requiresText: false, askIfMissing: true, silent: false },
  delete_all_chats: {
    group: 'destructive',
    requiresText: false,
    askIfMissing: false,
    silent: false,
  },
  rate_order: { group: 'session', requiresText: false, askIfMissing: false, silent: false },
  view_courtesy: { group: 'session', requiresText: false, askIfMissing: true, silent: true },
  ask_about_restaurant: { group: 'info', requiresText: false, askIfMissing: true, silent: false },

  // GRUPO F · LGPD · PRIVACY (2)
  show_lgpd_notice: { group: 'lgpd', requiresText: false, askIfMissing: false, silent: false },
  lgpd_data_request: { group: 'lgpd', requiresText: false, askIfMissing: true, silent: false },
};

const STAFF_TOOLS_REQUIRING_TEXT = ['send_complaint', 'send_message_to_manager'];
const SILENT_TOOLS = Object.entries(TOOL_REGISTRY)
  .filter(([_, v]) => v.silent)
  .map(([k]) => k);

// ─────────────────────────────────────────────────────────────
// HELPER · frame builder
// ─────────────────────────────────────────────────────────────
const f4 = ({ label, platform = 'iOS', screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard
      key={label + platform}
      id={'v14-' + label + '-' + platform}
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
// THREAD helpers
// ─────────────────────────────────────────────────────────────
const AssistantTurn = ({ when = 'agora', children, indicator, chips, expand }) => (
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
      Assistente · {when}
    </span>
    {indicator && (
      <div style={{ marginBottom: 10 }}>
        <ToolCallIndicator name={indicator.name} category={indicator.category} />
      </div>
    )}
    {children && (
      <div style={{ fontSize: 15.5, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink }}>
        {children}
      </div>
    )}
    {chips && <ContextualChips chips={chips} />}
    {expand && <ContextualInputExpand {...expand} />}
  </div>
);

// silent indicator = só o ToolCallIndicator, sem prose, sem chips
const SilentToolCall = ({ name, category }) => (
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
      Assistente · agora
    </span>
    <ToolCallIndicator name={name} category={category} />
  </div>
);

// ─────────────────────────────────────────────────────────────
// CHAT FRAME · com slot opcional pra overlay sheet
// ─────────────────────────────────────────────────────────────
const ChatFrame = ({
  children,
  andro = false,
  inputPlaceholder = 'Mensagem para a casa',
  topBack = false,
  overlay,
}) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  return (
    <Frame>
      <TopBar leftIcon={topBack ? 'back' : null} />
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
            gap: 18,
            paddingTop: 12,
            paddingBottom: 24,
            overflow: 'auto',
          }}
        >
          {children}
        </div>
        <div style={{ position: 'relative', paddingBottom: 26 }}>
          <SoftInput placeholder={inputPlaceholder} />
        </div>
        {overlay}
      </div>
    </Frame>
  );
};

// ============================================================
// SECTION 0 · princípio (mantido idêntico ao V13)
// ============================================================
const PatternBeforeNoChips = () => (
  <ChatFrame>
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
        Assistente · agora
      </span>
      <div style={{ fontSize: 15.5, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink }}>
        Adicionei o <b>Malbec da casa</b> · R$ 64 · serve em 6 min.
      </div>
    </div>
    <div
      style={{
        marginTop: 20,
        padding: '14px 16px',
        borderRadius: 12,
        border: `1px dashed ${C.danger}`,
        background: C.dangerWash,
        opacity: 0.85,
      }}
    >
      <MonoLabel size={9.5} color={C.danger}>
        Problema
      </MonoLabel>
      <div style={{ fontSize: 13, color: C.ink, marginTop: 4, letterSpacing: -0.05 }}>
        Cliente não sabe o que fazer agora · precisa pensar a próxima frase · UX morre na transição
        entre tools.
      </div>
    </div>
  </ChatFrame>
);

const PatternAfterWithChips = () => (
  <ChatFrame>
    <AssistantTurn
      chips={[
        { label: 'Ver pedido' },
        { label: 'Pedir mais alguma coisa' },
        { label: 'Pedir a conta' },
      ]}
    >
      Adicionei o <b>Malbec da casa</b> · R$ 64 · serve em 6 min.
    </AssistantTurn>
    <div
      style={{
        marginTop: 8,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.successWash,
      }}
    >
      <MonoLabel size={9.5} color={C.success}>
        Solução
      </MonoLabel>
      <div style={{ fontSize: 13, color: C.ink, marginTop: 4, letterSpacing: -0.05 }}>
        Cliente vê 3 caminhos prováveis · 1 toque pra qualquer um · ainda pode digitar texto livre
        se quiser.
      </div>
    </div>
  </ChatFrame>
);

const PatternExpandClosed = () => (
  <ChatFrame>
    <AssistantTurn
      chips={[
        { label: 'Demora' },
        { label: 'Item errado' },
        { label: 'Comida fria' },
        { label: 'Outro motivo', requiresText: true },
      ]}
    >
      Qual a sua reclamação? Vou passar pra Renata.
    </AssistantTurn>
  </ChatFrame>
);

const PatternExpandOpen = () => (
  <ChatFrame>
    <AssistantTurn
      expand={{
        placeholder: 'Conta o que aconteceu...',
        text: 'O risoto demorou 40 min · me trouxeram quando já tava sem temperatura · quase desisti.',
        ctaLabel: 'Confirmar e enviar',
      }}
    >
      Qual a sua reclamação? Vou passar pra Renata.
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 1 · ANIMAÇÃO ★ NOVA ★
// 4 keyframes congelados de B · liquid morph
// progresso 0% / 33% / 66% / 100% no eixo do tempo da animação
// ============================================================

// Visual progress badge — top-right inside frame
const ProgressBadge = ({ pct }) => (
  <div
    style={{
      position: 'absolute',
      top: 56,
      right: 18,
      zIndex: 5,
      fontFamily: MONO,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      background: C.ink,
      color: '#fff',
      padding: '5px 10px',
      borderRadius: 4,
      boxShadow: '0 2px 6px rgba(0,0,0,.18)',
    }}
  >
    t = {pct}%
  </div>
);

// Frozen rendering of the liquid morph at a specific progress point.
// Stage data approximates the same easing the prod animation uses
// (cubic-bezier(.4,0,.2,1) → output progress for a given time progress).
const KEYFRAME_STAGES = {
  0: {
    chips: 1.0,
    expandOpacity: 0,
    expandClipInset: '50% 0 50% 0',
    ctaOpacity: 0,
    showCaret: false,
  },
  33: {
    chips: 0.3,
    expandOpacity: 0.55,
    expandClipInset: '32% 0 32% 0',
    ctaOpacity: 0,
    showCaret: false,
  },
  66: {
    chips: 0.0,
    expandOpacity: 0.95,
    expandClipInset: '6% 0 6% 0',
    ctaOpacity: 0.4,
    showCaret: true,
  },
  100: {
    chips: 0.0,
    expandOpacity: 1.0,
    expandClipInset: '0 0 0 0',
    ctaOpacity: 1.0,
    showCaret: true,
  },
};

const FrozenChips = ({ opacity }) => {
  if (opacity === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        marginTop: 12,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        paddingBottom: 2,
        opacity,
        transition: 'none',
      }}
    >
      <ContextualChip label="Demora" />
      <ContextualChip label="Item errado" />
      <ContextualChip label="Comida fria" />
      <ContextualChip label="Outro motivo" requiresText />
    </div>
  );
};

const FrozenExpand = ({ stage }) => {
  if (stage.expandOpacity === 0) return null;
  return (
    <div style={{ marginTop: 14, opacity: stage.expandOpacity }}>
      <div
        style={{
          position: 'relative',
          background: '#fafaf8',
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
          padding: '14px 14px 12px',
          boxShadow: '0 1px 0 rgba(255,255,255,.6) inset, 0 4px 14px rgba(0,0,0,.04)',
          clipPath: `inset(${stage.expandClipInset} round 14px)`,
        }}
      >
        <button
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            borderRadius: 12,
            border: 'none',
            background: 'transparent',
            color: C.faint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          aria-label="Fechar"
        >
          {Ico.x(13, 'currentColor')}
        </button>
        <div
          style={{
            minHeight: 64,
            paddingRight: 24,
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.45,
            color: C.faint,
            letterSpacing: -0.05,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          Conta o que aconteceu...
          {stage.showCaret && (
            <span
              style={{
                display: 'inline-block',
                width: 1.5,
                height: 16,
                background: C.ink,
                marginLeft: 2,
                verticalAlign: 'middle',
                opacity: 0.7,
              }}
            />
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 12,
            fontFamily: MONO,
            fontSize: 9.5,
            color: C.faint,
            letterSpacing: 0.5,
          }}
        >
          0/240
        </div>
      </div>
      <div style={{ marginTop: 10, opacity: stage.ctaOpacity }}>
        <PillButton variant="filled" size="lg" disabled style={{ width: '100%' }}>
          Confirmar e enviar
        </PillButton>
      </div>
    </div>
  );
};

const KeyframeFreeze = ({ pct }) => {
  const stage = KEYFRAME_STAGES[pct];
  return (
    <ChatFrame overlay={<ProgressBadge pct={pct} />}>
      <CustomerBubble when="agora">[ tap "Outro motivo" ]</CustomerBubble>
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
          Assistente · agora
        </span>
        <div style={{ fontSize: 15.5, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink }}>
          Qual a sua reclamação? Vou passar pra Renata.
        </div>
        <FrozenChips opacity={stage.chips} />
        <FrozenExpand stage={stage} />
      </div>
    </ChatFrame>
  );
};

// ============================================================
// SECTION 2 · view_menu silent ★ CORRIGIDO ★
// Tool é navegação direta · não narra · só abre overlay
// ============================================================

const MenuOverlay = () => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      top: '32%',
      background: '#fff',
      borderRadius: '24px 24px 0 0',
      border: `1.5px solid ${C.border}`,
      borderBottom: 'none',
      padding: '12px 22px 22px',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 -8px 32px rgba(0,0,0,0.10)',
      animation: 'cMenuSheetUp 320ms cubic-bezier(.32,.72,0,1) both',
    }}
  >
    <div
      style={{
        width: 40,
        height: 4,
        borderRadius: 2,
        background: C.faint,
        alignSelf: 'center',
        marginBottom: 14,
        opacity: 0.6,
      }}
    />
    <div style={{ marginBottom: 14 }}>
      <MonoLabel size={10} color={C.mute}>
        Cardápio · Trattoria Luna
      </MonoLabel>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: -0.4,
          marginTop: 4,
          color: C.ink,
        }}
      >
        47 itens · 6 categorias
      </div>
    </div>
    <div
      style={{
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 999,
        padding: '11px 16px',
        fontSize: 14,
        color: C.faint,
        marginBottom: 14,
        background: C.surface,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14">
        <circle cx="6" cy="6" r="4" stroke={C.faint} strokeWidth="1.4" fill="none" />
        <path d="M9 9l3 3" stroke={C.faint} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span>Buscar prato</span>
    </div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
      {['Pratos do dia', 'Entradas', 'Massas', 'Carnes', 'Sobremesas'].map((cat, i) => (
        <span
          key={cat}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${i === 0 ? C.ink : C.borderSoft}`,
            background: i === 0 ? C.ink : '#fff',
            color: i === 0 ? '#fff' : C.ink,
            fontSize: 12,
            fontWeight: i === 0 ? 500 : 400,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {cat}
        </span>
      ))}
    </div>
    <div style={{ flex: 1, overflow: 'hidden' }}>
      {[
        {
          name: 'Risoto cogumelos · ao vinho',
          sub: 'parmesão · trufa preta · 18 min',
          price: 'R$ 64',
        },
        { name: 'Tagliatelle al ragù', sub: 'ragù bolonhesa · 14 min', price: 'R$ 58' },
        {
          name: 'Polpettine della casa',
          sub: 'almôndegas · molho pomodoro · 20 min',
          price: 'R$ 48',
        },
      ].map((d, i) => (
        <div
          key={d.name}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '12px 0',
            borderBottom: i < 2 ? `1px solid ${C.borderSoft}` : 'none',
          }}
        >
          <div style={{ flex: 1, paddingRight: 12 }}>
            <div
              style={{
                fontSize: 14.5,
                color: C.ink,
                fontWeight: 500,
                letterSpacing: -0.1,
                marginBottom: 2,
              }}
            >
              {d.name}
            </div>
            <div style={{ fontSize: 12, color: C.mute, letterSpacing: -0.05 }}>{d.sub}</div>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 13, color: C.ink, fontWeight: 500 }}>
            {d.price}
          </span>
        </div>
      ))}
    </div>
    <style>{`@keyframes cMenuSheetUp { from { transform: translateY(60%); opacity: .4; } to { transform: translateY(0); opacity: 1; } }`}</style>
  </div>
);

const ViewMenuSilent = () => (
  <ChatFrame overlay={<MenuOverlay />}>
    <CustomerBubble when="agora">abrir cardápio</CustomerBubble>
    <SilentToolCall name="view_menu" category="menu" />
  </ChatFrame>
);

// ============================================================
// SECTION 3 · send_complaint · 5 frames (mantidos do V13)
// ============================================================
const Pattern2A_AskType = () => (
  <ChatFrame>
    <CustomerBubble when="agora">quero reclamar</CustomerBubble>
    <AssistantTurn
      chips={[
        { label: 'Demora' },
        { label: 'Item errado' },
        { label: 'Item faltando' },
        { label: 'Comida fria' },
        { label: 'Outro motivo', requiresText: true },
      ]}
    >
      Qual a sua reclamação? Vou passar pra Renata.
    </AssistantTurn>
  </ChatFrame>
);

const Pattern2B_OutroOpen = () => (
  <ChatFrame>
    <CustomerBubble when="há 1 min">quero reclamar</CustomerBubble>
    <AssistantTurn>Qual a sua reclamação? Vou passar pra Renata.</AssistantTurn>
    <CustomerBubble when="agora">[ tap "Outro motivo" ]</CustomerBubble>
    <AssistantTurn
      expand={{
        placeholder: 'Conta o que aconteceu...',
        text: '',
        ctaLabel: 'Confirmar e enviar',
      }}
    >
      Conta mais um pouco · o que aconteceu?
    </AssistantTurn>
  </ChatFrame>
);

const ReviewCard = ({ kind, text }) => (
  <div
    style={{
      border: `1.4px solid ${C.ink}`,
      borderRadius: 14,
      background: '#fff',
      padding: '14px 16px',
    }}
  >
    <MonoLabel size={9.5} color={C.faint} style={{ display: 'block', marginBottom: 10 }}>
      Mensagem pra Renata · pré-visualização
    </MonoLabel>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <MonoLabel size={9} color={C.mute}>
        tipo
      </MonoLabel>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: C.ink,
          padding: '2px 8px',
          border: `1px solid ${C.ink}`,
          borderRadius: 4,
        }}
      >
        {kind}
      </span>
    </div>
    <div
      style={{
        fontSize: 14,
        lineHeight: 1.5,
        color: C.ink,
        letterSpacing: -0.05,
        paddingTop: 8,
        borderTop: `1px solid ${C.borderSoft}`,
      }}
    >
      “{text}”
    </div>
  </div>
);

const Pattern2C_ReviewCard = () => (
  <ChatFrame>
    <CustomerBubble when="há 2 min">o risoto chegou frio e demorou muito</CustomerBubble>
    <AssistantTurn>
      <ReviewCard
        kind="DEMORA + COMIDA FRIA"
        text="o risoto chegou frio e demorou muito · não consegui terminar"
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <PillButton variant="filled" size="md" style={{ flex: 1 }}>
          Confirmar
        </PillButton>
        <PillButton variant="outline" size="md" style={{ flex: 1 }}>
          Editar
        </PillButton>
      </div>
    </AssistantTurn>
  </ChatFrame>
);

const Pattern2D_ToolCalling = () => (
  <ChatFrame>
    <CustomerBubble when="há 2 min">o risoto chegou frio e demorou muito</CustomerBubble>
    <AssistantTurn>
      <ReviewCard
        kind="DEMORA + COMIDA FRIA"
        text="o risoto chegou frio e demorou muito · não consegui terminar"
      />
    </AssistantTurn>
    <CustomerBubble when="agora">[ tap "Confirmar" ]</CustomerBubble>
    <AssistantTurn indicator={{ name: 'send_complaint', category: 'staff' }} />
  </ChatFrame>
);

const Pattern2E_FinalChips = () => (
  <ChatFrame>
    <CustomerBubble when="há 3 min">o risoto chegou frio e demorou muito</CustomerBubble>
    <AssistantTurn
      when="há 1 min"
      chips={[
        { label: 'Ver mensagens · Renata' },
        { label: 'Pedir mais alguma coisa' },
        { label: 'Pedir a conta' },
      ]}
    >
      Mandei pra Renata · você verá a resposta no chat. Costuma responder em
      <b> ~2 min</b>.
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 4 · multi-step bebida (idêntico V13)
// ============================================================
const Pattern3A_AskType = () => (
  <ChatFrame>
    <CustomerBubble when="agora">quero adicionar uma bebida</CustomerBubble>
    <AssistantTurn
      chips={[
        { label: 'Vinho' },
        { label: 'Drink' },
        { label: 'Sem álcool' },
        { label: 'Recomende você' },
      ]}
    >
      Que tipo? Tem vinho da casa, drink autoral, sucos frescos do dia.
    </AssistantTurn>
  </ChatFrame>
);

const Pattern3B_AskColor = () => (
  <ChatFrame>
    <CustomerBubble when="há 30 s">[ tap "Vinho" ]</CustomerBubble>
    <AssistantTurn
      chips={[
        { label: 'Tinto' },
        { label: 'Branco' },
        { label: 'Rosé' },
        { label: 'Recomende você' },
      ]}
    >
      Tinto, branco ou rosé? A carta de hoje tem 12 rótulos.
    </AssistantTurn>
  </ChatFrame>
);

const Pattern3C_Confirmed = () => (
  <ChatFrame>
    <CustomerBubble when="agora">[ tap "Tinto" ]</CustomerBubble>
    <AssistantTurn
      indicator={{ name: 'add_to_order', category: 'menu' }}
      chips={[
        { label: 'Ver pedido' },
        { label: 'Pedir mais alguma coisa' },
        { label: 'Pedir a conta' },
      ]}
    >
      Adicionei o <b>Malbec da casa</b> · R$ 64 · serve em 6 min. Pareou bem com o seu risoto
      cogumelos.
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 6 · request_bill 2-step ★ CORRIGIDO ★
// router → open_payment_screen OR call_waiter(reason='ask_bill')
// ============================================================

// Step 1 · IA pergunta o canal
const BillStep1AskChannel = () => (
  <ChatFrame>
    <CustomerBubble when="agora">pede a conta</CustomerBubble>
    <AssistantTurn
      indicator={{ name: 'request_bill', category: 'payment' }}
      chips={[
        { label: 'Pagar pelo app', primary: true },
        { label: 'Chamar garçom' },
        { label: 'Voltar' },
      ]}
    >
      Você prefere pagar pelo app ou que o garçom traga a maquininha?
    </AssistantTurn>
  </ChatFrame>
);

// Step 2A · payment screen overlay (silent · UI dedicada · sem bubble adicional)
const PaymentScreenOverlay = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: '#fff',
      animation: 'cPaySheetUp 360ms cubic-bezier(.32,.72,0,1) both',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    {/* fake payment top bar */}
    <div
      style={{
        padding: '14px 20px 12px',
        borderBottom: `1px solid ${C.borderSoft}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          border: `1.2px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Ico.x(15, C.ink)}
      </div>
      <MonoLabel size={10} color={C.mute}>
        Pagamento
      </MonoLabel>
      <span style={{ width: 32 }} />
    </div>

    {/* total */}
    <div style={{ padding: '24px 22px 16px' }}>
      <MonoLabel size={10} color={C.mute}>
        Total da mesa
      </MonoLabel>
      <div
        style={{
          fontSize: 38,
          fontWeight: 600,
          letterSpacing: -1.2,
          color: C.ink,
          marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        R$ 142,90
      </div>
      <div style={{ fontSize: 13, color: C.mute, marginTop: 2, letterSpacing: -0.05 }}>
        4 itens · serviço (10%) incluso
      </div>
    </div>

    {/* split toggle */}
    <div
      style={{
        margin: '0 22px 18px',
        padding: '12px 14px',
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, letterSpacing: -0.1 }}>
          Dividir conta
        </div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>
          Igual · por item · valores diferentes
        </div>
      </div>
      <div
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          background: C.borderSoft,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }}
        />
      </div>
    </div>

    {/* method picker */}
    <div style={{ padding: '0 22px', flex: 1 }}>
      <MonoLabel size={10} color={C.mute} style={{ display: 'block', marginBottom: 10 }}>
        Forma de pagamento
      </MonoLabel>
      {[
        { name: 'Pix', sub: 'instantâneo · sem taxa', selected: true },
        { name: 'Apple Pay', sub: 'Touch ID / Face ID' },
        { name: 'Cartão de crédito', sub: 'salvar pra próxima' },
      ].map((m) => (
        <div
          key={m.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 14px',
            border: `1.5px solid ${m.selected ? C.ink : C.borderSoft}`,
            borderRadius: 12,
            marginBottom: 8,
            background: m.selected ? '#fafaf8' : '#fff',
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              border: `1.5px solid ${m.selected ? C.ink : C.borderSoft}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {m.selected && (
              <div style={{ width: 8, height: 8, borderRadius: 4, background: C.ink }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 500, color: C.ink, letterSpacing: -0.1 }}>
              {m.name}
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>{m.sub}</div>
          </div>
        </div>
      ))}
    </div>

    {/* sticky CTA */}
    <div style={{ padding: '14px 22px 28px', borderTop: `1px solid ${C.borderSoft}` }}>
      <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
        Pagar R$ 142,90
      </PillButton>
    </div>
    <style>{`@keyframes cPaySheetUp { from { transform: translateY(40%); opacity: .4; } to { transform: translateY(0); opacity: 1; } }`}</style>
  </div>
);

const BillStep2APayApp = () => (
  <ChatFrame overlay={<PaymentScreenOverlay />}>
    <CustomerBubble when="há 30 s">pede a conta</CustomerBubble>
    <AssistantTurn>Você prefere pagar pelo app ou que o garçom traga a maquininha?</AssistantTurn>
    <CustomerBubble when="agora">[ tap "Pagar pelo app" ]</CustomerBubble>
    <SilentToolCall name="open_payment_screen" category="payment" />
  </ChatFrame>
);

const BillStep2BCallWaiter = () => (
  <ChatFrame>
    <CustomerBubble when="há 30 s">pede a conta</CustomerBubble>
    <AssistantTurn when="há 30 s">
      Você prefere pagar pelo app ou que o garçom traga a maquininha?
    </AssistantTurn>
    <CustomerBubble when="agora">[ tap "Chamar garçom" ]</CustomerBubble>
    <AssistantTurn
      indicator={{ name: "call_waiter(reason='ask_bill')", category: 'staff' }}
      chips={[{ label: 'Ver pedido enquanto espera' }, { label: 'Mandar mensagem pra Renata' }]}
    >
      Avisei o garçom · ele tá indo até a mesa com a maquininha. Já adianto:
      <b> R$ 142,90</b> · serviço incluso.
    </AssistantTurn>
  </ChatFrame>
);

// graceful fail · 2 min depois sem ack do garçom · IA proativa
const BillRetryAfterWaiter = () => (
  <ChatFrame>
    <CustomerBubble when="há 2 min">[ tap "Chamar garçom" ]</CustomerBubble>
    <AssistantTurn when="há 2 min">
      Avisei o garçom · ele tá indo até a mesa com a maquininha.
    </AssistantTurn>
    <AssistantTurn
      when="agora"
      chips={[
        { label: 'Mandar de novo' },
        { label: 'Pagar pelo app' },
        { label: 'Cancelar pedido' },
      ]}
    >
      Ainda não tive resposta do garçom · quer que eu mande de novo OU já partimos pro pagamento
      pelo app?
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 7 · LGPD ★ COPY CORRIGIDA ★
// Deleção é IMEDIATA · sem 15 dias · protocolo guardado 90 dias
// ============================================================

const LGPDNoticeBubble = ({ children }) => (
  <div
    style={{
      background: '#fafaf8',
      border: `1px solid ${C.borderSoft}`,
      borderLeft: `3px solid ${C.ink}`,
      borderRadius: 10,
      padding: '14px 16px',
    }}
  >
    <MonoLabel size={9.5} color={C.ink} style={{ display: 'block', marginBottom: 8 }}>
      Aviso LGPD
    </MonoLabel>
    <div style={{ fontSize: 15, lineHeight: 1.5, letterSpacing: -0.15, color: C.ink }}>
      {children}
    </div>
  </div>
);

const LGPD1_Notice = () => (
  <ChatFrame>
    <CustomerBubble when="agora">quero apagar meus dados</CustomerBubble>
    <AssistantTurn
      indicator={{ name: 'show_lgpd_notice', category: 'lgpd' }}
      chips={[{ label: 'Sim, quero excluir' }, { label: 'Não, não quero excluir' }]}
    >
      <LGPDNoticeBubble>
        Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão dos seus dados a
        qualquer momento. Posso apagar suas conversas agora?
      </LGPDNoticeBubble>
    </AssistantTurn>
  </ChatFrame>
);

const LGPD2_Confirmed = () => (
  <ChatFrame>
    <CustomerBubble when="há 30 s">quero apagar meus dados</CustomerBubble>
    <AssistantTurn>
      <LGPDNoticeBubble>
        Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão dos seus dados a
        qualquer momento. Posso apagar suas conversas agora?
      </LGPDNoticeBubble>
    </AssistantTurn>
    <CustomerBubble when="agora">[ tap "Sim, quero excluir" ]</CustomerBubble>
    <AssistantTurn indicator={{ name: 'lgpd_data_request', category: 'lgpd' }} />
  </ChatFrame>
);

const LGPD3_Receipt = () => (
  <ChatFrame>
    <CustomerBubble when="há 1 min">quero apagar meus dados</CustomerBubble>
    <AssistantTurn when="agora">
      <div
        style={{
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
          background: '#fff',
          padding: '16px 18px',
        }}
      >
        <MonoLabel size={9.5} color={C.faint} style={{ display: 'block', marginBottom: 10 }}>
          Solicitação registrada · protocolo
        </MonoLabel>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 18,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          LGPD-2026-05-08-3F2A
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: C.ink, letterSpacing: -0.05 }}>
          Suas conversas foram apagadas <b>agora</b>. Protocolo guardado por
          <b> 90 dias</b> caso você precise de comprovante.
        </div>
      </div>
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 8 · Android paridade
// ============================================================
const AndroidParity = () => (
  <ChatFrame andro>
    <AssistantTurn
      expand={{
        placeholder: 'Conta o que aconteceu...',
        text: 'O risoto demorou 40 min',
        ctaLabel: 'Confirmar e enviar',
      }}
    >
      Qual a sua reclamação? Vou passar pra Renata.
    </AssistantTurn>
  </ChatFrame>
);

// ─────────────────────────────────────────────────────────────
// EXPORT · canvas V14
// ─────────────────────────────────────────────────────────────
window.CLIENTE_LLM_SECTIONS_V14 = [
  {
    id: 'v14.0',
    title: 'Princípio · navegação 100% conversacional via chips contextuais',
    subtitle:
      'Toda resposta da IA termina com 2-4 chips sugerindo próximas ações prováveis. Cliente sempre completa o fluxo de 2 formas equivalentes: tap chip OU texto livre. Chips somem após escolha · não persistem · não ressurgem sozinhos.',
    frames: [
      f4({
        label: 'antes · sem chips',
        screen: <PatternBeforeNoChips />,
        note: 'Bubble da IA termina na própria mensagem · cliente fica perdido na transição entre tools.',
      }),
      f4({
        label: 'depois · com chips contextuais',
        screen: <PatternAfterWithChips />,
        note: '2-4 chips outline pill · primário esquerda · destrutivo/cancelar direita · ≤22 chars · banido "Ok"/"Sim"/"Tá bom" exceto destructive confirms.',
      }),
      f4({
        label: 'expand · fechado · chip "Outro motivo" visível',
        screen: <PatternExpandClosed />,
        note: 'Chip exige texto (`requiresText: true`) → glifo discreto à direita. Tap NÃO abre tela nova · expande inline.',
      }),
      f4({
        label: 'expand · aberto · liquid morph',
        screen: <PatternExpandOpen />,
        note: 'ContextualInputExpand · variante única (liquid) · animação real é fluida · veja v14.1 pra storyboard de keyframes.',
      }),
    ],
  },

  // ★ SEÇÃO ATUALIZADA · 4 keyframes da animação liquid morph
  {
    id: 'v14.1',
    title: '★ Animação ContextualInputExpand · variante B (liquid morph) · 4 keyframes',
    subtitle:
      'Variantes A (snappy) e C (drape) descartadas no round 9-bis. B é o meio-termo cinematográfico que combina com chat. Animação real é fluida via cubic-bezier(.4,0,.2,1) por 380ms (clip-path do meio pra fora) + 200ms (CTA fade) · este storyboard documenta o caminho pra implementação.',
    frames: [
      f4({
        label: 'B · liquid morph · t = 0%',
        screen: <KeyframeFreeze pct={0} />,
        note: 'Estado inicial · chips em opacity 1 · textarea com clip-path: inset(50% 0 50% 0) · invisível · CTA invisível.',
      }),
      f4({
        label: 'B · liquid morph · t = 33%',
        screen: <KeyframeFreeze pct={33} />,
        note: 'Chips fadando (opacity 0.3) · textarea começou a revelar do meio pra fora (clip-path inset 32%) · CTA ainda invisível.',
      }),
      f4({
        label: 'B · liquid morph · t = 66%',
        screen: <KeyframeFreeze pct={66} />,
        note: 'Chips totalmente fade-out · textarea ~94% revelado (clip-path inset 6%) · CTA fade-in iniciando (opacity 0.4).',
      }),
      f4({
        label: 'B · liquid morph · t = 100%',
        screen: <KeyframeFreeze pct={100} />,
        note: 'Estado final · só textarea + CTA visíveis · chips removidos do DOM · cursor piscando esperando input.',
      }),
    ],
  },

  // ★ view_menu silent
  {
    id: 'v14.2',
    title: '★ Pattern 1 · view_menu · SILENT · navegação direta sem narração',
    subtitle:
      'view_menu é tool de navegação direta — quando cliente diz "abrir cardápio", a IA não narra nem oferece ajuda. Só abre o overlay. Tools silent: view_menu · view_order · view_chat_history · view_courtesy · open_payment_screen. A IA volta a aparecer só quando o overlay fechar (com ou sem ação consumada).',
    frames: [
      f4({
        label: 'view_menu · silent · overlay sobe',
        screen: <ViewMenuSilent />,
        note: 'Sequência: customer input → ToolCallIndicator inline (sem prose · sem chips) → overlay sheet sobe sobre o chat. Após overlay fechar: se cliente fechou sem ação → bubble discreta + chips contextuais; se adicionou item → fluxo add_to_order normal.',
      }),
    ],
  },

  // send_complaint (mantido)
  {
    id: 'v14.3',
    title: 'Pattern 2 · param-needed · send_complaint com "Outro motivo" expand',
    subtitle:
      'Tool exige texto · STAFF_TOOLS_REQUIRING_TEXT bloqueia chamada com texto vazio. Chips de tipo (5) · "Outro motivo" tem `requiresText:true` · expande inline. Review-card pré-envio · 2 CTAs · ToolCallIndicator mostarda · resposta final com chips contextuais.',
    frames: [
      f4({
        label: '2A · ask type · 5 chips',
        screen: <Pattern2A_AskType />,
        note: 'Chips: Demora · Item errado · Item faltando · Comida fria · Outro motivo (requiresText). Scroll horizontal no narrow.',
      }),
      f4({
        label: '2B · "Outro motivo" → expand aberto',
        screen: <Pattern2B_OutroOpen />,
        note: 'Chips desaparecem · ContextualInputExpand sobe inline (variante liquid · única) · CTA "Confirmar e enviar" disabled enquanto vazio.',
      }),
      f4({
        label: '2C · review card pré-envio',
        screen: <Pattern2C_ReviewCard />,
        note: 'Card border ink 1.4px · kind chip mono caps · texto entre aspas · 2 CTAs · Confirmar (filled) · Editar (outline). Cliente sempre revê antes de mandar pra Renata.',
      }),
      f4({
        label: '2D · ToolCallIndicator mostarda',
        screen: <Pattern2D_ToolCalling />,
        note: '··· USANDO send_complaint ··· em mostarda mute (categoria staff). Sinaliza entrega · não interrompe leitura.',
      }),
      f4({
        label: '2E · resposta + chips finais',
        screen: <Pattern2E_FinalChips />,
        note: 'Confirmação concreta com expectativa ("respondeu em ~2 min em média"). Chips: Ver mensagens · Renata · Pedir mais alguma coisa · Pedir a conta.',
      }),
    ],
  },

  // multi-step bebida (mantido)
  {
    id: 'v14.4',
    title: 'Pattern 3 · multi-step · pedido de bebida (LLM coleta detalhes)',
    subtitle:
      'Cada passo refina via chips · "Recomende você" sempre presente como caminho preguiçoso. ToolCallIndicator no momento do add_to_order. Chips finais contextuais ao pedido.',
    frames: [
      f4({
        label: '3A · ask type',
        screen: <Pattern3A_AskType />,
        note: 'Chips: Vinho · Drink · Sem álcool · Recomende você. Cliente impaciente vai direto no último.',
      }),
      f4({
        label: '3B · ask color',
        screen: <Pattern3B_AskColor />,
        note: 'Chips: Tinto · Branco · Rosé · Recomende você. Cliente continua refinando ou delega.',
      }),
      f4({
        label: '3C · confirmed · add_to_order',
        screen: <Pattern3C_Confirmed />,
        note: 'ToolCallIndicator ink mute · resposta com nome + preço + tempo + pareamento · chips: Ver pedido · Pedir mais · Pedir a conta.',
      }),
    ],
  },

  // ★ request_bill 2-step
  {
    id: 'v14.6',
    title: '★ Pattern 5 · request_bill · 2-step router · garçom OR app',
    subtitle:
      'request_bill agora é router · pergunta canal antes de agir. Internamente chama 1 de 2: open_payment_screen (silent · UI dedicada) OR call_waiter(reason="ask_bill") (avisa staff + adianta valor). Cliente nunca fica preso num caminho que não escolheu.',
    frames: [
      f4({
        label: '5 · step 1 · pergunta canal',
        screen: <BillStep1AskChannel />,
        note: 'IA pergunta antes de agir. Chips: Pagar pelo app (primary filled) · Chamar garçom (outline) · Voltar (outline). "Voltar" volta pro modo conversa · sem ação.',
      }),
      f4({
        label: '5 · step 2A · payment screen abre',
        screen: <BillStep2APayApp />,
        note: 'Tap "Pagar pelo app" → open_payment_screen (silent) · UI dedicada cobre o chat · ScreenCustomerPayment (placeholder com Pix/Apple Pay/Cartão · split toggle · CTA full-width).',
      }),
      f4({
        label: '5 · step 2B · garçom chamado + valor adiantado',
        screen: <BillStep2BCallWaiter />,
        note: 'Tap "Chamar garçom" → call_waiter(reason="ask_bill") · indicator mostarda staff · IA confirma e adianta valor · chips contextuais (ver pedido enquanto espera · mandar msg pra Renata).',
      }),
      f4({
        label: '5 · 2 min sem ack · retry alternativas',
        screen: <BillRetryAfterWaiter />,
        note: 'Após escolher "Chamar garçom" e ficar 2 min sem resposta · IA volta proativamente. Chips: Mandar de novo · Pagar pelo app (rota alternativa) · Cancelar pedido. Cliente nunca sem caminho.',
      }),
    ],
  },

  // ★ LGPD copy fix
  {
    id: 'v14.7',
    title: '★ LGPD flow · deleção imediata · sem "15 dias úteis"',
    subtitle:
      'Trigger por intent ("apagar meus dados", "vocês guardam minhas info?", "quais meus direitos?"). Texto canônico vive em código backend · imutável. Confirmação retorna protocolo + nota de que conversas já foram apagadas. Protocolo guardado 90 dias pra comprovante. Prazo legal LGPD de 15 dias se aplica só a pedidos de PII completo (cadastro) · escopo separado · não vive nesse fluxo.',
    frames: [
      f4({
        label: 'lgpd · 1 · notice + 2 chips',
        screen: <LGPD1_Notice />,
        note: 'Notice em ManagerBubble-style com mono label "AVISO LGPD". 2 chips simples: Sim, quero excluir · Não, não quero excluir.',
      }),
      f4({
        label: 'lgpd · 2 · tap sim · indicator',
        screen: <LGPD2_Confirmed />,
        note: 'ToolCallIndicator ink mute · USANDO lgpd_data_request · backend apaga chat_threads + chat_messages no NoSQL imediatamente · cria registro lgpd_requests com status fulfilled.',
      }),
      f4({
        label: 'lgpd · 3 · protocolo · IMEDIATO (★ corrigido)',
        screen: <LGPD3_Receipt />,
        note: 'Card mono LGPD-AAAA-MM-DD-XXXX · copy nova: "Suas conversas foram apagadas agora. Protocolo guardado por 90 dias caso você precise de comprovante." Sem prazo de 15 dias · sem push de confirmação posterior · ação consumada · SEM chips.',
      }),
    ],
  },

  // android (mantido)
  {
    id: 'v14.8',
    title: 'UI variations · paridade Android',
    subtitle: 'Mesma linguagem · status bar correta · gesture nav · animação igual.',
    frames: [
      f4({
        label: 'expand aberto',
        platform: 'Android',
        screen: <AndroidParity />,
        note: 'AndroidFrame com punch-hole + gesture pill. Animação cInputLiquid preserva cubic-bezier · zero diferença de timing.',
      }),
    ],
  },
];
