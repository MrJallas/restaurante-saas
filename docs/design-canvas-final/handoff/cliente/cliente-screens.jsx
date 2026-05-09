// ============================================================
// SCREENS DO APP DO CLIENTE — 18 frames cobrindo seções 4.2 → 4.5
// LINGUAGEM: branco puro · ink #0a0a0a · Inter sans · mono caps tiny
// labels · pill outline/filled. SEM serif. SEM terracota. SEM bubbles.
// ============================================================

const { useState } = React;

// ============ HELPER — frame builder pra usar dentro de DCSection ============
// DCSection filtra por c.type === DCArtboard, então temos que devolver
// um DCArtboard direto. Width=414 (390 frame + 24px gutter pra label).
// Height = 844 (frame) + caption (~120) + headroom (24).
const f = ({ label, platform = 'iOS', screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard key={label + platform} id={label + '-' + platform} label={`${label} · ${platform}`}
      width={414} height={844 + captionH + 24}
      style={{ background: '#f0eee9', borderRadius: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px', gap: 18 }}>
        {screen}
        {note && <Caption>{note}</Caption>}
      </div>
    </DCArtboard>
  );
};

// ─────────────────────────────────────────────────────────────
// 4.2 — CONTINUATION HOME (5 contextos iOS + 1 Android)
// Mesmo HomeHero, mas o texto da `AssistantBlock` muda conforme a
// última ação do cliente. Chips/pills de sugestão também são contextuais.
// ─────────────────────────────────────────────────────────────

// chips embaixo dos botões — mesmas pills outline pequenas
const ChipRow = ({ chips }) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
    {chips.map(c => (
      <span key={c} style={{
        padding: '7px 14px', borderRadius: 999, fontSize: 12,
        border: `1px solid ${C.borderSoft}`, background: '#fff',
        color: C.ink, fontFamily: FONT, letterSpacing: -0.05,
      }}>{c}</span>
    ))}
  </div>
);

const ContinuationHome = ({
  label, message, chips, primaryFilledLabel, primaryFilledIcon, andro,
}) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  return (
    <Frame>
      <TopBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        padding: '0 24px', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: 10, paddingBottom: 30 }}>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <PillButton>Chamar garçom</PillButton>
            <PillButton>Ver cardápio</PillButton>
            {primaryFilledLabel && (
              <PillButton variant="filled">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {primaryFilledIcon}
                  {primaryFilledLabel}
                </span>
              </PillButton>
            )}
          </div>

          <div style={{ marginTop: 22 }}>
            <AssistantBlock label={label} typing>
              {message}
            </AssistantBlock>
            {chips && <ChipRow chips={chips} />}
          </div>
        </div>

        <div style={{ position: 'relative', paddingBottom: andro ? 16 : 26 }}>
          <LiquidInput placeholder="Digite aqui" />
        </div>
      </div>
    </Frame>
  );
};

// ─────────────────────────────────────────────────────────────
// 4.3 — BOTTOM SHEET CHAMAR GARÇOM (vaul-style, 4 frames)
// Sobreposição com backdrop semi-opaco. Tela atrás CONTINUA visível.
// Sem mudança de rota. Swipe-down dispensa sem reload.
// ─────────────────────────────────────────────────────────────

const HomeBehindSheet = () => (
  // versão atenuada do home pra ficar atrás do sheet
  <>
    <TopBar />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 24px', justifyContent: 'center', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <PillButton>Chamar garçom</PillButton>
        <PillButton>Ver cardápio</PillButton>
      </div>
      <div style={{ marginTop: 22 }}>
        <MonoLabel style={{ marginBottom: 8 }}>Assistente</MonoLabel>
        <div style={{ fontSize: 20, lineHeight: 1.4, letterSpacing: -0.3, color: C.ink, maxWidth: 320 }}>
          Olá, Caleb. Posso ajudar com sugestões, pedido e pagamento.
        </div>
      </div>
    </div>
  </>
);

