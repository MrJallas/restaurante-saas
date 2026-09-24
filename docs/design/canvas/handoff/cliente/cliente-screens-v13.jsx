// ============================================================
// V13 · APP DO CLIENTE — NAVEGAÇÃO 100% CONVERSACIONAL
// 24 LLM tools + chips contextuais reativos + ContextualInputExpand
// + ToolCallIndicator + LGPD flow.
//
// Princípio arquitetural:
//   Toda resposta da IA termina com 2-4 chips contextuais sugerindo
//   próximas ações prováveis. Cliente sempre completa o fluxo de 2 formas:
//     1) tap chip (caminho rápido) — 1 toque
//     2) texto livre (LLM detecta intent e roteia pra mesma tool)
//   Ambos disparam a mesma tool · mesmos params · mesmo resultado.
//
// Linguagem: cliente-tokens.jsx (idêntica a v2 · zero desvio).
// ============================================================

// ─────────────────────────────────────────────────────────────
// TOOL REGISTRY · 24 tools em 6 grupos
// chips por tool documentados aqui · backend espelha em CONTEXTUAL_CHIPS_PER_TOOL
// ─────────────────────────────────────────────────────────────
const TOOL_REGISTRY = {
  // GRUPO A · CARDÁPIO · NAVEGAÇÃO (5)
  view_menu: { group: 'menu', requiresText: false, askIfMissing: false },
  search_dish: { group: 'menu', requiresText: false, askIfMissing: false },
  recommend_dish: { group: 'menu', requiresText: false, askIfMissing: true },
  check_allergens: { group: 'menu', requiresText: false, askIfMissing: true },
  compare_dishes: { group: 'menu', requiresText: false, askIfMissing: true },

  // GRUPO B · PEDIDO (4)
  add_to_order: { group: 'order', requiresText: false, askIfMissing: true },
  modify_order_item: { group: 'order', requiresText: false, askIfMissing: true },
  remove_order_item: { group: 'order', requiresText: false, askIfMissing: true },
  view_order: { group: 'order', requiresText: false, askIfMissing: false },

  // GRUPO C · COMUNICAÇÃO COM STAFF (3) · TODAS exigem texto não-vazio
  call_waiter: { group: 'staff', requiresText: false, askIfMissing: true },
  send_complaint: { group: 'staff', requiresText: true, askIfMissing: true },
  send_message_to_manager: { group: 'staff', requiresText: true, askIfMissing: true },

  // GRUPO D · PAGAMENTO (4) · UI dedicada
  request_bill: { group: 'payment', requiresText: false, askIfMissing: false },
  split_bill: { group: 'payment', requiresText: false, askIfMissing: true },
  pay_individual: { group: 'payment', requiresText: false, askIfMissing: true },
  pay_full: { group: 'payment', requiresText: false, askIfMissing: true },

  // GRUPO E · SESSÃO / UTILIDADE (6)
  view_chat_history: { group: 'session', requiresText: false, askIfMissing: false },
  delete_chat: { group: 'destructive', requiresText: false, askIfMissing: true },
  delete_all_chats: { group: 'destructive', requiresText: false, askIfMissing: false },
  rate_order: { group: 'session', requiresText: false, askIfMissing: false },
  view_courtesy: { group: 'session', requiresText: false, askIfMissing: true },
  ask_about_restaurant: { group: 'info', requiresText: false, askIfMissing: true },

  // GRUPO F · LGPD · PRIVACY (2) · ★ NOVO ★
  show_lgpd_notice: { group: 'lgpd', requiresText: false, askIfMissing: false },
  lgpd_data_request: { group: 'lgpd', requiresText: false, askIfMissing: true },
};

const STAFF_TOOLS_REQUIRING_TEXT = ['send_complaint', 'send_message_to_manager'];

