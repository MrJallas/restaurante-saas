// ============================================================
// V20 · CUSTOMER JOURNEY · CONSOLIDADO
// ────────────────────────────────────────────────────────────
// Entregável visual principal do round V20. Um único lugar pra entender
// o flow inteiro do cliente: 13 frames em sequência narrativa, cada um
// representando um momento-chave da jornada · da chegada (escanear QR)
// até saída (LGPD). Cada frame mostra a UI do momento + anotação curta
// com tool/intent disparado · screen ou rota correspondente · diff vs
// produção (se houver) · tag de status.
//
// # V20 · diff vs V19 · cliente-journey-v20.jsx
//   · NOVO arquivo · não havia DCSection consolidando os 19 rounds antes
//   · 13 frames covering: escanear QR · identificar · home · chat ·
//     cardápio · pedir · chamar garçom · pagar · late-arrival · merge ·
//     manager · cortesia/rating · LGPD
//   · 4 frames que ainda não têm representação canvas (01 splash) ou
//     são features 100% pendentes em prod (10/11/12/13)
//
// EXPORT: window.CLIENTE_JOURNEY_V20_SECTIONS · 1 DCSection · 13 frames
//
// CONVENÇÃO:
//   - Background section: C.bg (#fff)
//   - Frame: iOS 390×844 (thumbnail) · sem render de SOTA · nem todo
//     detalhe de UI · só elemento hero suficiente pra reconhecer o passo
//   - Label mono caps: "{NN} · {AÇÃO} · {TELA}"
//   - Anotação: tool/intent · screen ou rota · diff vs prod
//   - Tags visuais: [aligned] [só prod] [só canvas] [diverge] [pendente]
// ============================================================