const SheetReason = ({ icon, label, hint, selected }) => (
  <div style={{
    padding: '14px 16px', borderRadius: 14,
    border: `1.3px solid ${selected ? C.ink : C.borderSoft}`,
    background: selected ? '#fafaf8' : '#fff',
    display: 'flex', alignItems: 'center', gap: 14,
  }}>
    <div style={{
      width: 38, height: 38, borderRadius: 19, flexShrink: 0,
      border: `1.2px solid ${C.borderSoft}`, background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: C.ink, letterSpacing: -0.2 }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{hint}</div>}
    </div>
    <div style={{
      width: 18, height: 18, borderRadius: 9,
      border: `1.4px solid ${selected ? C.ink : C.faint}`,
      background: '#fff', position: 'relative',
    }}>
      {selected && (
        <div style={{
          position: 'absolute', inset: 3, borderRadius: 6, background: C.ink,
        }} />
      )}
    </div>
  </div>
);

const Sheet = ({ selectedIdx = -1, dismissY = 0, ctaEnabled }) => {
  const reasons = [
    { icon: Ico.book(20, C.ink),    label: 'Trazer o cardápio',  hint: 'Versão impressa pra mesa' },
    { icon: Ico.notepad(20, C.ink), label: 'Fazer pedido',       hint: 'Garçom anota direto' },
    { icon: Ico.glass(20, C.ink),   label: 'Servir bebida',      hint: 'Reabastecer ou vinho na taça' },
    { icon: Ico.receipt(20, C.ink), label: 'Pedir a conta',      hint: 'Iniciar fechamento' },
    { icon: Ico.chat(20, C.ink),    label: 'Outro motivo',       hint: 'Você descreve quando atender' },
  ];
  return (
    <>
      {/* Conteúdo de fundo (atenuado mas visível) */}
      <HomeBehindSheet />
      {/* backdrop discreto */}
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)',
        zIndex: 5, transition: 'opacity 250ms',
      }} />
      {/* sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
        zIndex: 10, padding: '10px 22px 28px',
        transform: `translateY(${dismissY}px)`,
        transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
      }}>
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 14px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.borderSoft }} />
        </div>

        <MonoLabel style={{ display: 'block', marginBottom: 6 }}>Mesa 12 · turno da noite</MonoLabel>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: C.ink, marginBottom: 4 }}>
          Chamar o garçom
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginBottom: 18 }}>
          Escolha o motivo. Vou avisar e te dar o tempo estimado.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reasons.map((r, i) => (
            <SheetReason key={i} {...r} selected={i === selectedIdx} />
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <PillButton variant="filled" size="lg" disabled={!ctaEnabled}
            style={{ width: '100%', justifyContent: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              Confirmar chamado {Ico.arrow(16, '#fff')}
            </span>
          </PillButton>
        </div>
      </div>
    </>
  );
};

const SheetIdle = ({ andro }) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  return (
    <Frame>
      <Sheet selectedIdx={-1} dismissY={0} ctaEnabled={false} />
    </Frame>
  );
};

const SheetSelected = () => (
  <IOSFrame>
    <Sheet selectedIdx={1} dismissY={0} ctaEnabled />
  </IOSFrame>
);

const SheetDismissing = () => (
  <IOSFrame>
    <Sheet selectedIdx={-1} dismissY={420} ctaEnabled={false} />
    {/* setinha indicando swipe-down */}
    <div style={{
      position: 'absolute', left: '50%', top: 220, transform: 'translateX(-50%)',
      zIndex: 20, fontFamily: MONO, fontSize: 10, color: C.mute,
      letterSpacing: 1.4, textTransform: 'uppercase', textAlign: 'center',
    }}>
      <div>Swipe down</div>
      <div style={{ marginTop: 8 }}>↓</div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 4.4 — CORTESIA RECEBIDA REDESIGN (4 frames)
// Substitui o mockup "estilo Claude". Selo customizado em vez de ícone
// genérico. Item em card branco com borda fina + mono caps label.
// Quote do gerente em itálico + travessão.
// ─────────────────────────────────────────────────────────────

// detail decorativo de canto — gravura linear minimal
const CornerOrnament = ({ pos = 'tl' }) => {
  const positions = {
    tl: { top: 60, left: 16, transform: 'rotate(0deg)' },
    tr: { top: 60, right: 16, transform: 'scaleX(-1)' },
    bl: { bottom: 100, left: 16, transform: 'scaleY(-1)' },
    br: { bottom: 100, right: 16, transform: 'scale(-1,-1)' },
  };
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
      style={{ position: 'absolute', opacity: 0.18, ...positions[pos] }}>
      <path d="M2 2c8 4 14 10 18 18M14 4c-2 4 0 8 4 10M4 14c4-2 8 0 10 4M2 22c6 1 11 6 12 12" stroke={C.ink} strokeWidth="0.9" strokeLinecap="round"/>
    </svg>
  );
};

