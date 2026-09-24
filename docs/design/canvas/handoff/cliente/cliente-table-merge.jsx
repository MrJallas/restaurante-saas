// ============================================================
// V16 CLIENTE · ROUND 8c · JUNÇÃO DE MESAS (table-merge)
// ────────────────────────────────────────────────────────────
// Customer-side da junção. Cliente A (host da M14) pede via chat
// IA. LLM chama request_table_merge sem target → abre OverlaySalonMap.
// Cliente A escolhe M15 → backend cria escalation_chains type=table-merge
// (consent duplo · ambos hosts aprovam). Cliente B (host da M15) recebe
// no chat IA com bubble TYPEWRITER (border-left mostarda · 25 ms/char ·
// cursor blink). Após texto completar, chips "Aceitar / Negar" aparecem.
// Alternativa fullscreen: ScreenCustomerHostApproveMerge.
//
// Cooldown 20 min em recusa/timeout · backend retorna 429 · LLM responde
// canned + chips alternativos (chamar recepcionista · esperar). Caminho
// reverso (M15→M14) continua aberto · cooldown unidirecional.
//
// EXPORT: window.CLIENTE_TABLE_MERGE_SECTIONS · 1 DCSection
//   9 frames · todos na linguagem cliente-tokens.jsx
//   (C, FONT, MONO, IOSFrame, AndroidFrame, TopBar, MonoLabel,
//    PillButton, AssistantBlock, ContextualChips, CustomerBubble,
//    OverlaySalonMap)
//   Inclui push lockscreen receptor (canal frio · INK NEUTRO ·
//   mesma família do push customer-host de V8b · sem mostarda).
//
// LINGUAGEM:
//   - border-left MOSTARDA na bubble typewriter (tempo-sensitive;
//     único uso de mostarda no app cliente · vocabulário staff
//     transitando pra cliente quando há decisão urgente social).
//     Após decisão, vira bubble normal sem border.
//   - Typewriter cursor: 2px ink piscando 1 s.
//   - Pill "↓ Pedido novo da Mesa 15" só aparece se chat ancorado
//     pra cima · comportamento padrão de chat moderno (WhatsApp,
//     iMessage). Auto-scroll ocorre só se ancorado no fim.
//   - Cooldown sub mono caps tiny mute · "· VOCÊ PODE TENTAR DE
//     NOVO EM 20 MIN".
// ============================================================