// ─────────────────────────────────────────────────────────────
// HELPER · frame builder (mesmo padrão de cliente-screens-v2.jsx)
// ─────────────────────────────────────────────────────────────
const f3 = ({ label, platform = 'iOS', screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard
      key={label + platform}
      id={'v13-' + label + '-' + platform}
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
// THREAD · helpers de bubble do cliente / IA / gerente
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

// ─────────────────────────────────────────────────────────────
// CHAT FRAME · iOS thread completo · top bar + scrollable + LiquidInput
// ─────────────────────────────────────────────────────────────
const ChatFrame = ({
  children,
  andro = false,
  inputPlaceholder = 'Mensagem para a casa',
  topBack = false,
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
          <LiquidInput placeholder={inputPlaceholder} />
        </div>
      </div>
    </Frame>
  );
};

// ============================================================
// SECTION 0 · customer-llm-pattern · PRINCÍPIO ARQUITETURAL
// ============================================================

// Frame · ANTES · bubble da IA SEM chips (estado "perdido")
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

// Frame · DEPOIS · mesma bubble COM 3 chips contextuais
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

// Frame · ContextualInputExpand FECHADO (chips visíveis · um deles requiresText)
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

// Frame · ContextualInputExpand ABERTO (textarea + CTA visíveis · chips somem)
const PatternExpandOpen = () => (
  <ChatFrame>
    <AssistantTurn
      expand={{
        placeholder: 'Conta o que aconteceu...',
        text: 'O risoto demorou 40 min · me trouxeram quando já tava sem temperatura · quase desisti.',
        ctaLabel: 'Confirmar e enviar',
        variant: 'snappy',
      }}
    >
      Qual a sua reclamação? Vou passar pra Renata.
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 1 · customer-llm-animations · 3 variantes pra cliente escolher
// Mesma cena · diferente easing/timing · Apple-flavored
// ============================================================

const AnimationDemo = ({ variant }) => (
  <ChatFrame>
    <AssistantTurn
      expand={{
        placeholder: 'Conta o que aconteceu...',
        text: '',
        ctaLabel: 'Confirmar e enviar',
        variant,
      }}
    >
      Qual a sua reclamação? Vou passar pra Renata.
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 2 · customer-llm-tools · 5 patterns
// ============================================================

// ─────────────────────────────────────────────────────────────
// PATTERN 1 · single-tool no-param · "abrir cardápio"
// ─────────────────────────────────────────────────────────────
const Pattern1ToolCalling = () => (
  <ChatFrame>
    <CustomerBubble when="agora">abrir cardápio</CustomerBubble>
    <AssistantTurn
      indicator={{ name: 'view_menu', category: 'menu' }}
      chips={[
        { label: 'Ver pratos do dia' },
        { label: 'Buscar prato' },
        { label: 'Recomende algo' },
      ]}
    >
      Cardápio aberto — <b>Trattoria Luna</b> · 47 itens. Quer que eu te ajude a escolher?
    </AssistantTurn>
  </ChatFrame>
);

// ─────────────────────────────────────────────────────────────
// PATTERN 2 · param-needed · "quero reclamar" (5 frames)
// ─────────────────────────────────────────────────────────────
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
    <CustomerBubble when="agora">[ tap “Outro motivo” ]</CustomerBubble>
    <AssistantTurn
      expand={{
        placeholder: 'Conta o que aconteceu...',
        text: '',
        ctaLabel: 'Confirmar e enviar',
        variant: 'snappy',
      }}
    >
      Conta mais um pouco · o que aconteceu?
    </AssistantTurn>
  </ChatFrame>
);

// Review card antes de mandar (resumo do que vai pra Renata)
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

// ─────────────────────────────────────────────────────────────
// PATTERN 3 · multi-step · pedido de bebida (3 frames)
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// PATTERN 5 · graceful fail · pede a conta + retry (2 frames)
// ─────────────────────────────────────────────────────────────
const Pattern5A_BillCalled = () => (
  <ChatFrame>
    <CustomerBubble when="agora">pede a conta</CustomerBubble>
    <AssistantTurn
      indicator={{ name: 'request_bill', category: 'payment' }}
      chips={[{ label: 'Pagar tudo' }, { label: 'Dividir conta' }, { label: 'Voltar' }]}
    >
      Vou trazer a conta · avisei o garçom. Já adianto: <b>R$ 142,90</b> · serviço incluso. Como
      você prefere pagar?
    </AssistantTurn>
  </ChatFrame>
);

const Pattern5B_BillFailRetry = () => (
  <ChatFrame>
    <CustomerBubble when="há 2 min">pede a conta</CustomerBubble>
    <AssistantTurn when="há 2 min">Vou trazer a conta · avisei o garçom.</AssistantTurn>
    <AssistantTurn
      when="agora"
      chips={[
        { label: 'Mandar de novo' },
        { label: 'Chamar maquininha' },
        { label: 'Cancelar pedido' },
      ]}
    >
      Ainda não tive resposta do garçom · quer que eu mande de novo OU já chamo a maquininha pra
      mesa?
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// SECTION 3 · LGPD flow · ★ NOVO ★ (3 frames)
// Texto canônico do show_lgpd_notice é exemplo · cliente edita depois.
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
        qualquer momento. Posso encaminhar sua solicitação pra gerência?
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
        qualquer momento. Posso encaminhar sua solicitação pra gerência?
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
            fontSize: 16,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          LGPD-2026-05-08-3F2A
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: C.ink, letterSpacing: -0.05 }}>
          Sua solicitação foi encaminhada pra gerência da Trattoria Luna · retorno em até{' '}
          <b>15 dias úteis</b>. Você receberá confirmação por push quando concluído.
        </div>
      </div>
    </AssistantTurn>
  </ChatFrame>
);

// ============================================================
// ANDROID PARIDADE · 1 frame · ContextualInputExpand aberto
// ============================================================
const AndroidParity = () => (
  <ChatFrame andro>
    <AssistantTurn
      expand={{
        placeholder: 'Conta o que aconteceu...',
        text: 'O risoto demorou 40 min',
        ctaLabel: 'Confirmar e enviar',
        variant: 'snappy',
      }}
    >
      Qual a sua reclamação? Vou passar pra Renata.
    </AssistantTurn>
  </ChatFrame>
);

// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO PRA O CANVAS V13
// ─────────────────────────────────────────────────────────────
window.CLIENTE_LLM_SECTIONS = [
  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.0',
    title: 'Princípio · navegação 100% conversacional via chips contextuais',
    subtitle:
      'Toda resposta da IA termina com 2-4 chips sugerindo próximas ações prováveis. NÃO opcionais. Cliente sempre completa o fluxo de 2 formas equivalentes: tap chip (caminho rápido, 1 toque) OU texto livre (LLM detecta intent e roteia). Chips somem após escolha · não persistem · não ressurgem sozinhos.',
    frames: [
      f3({
        label: 'antes · sem chips',
        screen: <PatternBeforeNoChips />,
        note: 'Bubble da IA terminava na própria mensagem. Cliente fica perdido na transição entre tools — UX morre. Esse era o estado v12 fora do fluxo de reclamação.',
      }),
      f3({
        label: 'depois · com chips contextuais',
        screen: <PatternAfterWithChips />,
        note: '2-4 chips outline pill · primário esquerda · destrutivo/cancelar direita · ≤22 chars · banido "Ok"/"Sim"/"Tá bom" exceto destructive confirms (orientação cliente).',
      }),
      f3({
        label: 'expand · fechado · chip "Outro motivo" visível',
        screen: <PatternExpandClosed />,
        note: 'Quando uma chip exige texto (prop `requiresText: true`), ela vem com glifo discreto à direita. Tap NÃO abre tela nova — expande inline.',
      }),
      f3({
        label: 'expand · aberto · textarea + CTA full-width',
        screen: <PatternExpandOpen />,
        note: 'ContextualInputExpand · surface #fafaf8 · border 1px borderSoft · radius 14 · X discreto top-right reverte pros chips · contador 240 chars bottom-right · CTA filled ink full-width disabled enquanto vazio.',
      }),
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.1',
    title: 'Animação do ContextualInputExpand · 3 variantes Apple-flavor pra escolher',
    subtitle:
      'Mesma cena · diferente timing/easing. Todas mantêm a sequência: chips fade-out → textarea entra → CTA revela. Diferem em curva, duração e sensação tátil. Pick a favorita · descarto as outras 2 no próximo round.',
    frames: [
      f3({
        label: 'A · spring snappy (iOS sheet)',
        screen: <AnimationDemo variant="snappy" />,
        note: 'Spring iOS — chips fade 180ms · textarea slide+scale 320ms cubic-bezier(.32,.72,0,1) · CTA scale 0.96→1 220ms · total ~520ms. Sensação tátil/responsiva tipo iOS sheet · ressona com quem é fã do snap da Apple.',
      }),
      f3({
        label: 'B · liquid morph (Apple Music)',
        screen: <AnimationDemo variant="liquid" />,
        note: 'Liquid morph — chips fade 200ms · clip-path desce do meio pra fora 380ms cubic-bezier(.4,0,.2,1) · CTA fade 200ms · total ~580ms. Mais cinético · a caixa "se forma" do nada como na transição entre cards do Apple Music.',
      }),
      f3({
        label: 'C · soft drape (Apple Mail compose)',
        screen: <AnimationDemo variant="drape" />,
        note: 'Soft drape — chips fade 240ms · textarea desce 16px com ease-out forte 420ms cubic-bezier(.16,1,.3,1) · CTA fade 220ms · total ~640ms. Sensação contida/elegante · igual quando você abre compose no Apple Mail · "respira" no fim.',
      }),
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.2',
    title: 'Pattern 1 · single-tool no-param · "abrir cardápio"',
    subtitle:
      'Tool sem parâmetros. ToolCallIndicator aparece após mensagem de transição, antes da confirmação. Mostarda mute pra staff · ink mute pra resto. 1 frame que cobre o caso.',
    frames: [
      f3({
        label: 'view_menu · indicator + chips',
        screen: <Pattern1ToolCalling />,
        note: 'JetBrains Mono 10px tracking 1.5 caps · 3 dots animados pulsando ambos os lados · cor ink mute · animação cDotPulse 1.2s loop · fade-in/out 200ms.',
      }),
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.3',
    title: 'Pattern 2 · param-needed · send_complaint com "Outro motivo" expand',
    subtitle:
      'Tool exige texto · STAFF_TOOLS_REQUIRING_TEXT bloqueia chamada com texto vazio. Chips de tipo (5) · "Outro motivo" tem prop requiresText:true · expande inline. Review-card pré-envio com kind + texto · 2 CTAs (Confirmar/Editar) · ToolCallIndicator mostarda · resposta final com chips contextuais.',
    frames: [
      f3({
        label: '2A · ask type · 5 chips',
        screen: <Pattern2A_AskType />,
        note: 'Chips: Demora · Item errado · Item faltando · Comida fria · Outro motivo (requiresText). Scroll horizontal no narrow.',
      }),
      f3({
        label: '2B · "Outro motivo" → expand aberto',
        screen: <Pattern2B_OutroOpen />,
        note: 'Chips desaparecem · ContextualInputExpand sobe inline · placeholder "Conta o que aconteceu..." · CTA "Confirmar e enviar" disabled enquanto vazio.',
      }),
      f3({
        label: '2C · review card pré-envio',
        screen: <Pattern2C_ReviewCard />,
        note: 'Card border ink 1.4px · kind chip mono caps · texto entre aspas · 2 CTAs side-by-side · Confirmar (filled) · Editar (outline). Cliente sempre revê antes de mandar pra Renata.',
      }),
      f3({
        label: '2D · ToolCallIndicator mostarda',
        screen: <Pattern2D_ToolCalling />,
        note: '··· USANDO send_complaint ··· em mostarda mute (categoria staff). Sinaliza que mensagem tá sendo entregue · não interrompe leitura.',
      }),
      f3({
        label: '2E · resposta + chips finais',
        screen: <Pattern2E_FinalChips />,
        note: 'Confirmação concreta com expectativa ("respondeu em ~2 min em média"). Chips: Ver mensagens · Renata · Pedir mais alguma coisa · Pedir a conta.',
      }),
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.4',
    title: 'Pattern 3 · multi-step · pedido de bebida (LLM coleta detalhes)',
    subtitle:
      'Cada passo refina via chips · "Recomende você" sempre presente como caminho preguiçoso. ToolCallIndicator no momento do add_to_order. Chips finais contextuais ao pedido (mostram o que faz sentido fazer agora que tem bebida no pedido).',
    frames: [
      f3({
        label: '3A · ask type · vinho/drink/sem-álcool',
        screen: <Pattern3A_AskType />,
        note: 'Chips: Vinho · Drink · Sem álcool · Recomende você. Cliente impaciente vai direto no último.',
      }),
      f3({
        label: '3B · ask color · tinto/branco/rosé',
        screen: <Pattern3B_AskColor />,
        note: 'Chips: Tinto · Branco · Rosé · Recomende você. Cliente continua refinando ou delega.',
      }),
      f3({
        label: '3C · confirmed · add_to_order',
        screen: <Pattern3C_Confirmed />,
        note: 'ToolCallIndicator ink mute (categoria menu/order) · resposta com nome + preço + tempo + pareamento · chips: Ver pedido · Pedir mais alguma coisa · Pedir a conta.',
      }),
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.6',
    title: 'Pattern 5 · graceful fail · pede a conta sem resposta do garçom',
    subtitle:
      'Tool não falha tecnicamente · falha de SLA. Após 2 min sem ack do garçom, IA proativamente oferece alternativas · não fica esperando passivamente. ToolCallIndicator mostarda no primeiro ping (categoria payment/staff).',
    frames: [
      f3({
        label: '5A · bill called · 3 chips primários',
        screen: <Pattern5A_BillCalled />,
        note: 'IA antecipa info ("R$ 142,90 · serviço incluso") · não faz cliente esperar pra saber. Chips: Pagar tudo · Dividir conta · Voltar.',
      }),
      f3({
        label: '5B · 2 min depois · retry alternativas',
        screen: <Pattern5B_BillFailRetry />,
        note: 'IA volta proativamente sem cliente cobrar. Chips: Mandar de novo · Chamar maquininha · Cancelar pedido. Cliente nunca fica sem caminho.',
      }),
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.7',
    title: 'LGPD flow · ★ NOVO ★ · show_lgpd_notice + lgpd_data_request',
    subtitle:
      'Trigger por intent ("apagar meus dados", "vocês guardam minhas info?", "quais meus direitos?"). Texto canônico vive em código backend · imutável · cliente edita em docs/features/chat-history-lgpd.md (atualmente exemplo). Confirmação retorna protocolo + prazo de 15 dias úteis. SEM chips após consumado.',
    frames: [
      f3({
        label: 'lgpd · 1 · notice + 2 chips',
        screen: <LGPD1_Notice />,
        note: 'Notice em ManagerBubble-style (#fafaf8 + border-left ink) com mono label "AVISO LGPD". 2 chips simples: Sim, quero excluir · Não, não quero excluir.',
      }),
      f3({
        label: 'lgpd · 2 · tap sim · indicator',
        screen: <LGPD2_Confirmed />,
        note: 'ToolCallIndicator ink mute · USANDO lgpd_data_request · cria registro server-side · roteia pra gerência (canal staff específico).',
      }),
      f3({
        label: 'lgpd · 3 · protocolo + prazo',
        screen: <LGPD3_Receipt />,
        note: 'Card com protocolo formato LGPD-AAAA-MM-DD-XXXX em mono · prazo legal 15 dias úteis · push de confirmação quando concluído. SEM chips · ação consumada.',
      }),
    ],
  },

  // ───────────────────────────────────────────────────────────
  {
    id: 'v13.8',
    title: 'UI variations · paridade Android',
    subtitle: 'Mesma linguagem · status bar correta · gesture nav · animação igual.',
    frames: [
      f3({
        label: 'expand aberto',
        platform: 'Android',
        screen: <AndroidParity />,
        note: 'AndroidFrame com punch-hole + gesture pill. Animação cInputSnappy preserva cubic-bezier · zero diferença de timing. Mesma linguagem visual.',
      }),
    ],
  },
];