const CourtesyArrival = ({ andro }) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  return (
    <Frame>
      <TopBar leftIcon="back" rightIcon={null} />
      <CornerOrnament pos="tl" />
      <CornerOrnament pos="tr" />
      <CornerOrnament pos="bl" />
      <CornerOrnament pos="br" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        padding: '20px 28px 24px', overflow: 'hidden' }}>

        {/* selo no topo, sem fundo retangular */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 22 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 38,
            border: `1.4px solid ${C.ink}`, color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {Ico.giftSeal(36, C.ink)}
          </div>
        </div>

        <MonoLabel style={{ display: 'block', textAlign: 'center', marginBottom: 8 }}>
          Cortesia da casa · mesa 12
        </MonoLabel>

        <div style={{
          fontSize: 32, fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.8,
          textAlign: 'center', color: C.ink, marginBottom: 6, textWrap: 'balance',
        }}>
          Cortesia da casa
        </div>
        <div style={{
          fontSize: 13, color: C.mute, textAlign: 'center', marginBottom: 22,
          letterSpacing: -0.05,
        }}>
          Renata, gerente, mandou pra você
        </div>

        {/* card do item */}
        <div style={{
          border: `1px solid ${C.borderSoft}`, borderRadius: 14,
          padding: '18px 18px 20px', background: '#fff', marginBottom: 18,
        }}>
          <MonoLabel style={{ display: 'block', marginBottom: 6 }}>
            Sobremesa · sem cobrança
          </MonoLabel>
          <div style={{
            fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: C.ink,
            marginBottom: 6,
          }}>
            Petit gâteau de chocolate
          </div>
          <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, textWrap: 'pretty' }}>
            Bolo quente meio amargo com sorvete de creme. Sai da cozinha em 6 min.
          </div>
        </div>

        {/* quote do gerente */}
        <div style={{
          padding: '0 4px', marginBottom: 24, fontSize: 14, lineHeight: 1.55,
          color: C.ink, fontStyle: 'italic', letterSpacing: -0.1, textWrap: 'pretty',
        }}>
          "Vi que estão celebrando hoje — quis mandar um mimo pra completar a mesa."
          <div style={{ fontStyle: 'normal', marginTop: 6, fontSize: 12, color: C.mute }}>
            — Renata, gerente
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: andro ? 14 : 22 }}>
          <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
            Aceitar com gratidão
          </PillButton>
          <button style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: FONT, fontSize: 13, color: C.mute, letterSpacing: -0.05,
            textDecoration: 'underline', padding: '6px 0',
          }}>Não, obrigado</button>
        </div>
      </div>
    </Frame>
  );
};