// helper builder · mesmo shape do fL em cliente-late-arrival.jsx
const fM = ({ label, screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard
      key={'v16c-' + label}
      id={'v16c-' + label}
      label={`${label} · iOS`}
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
              fontFamily: FONT,
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

const fMA = ({ label, screen, note, platform = 'Android' }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard
      key={'v16c-' + label}
      id={'v16c-' + label}
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
              fontFamily: FONT,
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
// chat-shell · base de chat IA (TopBar + lista vertical + composer)
// ─────────────────────────────────────────────────────────────
const ChatShell = ({ table = 'Mesa 14', restaurant = 'Trattoria Luna', children, scrollPill }) => (
  <>
    <TopBar table={table} restaurant={restaurant} />
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        padding: '8px 22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {children}

      {scrollPill}

      <div style={{ flex: 1 }} />

      <div
        style={{
          marginTop: 8,
          padding: '10px 14px',
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: C.faint,
          fontSize: 14,
        }}
      >
        <span style={{ flex: 1 }}>Pergunte alguma coisa…</span>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: C.ink,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Ico.send(14, '#fff')}
        </span>
      </div>
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────
// MergeTypewriterBubble · bubble especial pro receptor (M15)
//   - border-left mostarda (4px) durante tempo-sensitive
//   - eyebrow MONO "PEDIDO DA MESA 14 · AGORA"
//   - texto digita 25ms/char (mostrado em estado parcial ou completo)
//   - cursor blink se typing
//   - chips só aparecem após texto completar
// ─────────────────────────────────────────────────────────────
const MergeTypewriterBubble = ({
  fromTable = 14,
  fromName = 'Caleb',
  fromParty = 4,
  ourParty = 2,
  state = 'typing-mid', // 'typing-mid' | 'complete'
  showChips = false,
}) => {
  const fullText =
    `${fromName} da Mesa ${fromTable} quer juntar a mesa contigo. ` +
    `Eles são ${fromParty} pessoas, vocês são ${ourParty} · viraria ` +
    `uma mesa só com ${fromParty + ourParty}, uma comanda, uma conta.`;

  const partial = fullText.slice(0, 88); // recorte natural mid-sentence

  const showText = state === 'complete' ? fullText : partial;
  const showCursor = state !== 'complete';
  const isUrgent = !showChips; // border-left mostarda só durante decisão pendente

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${C.borderSoft}`,
        borderLeft: isUrgent ? `4px solid ${C.warning}` : `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: '12px 14px 14px',
        animation: 'cMergeBubbleEnter 280ms cubic-bezier(.4,0,.2,1) both',
      }}
    >
      {/* Eyebrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: C.warning,
            animation: isUrgent ? 'cWarnPulse 1.6s ease-in-out infinite' : undefined,
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: C.warning,
          }}
        >
          Pedido da Mesa {fromTable} · agora
        </span>
      </div>

      {/* Texto progressivo · sans serif, conversational */}
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.5,
          color: C.ink,
          letterSpacing: -0.05,
        }}
      >
        {showText}
        {showCursor && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 18,
              background: C.ink,
              marginLeft: 2,
              verticalAlign: '-3px',
              animation: 'cursor-blink 1s infinite',
            }}
          />
        )}
      </div>

      {/* Chips só após texto completar */}
      {showChips && (
        <div
          style={{
            marginTop: 12,
            animation: 'cChipsFade 220ms ease-out 80ms both',
          }}
        >
          <ContextualChips
            chips={[
              { label: 'Aceitar pedido', primary: true },
              { label: 'Negar pedido' },
              { label: 'Ver mais detalhes' },
            ]}
          />
        </div>
      )}

      <style>{`
        @keyframes cMergeBubbleEnter {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cWarnPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes cChipsFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ScrollPill · "↓ Pedido novo da Mesa N"
//   sticky-bottom · só aparece quando chat ancorado pra cima
//   ao tap leva pro bubble novo (auto-scroll explícito)
// ─────────────────────────────────────────────────────────────
const ScrollPill = ({ fromTable = 14 }) => (
  <div
    style={{
      position: 'sticky',
      bottom: 0,
      alignSelf: 'center',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      borderRadius: 999,
      background: C.ink,
      color: '#fff',
      boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
      fontFamily: FONT,
      fontSize: 12.5,
      fontWeight: 600,
      letterSpacing: -0.05,
      animation: 'cPillSlide 200ms ease-out both',
    }}
  >
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M6 2v8M2 7l4 4 4-4"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
    Pedido novo da Mesa {fromTable}
    <style>{`
      @keyframes cPillSlide {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  </div>
);

// ─────────────────────────────────────────────────────────────
// FRAME 1 · OverlaySalonMap aberto · M14 destacada · M15 selecionada · iOS
// ─────────────────────────────────────────────────────────────
const ScreenOverlayMapIOS = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    {/* Chat skeleton por baixo · simula estado prévio */}
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        padding: '8px 22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        filter: 'blur(.4px)',
        opacity: 0.7,
      }}
    >
      <CustomerBubble when="20:32">quero juntar com a mesa do lado</CustomerBubble>
      <ToolCallIndicator name="request_table_merge" category="staff" />
      <AssistantBlock label="Assistente">
        Beleza · vou te mostrar quais mesas tão ocupadas perto de vocês.
      </AssistantBlock>
    </div>
    {/* Overlay sobrepõe o chat */}
    <OverlaySalonMap yourTable={14} selectedTable={15} />
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 2 · OverlaySalonMap · paridade Android
// ─────────────────────────────────────────────────────────────
const ScreenOverlayMapAndroid = () => (
  <AndroidFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        padding: '8px 22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        filter: 'blur(.4px)',
        opacity: 0.7,
      }}
    >
      <CustomerBubble when="20:32">quero juntar com a mesa do lado</CustomerBubble>
      <ToolCallIndicator name="request_table_merge" category="staff" />
      <AssistantBlock label="Assistente">
        Beleza · vou te mostrar quais mesas tão ocupadas perto de vocês.
      </AssistantBlock>
    </div>
    <OverlaySalonMap yourTable={14} selectedTable={15} />
  </AndroidFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME · Push lockscreen receptor (M15 · app fechado)