// helper artboard
const fJ = ({ label, screen, note, tag }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 60 : 0;
  return (
    <DCArtboard key={'v20-journey-' + label} id={'v20-journey-' + label}
      label={`${label} · iOS`}
      width={414} height={844 + captionH + 24}
      style={{ background: '#f0eee9', borderRadius: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px', gap: 18 }}>
        {screen}
        {note && (
          <div style={{
            marginTop: 14, maxWidth: 420,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {tag && <JourneyTag tag={tag} />}
            <div style={{
              fontSize: 12, color: C.mute, lineHeight: 1.5,
              fontFamily: FONT, letterSpacing: -0.05,
            }}>{note}</div>
          </div>
        )}
      </div>
    </DCArtboard>
  );
};

// tag colorida em mono caps
const JourneyTag = ({ tag }) => {
  const styles = {
    aligned:   { color: C.success, background: C.successWash, label: 'aligned · prod = canvas' },
    soProd:    { color: C.mute,    background: C.surface,     label: 'só prod · sem frame canvas' },
    soCanvas:  { color: C.mute,    background: C.surface,     label: 'só canvas · feature pendente' },
    diverge:   { color: C.warning, background: C.warningWash, label: 'diverge · decisão pendente' },
    pendente:  { color: C.danger,  background: C.dangerWash,  label: 'pendente · cabear em prod' },
  };
  const s = styles[tag] || styles.aligned;
  return (
    <span style={{
      alignSelf: 'flex-start',
      padding: '4px 8px', borderRadius: 4,
      background: s.background, color: s.color,
      fontFamily: FONT, fontSize: 9.5, fontWeight: 600,
      letterSpacing: 1.2, textTransform: 'uppercase',
    }}>{s.label}</span>
  );
};

// ─────────────────────────────────────────────────────────────
// 01 · ESCANEAR QR · SPLASH
//   Tool: recognize · Rota: /[slug]/mesa/[tableCode] (state: loading)
//   Frame: monograma + 3 bouncing dots (cap 1.5s)
//   Tag: só prod · DESENHAR NOVO neste round
// ─────────────────────────────────────────────────────────────
const F01_Splash = () => (
  <IOSFrame>
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 38,
      paddingBottom: 40,
    }}>
      {/* Monograma TL · alinha brand de Trattoria Luna */}
      <div style={{
        width: 96, height: 96, borderRadius: 24,
        background: C.ink, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT, fontSize: 36, fontWeight: 700, letterSpacing: -1.5,
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>TL</div>

      {/* 3 bouncing dots · animação cap 1.5s */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 8, height: 8, borderRadius: 4, background: C.ink,
            animation: `cBounce 1.4s ${i * 0.18}s ease-in-out infinite`,
          }} />
        ))}
      </div>

      <MonoLabel size={10} color={C.faint}>Conectando à mesa 14</MonoLabel>

      <style>{`
        @keyframes cBounce {
          0%,80%,100% { transform: translateY(0); opacity: 0.4; }
          40%         { transform: translateY(-10px); opacity: 1; }
        }
      `}</style>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 02 · IDENTIFICAR · NOME + CPF
//   Tool: customer.identify · Componente: WelcomeModal
//   Frame: usa ScreenCustomerIdentifyBeforeJoin (já no window)
//   Tag: aligned (canvas e prod alinham · mesmo modal serve first-time
//        normal e late-arrival)
// ─────────────────────────────────────────────────────────────
const F02_Identify = () => {
  const Comp = window.ScreenCustomerIdentifyBeforeJoin;
  return Comp ? <Comp filled={false} /> : <PlaceholderFrame label="ScreenCustomerIdentifyBeforeJoin" />;
};

// ─────────────────────────────────────────────────────────────
// 03 · HOME · HERO + 2 PILLS + INPUT
//   Tool: (nenhum · navegação) · Rota: /[slug]/mesa/[tableCode] (home)
//   Frame: TopBar + AssistantBlock typing + 2 pills + SoftInput
//   Tag: aligned (chips contextuais ainda não em prod · Claude Code implementa)
// ─────────────────────────────────────────────────────────────
const F03_Home = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div style={{
      flex: 1, padding: '8px 24px 24px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ marginTop: 24 }}>
        <AssistantBlock label="Assistente">
          Olá Caleb · vocês querem que eu sugira pratos pra começar
          ou preferem ver o cardápio?
        </AssistantBlock>
      </div>

      <div style={{ marginTop: 22 }}>
        <ContextualChips chips={[
          { label: 'Sugere você', primary: true },
          { label: 'Ver cardápio' },
        ]} />
      </div>

      <div style={{ flex: 1 }} />

      <SoftInput placeholder="Pergunte alguma coisa…" />
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 04 · CHAT · TURN COM CHIPS
//   Tool: TOOL_REGISTRY (cliente-screens-v14:25) · Rota: /[slug]/assistente
//   Frame: chat thread com customer bubble + assistant turn + chips
//   Tag: pendente (ContextualChips/InputExpand ainda não em prod)
// ─────────────────────────────────────────────────────────────
const F04_Chat = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div style={{
      flex: 1, padding: '8px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
    }}>
      <CustomerBubble when="agora">queria 1 vinho tinto pra acompanhar</CustomerBubble>
      <div>
        <div style={{
          fontFamily: FONT, fontSize: 11, fontWeight: 500,
          letterSpacing: 1, textTransform: 'uppercase',
          color: C.mute, marginBottom: 8,
        }}>Assistente · agora</div>
        <ToolCallIndicator name="add_to_order" category="menu" />
        <div style={{
          marginTop: 10,
          fontSize: 15.5, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink,
        }}>
          Adicionei o <b>Malbec da casa</b> · R$ 64 · serve em 6 min.
        </div>
        <ContextualChips chips={[
          { label: 'Ver pedido' },
          { label: 'Pedir mais alguma coisa' },
          { label: 'Pedir a conta' },
        ]} />
      </div>

      <div style={{ flex: 1 }} />

      <SoftInput placeholder="Mensagem para a casa" />
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 05 · CARDÁPIO · OVERLAY OU ROTA
//   Tool: view_menu (silent) · Rota: /[slug]/cardapio (em prod)
//   Frame: overlay sheet com cardápio (canvas spec)
//   Tag: diverge · canvas = overlay · prod = rota dedicada
// ─────────────────────────────────────────────────────────────
const F05_Menu = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    {/* Chat por baixo · blur leve */}
    <div style={{
      flex: 1, position: 'relative',
      padding: '8px 24px 24px',
      filter: 'blur(.5px)', opacity: 0.5,
      overflow: 'hidden',
    }}>
      <CustomerBubble when="agora">abrir cardápio</CustomerBubble>
    </div>

    {/* Overlay sheet sobe · ~68% da altura */}
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, top: '32%',
      background: '#fff',
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      border: `1.5px solid ${C.ink}`, borderBottom: 'none',
      padding: '12px 22px 22px',
      boxShadow: '0 -8px 32px rgba(0,0,0,0.10)',
    }}>
      <div style={{
        width: 40, height: 4, borderRadius: 2, background: C.faint,
        margin: '0 auto 14px', opacity: 0.6,
      }} />
      <MonoLabel size={10} color={C.mute}>Cardápio · Trattoria Luna</MonoLabel>
      <div style={{
        fontSize: 22, fontWeight: 600, letterSpacing: -0.4,
        marginTop: 4, color: C.ink,
      }}>47 itens · 6 categorias</div>

      {/* Search pill */}
      <div style={{
        marginTop: 14, padding: '11px 16px', borderRadius: 999,
        border: `1px solid ${C.borderSoft}`, background: C.surface,
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 14, color: C.faint,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="6" cy="6" r="4" stroke={C.faint} strokeWidth="1.4" fill="none"/>
          <path d="M9 9l3 3" stroke={C.faint} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        Buscar prato
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'nowrap', overflow: 'hidden' }}>
        {['Pratos do dia', 'Entradas', 'Massas', 'Carnes'].map((cat, i) => (
          <span key={cat} style={{
            padding: '6px 12px', borderRadius: 999,
            border: `1px solid ${i === 0 ? C.ink : C.borderSoft}`,
            background: i === 0 ? C.ink : '#fff',
            color: i === 0 ? '#fff' : C.ink,
            fontSize: 12, fontWeight: i === 0 ? 500 : 400, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{cat}</span>
        ))}
      </div>

      {/* Sample items */}
      <div style={{ marginTop: 14 }}>
        {[
          { name: 'Risoto cogumelos · ao vinho', price: 'R$ 64' },
          { name: 'Tagliatelle al ragù',         price: 'R$ 58' },
          { name: 'Polpettine della casa',       price: 'R$ 48' },
        ].map((d, i) => (
          <div key={d.name} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 0',
            borderBottom: i < 2 ? `1px solid ${C.borderSoft}` : 'none',
          }}>
            <span style={{ fontSize: 14.5, color: C.ink, fontWeight: 500, letterSpacing: -0.1 }}>{d.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.ink, fontWeight: 500 }}>{d.price}</span>
          </div>
        ))}
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 06 · ADICIONAR AO PEDIDO · MULTI-STEP
//   Tool: add_to_order · Rota: /[slug]/cardapio/[itemId] (em prod)
//   Frame: chat com 2 chips de refinamento
//   Tag: diverge · canvas = chips · prod = tela dedicada
// ─────────────────────────────────────────────────────────────
const F06_AddToOrder = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div style={{
      flex: 1, padding: '8px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
    }}>
      <CustomerBubble when="há 30 s">[ tap "Vinho" ]</CustomerBubble>
      <div>
        <div style={{
          fontFamily: FONT, fontSize: 11, fontWeight: 500,
          letterSpacing: 1, textTransform: 'uppercase',
          color: C.mute, marginBottom: 8,
        }}>Assistente · agora</div>
        <div style={{
          fontSize: 15.5, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink,
        }}>
          Tinto, branco ou rosé? A carta de hoje tem 12 rótulos.
        </div>
        <ContextualChips chips={[
          { label: 'Tinto' },
          { label: 'Branco' },
          { label: 'Rosé' },
          { label: 'Recomende você' },
        ]} />
      </div>

      <div style={{ flex: 1 }} />
      <SoftInput placeholder="Mensagem para a casa" />
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 07 · CHAMAR GARÇOM · BOTTOM SHEET
//   Tool: call_waiter · Rota: /[slug]/garcom/chamar (em prod)
//   Frame: bottom sheet vaul-style com 4 motivos
//   Tag: diverge · canvas = sheet vaul · prod = rota fullscreen
// ─────────────────────────────────────────────────────────────
const F07_CallWaiter = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    {/* chat por baixo · blur */}
    <div style={{
      flex: 1, position: 'relative', padding: '8px 24px 24px',
      filter: 'blur(.5px)', opacity: 0.5, overflow: 'hidden',
    }}>
      <CustomerBubble when="agora">chamar garçom</CustomerBubble>
    </div>

    {/* sheet · ~52% altura */}
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, top: '48%',
      background: '#fff',
      borderTopLeftRadius: 22, borderTopRightRadius: 22,
      border: `1.5px solid ${C.ink}`, borderBottom: 'none',
      padding: '14px 22px 28px',
      boxShadow: '0 -8px 32px rgba(0,0,0,0.10)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{
        width: 40, height: 4, borderRadius: 2, background: C.faint,
        margin: '0 auto', opacity: 0.6,
      }} />
      <div>
        <MonoLabel size={10} color={C.mute}>Chamar garçom</MonoLabel>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.4,
          marginTop: 4, color: C.ink,
        }}>Por que você precisa do garçom?</div>
      </div>

      {[
        { label: 'Pedir a conta', sub: 'Maquininha vai até a mesa' },
        { label: 'Talheres', sub: 'Ou guardanapos extras' },
        { label: 'Água', sub: 'Com ou sem gás' },
        { label: 'Outro motivo', sub: 'Conta o que precisa' },
      ].map((r, i) => (
        <div key={r.label} style={{
          padding: '12px 14px', borderRadius: 12,
          border: `1px solid ${i === 0 ? C.ink : C.borderSoft}`,
          background: i === 0 ? C.surface : '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 500, color: C.ink, letterSpacing: -0.1 }}>{r.label}</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>{r.sub}</div>
          </div>
          <span style={{ fontSize: 14, color: C.faint }}>›</span>
        </div>
      ))}
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 08 · PEDIR A CONTA · 2-STEP
//   Tool: request_bill (router) · Rota: /[slug]/pagamento + /dividir + /pix
//   Frame: chat com chips de canal (Pagar pelo app · Garçom · Voltar)
//   Tag: diverge · canvas = step 1 chips · prod = entra direto
// ─────────────────────────────────────────────────────────────
const F08_RequestBill = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div style={{
      flex: 1, padding: '8px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
    }}>
      <CustomerBubble when="agora">pede a conta</CustomerBubble>
      <div>
        <div style={{
          fontFamily: FONT, fontSize: 11, fontWeight: 500,
          letterSpacing: 1, textTransform: 'uppercase',
          color: C.mute, marginBottom: 8,
        }}>Assistente · agora</div>
        <ToolCallIndicator name="request_bill" category="payment" />
        <div style={{
          marginTop: 10,
          fontSize: 15.5, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink,
        }}>
          Você prefere pagar pelo app ou que o garçom traga a maquininha?
        </div>
        <ContextualChips chips={[
          { label: 'Pagar pelo app', primary: true },
          { label: 'Chamar garçom' },
          { label: 'Voltar' },
        ]} />
      </div>

      <div style={{ flex: 1 }} />
      <SoftInput placeholder="Mensagem para a casa" />
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 09 · LATE-ARRIVAL · IDENTIFY + WAIT + JOIN
//   Tools: customer.identify (mesa ocupada) → host.approve_join
//   Frame: hero = ScreenWaitingApproval (já em window)
//   Tag: aligned · customer-host model · staff só notificado depois
// ─────────────────────────────────────────────────────────────
const F09_LateArrival = () => {
  const Comp = window.ScreenWaitingApproval;
  return Comp ? <Comp state="waiting" /> : <PlaceholderFrame label="ScreenWaitingApproval" />;
};

// ─────────────────────────────────────────────────────────────
// 10 · MERGE · OVERLAY MAP + TYPEWRITER
//   Tools: request_merge → host.approve_merge
//   Frame: hero = ScreenOverlayMapIOS (já em window)
//   Tag: pendente · feature 100% pendente em prod
// ─────────────────────────────────────────────────────────────
const F10_Merge = () => {
  const Comp = window.ScreenOverlayMapIOS;
  return Comp ? <Comp /> : <PlaceholderFrame label="ScreenOverlayMapIOS" />;
};

// ─────────────────────────────────────────────────────────────
// 11 · MANAGER · BUBBLE + COMPLAINT
//   Tools: manager.send_message · send_complaint
//   Frame: chat com ManagerBubble + bubble do cliente reclamando
//   Tag: pendente · ManagerBubble + complaint flow não em prod
// ─────────────────────────────────────────────────────────────
const F11_Manager = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div style={{
      flex: 1, padding: '8px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
    }}>
      <ManagerBubble name="Renata" role="Gerente" when="há 1 min">
        Acabei de ver o problema com o seu risoto · já tô com a cozinha
        e te aviso aqui em 2 min, tá?
      </ManagerBubble>
      <CustomerBubble when="agora">obrigado · vou esperar</CustomerBubble>

      <div style={{ flex: 1 }} />
      <SoftInput placeholder="Mensagem para Renata" />
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 12 · CORTESIA + RATING
//   Tools: courtesy.notify · rating.submit
//   Frame: bubble cortesia chega + star rating (composto)
//   Tag: pendente · CourtesyArrival não em prod · rating existe sem
//        frame canvas
// ─────────────────────────────────────────────────────────────
const F12_CourtesyRating = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div style={{
      flex: 1, padding: '8px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
    }}>
      {/* CourtesyArrival · gift bubble */}
      <div style={{
        background: '#fafaf8', border: `1px solid ${C.borderSoft}`,
        borderLeft: `3px solid ${C.warning}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: C.warning, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Ico.giftSeal(20, '#fff')}</div>
          <MonoLabel size={10} color={C.warning}>Cortesia da casa</MonoLabel>
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: C.ink, letterSpacing: -0.05 }}>
          Renata mandou uma <b>taça de espumante</b> pela demora · já vai na mesa.
        </div>
      </div>

      {/* Rating · 5 stars */}
      <div style={{
        background: '#fff', border: `1.4px solid ${C.ink}`,
        borderRadius: 14, padding: '16px 18px', textAlign: 'center',
      }}>
        <MonoLabel size={10} color={C.mute}>Como foi a experiência?</MonoLabel>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <svg key={n} width="32" height="32" viewBox="0 0 32 32">
              <path
                d="M16 4l3.5 8.5L28 14l-6.5 5.5 2 8.5L16 23l-7.5 5 2-8.5L4 14l8.5-1.5z"
                fill={n <= 4 ? C.ink : 'none'}
                stroke={C.ink} strokeWidth="1.5" strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 14, color: C.mute, letterSpacing: -0.05 }}>
          Quer deixar um comentário pra Renata?
        </div>
      </div>

      <div style={{ flex: 1 }} />
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 13 · LGPD + HISTÓRICO EU
//   Tools: show_lgpd_notice · lgpd_data_request
//   Frame: chat com LGPD notice ManagerBubble-style + chips
//   Tag: pendente · feature inteira pendente em prod · texto canônico
// ─────────────────────────────────────────────────────────────
const F13_LGPD = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />
    <div style={{
      flex: 1, padding: '8px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
    }}>
      <CustomerBubble when="agora">quero apagar meus dados</CustomerBubble>
      <div>
        <div style={{
          fontFamily: FONT, fontSize: 11, fontWeight: 500,
          letterSpacing: 1, textTransform: 'uppercase',
          color: C.mute, marginBottom: 8,
        }}>Assistente · agora</div>
        <ToolCallIndicator name="show_lgpd_notice" category="lgpd" />
        <div style={{
          marginTop: 10,
          background: '#fafaf8', border: `1px solid ${C.borderSoft}`,
          borderLeft: `3px solid ${C.ink}`, borderRadius: 10,
          padding: '14px 16px',
        }}>
          <MonoLabel size={9.5} color={C.ink} style={{ display: 'block', marginBottom: 8 }}>
            Aviso LGPD
          </MonoLabel>
          <div style={{ fontSize: 15, lineHeight: 1.5, letterSpacing: -0.15, color: C.ink }}>
            Você, como consumidor, tem direito por lei (LGPD) de pedir a
            exclusão dos seus dados a qualquer momento. Posso apagar suas
            conversas agora?
          </div>
        </div>
        <ContextualChips chips={[
          { label: 'Sim, quero excluir', destructive: true },
          { label: 'Não, não quero excluir' },
        ]} />
      </div>

      <div style={{ flex: 1 }} />
      <SoftInput placeholder="Mensagem para a casa" />
    </div>
  </IOSFrame>
);

// fallback usado se algum window.* não estiver carregado (debug)
const PlaceholderFrame = ({ label }) => (
  <IOSFrame>
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, padding: 40,
    }}>
      <MonoLabel size={11} color={C.danger}>frame não carregado</MonoLabel>
      <div style={{
        fontFamily: MONO, fontSize: 12, color: C.mute, textAlign: 'center',
      }}>{label}</div>
    </div>
  </IOSFrame>
);

// ═════════════════════════════════════════════════════════════
// DCSection EXPORT
// ═════════════════════════════════════════════════════════════
window.CLIENTE_JOURNEY_V20_SECTIONS = [
  {
    id: 'customer-journey-consolidado',
    title: 'CUSTOMER JOURNEY · CONSOLIDADO V20',
    subtitle:
      '13 frames · ordem narrativa · hand-off pro Claude Code. Único lugar pra entender o flow inteiro do cliente · ' +
      'da chegada (escanear QR) até saída (LGPD). Cada frame mostra a UI do momento + tool/intent + screen/rota + ' +
      'diff vs produção (se houver) + tag de status. Splits decisórios indicados na anotação ' +
      '("aprovado" vs "rejeitado" · "host responde" vs "timeout"). 4 frames são features 100% pendentes em prod ' +
      '(merge · manager+complaint · cortesia · LGPD UI) · 4 divergem entre canvas e prod (cardápio · add_to_order · ' +
      'chamar garçom · pagamento) · 5 estão alinhados ou só faltam pequenos cabos. ',
    frames: [
      fJ({
        label: '01 · escanear · splash',
        screen: <F01_Splash />,
        tag: 'soProd',
        note:
          'Tool: recognize · Rota: /[slug]/mesa/[tableCode] (state: loading) · ' +
          'Monograma TL + 3 bouncing dots · cap 1.5s. NOVO V20 · sem frame canvas hoje · DESENHADO neste round. ' +
          'Próximo: identificar (frame 02) se cliente novo OU home (frame 03) se sessão já existe.',
      }),
      fJ({
        label: '02 · identificar · nome + cpf',
        screen: <F02_Identify />,
        tag: 'aligned',
        note:
          'Tool: customer.identify · Componente: WelcomeModal (em prod) · ScreenCustomerIdentifyBeforeJoin (canvas). ' +
          'Mesmo modal serve first-time normal e late-arrival · CPF lookup auto-login se existe. → próximo: home (frame 03) ' +
          'OU waiting approval (frame 09 · se mesa ocupada).',
      }),
      fJ({
        label: '03 · home · hero + 2 pills + input',
        screen: <F03_Home />,
        tag: 'aligned',
        note:
          'Tool: (nenhum · navegação) · Rota: /[slug]/mesa/[tableCode] (home). ' +
          'AssistantBlock typing-on-arrival + 2 chips (Sugere você primary · Ver cardápio) + SoftInput. ' +
          'ContextualChips ainda não em prod · Claude Code implementa · ver HAND-OFF B.3.',
      }),
      fJ({
        label: '04 · chat · turn com chips',
        screen: <F04_Chat />,
        tag: 'pendente',
        note:
          'Tool: TOOL_REGISTRY (cliente-screens-v14:25 · 25 tools · 6 grupos) · Rota: /[slug]/assistente. ' +
          'AssistantTurn com ToolCallIndicator + bubble texto + ContextualChips. ContextualChips e ' +
          'ContextualInputExpand cabeados nos turns da IA · feature pendente em prod · ver HAND-OFF B.3.',
      }),
      fJ({
        label: '05 · cardápio · overlay vs rota',
        screen: <F05_Menu />,
        tag: 'diverge',
        note:
          'Tool: view_menu (silent · não gera bubble) · Rota canvas: overlay sheet · Rota prod: /[slug]/cardapio. ' +
          'DECISÃO PENDENTE · default sugerido: manter rota dedicada (prod) · canvas mostra overlay como ' +
          'alternativa fluída. Claude Code resolve com PM/usuário · ver HAND-OFF B.4.',
      }),
      fJ({
        label: '06 · adicionar ao pedido · multi-step',
        screen: <F06_AddToOrder />,
        tag: 'diverge',
        note:
          'Tool: add_to_order · Rota canvas: chips multi-step (Vinho → Tinto/Branco/Rosé → confirmação) · ' +
          'Rota prod: /[slug]/cardapio/[itemId] (tela dedicada com qty/note/size). ' +
          'DECISÃO PENDENTE · default sugerido: híbrido chat-first com fallback rota · ver HAND-OFF B.4.',
      }),
      fJ({
        label: '07 · chamar garçom · bottom sheet',
        screen: <F07_CallWaiter />,
        tag: 'diverge',
        note:
          'Tool: call_waiter (com reason: ask_bill/help/silverware/water/custom) · ' +
          'Rota canvas: bottom sheet vaul-style · Rota prod: /[slug]/garcom/chamar (rota fullscreen). ' +
          'DECISÃO PENDENTE · default sugerido: rota (prod vence · fullscreen reduz erros) · ver HAND-OFF B.4.',
      }),
      fJ({
        label: '08 · pedir a conta · 2-step router',
        screen: <F08_RequestBill />,
        tag: 'diverge',
        note:
          'Tool: request_bill (router) · chama 1 de 2: open_payment_screen (silent · UI dedicada) OU ' +
          'call_waiter(reason="ask_bill") (avisa staff). Rota canvas: step 1 chips · Rota prod: entra direto. ' +
          'DECISÃO PENDENTE · default sugerido: step 1 chips · canvas vence pra reduzir cliques sem volta · ' +
          'ver HAND-OFF B.4.',
      }),
      fJ({
        label: '09 · late-arrival · identify + wait + join',
        screen: <F09_LateArrival />,
        tag: 'aligned',
        note:
          'Tools: customer.identify (mesa ocupada) → host.approve_join · State: pending_approval. ' +
          'Customer-host model · staff só notificado depois. Sub-flow: ScreenCustomerIdentifyBeforeJoin → ' +
          'ScreenWaitingApproval (waiting/approved/failed) → ScreenJoinedNotice. Mostrado aqui: ' +
          'estado WAITING (47 s countdown · pulse animation · CTA cancelar). → aprovado: frame 03 (home). ' +
          '→ timeout: escape valve "chamar recepcionista".',
      }),
      fJ({
        label: '10 · merge · overlay map + typewriter',
        screen: <F10_Merge />,
        tag: 'pendente',
        note:
          'Tools: request_merge → host.approve_merge (consent duplo). ' +
          'Sub-flow: ScreenOverlayMapIOS (mostrado aqui · grade 3×3 espacial real · M14 centro · M15 selecionada) → ' +
          'MergeTypewriterBubble no chat do receptor (border-left mostarda · 25ms/char · cursor blink) → ' +
          'ScreenPostMerge (success-wash · TopBar "Mesa 14 + 15"). Cooldown 20min em recusa/timeout · ' +
          'ack-detection antes de ressuscitar fluxos. Feature 100% pendente em prod · ver HAND-OFF B.3.',
      }),
      fJ({
        label: '11 · manager · bubble + complaint',
        screen: <F11_Manager />,
        tag: 'pendente',
        note:
          'Tools: manager.send_message · send_complaint (5 tipos: demora/item errado/item faltando/comida fria/outro). ' +
          'ManagerBubble com nome + role + when + avatar inicial · borda esquerda 3px ink (visualmente diferente ' +
          'da IA). Sub-flow complaint: Pattern2A_AskType (5 chips) → 2B_OutroOpen (expand inline) → ' +
          '2C_ReviewCard (pré-envio com 2 CTAs) → 2D_ToolCalling → 2E_FinalChips. Feature 100% pendente em prod.',
      }),
      fJ({
        label: '12 · cortesia + rating',
        screen: <F12_CourtesyRating />,
        tag: 'pendente',
        note:
          'Tools: courtesy.notify (envio do staff) · rating.submit (cliente avalia). ' +
          'CourtesyArrival = bubble especial com border-left mostarda + ícone gift seal + nome do staff que enviou. ' +
          'Rating · card border ink com 5 stars + textarea opcional pra comentário. ' +
          'Rota prod parcial · /pagamento/feedback existe sem frame canvas · CourtesyArrival 100% pendente. Ver HAND-OFF B.3.',
      }),
      fJ({
        label: '13 · LGPD + histórico Eu',
        screen: <F13_LGPD />,
        tag: 'pendente',
        note:
          'Tools: show_lgpd_notice (texto canônico · vive em backend) · lgpd_data_request (deleção imediata). ' +
          'Sub-flow único: notice ManagerBubble-style com aviso completo + 2 chips (Sim destructive · Não) → ' +
          'ToolCallIndicator lgpd_data_request → card de protocolo (LGPD-AAAA-MM-DD-XXXX · "apagadas agora · ' +
          'protocolo guardado 90 dias"). delete_all_chats segue acessível como tool no LLM mas sem frames ' +
          'dedicados · todo o caminho de "apagar conversas" do cliente passa pelo flow LGPD. Feature 100% pendente em prod.',
      }),
    ],
  },
];

Object.assign(window, {
  F01_Splash, F02_Identify, F03_Home, F04_Chat, F05_Menu,
  F06_AddToOrder, F07_CallWaiter, F08_RequestBill,
  F09_LateArrival, F10_Merge, F11_Manager, F12_CourtesyRating, F13_LGPD,
});