const CourtesyConfirmed = () => (
  <IOSFrame>
    <TopBar leftIcon="back" rightIcon={null} />
    <CornerOrnament pos="tl" />
    <CornerOrnament pos="tr" />

    <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
      padding: '40px 28px 24px', alignItems: 'center', justifyContent: 'flex-start' }}>

      {/* selo carimbado — escala 2x e levemente tortinho */}
      <div style={{
        marginTop: 24, marginBottom: 26,
        transform: 'rotate(-7deg)', position: 'relative',
      }}>
        <div style={{
          width: 130, height: 130, borderRadius: 65,
          border: `2px solid ${C.ink}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 4, color: C.ink, position: 'relative',
        }}>
          {/* anel interno tracejado */}
          <div style={{
            position: 'absolute', inset: 8, borderRadius: '50%',
            border: `1px dashed ${C.ink}`, opacity: 0.6,
          }} />
          <MonoLabel size={9} style={{ marginBottom: 2 }}>Cortesia · 2026</MonoLabel>
          {Ico.check(26, C.ink)}
          <MonoLabel size={9} style={{ marginTop: 2 }}>Trattoria luna</MonoLabel>
        </div>
      </div>

      <MonoLabel style={{ marginBottom: 8 }}>Aceito · mesa 12</MonoLabel>
      <div style={{
        fontSize: 28, fontWeight: 600, letterSpacing: -0.7, lineHeight: 1.1,
        textAlign: 'center', marginBottom: 6, color: C.ink, textWrap: 'balance',
      }}>
        Bom apetite, Caleb
      </div>
      <div style={{ fontSize: 14, color: C.mute, textAlign: 'center', marginBottom: 24, textWrap: 'pretty', maxWidth: 280 }}>
        A Marina vai trazer assim que sair da cozinha.
      </div>

      {/* avatar + ETA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', border: `1px solid ${C.borderSoft}`,
        borderRadius: 999, background: '#fff', marginBottom: 24,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 16, background: C.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600,
        }}>MA</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>Marina</div>
          <MonoLabel size={9.5} color={C.mute}>Garçonete · ~6 min</MonoLabel>
        </div>
        <span style={{ marginLeft: 12, color: C.faint }}>{Ico.clock(14, C.faint)}</span>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ width: '100%', paddingBottom: 22 }}>
        <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
          Voltar para a mesa
        </PillButton>
      </div>
    </div>
  </IOSFrame>
);

const CourtesyDeclined = () => (
  <IOSFrame>
    <TopBar leftIcon="back" rightIcon={null} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
      padding: '60px 28px 24px', alignItems: 'center', justifyContent: 'flex-start' }}>

      <div style={{
        width: 56, height: 56, borderRadius: 28,
        border: `1.4px solid ${C.borderSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.mute, marginBottom: 22,
      }}>{Ico.x(22, C.mute)}</div>

      <MonoLabel style={{ marginBottom: 8 }}>Mesa 12</MonoLabel>
      <div style={{
        fontSize: 26, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.15,
        textAlign: 'center', marginBottom: 8, color: C.ink, textWrap: 'balance',
      }}>
        Sem problemas, Caleb
      </div>
      <div style={{ fontSize: 14, color: C.mute, textAlign: 'center',
        textWrap: 'pretty', maxWidth: 290, marginBottom: 24 }}>
        A cortesia volta pro estoque do dia. Avisei a Renata.
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ width: '100%', paddingBottom: 22 }}>
        <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
          Voltar para a mesa
        </PillButton>
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// 4.5 — MENSAGEM DO GERENTE NO CHAT (3 frames)
// Bubble visualmente diferente da IA: borda esquerda preta + bg cinza
// quente. Pode haver IA + gerente convivendo na mesma tela.
// ─────────────────────────────────────────────────────────────

const ManagerOnly = ({ andro }) => {
  const Frame = andro ? AndroidFrame : IOSFrame;
  return (
    <Frame>
      <TopBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        padding: '0 24px', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: 18, paddingBottom: 30 }}>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <PillButton>Chamar garçom</PillButton>
            <PillButton>Ver cardápio</PillButton>
          </div>

          <div style={{ marginTop: 18 }}>
            <ManagerBubble name="Renata" role="Gerente" when="agora">
              Vi que estão esperando há um pouco — o risoto sai em 4 min.
              Mandei um aperitivo da casa pra esse intervalo. Tudo bem com você?
            </ManagerBubble>
          </div>
        </div>

        <div style={{ position: 'relative', paddingBottom: andro ? 14 : 26 }}>
          <LiquidInput placeholder="Responder Renata" />
        </div>
      </div>
    </Frame>
  );
};