//   - INK NEUTRO · sem mostarda (mesma família do push customer-host V8b)
//   - Avatar 38×38 ink-on-ink com glifo mesa-juntada (2 quadrados encadeados)
//   - Title "Mesa 14 quer juntar com a sua"
//   - Body "Caleb · 4 pessoas — toca pra responder"
// ─────────────────────────────────────────────────────────────
const PushMergeReceiverIOS = () => (
  <IOSFrame style={{ background: '#0a0a0a' }}>
    <div style={{ position: 'absolute', inset: 0, top: 44, bottom: 8 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(160deg, #1d1d1f 0%, #131314 60%, #0a0a0a 100%)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* lockscreen clock */}
        <div
          style={{
            textAlign: 'center',
            color: '#fff',
            paddingTop: 60,
            fontFamily: '-apple-system, "SF Pro Display", system-ui',
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 500, opacity: 0.95, letterSpacing: 0.3 }}>
            Quinta-feira, 7 de maio
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 200,
              lineHeight: '0.95',
              letterSpacing: -3,
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            20:32
          </div>
        </div>
        {/* glass quick-action stubs · flashlight + camera */}
        <div
          style={{ display: 'flex', gap: 12, padding: '20px 16px 24px', justifyContent: 'center' }}
        >
          <div
            style={{
              width: 156,
              height: 64,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(20px)',
            }}
          />
          <div
            style={{
              width: 156,
              height: 64,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(20px)',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* push banner · glass · ink-on-white com glifo mesa-juntada */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 110 }}>
          <div style={{ margin: '0 12px', position: 'relative' }}>
            <div
              style={{
                position: 'relative',
                borderRadius: 18,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.18)',
              }}
            >
              <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 12 }}>
                {/* ink-on-ink tile com glifo mesa-juntada (2 quadrados encadeados) */}
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
                    position: 'relative',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <rect
                      x="2"
                      y="2"
                      width="7"
                      height="7"
                      rx="1.4"
                      stroke="#fff"
                      strokeWidth="1.6"
                    />
                    <rect
                      x="9"
                      y="9"
                      width="7"
                      height="7"
                      rx="1.4"
                      stroke="#fff"
                      strokeWidth="1.6"
                    />
                  </svg>
                  <span
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -3,
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: '#0a0a0a',
                      border: '2px solid rgba(255,255,255,0.9)',
                    }}
                  />
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: '-apple-system, system-ui',
                    color: '#000',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
                      Mesa 14 quer juntar com a sua
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'rgba(60,60,67,0.6)',
                        flexShrink: 0,
                        marginLeft: 8,
                      }}
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
                    Caleb · 4 pessoas — toca pra responder
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 3 · bubble typewriter no MEIO da animação (M15 receptor)
// ─────────────────────────────────────────────────────────────
const ScreenTypewriterMid = () => (
  <IOSFrame>
    <ChatShell table="Mesa 15" restaurant="Trattoria Luna">
      {/* Contexto pré-existente · cliente B já tava conversando com a IA */}
      <CustomerBubble when="20:30">vou pedir mais 1 taça de vinho tinto</CustomerBubble>
      <AssistantBlock label="Assistente">
        Adicionei <b>1× Taça de vinho tinto · R$ 28</b> no pedido.
      </AssistantBlock>

      {/* Bubble nova chega no fim · com border-left mostarda + typewriter mid */}
      <MergeTypewriterBubble
        fromTable={14}
        fromName="Caleb"
        fromParty={4}
        ourParty={2}
        state="typing-mid"
        showChips={false}
      />
    </ChatShell>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 4 · bubble typewriter completa + chips · scroll pill flutuante
//   demonstra: chat ancorado pra cima, pill aparece, mas typewriter
//   já completou abaixo. Cliente toca a pill pra descer e decidir.
// ─────────────────────────────────────────────────────────────
const ScreenTypewriterCompleteWithPill = () => (
  <IOSFrame>
    <ChatShell
      table="Mesa 15"
      restaurant="Trattoria Luna"
      scrollPill={<ScrollPill fromTable={14} />}
    >
      <CustomerBubble when="20:30">vou pedir mais 1 taça de vinho tinto</CustomerBubble>
      <AssistantBlock label="Assistente">
        Adicionei <b>1× Taça de vinho tinto · R$ 28</b> no pedido.
      </AssistantBlock>

      {/* Bubble completa com chips ativos */}
      <MergeTypewriterBubble
        fromTable={14}
        fromName="Caleb"
        fromParty={4}
        ourParty={2}
        state="complete"
        showChips={true}
      />
    </ChatShell>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 5 · ScreenCustomerHostApproveMerge (alternativa fullscreen)
// ─────────────────────────────────────────────────────────────
const ScreenHostApproveMerge = () => (
  <IOSFrame>
    <TopBar table="Mesa 15" restaurant="Trattoria Luna" leftIcon="back" rightIcon={null} />

    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px 22px 22px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <MonoLabel size={10} color={C.faint}>
        Mesas 14 + 15 · junção
      </MonoLabel>

      <div
        style={{
          marginTop: 10,
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.2,
          color: C.ink,
          letterSpacing: -0.4,
        }}
      >
        <b>Caleb (Mesa 14)</b> quer juntar com a sua mesa
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: 500,
          color: C.mute,
          lineHeight: 1.5,
          letterSpacing: -0.05,
        }}
      >
        Vão virar uma mesa só com <b>6 pessoas</b> · uma comanda só · uma conta só.
      </div>

      {/* Bloco · sua mesa */}
      <div
        style={{
          marginTop: 22,
          padding: '14px 14px',
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <MonoLabel size={10} color={C.mute}>
            Sua mesa · 15
          </MonoLabel>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            2 pessoas
          </span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PersonChipMerge name="Marina" you />
          <PersonChipMerge name="Lucas" />
        </div>
      </div>

      {/* Bloco · mesa que quer juntar */}
      <div
        style={{
          marginTop: 12,
          padding: '14px 14px',
          background: '#fff',
          border: `1.3px solid ${C.ink}`,
          borderRadius: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <MonoLabel size={10} color={C.ink}>
            Mesa que quer juntar · 14
          </MonoLabel>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            4 pessoas
          </span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PersonChipMerge name="Caleb" host />
          <PersonChipMerge name="Olivia" />
          <PersonChipMerge name="Henrique" />
          <PersonChipMerge name="Júlia" />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 16 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
          Sim, pode juntar
        </PillButton>
        <PillButton variant="outline" size="lg" style={{ width: '100%' }}>
          Não, melhor separado
        </PillButton>
      </div>
    </div>
  </IOSFrame>
);

// avatar local (pra evitar colisão com PersonChip de cliente-late-arrival)
const PersonChipMerge = ({ name, you = false, host = false, size = 36 }) => {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          background: you ? C.ink : '#e8e6e0',
          color: you ? '#fff' : C.ink,
          border: you ? 'none' : `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          fontSize: size >= 40 ? 14 : 12,
          fontWeight: 700,
          letterSpacing: -0.4,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
          {name}
        </span>
        {(you || host) && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {you ? 'Você · host' : 'Host da mesa'}
          </span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// FRAME 6 · bubble pós-junção · "Mesas juntadas · agora vocês são 6"
// ─────────────────────────────────────────────────────────────
const ScreenPostMerge = () => (
  <IOSFrame>
    <ChatShell table="Mesa 14 + 15" restaurant="Trattoria Luna">
      {/* Contexto pré-existente */}
      <CustomerBubble when="20:33">quero juntar com a mesa do lado</CustomerBubble>
      <AssistantBlock label="Assistente">
        Mesa 15 (Marina) já recebeu o pedido. Tô esperando ela decidir.
      </AssistantBlock>

      {/* System divider · não é AI nem manager · é evento */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <span style={{ flex: 1, height: 1, background: C.borderSoft }} />
        <MonoLabel size={9.5} color={C.faint}>
          Mesas 14 + 15 juntaram · 20:34
        </MonoLabel>
        <span style={{ flex: 1, height: 1, background: C.borderSoft }} />
      </div>

      {/* Bubble especial pós-junção · success-toned */}
      <div
        style={{
          background: C.successWash,
          border: `1px solid ${C.success}`,
          borderRadius: 12,
          padding: '14px 16px',
          animation: 'cMergeSuccess 320ms cubic-bezier(.4,0,.2,1) both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: C.success,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {Ico.check(16, '#fff')}
          </div>
          <MonoLabel size={10} color={C.success}>
            Mesas juntadas
          </MonoLabel>
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: C.ink, letterSpacing: -0.05 }}>
          Agora vocês são <b>6 pessoas</b> em uma comanda só · uma conta só. Marina vai aparecer
          aqui no chat junto com vocês.
        </div>
      </div>

      <ContextualChips
        chips={[
          { label: 'Quem tá na mesa agora?' },
          { label: 'Pedir mais alguma coisa', primary: true },
        ]}
      />

      <style>{`
        @keyframes cMergeSuccess {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ChatShell>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 7 · bubble pós-recusa · sub mono caps tiny "VOCÊ PODE TENTAR DE NOVO EM 20 MIN"
// ─────────────────────────────────────────────────────────────
const ScreenPostReject = () => (
  <IOSFrame>
    <ChatShell table="Mesa 14" restaurant="Trattoria Luna">
      <CustomerBubble when="20:33">quero juntar com a mesa do lado</CustomerBubble>
      <AssistantBlock label="Assistente">
        Mandei o pedido pra Marina (Mesa 15). Tô esperando ela responder.
      </AssistantBlock>

      {/* Bubble da IA com a recusa · sem border mostarda · neutra */}
      <div
        style={{
          background: '#fff',
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 12,
          padding: '14px 16px',
        }}
      >
        <MonoLabel size={9.5} color={C.faint} style={{ marginBottom: 8 }}>
          Assistente · agora
        </MonoLabel>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: C.ink, letterSpacing: -0.05 }}>
          Marina preferiu não juntar agora · sem stress, vocês ficam separados mesmo.
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: MONO,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: C.faint,
          }}
        >
          · Você pode tentar de novo em 20 min
        </div>
      </div>

      <ContextualChips
        chips={[
          { label: 'Chamar recepcionista', primary: true },
          { label: 'Pedir pra outra mesa' },
          { label: 'Beleza' },
        ]}
      />
    </ChatShell>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 8 · cooldown ativo · re-tentativa dentro de 20 min
//   LLM responde canned (sem chamar tool) + chips alternativos
// ─────────────────────────────────────────────────────────────
const ScreenCooldownReattempt = () => (
  <IOSFrame>
    <ChatShell table="Mesa 14" restaurant="Trattoria Luna">
      {/* Contexto · primeira tentativa rejeitada há ~5 min */}
      <CustomerBubble when="20:34">quero juntar com a mesa do lado</CustomerBubble>
      <AssistantBlock label="Assistente">
        Marina preferiu não juntar agora · sem stress.
      </AssistantBlock>

      {/* Cliente tenta de novo · 5 min depois */}
      <CustomerBubble when="20:39">e agora? dá pra tentar de novo?</CustomerBubble>

      {/* LLM · resposta canned ao 429 · não chama tool */}
      <AssistantBlock label="Assistente">
        A Mesa 15 disse que prefere não juntar agora · vamos esperar uns <b>15 min</b> antes de
        tentar de novo? Ou quer chamar a recepcionista pra te ajudar presencialmente?
      </AssistantBlock>

      <ContextualChips
        chips={[
          { label: 'Chamar recepcionista', primary: true },
          { label: 'Esperar' },
          { label: 'Pedir pra outra mesa' },
        ]}
      />

      {/* sub-info discreto · countdown do cooldown */}
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 100,
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          fontFamily: MONO,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: C.mute,
          alignSelf: 'flex-start',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 3, background: C.faint }} />
        Cooldown M14 → M15 · 14 min 32 s restantes
      </div>
    </ChatShell>
  </IOSFrame>
);

// ═════════════════════════════════════════════════════════════
// DCSection EXPORT
// ═════════════════════════════════════════════════════════════
window.CLIENTE_TABLE_MERGE_SECTIONS = [
  {
    id: 'customer-table-merge-flow',
    title: 'Junção de mesas · consent duplo · cooldown 20 min',
    subtitle:
      'Customer-side da junção. Cliente A (host da M14) pede via chat IA · LLM chama request_table_merge · ' +
      'OverlaySalonMap abre com 6-8 mesas próximas (grade espacial real). Após escolha, escalation_chains ' +
      'type=table-merge cria 2 timers paralelos (60 s cada) · M14 e M15 hosts decidem em paralelo. ' +
      'Receptor (M15) vê bubble TYPEWRITER com border-left mostarda · texto em 25 ms/char · cursor blink · ' +
      'chips só após texto completar. Recusa OU timeout ativa cooldown 20 min unidirecional · backend retorna ' +
      '429 em re-tentativas · LLM responde canned com chips alternativos (chamar recepcionista · esperar). ' +
      'Caminho reverso (M15→M14) continua aberto. Auto-scroll padrão de chat moderno: pill flutuante "↓ ' +
      'Pedido novo da Mesa 15" só quando ancorado pra cima.',
    frames: [
      fM({
        label: '01 OverlaySalonMap aberto · M14 (você) · M15 selecionada · iOS',
        screen: <ScreenOverlayMapIOS />,
        note:
          'Overlay sobre o chat IA · backdrop preto 32% · borderTopLeft 22 round-up sheet. Grade 3×3 espacial · ' +
          'mesa do cliente (M14) no centro · pintada ink-on-ink com badge "VOCÊ TÁ AQUI" mono caps tiny. M15 (selecionada) ' +
          'à direita · borda 2px ink + check no canto sup · hint "Casal Santos · 2 pessoas". M11/12/16/17 também ocupadas ' +
          '(host names). M13/19/18 atenuadas (livres ou distantes · opacidade 0.42). Bottom CTA filled "Pedir pra juntar com ' +
          'mesa 15" + sub explicando que Casal Santos vai receber o pedido. X discreto canto sup direito · também sai sem ação.',
      }),
      fMA({
        label: '02 OverlaySalonMap · paridade Android',
        screen: <ScreenOverlayMapAndroid />,
        platform: 'Android',
        note:
          'Mesmo layout · só muda chrome do device (status bar 32 px com punch-hole · gesture bar 18 px · borderRadius ' +
          '36 vs 44). Overlay e grade 3×3 idênticos.',
      }),
      fM({
        label: '03 push lockscreen receptor · canal frio · app fechado',
        screen: <PushMergeReceiverIOS />,
        note:
          'Entry point primário quando app de Marina (M15) está fechado · canal frio · merece visual próprio. INK NEUTRO ' +
          'em todos os elementos · ZERO mostarda (mesma família do push customer-host de V8b · mostarda fica reservada pro ' +
          'in-app onde a decisão é imediatamente acionável). Avatar 38×38 ink-on-ink com GLIFO mesa-juntada (2 quadrados ' +
          'encadeados em outline branco) · sinaliza visualmente "junção" sem palavra. Title "Mesa 14 quer juntar com a sua" ' +
          '· body "Caleb · 4 pessoas — toca pra responder". Tap abre app · cliente cai direto no chat IA com bubble já ' +
          'COMPLETA (NÃO rebobina typewriter · seria irritante depois de tap consciente) + chips Aceitar/Negar ativos. ' +
          'Border-left mostarda permanece na bubble in-app porque decisão segue pendente.',
      }),
      fM({
        label: '04 bubble typewriter no MEIO · cursor blink visível',
        screen: <ScreenTypewriterMid />,
        note:
          'Receptor (M15 · Marina) está com app aberto. WebSocket merge.requested chega · bubble entra com border-left ' +
          'MOSTARDA 4px (único uso de mostarda no app cliente · sinaliza decisão tempo-sensitive). Eyebrow MONO caps tiny ' +
          'mostarda · "PEDIDO DA MESA 14 · AGORA" + dot pulsante. Texto digita progressivamente em 25 ms/char (mostrado ~70% ' +
          'aqui · cursor 2px ink piscando 1 s). Sem chips ainda · só após texto completar. Animação cMergeBubbleEnter 280 ms ' +
          'cubic-bezier(.4,0,.2,1) na entrada do bubble.',
      }),
      fM({
        label: '05 bubble typewriter completa + chips · scroll pill flutuante',
        screen: <ScreenTypewriterCompleteWithPill />,
        note:
          'Texto completou (~3-4 s). Chips Aceitar/Negar/Detalhes aparecem em fade 220 ms (não simultâneo com texto). Border ' +
          'mostarda CONTINUA porque decisão ainda pendente · vira normal só após chip usado. Pill flutuante "↓ Pedido novo da ' +
          'Mesa 14" sticky-bottom ink-on-white · só renderiza se chat ancorado pra cima (modern chat behavior · WhatsApp/iMessage). ' +
          'Tap na pill desce pro bubble · auto-scroll explícito. Se cliente já estava ancorado no fim, sem pill · auto-scroll ' +
          'acompanha o typewriter naturalmente.',
      }),
      fM({
        label: '06 ScreenCustomerHostApproveMerge · alternativa fullscreen',
        screen: <ScreenHostApproveMerge />,
        note:
          'Caso cliente queira ver mais contexto antes de decidir, tap em chip "Ver mais detalhes" abre tela cheia. ' +
          'Eyebrow "MESAS 14 + 15 · JUNÇÃO". Hero "[Caleb (Mesa 14)] quer juntar com a sua mesa". Sub "Vão virar uma mesa só ' +
          'com 6 pessoas · uma comanda só · uma conta só". 2 blocos visualmente distintos: "Sua mesa · 15" (surface) com Marina ' +
          '(você) + Lucas · "Mesa que quer juntar · 14" (border ink grossa) com Caleb (host) + Olivia + Henrique + Júlia. CTAs ' +
          'full-width: "Sim, pode juntar" (filled ink) + "Não, melhor separado" (outline).',
      }),
      fM({
        label: '07 bubble pós-junção · "Mesas juntadas · agora vocês são 6"',
        screen: <ScreenPostMerge />,
        note:
          'Após ambos hosts aprovarem (parallel consent · steps 1A + 1B do escalation_chains type=table-merge), backend cria ' +
          'registro em table_merges + liga merged_with_session_id nas 2 sessions. Comandas viram uma só. System divider "Mesas ' +
          '14 + 15 juntaram · 20:34" + bubble especial success-wash · check ink-success no header · texto "Agora vocês são 6 ' +
          'pessoas em uma comanda só · uma conta só. Marina vai aparecer aqui no chat junto com vocês". TopBar muda pra ' +
          '"Mesa 14 + 15".',
      }),
      fM({
        label: '08 bubble pós-recusa · sub "VOCÊ PODE TENTAR DE NOVO EM 20 MIN"',
        screen: <ScreenPostReject />,
        note:
          'Marina recusou · ou step 1B timeout 60 s. Backend insere em merge_cooldowns (TTL 20 min · origin=14, target=15, ' +
          'reason="rejected" ou "timeout"). Bubble da IA neutra · NÃO success-wash · NÃO danger · só info. Copy "Marina ' +
          'preferiu não juntar agora · sem stress, vocês ficam separados mesmo". Sub mono caps tiny mute · "· VOCÊ PODE ' +
          'TENTAR DE NOVO EM 20 MIN" (sinaliza cooldown sem alarmar). Chips primários "Chamar recepcionista" + alternativas ' +
          '"Pedir pra outra mesa" e "Beleza".',
      }),
      fM({
        label: '09 cooldown ativo · re-tentativa em 5 min · LLM canned 429',
        screen: <ScreenCooldownReattempt />,
        note:
          'Cliente tenta pedir junção 5 min depois ("e agora? dá pra tentar de novo?"). Backend retorna HTTP 429 · LLM ' +
          'recebe error e responde canned (NÃO chama request_table_merge de novo): "A Mesa 15 disse que prefere não juntar ' +
          'agora · vamos esperar uns 15 min antes de tentar de novo? Ou quer chamar a recepcionista pra te ajudar ' +
          'presencialmente?". Chips primários "Chamar recepcionista" · "Esperar" · "Pedir pra outra mesa" (caminho reverso ' +
          'aberto · cooldown unidirecional M14→M15). Pill MONO caps tiny no fim mostra countdown "Cooldown M14 → M15 · 14 min ' +
          '32 s restantes" pra dar contexto técnico discreto.',
      }),
    ],
  },
];

Object.assign(window, {
  // expostos só pra debug · não usados de fora
  ScreenOverlayMapIOS,
  ScreenOverlayMapAndroid,
  PushMergeReceiverIOS,
  ScreenTypewriterMid,
  ScreenTypewriterCompleteWithPill,
  ScreenHostApproveMerge,
  ScreenPostMerge,
  ScreenPostReject,
  ScreenCooldownReattempt,
  MergeTypewriterBubble,
  ScrollPill,
});