const ManagerConversation = () => (
  <IOSFrame>
    <TopBar />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        gap: 16, paddingTop: 16, paddingBottom: 24, overflow: 'auto' }}>

        {/* IA primeiro — estilo inline sem bubble */}
        <div>
          <MonoLabel size={10} color={C.mute} style={{ marginBottom: 8 }}>
            Assistente · há 8 min
          </MonoLabel>
          <div style={{ fontSize: 16, lineHeight: 1.45, letterSpacing: -0.2, color: C.ink }}>
            Seu pedido tá com a cozinha. Te aviso aqui quando estiver pronto.
          </div>
        </div>

        {/* mensagem do cliente — alinhada à direita */}
        <div style={{ alignSelf: 'flex-end', maxWidth: 280 }}>
          <div style={{
            background: C.ink, color: '#fff', borderRadius: 18,
            padding: '10px 14px', fontSize: 14, lineHeight: 1.4,
          }}>
            Tem demorado um pouco né
          </div>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, letterSpacing: 0.5 }}>
              Você · há 6 min
            </span>
          </div>
        </div>

        {/* mensagem do gerente — bubble assinatura */}
        <ManagerBubble name="Renata" role="Gerente" when="há 1 min">
          Vi seu chamado, Caleb. O risoto sai em 4 min — mandei um aperitivo
          da casa pra esse intervalo.
        </ManagerBubble>

        {/* resposta do cliente */}
        <div style={{ alignSelf: 'flex-end', maxWidth: 280 }}>
          <div style={{
            background: C.ink, color: '#fff', borderRadius: 18,
            padding: '10px 14px', fontSize: 14, lineHeight: 1.4,
          }}>
            Obrigado Renata, sem pressa
          </div>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, letterSpacing: 0.5 }}>
              Você · agora
            </span>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', paddingBottom: 26 }}>
        <LiquidInput placeholder="Mensagem para a casa" />
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO PARA O CANVAS HOST
// ─────────────────────────────────────────────────────────────
window.CLIENTE_SECTIONS = [
  {
    id: '4.2',
    title: 'Continuação · Home pós-ação',
    subtitle: '5 contextos derivados da última ação na sessão. Pool de templates Redis + renderTemplate(), espelhando home.service.ts.',
    frames: [
      f({ label: 'viu cardápio', screen: <ContinuationHome
        label="Assistente · você esteve no menu"
        message={<>Tava bisbilhotando o menu? Posso te recomendar uma <b>sobremesa do dia</b> ou um vinho que combina.</>}
        chips={['Sobremesa do dia', 'Vinho da casa', 'Voltar pro menu', 'Comparar dois pratos']}
      />, note: 'Última ação: viu_cardapio (cardápio aberto há 2-30min, sem pedido). Pool 8+ templates. Chips contextuais (não estáticos). Todo chip dispara ação útil · todo "ok" foi banido.' }),
      f({ label: 'chamou garçom', screen: <ContinuationHome
        label="Assistente · garçom avisado"
        message={<>Avisei o garçom — ele tá indo aí. Quer ir vendo a próxima rodada enquanto isso?</>}
        chips={['Ver bebidas', 'Ver sobremesas', 'Cancelar chamado', 'Quanto tempo?']}
      />, note: 'Última ação: chamou_garcom (waiter_calls.created_at recente, ainda em "calling"). Mantém o estado vivo no chat. "Quanto tempo?" → IA consulta ETA real do garçom no waiter_calls e devolve.' }),
      f({ label: 'abriu pedido', screen: <ContinuationHome
        label="Assistente · pedido em andamento"
        message={<>Seu pedido tá com a cozinha. Te aviso aqui quando estiver pronto pra ir. Quer adicionar algo enquanto espera?</>}
        chips={['Adicionar bebida', 'Ver pedido', 'Pedir mais', 'Quanto tempo?']}
        primaryFilledLabel="Acompanhar pedido"
        primaryFilledIcon={<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="#fff" strokeWidth="1.4" fill="none"/><path d="M7 4v3.2L9 9" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/></svg>}
      />, note: 'Última ação: abriu_pedido (orders existe, status preparing). CTA filled abre /[slug]/pedido — status agregado em mono caps (HÁ 8 MIN NA COZINHA), sem mapa/ETA preciso. Sem cara de delivery.' }),
      f({ label: 'pagou', screen: <ContinuationHome
        label="Assistente · pagamento ok"
        message={<>Paguinho registrado, Caleb. Mais alguma coisa antes de fechar a comanda?</>}
        chips={['Pedir conta final', 'Café espresso', 'Ainda quero algo', 'Avaliar atendimento']}
      />, note: 'Última ação: pagou (customer_consumption_summary.last_paid recente). Tom encerrando, ainda com brecha pra extras. "Avaliar atendimento" abre fluxo de rating do garçom + notas.' }),
      f({ label: 'voltou sem ação', screen: <ContinuationHome
        label="Assistente · de volta"
        message={<>Bem-vindo de volta. Da última vez foi <b>risoto de camarão</b>. Posso sugerir algo parecido ou mostrar novidades?</>}
        chips={['Repetir última', 'Mostrar novidades', 'Algo leve', 'Começar do zero']}
      />, note: 'Última ação: voltou_sem_acao (sessão antiga sem evento recente, mas isReturning=true). Inclui last_items[].' }),
      f({ label: 'viu cardápio', platform: 'Android', screen: <ContinuationHome
        andro
        label="Assistente · você esteve no menu"
        message={<>Tava bisbilhotando o menu? Posso te recomendar uma <b>sobremesa do dia</b> ou um vinho.</>}
        chips={['Sobremesa do dia', 'Vinho da casa', 'Voltar pro menu']}
      />, note: 'Mesma cópia, status bar Android (camera punch-hole) e gesture nav.' }),
    ],
  },
  {
    id: '4.3',
    title: 'Bottom sheet "Chamar garçom" (vaul)',
    subtitle: 'Substitui /[slug]/garcom/chamar (rota inteira). Drawer sobreposto à tela atual, sem reload, com swipe-down dispense.',
    frames: [
      f({ label: 'idle · home atrás visível', screen: <SheetIdle />,
        note: 'Sheet aparece sobre o home atenuado. Backdrop 32% preto. Drag handle no topo. CTA disabled até escolher motivo. Animação: slideUp 220ms ease-out.' }),
      f({ label: 'motivo selecionado', screen: <SheetSelected />,
        note: 'Radio "Fazer pedido" selecionado. CTA filled habilita. Tap-feedback no card (bg #fafaf8 + border ink). Hit target 44+ ✓.' }),
      f({ label: 'swipe-dismiss em curso', screen: <SheetDismissing />,
        note: 'Gesto de swipe-down dispensa o sheet sem mudar de rota. Animação: translateY follow-finger; ao soltar 60%+ → close 220ms; senão volta 180ms.' }),
      f({ label: 'idle', platform: 'Android', screen: <SheetIdle andro />,
        note: 'Mesmo sheet em Android. Status bar/gesture nav corretos. Backdrop e radii idênticos.' }),
    ],
  },
  {
    id: '4.4',
    title: 'Cortesia da casa — redesign',
    subtitle: 'Substitui o mockup "estilo Claude". Selo customizado, item em card branco com mono caps label, quote em itálico assinada.',
    frames: [
      f({ label: 'recebimento', screen: <CourtesyArrival />,
        note: 'Ornamentos discretos nos 4 cantos. Selo redondo (não retangular arredondado). Quote do gerente em itálico com travessão. CTA primário filled black + secundário sublinhado discreto.' }),
      f({ label: 'aceito · selo carimbado', screen: <CourtesyConfirmed />,
        note: 'Checkmark genérico → selo carimbado tortinho (rotate -7deg). Pill com avatar Marina + ETA mono. Animação: stamp-in com bounce + sutil rotação 0→-7deg.' }),
      f({ label: 'recusa', screen: <CourtesyDeclined />,
        note: 'Estado de recusa minimal. X em circle outline (não preenchido). Mensagem curta, sem culpabilizar.' }),
      f({ label: 'recebimento', platform: 'Android', screen: <CourtesyArrival andro />,
        note: 'Mesma composição, ajustes de status bar e nav gesture. Largura mantém 390 pra parear com iOS no canvas.' }),
    ],
  },
  {
    id: '4.5',
    title: 'Mensagem do gerente no chat',
    subtitle: 'Bubble assinatura: borda esquerda ink + fundo cinza quente. Avatar com inicial da pessoa + mono caps "RENATA · GERENTE".',
    frames: [
      f({ label: 'mensagem solo', screen: <ManagerOnly />,
        note: 'Só mensagem da Renata, fora do contexto da IA. Input troca placeholder → "Responder Renata". Resposta vai pro app do gerente, NÃO pra IA.' }),
      f({ label: 'IA + cliente + gerente', screen: <ManagerConversation />,
        note: 'Convivência: IA inline (sem bubble), cliente em bubble preto à direita, gerente em bubble assinatura à esquerda com borda ink. Tempo em mono caps tiny.' }),
      f({ label: 'mensagem solo', platform: 'Android', screen: <ManagerOnly andro />,
        note: 'Status bar Android. Borda esquerda do bubble do gerente continua igual — assinatura visual da casa.' }),
    ],
  },
];
