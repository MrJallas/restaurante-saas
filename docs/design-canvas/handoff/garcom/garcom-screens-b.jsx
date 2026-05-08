// ============================================================
// GARÇOM — TELAS DE DETALHE + AÇÃO
// ============================================================

// ============================================================
// DETALHE DA MESA — total da conta + histórico unificado
// (pedidos · chamados de garçom · pagamentos pelo app)
// ============================================================
const ScreenTableDetail = ({ dark = false, showMenu = false }) => {
  const C = useG(dark);

  // pagamentos parciais feitos pelos clientes via app mobile
  const payments = [
    { who: 'Caleb',    amount: 71.88, method: 'Pix · app',     when: '21:48', status: 'pago' },
    { who: 'Marina',   amount: 71.88, method: 'Crédito · app', when: '21:46', status: 'pago' },
    { who: 'Diego',    amount: 71.88, method: 'Pix · app',     when: '21:44', status: 'processando' },
  ];
  const totalConta = 287.50;
  const totalPago = payments.filter(p => p.status === 'pago').reduce((a, b) => a + b.amount, 0);
  const restante = totalConta - totalPago;
  const pessoas = 4;

  // histórico cronológico unificado: pedidos, chamados, pagamentos
  const timeline = [
    { kind: 'payment', when: '21:48', who: 'Caleb',  amount: 71.88, method: 'Pix · app', status: 'pago' },
    { kind: 'payment', when: '21:46', who: 'Marina', amount: 71.88, method: 'Crédito · app', status: 'pago' },
    { kind: 'payment', when: '21:44', who: 'Diego',  amount: 71.88, method: 'Pix · app', status: 'processando' },
    { kind: 'call', when: '21:42', callType: 'pediu-conta', sub: 'Pelo cardápio digital' },
    { kind: 'order', when: '21:34', id: '#0142', station: 'Bar', status: 'preparando',
      items: [
        { q: 2, n: 'Aperol Spritz', note: 'sem azeitona, com fatia de laranja' },
        { q: 1, n: 'Suco de limão', note: 'pouco açúcar' },
      ]},
    { kind: 'order', when: '21:32', id: '#0142', station: 'Cozinha', status: 'pronto',
      items: [
        { q: 1, n: 'Risoto de camarão', note: 'sem cebola, ponto ao dente' },
        { q: 1, n: 'Bruschetta caprese', note: null },
        { q: 2, n: 'Filé ao vinho', note: 'um mal passado, um ao ponto' },
      ]},
    { kind: 'call', when: '21:18', callType: 'chamou-garcom', sub: 'Sem motivo informado' },
    { kind: 'order', when: '21:05', id: '#0140', station: 'Cozinha', status: 'servido',
      items: [
        { q: 4, n: 'Couvert da casa', note: null },
      ]},
    { kind: 'call', when: '20:58', callType: 'mais-bebida', sub: 'Mais 1 Aperol Spritz' },
  ];

  const statusMap = {
    'pronto':     { tone: 'success', label: 'Pronto · servir' },
    'preparando': { tone: 'warn',    label: 'Preparando' },
    'servido':    { tone: 'soft',    label: 'Servido' },
    'novo':       { tone: 'info',    label: 'Enviado' },
  };

  const callMeta = {
    'pediu-conta':   { label: 'Pediu a conta',  icon: Icon.receipt, tone: C.danger },
    'chamou-garcom': { label: 'Chamou garçom',  icon: Icon.hand,    tone: C.warn   },
    'mais-bebida':   { label: 'Pediu bebida',   icon: Icon.glass,   tone: C.info   },
    'pronto-cozinha':{ label: 'Pronto cozinha', icon: Icon.check,   tone: C.success },
  };

  const fmt = (v) => v.toFixed(2).replace('.', ',');

  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Mesa 12"
        sub="4 PESSOAS · ABERTA HÁ 42 MIN"
        right={<GIconBtn dark={dark} icon={Icon.more(20)} />}
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
        {/* sumário da conta — só leitura */}
        <div style={{
          margin: '14px 16px', padding: 18, borderRadius: 16,
          background: C.ink, color: C.bg,
        }}>
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1, textTransform: 'uppercase' }}>
            Total da conta
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.8,
            fontVariantNumeric: 'tabular-nums', marginTop: 2, lineHeight: 1.05 }}>
            R$ {fmt(totalConta)}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            R$ {fmt(totalConta / pessoas)} por pessoa · {pessoas} pessoas
          </div>

          {/* progresso de pagamento */}
          <div style={{ marginTop: 16, paddingTop: 14,
            borderTop: '1px solid rgba(255,255,255,0.14)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 12, opacity: 0.85, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
              <span>Pago pelo app · R$ {fmt(totalPago)}</span>
              <span>Falta · R$ {fmt(restante)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 99,
              background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(totalPago / totalConta) * 100}%`,
                background: C.bg, borderRadius: 99 }} />
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: C.bg }} />
                <span style={{ opacity: 0.85 }}>{payments.filter(p => p.status === 'pago').length} pagaram</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4,
                  background: 'rgba(255,255,255,0.4)' }} />
                <span style={{ opacity: 0.85 }}>{payments.filter(p => p.status === 'processando').length} processando</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4,
                  border: '1.5px solid rgba(255,255,255,0.5)' }} />
                <span style={{ opacity: 0.85 }}>{pessoas - payments.length} pendentes</span>
              </span>
            </div>
          </div>
        </div>

        {/* header da timeline */}
        <div style={{ padding: '18px 16px 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700 }}>
            Histórico
          </div>
          <div style={{ fontSize: 11, color: C.mute, fontWeight: 500 }}>
            {timeline.length} eventos
          </div>
        </div>

        {/* timeline unificada */}
        <div style={{ position: 'relative', padding: '0 16px' }}>
          {timeline.map((ev, i) => {
            const isLast = i === timeline.length - 1;

            // ----- PEDIDO -----
            if (ev.kind === 'order') {
              const s = statusMap[ev.status];
              const isPronto = ev.status === 'pronto';
              return (
                <TLRow key={i} dark={dark} time={ev.when} isLast={isLast}
                  dot={<TLDot color={isPronto ? C.success : C.ink} bg={C.bg} />}>
                  <div style={{
                    borderRadius: 14,
                    border: `1.5px solid ${isPronto ? C.success : C.borderSoft}`,
                    background: isPronto ? C.successBg : C.bg,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: `1px dashed ${C.borderFaint}`,
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                          Pedido {ev.id}
                        </span>
                        <span style={{ fontSize: 10, color: C.mute, letterSpacing: 0.5,
                          textTransform: 'uppercase', fontWeight: 600 }}>
                          · {ev.station}
                        </span>
                      </div>
                      <GBadge tone={s.tone} dark={dark} dot pulse={isPronto}>{s.label}</GBadge>
                    </div>
                    <div style={{ padding: '4px 12px 10px' }}>
                      {ev.items.map((it, j) => (
                        <div key={j} style={{
                          display: 'flex', gap: 10, padding: '6px 0',
                          borderBottom: j < ev.items.length - 1 ? `1px solid ${C.borderFaint}` : 'none',
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 20 }}>
                            {it.q}×
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{it.n}</div>
                            {it.note && (
                              <div style={{ fontSize: 11, color: C.mute, marginTop: 1, fontStyle: 'italic' }}>
                                “{it.note}”
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TLRow>
              );
            }

            // ----- CHAMADO -----
            if (ev.kind === 'call') {
              const m = callMeta[ev.callType] || callMeta['chamou-garcom'];
              return (
                <TLRow key={i} dark={dark} time={ev.when} isLast={isLast}
                  dot={<TLDot color={m.tone} bg={C.bg} />}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 12,
                    border: `1.5px solid ${C.borderSoft}`,
                    background: C.bg,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: m.tone, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>{m.icon(16)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 11, color: C.mute, marginTop: 1 }}>
                        {ev.sub}
                      </div>
                    </div>
                  </div>
                </TLRow>
              );
            }

            // ----- PAGAMENTO -----
            if (ev.kind === 'payment') {
              const isPago = ev.status === 'pago';
              return (
                <TLRow key={i} dark={dark} time={ev.when} isLast={isLast}
                  dot={<TLDot color={isPago ? C.success : C.warn} bg={C.bg} />}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 12,
                    border: `1.5px solid ${C.borderSoft}`,
                    background: C.bg,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: isPago ? C.success : C.warn, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>{Icon.check(16)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                          {ev.who} {isPago ? 'pagou' : 'pagando'}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink,
                          fontVariantNumeric: 'tabular-nums' }}>
                          R$ {fmt(ev.amount)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: C.mute, marginTop: 1 }}>
                        {ev.method}{!isPago && ' · aguardando confirmação'}
                      </div>
                    </div>
                  </div>
                </TLRow>
              );
            }

            return null;
          })}
        </div>
      </div>

      <GBottomNav active="home" dark={dark} />

      {showMenu && (
        <MoreSheet dark={dark} title="Mesa 12 · 4 pessoas" actions={[
          { icon: Icon.receipt, label: 'Imprimir conta',           sub: 'Envia para a maquininha do caixa' },
          { icon: Icon.user,    label: 'Transferir mesa',          sub: 'Passar a mesa para outro garçom' },
          { icon: Icon.flame,   label: 'Reportar problema',        sub: 'Avisa o gerente sobre algo na mesa', tone: 'danger' },
        ]} />
      )}
    </div>
  );
};

// linha da timeline com dot + linha vertical à esquerda
const TLRow = ({ dark, time, dot, children, isLast }) => {
  const C = useG(dark);
  return (
    <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
      {/* gutter esquerdo: hora + dot + linha */}
      <div style={{ width: 44, flexShrink: 0, position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        paddingTop: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.mute,
          letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums' }}>
          {time}
        </div>
      </div>
      <div style={{ position: 'relative', width: 0 }}>
        {/* linha vertical */}
        {!isLast && (
          <div style={{ position: 'absolute', left: -1, top: 16, bottom: -10,
            width: 2, background: C.borderFaint, borderRadius: 1 }} />
        )}
        {/* dot */}
        <div style={{ position: 'absolute', left: -7, top: 12 }}>
          {dot}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 14, paddingBottom: 10 }}>
        {children}
      </div>
    </div>
  );
};

const TLDot = ({ color, bg }) => (
  <div style={{
    width: 14, height: 14, borderRadius: 7,
    background: bg, border: `3px solid ${color}`,
  }} />
);

// ============================================================
// DETALHE DO CHAMADO — ex: cliente quer a conta
// ============================================================
const ScreenCallDetail = ({ dark = false, type = 'pediu-conta', showMenu = false }) => {
  const C = useG(dark);
  const meta = CALL_TYPES[type];
  const tint = meta.tone === 'danger' ? C.danger
            : meta.tone === 'success' ? C.success
            : meta.tone === 'info'    ? C.info : C.warn;

  // prioridade dinâmica: vem do balanceador da API com base em filas (cozinha, bar, salão)
  // tone='danger' (vermelho) = demanda alta nessa estação, este chamado tem prioridade máxima
  // tone='warn'   (amarelo)  = demanda média
  // tone='info'   (azul)     = demanda baixa
  const config = {
    'pediu-conta': {
      title: 'Pediu a conta',
      subtitle: 'Mesa 3 · 5 pessoas',
      bigText: 'R$ 612,40',
      hint: 'Cliente solicitou pelo cardápio digital. Forma de pagamento ainda não escolhida.',
      primary: 'A caminho',
      secondary: 'Voltar',
      reminder: 'Lembre-se de levar a maquininha de cartão',
      priority: 'high', // ex: muitos clientes chamando — fila do salão lotada
    },
    'chamou-garcom': {
      title: 'Chamou garçom',
      subtitle: 'Mesa 18 · 4 pessoas',
      bigText: 'há 30s',
      hint: 'Cliente acionou o botão "chamar garçom" pelo cardápio. Sem motivo informado.',
      primary: 'A caminho',
      secondary: 'Voltar',
      priority: 'high',
    },
    'pronto-cozinha': {
      title: 'Pronto · cozinha',
      subtitle: 'Mesa 12 · 4 pessoas',
      bigText: '2 pratos',
      hint: 'Risoto de camarão · Filé ao vinho. Bandeja na bancada de retirada.',
      primary: 'Vou servir',
      secondary: 'Adiar 2 min',
      priority: 'high', // cozinha com fila → bandejas precisam sair rápido
    },
  }[type] || {};

  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Chamado"
        right={<GIconBtn dark={dark} icon={Icon.more(20)} />}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 24px' }}>
        {/* hero */}
        <div style={{
          background: tint, color: '#fff', padding: '28px 24px 32px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.85 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{meta.icon(18)}</div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                fontWeight: 700 }}>{config.title}</div>
            </div>
            {config.priority === 'high' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 100,
                background: '#fff', color: C.danger,
                fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: C.danger,
                  animation: 'gPulse 1.2s ease-in-out infinite' }} />
                Prioridade alta
              </div>
            )}
          </div>
          <div style={{ fontSize: 14, marginTop: 14, opacity: 0.85, fontWeight: 500 }}>
            {config.subtitle}
          </div>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5, marginTop: 8,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {config.bigText}
          </div>
          <div style={{ fontSize: 14, marginTop: 14, lineHeight: 1.5, opacity: 0.95 }}>
            {config.hint}
          </div>
        </div>

        {/* lembrete específico (maquininha para "pediu a conta") */}
        {config.reminder && (
          <div style={{
            margin: '14px 16px 0', padding: '12px 14px',
            borderRadius: 12, background: dark ? 'rgba(255,210,90,0.08)' : '#fff8e1',
            border: `1.5px solid ${dark ? 'rgba(255,210,90,0.4)' : '#f0d27a'}`,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: C.warn, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{Icon.creditCard ? Icon.creditCard(15) : Icon.receipt(15)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1,
                textTransform: 'uppercase', color: dark ? '#f5d57a' : '#8a6a13' }}>
                Lembrete
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 2,
                lineHeight: 1.35 }}>
                {config.reminder}
              </div>
            </div>
          </div>
        )}

        {/* contexto da mesa */}
        <div style={{ padding: '20px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700, marginBottom: 10 }}>
            Resumo da mesa
          </div>
          <div style={{ border: `1.5px solid ${C.borderSoft}`, borderRadius: 14,
            overflow: 'hidden' }}>
            {[
              ['Aberta há',     '64 min'],
              ['Itens lançados', '12'],
              ['Última ação',    'Sobremesa servida há 6 min'],
              ['Forma de pgto',  'A definir'],
            ].map(([k, v], i, a) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px',
                borderBottom: i < a.length - 1 ? `1px solid ${C.borderFaint}` : 'none',
              }}>
                <span style={{ fontSize: 13, color: C.mute }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* outros chamados ativos no salão */}
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700, marginBottom: 10 }}>
            Outros chamados (3)
          </div>
        </div>
        <CallRow dark={dark} table={18} type="chamou-garcom" sub="Cliente acionou" time="agora" urgent />
        <CallRow dark={dark} table={12} type="pronto-cozinha" sub="Risoto · Filé" time="há 1 min" />
      </div>

      {/* ações fixas */}
      <div style={{
        borderTop: `1px solid ${C.borderFaint}`,
        padding: '12px 16px 14px', display: 'flex', gap: 10,
        background: C.bg,
      }}>
        <GButton kind="secondary" dark={dark}>{config.secondary}</GButton>
        <div style={{ flex: 1 }}>
          <GButton kind="primary" dark={dark} full>{config.primary}</GButton>
        </div>
      </div>

      {showMenu && (
        <MoreSheet dark={dark} title={`Chamado · ${config.subtitle || ''}`} actions={[
          { icon: Icon.user,    label: 'Repassar para colega',    sub: 'Manda este chamado para outro garçom' },
          { icon: Icon.bell,    label: 'Avisar gerente',          sub: 'Quando precisa de ajuda imediata' },
          { icon: Icon.check,   label: 'Resolver sem ir lá',      sub: 'Cliente desistiu ou foi atendido', tone: 'danger' },
        ]} />
      )}
    </div>
  );
};

// ============================================================
// PEDIDO MANUAL — VARIAÇÃO A: GRADE DE CHIPS RÁPIDOS
// (cardápio resumido, optimizado para velocidade do garçom)
// Bottom sheet ARRASTÁVEL: o garçom puxa a comanda para cima
// para ampliar; ao passar do limite, vira tela cheia automática
// e ainda permite descer de volta puxando o handle.
// ============================================================
const ScreenOrderQuick = ({ dark = false, initialSnap = 'default' }) => {
  const C = useG(dark);

  const cart = [
    { n: 'Aperol Spritz',       q: 2, note: 'sem azeitona, com fatia de laranja',  p: 32 },
    { n: 'Risoto de camarão',   q: 1, note: 'sem cebola, ponto ao dente',           p: 78 },
    { n: 'Bruschetta caprese',  q: 1, note: null,                                   p: 28 },
    { n: 'Filé ao vinho',       q: 1, note: 'mal passado',                          p: 92 },
    { n: 'Suco de limão',       q: 1, note: 'pouco açúcar',                         p: 14 },
  ];
  const total = cart.reduce((s, x) => s + x.p * x.q, 0);
  const itemCount = cart.reduce((s, x) => s + x.q, 0);
  const fmt = (v) => v.toFixed(2).replace('.', ',');

  // ====== bottom-sheet: altura controlada pelo drag ======
  const wrapRef = React.useRef(null);
  const [frameH, setFrameH] = React.useState(812); // altura visível do app
  React.useEffect(() => {
    if (wrapRef.current) setFrameH(wrapRef.current.clientHeight);
  }, []);

  // snaps em px a partir do bottom: COLLAPSED (mostra só header + 1 item),
  // DEFAULT (mostra ~3 itens), FULL (tela cheia auto)
  const SNAP_COLLAPSED = 168;
  const SNAP_DEFAULT   = 360;
  const SNAP_FULL      = frameH;          // tela cheia auto
  const FULL_THRESHOLD = frameH * 0.82;   // >82% da tela = vira full

  const initialH = initialSnap === 'full' ? 9999
                 : initialSnap === 'collapsed' ? SNAP_COLLAPSED
                 : SNAP_DEFAULT;
  const [sheetH, setSheetH] = React.useState(initialH);
  // se initialSnap='full', re-aplica quando descobrirmos o frameH real
  React.useEffect(() => {
    if (initialSnap === 'full') setSheetH(frameH);
  }, [frameH, initialSnap]);
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef({ startY: 0, startH: 0 });

  const onPointerDown = (e) => {
    e.preventDefault();
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = { startY: y, startH: sheetH };
    setDragging(true);
  };
  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const dy = dragRef.current.startY - y; // sobe = positivo
      const next = Math.max(80, Math.min(SNAP_FULL, dragRef.current.startH + dy));
      setSheetH(next);
    };
    const onUp = () => {
      setDragging(false);
      // snap para o ponto mais próximo
      setSheetH((h) => {
        if (h >= FULL_THRESHOLD) return SNAP_FULL;
        const dC = Math.abs(h - SNAP_COLLAPSED);
        const dD = Math.abs(h - SNAP_DEFAULT);
        const dF = Math.abs(h - SNAP_FULL);
        const min = Math.min(dC, dD, dF);
        if (min === dC) return SNAP_COLLAPSED;
        if (min === dD) return SNAP_DEFAULT;
        return SNAP_FULL;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, FULL_THRESHOLD, SNAP_COLLAPSED, SNAP_DEFAULT, SNAP_FULL]);

  const isFull = sheetH >= FULL_THRESHOLD;
  const showItems = sheetH > SNAP_COLLAPSED + 20; // some no estado mais colapsado

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column', position: 'relative',
      overflow: 'hidden' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Novo pedido"
        sub="MESA 12 · LANÇAMENTO RÁPIDO"
        right={<GIconBtn dark={dark} icon={Icon.search(20)} />}
      />

      {/* tabs categorias */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px',
        overflowX: 'auto', borderBottom: `1px solid ${C.borderFaint}` }}>
        {['Bar', 'Entradas', 'Massas', 'Grelha', 'Sobremesas'].map((t, i) => (
          <div key={t} style={{
            padding: '8px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600,
            background: i === 0 ? C.ink : 'transparent',
            color: i === 0 ? C.bg : C.ink,
            border: i === 0 ? 'none' : `1.2px solid ${C.borderSoft}`,
            flexShrink: 0,
          }}>{t}</div>
        ))}
      </div>

      {/* MENU — área de adicionar itens (atrás do sheet) */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px',
        paddingBottom: sheetH + 16 // reserva espaço para o sheet
      }}>
        <div style={{ fontSize: 11, color: C.mute, letterSpacing: 1.5,
          textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
          Bar · 6 itens
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {G_MENU.find(c => c.cat === 'Bar').items.map(it => (
            <div key={it.id} style={{
              border: `1.5px solid ${C.borderSoft}`, borderRadius: 14,
              padding: 12, position: 'relative', minHeight: 90,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, letterSpacing: -0.2 }}>
                {it.n}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  R$ {it.p.toFixed(2).replace('.', ',')}
                </span>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, background: C.ink, color: C.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{Icon.plus(18)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 14 }} />

        <div style={{ fontSize: 11, color: C.mute, letterSpacing: 1.5,
          textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
          Mais pedidos · favoritos do salão
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Couvert (4×)', 'Pão alho', 'Água sem gás', 'Café espresso', 'Caipirinha de limão'].map(t => (
            <div key={t} style={{
              padding: '8px 14px', borderRadius: 100,
              border: `1.2px solid ${C.borderSoft}`,
              fontSize: 13, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: C.mute }}>{Icon.plus(14)}</span>{t}
            </div>
          ))}
        </div>
      </div>

      {/* SCRIM — escurece o menu quando o sheet está em tela cheia */}
      {isFull && (
        <div style={{
          position: 'absolute', inset: 0,
          background: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.18)',
          pointerEvents: 'none',
          transition: dragging ? 'none' : 'opacity 0.2s',
        }} />
      )}

      {/* BOTTOM SHEET — comanda arrastável */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: sheetH,
        background: C.surface,
        borderTop: `1.5px solid ${C.ink}`,
        borderTopLeftRadius: isFull ? 0 : 18,
        borderTopRightRadius: isFull ? 0 : 18,
        boxShadow: dark
          ? '0 -10px 30px rgba(0,0,0,0.4)'
          : '0 -10px 30px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column',
        transition: dragging ? 'none' : 'height 0.22s cubic-bezier(0.32,0.72,0,1), border-radius 0.22s',
        zIndex: 20,
        overflow: 'hidden',
      }}>
        {/* HANDLE — área de arraste com barrinha */}
        <div
          onMouseDown={onPointerDown}
          onTouchStart={onPointerDown}
          style={{
            cursor: dragging ? 'grabbing' : 'grab',
            padding: '8px 0 6px',
            touchAction: 'none',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 40, height: 5, margin: '0 auto',
            borderRadius: 99,
            background: dragging ? C.ink : (dark ? '#555' : '#cfcfcf'),
            transition: 'background 0.15s',
          }} />
        </div>

        {/* HEADER da comanda */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '4px 16px 10px',
          borderBottom: showItems ? `1px solid ${C.borderFaint}` : 'none',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
              textTransform: 'uppercase', color: C.mute }}>
              Comanda · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
            </div>
            <div style={{
              fontSize: isFull ? 26 : 22,
              fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              letterSpacing: -0.5, marginTop: 2,
              transition: 'font-size 0.2s',
            }}>
              R$ {fmt(total)}
            </div>
          </div>
          <button
            onClick={() => setSheetH(isFull ? SNAP_DEFAULT : SNAP_FULL)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 100,
              border: `1.5px solid ${C.ink}`,
              background: C.bg, color: C.ink, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
              fontFamily: G_FONT,
            }}
          >
            {isFull ? Icon.collapse(15) : Icon.expand(15)}
            {isFull ? 'Reduzir' : 'Tela cheia'}
          </button>
        </div>

        {/* LISTA de itens — visível conforme o sheet abre */}
        {showItems && (
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '8px 16px 12px',
            WebkitOverflowScrolling: 'touch',
          }}>
            {cart.map((it, i) => {
              // tamanhos crescem em tela cheia
              const qSize  = isFull ? 50 : 38;
              const fsName = isFull ? 17 : 14;
              const fsNote = isFull ? 13 : 12;
              const fsPrice = isFull ? 16 : 13;
              const padY = isFull ? 14 : 10;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: `${padY}px 14px`, marginBottom: 8,
                  background: C.bg, borderRadius: 12,
                  border: `${isFull ? 2 : 1.5}px solid ${isFull ? C.ink : C.borderSoft}`,
                  transition: 'padding 0.2s, border-color 0.2s',
                }}>
                  <div style={{
                    minWidth: qSize, height: qSize, borderRadius: 10,
                    background: C.ink, color: C.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isFull ? 20 : 15, fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'all 0.2s',
                  }}>
                    {it.q}×
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: fsName, fontWeight: 700, color: C.ink,
                      letterSpacing: -0.2, lineHeight: 1.2,
                      transition: 'font-size 0.2s' }}>
                      {it.n}
                    </div>
                    {it.note && (
                      <div style={{ fontSize: fsNote, color: C.mute, marginTop: 3,
                        fontStyle: 'italic', lineHeight: 1.3,
                        whiteSpace: isFull ? 'normal' : 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        “{it.note}”
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: fsPrice, fontWeight: 700, color: C.ink,
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    transition: 'font-size 0.2s' }}>
                    R$ {fmt(it.p * it.q)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* dois botões: voltar (adicionar mais) + enviar */}
        <div style={{
          display: 'flex', gap: 10,
          padding: showItems ? '10px 16px 14px' : '10px 16px 14px',
          borderTop: showItems ? `1px solid ${C.borderFaint}` : 'none',
          flexShrink: 0,
        }}>
          <div style={{ flex: '0 0 auto' }}>
            <button style={{
              padding: '14px 18px', borderRadius: 12,
              border: `1.5px solid ${C.ink}`, background: C.bg, color: C.ink,
              fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
              fontFamily: G_FONT, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {Icon.back(16)} Adicionar mais
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <GButton kind="primary" dark={dark} full icon={Icon.arrow(18)}>
              Enviar para cozinha
            </GButton>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// (FullCartOverlay foi substituído pelo bottom-sheet arrastável
//  dentro do ScreenOrderQuick — mantido só como referência morta.)
// ============================================================
const _UNUSED_FullCartOverlay = ({ dark, cart, total, itemCount, onClose }) => {
  const C = useG(dark);
  const fmt = (v) => v.toFixed(2).replace('.', ',');
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: C.bg, color: C.ink,
      display: 'flex', flexDirection: 'column',
      fontFamily: G_FONT, zIndex: 50,
      animation: 'gFadeIn 0.18s ease-out',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${C.borderFaint}`,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
            textTransform: 'uppercase', color: C.mute }}>
            Mesa 12 · Comanda nova
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 40, height: 40, borderRadius: 12,
          border: `1.5px solid ${C.ink}`, background: C.bg, color: C.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>{Icon.collapse(20)}</button>
      </div>

      {/* lista grande */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
        {cart.map((it, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '16px 16px', marginBottom: 10,
            border: `2px solid ${C.ink}`, borderRadius: 14,
            background: C.bg,
          }}>
            <div style={{
              minWidth: 52, height: 52, borderRadius: 12,
              background: C.ink, color: C.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}>{it.q}×</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline', gap: 8,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.ink,
                  letterSpacing: -0.3, lineHeight: 1.15 }}>
                  {it.n}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.ink,
                  fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  R$ {fmt(it.p * it.q)}
                </div>
              </div>
              {it.note && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 8,
                  background: dark ? 'rgba(240,200,80,0.12)' : '#fff7d6',
                  border: `1px solid ${dark ? 'rgba(240,200,80,0.4)' : '#e8c84a'}`,
                  fontSize: 14, color: dark ? '#f0d27a' : '#5a4500',
                  fontWeight: 500, lineHeight: 1.35,
                }}>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase',
                    fontSize: 10, letterSpacing: 1, opacity: 0.8, marginRight: 6 }}>
                    Obs
                  </span>
                  {it.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* footer com total + ações */}
      <div style={{
        borderTop: `1.5px solid ${C.ink}`, background: C.surface,
        padding: '14px 16px 16px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
            textTransform: 'uppercase', color: C.mute }}>
            Total
          </span>
          <span style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            letterSpacing: -0.8 }}>
            R$ {fmt(total)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: '0 0 auto' }}>
            <button onClick={onClose} style={{
              padding: '14px 18px', borderRadius: 12,
              border: `1.5px solid ${C.ink}`, background: C.bg, color: C.ink,
              fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
              fontFamily: G_FONT, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {Icon.back(16)} Adicionar mais
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <GButton kind="primary" dark={dark} full icon={Icon.arrow(18)}>
              Enviar para cozinha
            </GButton>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PEDIDO MANUAL — VARIAÇÃO B: BUSCA + LISTA (estilo POS)
// ============================================================
const ScreenOrderSearch = ({ dark = false }) => {
  const C = useG(dark);
  const total = 156;
  const itemsInCart = [
    { n: 'Risoto camarão', q: 1, p: 78 },
    { n: 'Salmão grelhado', q: 1, p: 86 },
  ];
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Mesa 7 · Lançar"
        right={<div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>2</div>}
      />

      {/* search */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', borderRadius: 14,
          background: C.surface, border: `1.5px solid ${C.ink}`,
          color: C.ink,
        }}>
          {Icon.search(18)}
          <span style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>risoto</span>
          <span style={{
            display: 'inline-block', width: 1.5, height: 18,
            background: C.ink, animation: 'gBlink 1s infinite',
          }} />
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: C.mute }}>3 resultados</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* resultados */}
        {[
          { n: 'Risoto de camarão', cat: 'Massas', p: 78, hint: 'sem cebola, sem alho' },
          { n: 'Risoto de funghi', cat: 'Massas', p: 72, hint: null },
          { n: 'Risoto de aspargos', cat: 'Massas', p: 68, hint: 'sazonal' },
        ].map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', borderBottom: `1px solid ${C.borderFaint}`,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: C.surface,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.mute,
            }}>{Icon.fork(20)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>
                <span dangerouslySetInnerHTML={{ __html: r.n.replace(/(risoto)/i, `<mark style="background:${C.ink};color:${C.bg};padding:0 3px;border-radius:3px">$1</mark>`) }} />
              </div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                {r.cat} · R$ {r.p.toFixed(2).replace('.', ',')}
                {r.hint && ` · ${r.hint}`}
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              border: `1.5px solid ${C.ink}`, color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{Icon.plus(16)}</div>
          </div>
        ))}

        {/* sugestões inteligentes */}
        <div style={{ padding: '18px 16px 8px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Costumam vir junto
        </div>
        <div style={{ padding: '0 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Taça vinho branco', 'Bruschetta caprese', 'Água com gás'].map(t => (
            <div key={t} style={{
              padding: '8px 14px', borderRadius: 100,
              border: `1.2px solid ${C.borderSoft}`, fontSize: 13,
              fontWeight: 500,
            }}>+ {t}</div>
          ))}
        </div>
      </div>

      {/* bottom — itens no carrinho + total */}
      <div style={{
        borderTop: `1px solid ${C.borderFaint}`,
        background: C.bg, padding: '12px 16px 14px',
      }}>
        {itemsInCart.map((it, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', padding: '4px 0',
            fontSize: 13,
          }}>
            <span><span style={{ fontWeight: 700 }}>{it.q}×</span> {it.n}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              R$ {it.p.toFixed(2).replace('.', ',')}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.borderFaint}`,
          fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          <span>Total</span>
          <span>R$ {total.toFixed(2).replace('.', ',')}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <GButton kind="primary" dark={dark} full>Enviar 2 itens</GButton>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PEDIDO MANUAL — VARIAÇÃO C: ITEM EM DETALHE (modificadores)
// ============================================================
const ScreenOrderItem = ({ dark = false }) => {
  const C = useG(dark);
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Filé ao vinho"
        sub="MESA 12 · ITEM"
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* placeholder de imagem */}
        <div style={{
          margin: '14px 16px', height: 140, borderRadius: 14,
          background: C.surface, border: `1.2px solid ${C.borderFaint}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.faint, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
        }}>FOTO DO PRATO</div>

        <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6 }}>Filé ao vinho</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              R$ 92,00
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.5 }}>
            Filé mignon ao molho de vinho tinto, batatas rústicas e brócolis grelhado.
          </div>
        </div>

        {/* Quantidade */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700, marginBottom: 10 }}>
            Quantidade
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, color: C.ink,
              border: `1.5px solid ${C.ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{Icon.minus(20)}</div>
            <div style={{ fontSize: 28, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>
              2
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 22, background: C.ink, color: C.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{Icon.plus(20)}</div>
          </div>
        </div>

        {/* ponto da carne */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700, marginBottom: 10 }}>
            Ponto da carne · obrigatório
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Mal passado', 'Ao ponto p/ menos', 'Ao ponto', 'Ao ponto p/ mais', 'Bem passado'].map((t, i) => (
              <div key={t} style={{
                padding: '10px 14px', borderRadius: 100,
                border: `1.5px solid ${i === 2 ? C.ink : C.borderSoft}`,
                background: i === 2 ? C.ink : 'transparent',
                color: i === 2 ? C.bg : C.ink,
                fontSize: 13, fontWeight: 600,
              }}>{t}</div>
            ))}
          </div>
        </div>

        {/* extras */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700, marginBottom: 10 }}>
            Extras
          </div>
          {[
            { n: 'Molho extra', p: 0, sel: true },
            { n: 'Ovo frito',   p: 6,  sel: false },
            { n: 'Bacon',       p: 8,  sel: false },
          ].map((x, i, a) => (
            <div key={x.n} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
              borderBottom: i < a.length - 1 ? `1px solid ${C.borderFaint}` : 'none',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                border: `1.5px solid ${x.sel ? C.ink : C.borderSoft}`,
                background: x.sel ? C.ink : 'transparent',
                color: C.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{x.sel && Icon.check(14)}</div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{x.n}</div>
              <div style={{ fontSize: 13, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>
                {x.p === 0 ? '—' : `+ R$ ${x.p},00`}
              </div>
            </div>
          ))}
        </div>

        {/* observação */}
        <div style={{ padding: '20px 16px 24px' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700, marginBottom: 10 }}>
            Observação para a cozinha
          </div>
          <div style={{
            border: `1.2px solid ${C.borderSoft}`, borderRadius: 12,
            padding: '12px 14px', fontSize: 14, color: C.ink, minHeight: 64,
          }}>
            Cliente é alérgico a alho. Atenção redobrada.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {['Sem cebola', 'Sem glúten', 'Trocar batata por salada', 'Tirar molho'].map(t => (
              <div key={t} style={{
                padding: '6px 12px', borderRadius: 100,
                border: `1px solid ${C.borderSoft}`, color: C.mute,
                fontSize: 12, fontWeight: 500,
              }}>+ {t}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        borderTop: `1px solid ${C.borderFaint}`,
        padding: '12px 16px 14px', display: 'flex', gap: 10,
        background: C.bg,
      }}>
        <GButton kind="secondary" dark={dark}>Cancelar</GButton>
        <div style={{ flex: 1 }}>
          <GButton kind="primary" dark={dark} full>
            Adicionar · R$ 184,00
          </GButton>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// HISTÓRICO DO TURNO / FECHAMENTO
// ============================================================
const ScreenShift = ({ dark = false }) => {
  const C = useG(dark);
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Meu turno"
        sub="03 MAI · 18H–02H"
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {/* big numbers */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{
            background: C.ink, color: C.bg, borderRadius: 16, padding: 18,
          }}>
            <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1.5,
              textTransform: 'uppercase' }}>Faturado por mim</div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.2,
              fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
              R$ 2.487,30
            </div>
            <div style={{
              display: 'flex', gap: 22, marginTop: 18,
              borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 14,
            }}>
              {[
                ['Mesas', '11'],
                ['Pedidos', '34'],
                ['Tempo méd.', '6m'],
                ['Gorjeta', 'R$ 248'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 1, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2,
                    fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* timeline */}
        <div style={{ padding: '8px 16px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Linha do tempo
        </div>
        {[
          { t: '21:34', e: 'Lançou pedido', d: 'Mesa 12 · 4 itens · R$ 287,50' },
          { t: '21:18', e: 'Fechou conta', d: 'Mesa 9 · R$ 198,00 · cartão' },
          { t: '20:56', e: 'Atendeu chamado', d: 'Mesa 14 · cliente queria mais pão' },
          { t: '20:42', e: 'Lançou pedido', d: 'Mesa 7 · 6 itens · R$ 412,00' },
          { t: '20:18', e: 'Mesa aberta',  d: 'Mesa 18 · 4 pessoas' },
          { t: '19:55', e: 'Fechou conta', d: 'Mesa 4 · R$ 156,00 · pix' },
        ].map((row, i, a) => (
          <div key={i} style={{
            display: 'flex', gap: 14, padding: '12px 16px',
            borderBottom: i < a.length - 1 ? `1px solid ${C.borderFaint}` : 'none',
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: C.mute,
              fontVariantNumeric: 'tabular-nums', minWidth: 40, paddingTop: 1,
            }}>{row.t}</div>
            <div style={{ position: 'relative', minWidth: 12 }}>
              <span style={{
                position: 'absolute', top: 4, left: 4, width: 8, height: 8,
                borderRadius: 4, background: C.ink,
              }} />
              {i < a.length - 1 && (
                <span style={{
                  position: 'absolute', top: 12, left: 7, bottom: -12, width: 1.5,
                  background: C.borderFaint,
                }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.2 }}>{row.e}</div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{row.d}</div>
            </div>
          </div>
        ))}
      </div>

      <GBottomNav active="shift" dark={dark} />
    </div>
  );
};

// ============================================================
// PERFIL / CONFIGURAÇÕES
// ============================================================
const ScreenProfile = ({ dark = false }) => {
  const C = useG(dark);
  const Row = ({ icon, label, value, badge, sub, danger, last }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px',
      borderBottom: last ? 'none' : `1px solid ${C.borderFaint}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: danger ? C.dangerBg : C.surface,
        color: danger ? C.danger : C.mute,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: danger ? C.danger : C.ink }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
          background: '#C43A3A', color: '#fff',
          fontSize: 10.5, fontWeight: 800, letterSpacing: 0.2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>{badge}</span>
      )}
      {value && (
        <div style={{ fontSize: 13, color: C.mute }}>{value}</div>
      )}
      {!danger && (
        <span style={{ color: C.faint }}>›</span>
      )}
    </div>
  );

  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Perfil"
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {/* perfil header */}
        <div style={{ padding: '24px 16px 20px', textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 40, margin: '0 auto',
            background: C.ink, color: C.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, letterSpacing: -0.5,
          }}>MC</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, marginTop: 12 }}>
            Mariana Costa
          </div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>
            Garçonete · Trattoria Luna
          </div>
          <div style={{
            display: 'inline-flex', gap: 8, marginTop: 12,
            padding: '6px 12px', borderRadius: 100,
            background: C.successBg, color: C.success,
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 4, background: 'currentColor',
              animation: 'gPulse 1.4s infinite',
            }} />
            Em turno · 03h 12m
          </div>
        </div>

        {/* sections */}

        {/* ★ V11 · 2026-05 ★ MENSAGENS · 1º bloco após hero · interruptivo
            Subiu de OPERAÇÃO (que sumiu — só tinha esse item) pra cá.
            Badge de não-lidas tem que estar visível na hora da abertura. */}
        <div style={{ padding: '8px 16px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Mensagens
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.borderFaint}`,
          margin: '0 16px', borderRadius: 14, overflow: 'hidden' }}>
          <Row icon={Icon.chat(18)} label="Mensagens" sub="Histórico · 1 não-lida" badge={1} last />
        </div>

        <div style={{ padding: '20px 16px 8px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Notificações
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.borderFaint}`,
          margin: '0 16px', borderRadius: 14, overflow: 'hidden' }}>
          <Row icon={Icon.bell(18)} label="Som de chamado" value="Sino curto" />
          <Row icon={Icon.flame(18)} label="Vibrar em atrasos" value="Forte" />
          <Row icon={Icon.glass(18)} label="Avisar bar pronto" value="Sempre" last />
        </div>

        <div style={{ padding: '20px 16px 8px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Preferências
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.borderFaint}`,
          margin: '0 16px', borderRadius: 14, overflow: 'hidden' }}>
          <Row icon={Icon.table(18)} label="Setor padrão" value="Todos" />
          <Row icon={Icon.settings(18)} label="Tema" value={dark ? 'Escuro' : 'Claro'} />
          <Row icon={Icon.user(18)} label="Editar PIN" last />
        </div>

        <div style={{ padding: '20px 16px 8px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Sessão
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.borderFaint}`,
          margin: '0 16px 20px', borderRadius: 14, overflow: 'hidden' }}>
          <Row icon={Icon.clock(18)} label="Encerrar turno" />
          <Row icon={Icon.back(18)} label="Sair da conta" danger last />
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: C.faint, padding: 16 }}>
          Trattoria Luna · v 2.4.1
        </div>
      </div>

      <GBottomNav active="me" dark={dark} />
    </div>
  );
};

// ============================================================
// CHOOSER DE NOVA INTERAÇÃO — modal aberto pela aba "Novo"
// ============================================================
// V4 (2026-05): a aba "Novo" do GBottomNav não vai mais direto pro
// scanner. Abre essa tela intermediária com 2 caminhos: escanear o
// QR (primário · ink filled) ou pegar a mesa pelo número (secundário ·
// outline). Footer discreto pro caso raro de QR ilegível.
//
// Por que: o scanner é o fluxo principal mas tinha 2 problemas como
// landing — (1) câmera demora a abrir e o garçom já sente atrito;
// (2) pra mesas que ele JÁ atende, escanear é desnecessário (basta
// o número). Esse chooser dá 1 segundo a mais de cognição mas
// elimina ~30% das vezes que o garçom abria o scanner pra usar o
// "Inserir manualmente".
//
// Acessível também via FAB opcional do ScreenHomeGrid.
const ScreenWaiterNewEntry = ({ dark = false }) => {
  const C = useG(dark);
  return (
    <div style={{
      width: '100%', height: '100%', background: C.surface, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* Header minimal · X esquerda · título mono caps central ─ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '54px 16px 12px',
      }}>
        <button aria-label="Fechar" style={{
          all: 'unset', cursor: 'pointer',
          width: 40, height: 40, borderRadius: 20,
          background: C.bg, border: `1px solid ${C.borderSoft}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.ink,
        }}>{Icon.x(18)}</button>
        <div style={{
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          fontWeight: 700, color: C.faint,
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}>Nova interação</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Hero · pergunta + sub ──────────────────────────────── */}
      <div style={{ padding: '24px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: C.ink, lineHeight: 1.2 }}>
          Como vai começar?
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 8, lineHeight: 1.5, fontWeight: 500 }}>
          Toda nova ação na mesa começa lendo o QR ou inserindo o número.
        </div>
      </div>

      {/* 2 cards-botão grandes · stacked · gap 12 ──────────── */}
      <div style={{ flex: 1, padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Card 1 · Escanear QR · primário ink filled */}
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '20px 18px', borderRadius: 16,
          background: C.ink, color: '#fff',
          display: 'flex', alignItems: 'center', gap: 16,
          minHeight: 96,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'rgba(255,255,255,0.10)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{Icon.qr(40)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>Escanear QR da mesa</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: 4, lineHeight: 1.4 }}>
              Câmera abre, posiciona o QR · ação principal
            </div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>{Icon.arrow(18)}</span>
        </button>

        {/* Card 2 · Inserir número · secundário outline */}
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '20px 18px', borderRadius: 16,
          background: C.bg, color: C.ink,
          border: `1.5px solid ${C.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 16,
          minHeight: 96,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: C.surface, color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {/* keypad simple inline · 9 dots */}
            <svg width={36} height={36} viewBox="0 0 36 36" fill="none">
              <rect x="6" y="3" width="24" height="30" rx="3" stroke="currentColor" strokeWidth="2" />
              {[
                [10, 9], [18, 9], [26, 9],
                [10, 17], [18, 17], [26, 17],
                [10, 25], [18, 25], [26, 25],
              ].map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="1.6" fill="currentColor" />
              ))}
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>Pegar mesa pelo número</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.mute, marginTop: 4, lineHeight: 1.4 }}>
              Lista de mesas que você atende + livres
            </div>
          </div>
          <span style={{ color: C.faint, flexShrink: 0 }}>{Icon.arrow(18)}</span>
        </button>
      </div>

      {/* Footer · escape route discreto ──────────────────── */}
      <div style={{ padding: '20px 16px 32px', textAlign: 'center' }}>
        <button style={{
          all: 'unset', cursor: 'pointer',
          fontSize: 11, color: C.faint, fontWeight: 700,
          letterSpacing: 0.7, textTransform: 'uppercase',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          textDecoration: 'underline', textUnderlineOffset: 4,
        }}>O QR da mesa tá ilegível? Contactar gerente</button>
      </div>
    </div>
  );
};

// ============================================================
// SCANNER QR DA MESA — abre do chooser (V4) ou direto via FAB
// ============================================================
// V4 (2026-05): não é mais a entrada da aba "Novo" — quem chega aqui
// já fez a escolha "Escanear QR" no ScreenWaiterNewEntry. Por isso
// "Inserir manualmente" foi reduzido a text link discreto no rodapé
// (fallback raro · QR ilegível, câmera com problema). Quem prefere
// número usa direto a 2ª opção do chooser sem passar pelo scanner.
const ScreenWaiterScanQr = ({ dark = false }) => {
  // Fundo SEMPRE escuro (visualizador de câmera) — não respeita tema
  const bg = '#0a0a0a';
  const C = useG(dark);

  return (
    <div style={{ width: '100%', height: '100%', background: bg, color: '#fff',
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Topbar com botão fechar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '54px 16px 12px',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 20,
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
        }}>{Icon.x(18)}</div>
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Câmera</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Título e subtítulo */}
      <div style={{ padding: '0 24px 18px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginTop: 18 }}>
          Escaneie a mesa
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.4 }}>
          Posicione o QR code da mesa dentro da moldura para começar o atendimento.
        </div>
      </div>

      {/* Viewfinder — moldura central */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative' }}>
        <div style={{
          position: 'relative', width: 240, height: 240,
        }}>
          {/* 4 cantos brancos */}
          {[
            { top: 0, left: 0, borderTop: '3px solid #fff', borderLeft: '3px solid #fff', borderTopLeftRadius: 14 },
            { top: 0, right: 0, borderTop: '3px solid #fff', borderRight: '3px solid #fff', borderTopRightRadius: 14 },
            { bottom: 0, left: 0, borderBottom: '3px solid #fff', borderLeft: '3px solid #fff', borderBottomLeftRadius: 14 },
            { bottom: 0, right: 0, borderBottom: '3px solid #fff', borderRight: '3px solid #fff', borderBottomRightRadius: 14 },
          ].map((s, i) => (
            <span key={i} style={{ position: 'absolute', width: 36, height: 36, ...s }} />
          ))}
          {/* Linha de scan animada */}
          <div style={{
            position: 'absolute', left: 8, right: 8, top: '50%',
            height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
            boxShadow: '0 0 14px rgba(255,255,255,0.6)',
            animation: 'gPulse 1.6s infinite ease-in-out',
          }} />
        </div>
      </div>

      {/* Footer · "Inserir manualmente" reduzido a text link (V4) */}
      <div style={{ padding: '8px 16px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}>QR ilegível?</div>
        <button style={{
          all: 'unset', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
          letterSpacing: -0.1,
          textDecoration: 'underline', textUnderlineOffset: 4,
        }}>Inserir número da mesa</button>
      </div>
    </div>
  );
};

// ============================================================
// ESCOLHER MESA — fallback manual quando garçom prefere não escanear
// ============================================================
// Acessada via "Inserir manualmente" no scanner, ou via shortcut na home.
// Lista mesas que o garçom JÁ atende (priorizadas) + mesas LIVRES disponíveis
// para iniciar atendimento. Mostra capacidade de cada mesa.
const ScreenWaiterTablePicker = ({ dark = false }) => {
  const C = useG(dark);
  const myTables  = G_TABLES.filter(t => t.occupied > 0).slice(0, 4);
  const available = G_TABLES.filter(t => t.occupied === 0).slice(0, 4);

  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>

      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Escolher mesa"
        sub="CABRAL · TURNO 18H–02H"
        right={<GIconBtn dark={dark} icon={Icon.search(20)} />}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0 80px' }}>
        {/* SEÇÃO · ATENDENDO ATUALMENTE */}
        <div style={{ padding: '14px 16px 8px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.ink, fontWeight: 700 }}>
          Atendendo atualmente
        </div>
        {myTables.map(t => (
          <TableRow key={t.num} dark={dark} table={t} mine />
        ))}

        {/* SEÇÃO · DISPONÍVEIS */}
        <div style={{ padding: '20px 16px 8px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Disponíveis
        </div>
        {available.map(t => (
          <TableRow key={t.num} dark={dark} table={t} />
        ))}
        {available.length === 0 && (
          <div style={{ padding: '24px 16px', color: C.mute, fontSize: 13, textAlign: 'center' }}>
            Nenhuma mesa livre no momento.
          </div>
        )}
      </div>

      <GBottomNav active="home" dark={dark} />
    </div>
  );
};

// linha pra picker (sem usar o card grande do home)
const TableRow = ({ table, dark, mine }) => {
  const C = useG(dark);
  const seats = table.seats || 4;
  const occupied = table.occupied || 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px', borderBottom: `1px solid ${C.borderFaint}`,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: mine ? C.ink : (dark ? '#1f1f1f' : '#f3f3f3'),
        color: mine ? C.bg : C.ink,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase',
          fontWeight: 600, opacity: 0.7 }}>Mesa</div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1 }}>
          {String(table.num).padStart(2,'0')}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
          Mesa {String(table.num).padStart(2,'0')} · {occupied || seats} pessoa{(occupied || seats) > 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
          {mine
            ? (occupied > 0 ? `${occupied} ocupando · ${seats - occupied} livre(s)` : `Ocupada · ${occupied}/${seats}`)
            : `Capacidade ${seats} · livre`}
        </div>
      </div>
      <span style={{ flexShrink: 0, color: C.mute }}>{Icon.arrow(14)}</span>
    </div>
  );
};

// ============================================================
// CONFIRMAR ENTREGA — após retirar pedido pronto da cozinha/bar
// ============================================================
// Quando o garçom toca "Vou servir" em ScreenCallDetail (pronto-cozinha),
// e leva a bandeja pra mesa, ESTE é o handshake final: confirmar com o
// cliente que o pedido foi entregue. Fecha o ciclo de pedido em "servido"
// no KDS e libera o card do chamado da fila do garçom.
const ScreenWaiterDeliveryConfirm = ({ dark = false }) => {
  const C = useG(dark);
  const items = [
    { q: 1, n: 'Risoto de camarão',     note: null },
    { q: 1, n: 'Filé ao vinho',         note: 'sem cogumelos' },
    { q: 2, n: 'Suco de laranja 300ml', note: null },
  ];

  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, color: C.ink,
      fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        title="Entrega"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 24px' }}>
        {/* Hero verde */}
        <div style={{
          background: C.success, color: '#fff', padding: '28px 24px 32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{Icon.check(18)}</div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
              fontWeight: 700 }}>Pedido pronto</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.6, marginTop: 18, lineHeight: 1 }}>
            Pedido entregue
          </div>
          <div style={{ fontSize: 14, marginTop: 8, opacity: 0.92 }}>
            Mesa 12 · há 32 minutos
          </div>
          <div style={{ fontSize: 13, marginTop: 14, opacity: 0.85, lineHeight: 1.5 }}>
            Confirme com os seus clientes se está tudo certo antes de marcar como entregue.
          </div>
        </div>

        {/* Lista de itens */}
        <div style={{ padding: '20px 16px 6px',
          fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
          color: C.mute, fontWeight: 700 }}>
          Itens da bandeja
        </div>
        {items.map((it, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '12px 16px', borderBottom: `1px solid ${C.borderFaint}`,
          }}>
            <div style={{
              minWidth: 30, height: 30, borderRadius: 8, padding: '0 8px',
              background: C.surface, color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
            }}>{it.q}×</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{it.n}</div>
              {it.note && (
                <div style={{ fontSize: 12, color: C.mute, marginTop: 2,
                  fontStyle: 'italic' }}>↳ {it.note}</div>
              )}
            </div>
          </div>
        ))}

        {/* Lembrete */}
        <div style={{
          margin: '18px 16px 0', padding: '14px 16px',
          background: C.warn + (dark ? '22' : '14'),
          border: `1px solid ${C.warn}33`,
          borderRadius: 14,
          display: 'flex', gap: 10,
        }}>
          <span style={{ color: C.warn, fontSize: 18, lineHeight: 1, marginTop: 1 }}>!</span>
          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>
            Se o cliente apontar item errado ou faltando, toque <b>Cancelar</b> e abra
            <b> chamado para a cozinha</b> antes de sair da mesa.
          </div>
        </div>
      </div>

      {/* Ações fixas no rodapé */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 16px 18px',
        borderTop: `1px solid ${C.borderFaint}`, background: C.bg,
      }}>
        <button style={{
          flex: 1, height: 52, borderRadius: 14, border: `1px solid ${C.border}`,
          background: 'transparent', color: C.ink,
          fontSize: 15, fontWeight: 600, fontFamily: G_FONT,
        }}>Cancelar</button>
        <button style={{
          flex: 2, height: 52, borderRadius: 14, border: 'none',
          background: C.ink, color: C.bg,
          fontSize: 15, fontWeight: 700, fontFamily: G_FONT, letterSpacing: -0.2,
        }}>Confirmar entrega</button>
      </div>
    </div>
  );
};

// ============================================================
// CHAMADOS · aba Chamados do garçom (★ V9 · refatorado V10 ★)
// ────────────────────────────────────────────────────────────
// Lista unificada de chamados que o garçom recebe — chamados
// de mesa (tipos clássicos: chamou-garcom, pediu-conta,
// pronto-cozinha, pronto-bar) + tipo `manager-message`,
// mensagem direta da gerente (V9). Item manager-message tem
// styling distinto (ink em fundo branco · ícone chat balloon)
// pra não competir com cores semânticas dos call-types.
//
// V10 · Tap abre ScreenStaffMessageThread (deep-link via
// senderId · não mais o ScreenStaffMessageDetail isolado).
// Push lockscreen `manager-message` segue o mesmo handler.
// ============================================================
const ScreenWaiterCalls = ({ dark = false, onTo = () => {} }) => {
  const C = useG(dark);

  const items = [
    {
      id: 'mm-1', kind: 'manager-message',
      from: 'Renata · gerente', ts: 'agora',
      preview: 'Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o Henrique.',
      unread: true,
    },
    {
      id: 'c-1', kind: 'call-table', tone: 'danger',
      mesa: 18, label: 'CHAMOU GARÇOM',
      preview: '4 pessoas · cliente acionou o botão',
      ts: '2 min', actions: ['Vou agora', 'Adiar'],
    },
    {
      id: 'c-2', kind: 'call-kitchen', tone: 'success',
      mesa: 12, label: 'PRONTO · COZINHA',
      preview: 'Risoto de camarão, Filé ao vinho',
      ts: '3 min', actions: ['Vou servir'],
    },
    {
      id: 'c-3', kind: 'call-bill', tone: 'info',
      mesa: 3, label: 'PEDIU A CONTA',
      preview: 'R$ 612,40 · 5 pessoas',
      ts: '5 min', actions: ['Levar maquininha'],
    },
  ];

  const Topbar = () => (
    <div style={{
      padding: '14px 16px 10px',
      background: C.bg, borderBottom: `1px solid ${C.borderFaint}`,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.faint,
        letterSpacing: 0.7, textTransform: 'uppercase',
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
      }}>Chamados</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: -0.4 }}>
          {items.length}<span style={{ color: C.faint, fontWeight: 600, fontSize: 16, marginLeft: 4 }}>ativos</span>
        </div>
        <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>Suas mesas · 7</div>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', background: C.bg, fontFamily: G_FONT, color: C.ink, display: 'flex', flexDirection: 'column' }}>
      <Topbar />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => {
            if (it.kind === 'manager-message') {
              return (
                <button key={it.id} onClick={() => onTo('staff-message-thread')} style={{
                  all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                  width: '100%',
                  padding: '12px 14px', borderRadius: 14,
                  border: `1px solid ${C.border}`,
                  background: '#FFFFFF',
                  display: 'flex', gap: 12, position: 'relative',
                }}>
                  {it.unread && (
                    <span aria-hidden style={{
                      position: 'absolute', top: 12, right: 14,
                      width: 8, height: 8, borderRadius: '50%', background: C.ink,
                    }} />
                  )}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: C.ink, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{Icon.chat(18)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 9.5, fontWeight: 800, color: C.ink, letterSpacing: 0.7,
                      textTransform: 'uppercase',
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    }}>MENSAGEM DA GERENTE · {it.ts}</div>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.15, marginTop: 2,
                    }}>{it.from}</div>
                    <div style={{
                      fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.4, marginTop: 4,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>{it.preview}</div>
                  </div>
                </button>
              );
            }
            // chamados de mesa · tone-based
            const tint = it.tone === 'danger' ? '#C43A3A'
                      : it.tone === 'success' ? '#2F7D4F'
                      : '#0a84ff';
            const tintBg = it.tone === 'danger' ? '#FFF1F1'
                        : it.tone === 'success' ? '#EFF7F1'
                        : '#EDF4FF';
            return (
              <button key={it.id} onClick={() => onTo('chamado')} style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: '100%',
                padding: '12px 14px', borderRadius: 14,
                border: `1px solid ${C.borderFaint}`,
                borderLeft: `3px solid ${tint}`,
                background: tintBg,
                display: 'flex', gap: 12,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: tint, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, letterSpacing: -0.3,
                  fontVariantNumeric: 'tabular-nums',
                }}>{it.mesa}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 800, color: tint, letterSpacing: 0.7, textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}>{it.label} · há {it.ts}</div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1, marginTop: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>Mesa {it.mesa}</div>
                  <div style={{
                    fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{it.preview}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <GBottomNav active="calls" dark={dark} />
    </div>
  );
};

// ============================================================
// MENSAGENS · LISTA DE THREADS + CHAT · todos os 3 roles (★ V10 · 2026-05 ★)
// ────────────────────────────────────────────────────────────
// Substitui ScreenStaffMessageDetail (V9 · "mensagem isolada" tipo
// notificação numa tela só). V10 promove a feature pra Caixa de
// mensagens completa: lista de threads (ScreenStaffMessages) +
// chat-style entre funcionários (ScreenStaffMessageThread).
//
// Acessada pelo Eu de cada role · ActionRow "Mensagens" no bloco
// OPERAÇÃO. Push lockscreen de mensagem direta da gerente continua
// chegando — agora o tap leva direto pro thread (deep-link via
// senderId), não pro detail isolado. Round-trip de leitura agora é
// disparado quando o destinatário abre A THREAD (não mais a tela
// isolada): ao montar o ScreenStaffMessageThread, frontend dispara
// POST /staff/messages/:id/read pra cada mensagem não-lida cuja
// bubble entrou no viewport — backend emite `message.read` via WS
// pro emissor.
//
// Comportamento idêntico pros 3 roles (manager · waiter · host) ·
// só muda o conteúdo da caixa. Backend: ver server-notes.md
// seção 5.7-bis · estende assistant_messages com thread_id +
// read_at + to_staff_id (V9 já tinha to_role · esse round
// generaliza pra threads).
// ============================================================

// ─── MOCK DATA · threads visíveis pra cada role ────────────────
// Cada role vê SUA caixa de entrada. As threads são simétricas:
// quando Mariana (waiter) vê 'tw-renata', do lado da gerente é
// 'tm-mariana' — backend usa um thread_id determinístico baseado
// no par (least(staff_a), greatest(staff_b)). Aqui no canvas só
// modelamos o ponto de vista de cada role pra economizar dados
// duplicados.
const STAFF_THREADS = {
  manager: [
    // Caleb · 2 não-lidas (segue a SOBRECARGA do V9 · backstory:
    // gerente acabou de mandar mensagem pelo MContactStaffSheet,
    // garçom já leu E respondeu · esse é o lado de cá da thread)
    { id: 'tm-caleb',    other: { name: 'Caleb Souza',        init: 'CS', role: 'GARÇOM',     color: '#4F6BFF', online: true  },
      last: { content: 'Beleza, tô indo na 14 agora. A 21 demora 2 min · cliente acabou de pedir o digestivo.', at: '19:43', from: 'other' },
      unread: 2 },
    // Olivia · 1 não-lida
    { id: 'tm-olivia',   other: { name: 'Olivia Martins',     init: 'OM', role: 'GARÇOM',     color: '#E37D2F', online: true  },
      last: { content: 'Posso pegar a 12 do Henrique? Ele tá apertado e tô liberada agora.', at: '19:38', from: 'other' },
      unread: 1 },
    // Henrique
    { id: 'tm-henrique', other: { name: 'Henrique Lima',      init: 'HL', role: 'GARÇOM',     color: '#7A4FBE', online: false },
      last: { content: 'Ok, te aviso quando descomprimir.', at: '19:14', from: 'other' },
      unread: 0 },
    // Letícia · recepção
    { id: 'tm-leticia',  other: { name: 'Letícia Aguiar',     init: 'LA', role: 'RECEPÇÃO',   color: '#0B7A8B', online: true  },
      last: { content: 'A reserva da família Tanaka chegou — joguei na mesa 14, garçom é o Caleb.', at: 'ONTEM', from: 'other' },
      unread: 0 },
    // Bruno · cozinha
    { id: 'tm-bruno',    other: { name: 'Bruno Pacheco',      init: 'BP', role: 'COZINHA',    color: '#C43A3A', online: true  },
      last: { content: 'Filé sai em 8 min, tô puxando o risoto antes pra liberar a chapa.', at: 'ONTEM', from: 'other' },
      unread: 0 },
  ],
  waiter: [
    // Renata · 1 não-lida (a mensagem do V9 que disparou o push)
    { id: 'tw-renata',   other: { name: 'Renata Albuquerque', init: 'RA', role: 'GERENTE',    color: '#7A4FBE', online: true  },
      last: { content: 'Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o Henrique.', at: '19:42', from: 'other' },
      unread: 1 },
    // Olivia · garçom colega
    { id: 'tw-olivia',   other: { name: 'Olivia Martins',     init: 'OM', role: 'GARÇOM',     color: '#E37D2F', online: true  },
      last: { content: 'Cobre a 12 pra mim? Tô lá no banheiro 30s', at: '18:55', from: 'other' },
      unread: 0 },
    // Bruno · cozinha
    { id: 'tw-bruno',    other: { name: 'Bruno Pacheco',      init: 'BP', role: 'COZINHA',    color: '#C43A3A', online: true  },
      last: { content: 'Manda buscar — tá na pass.', at: 'ONTEM', from: 'other' },
      unread: 0 },
  ],
  host: [
    // Renata
    { id: 'th-renata',   other: { name: 'Renata Albuquerque', init: 'RA', role: 'GERENTE',    color: '#7A4FBE', online: true  },
      last: { content: 'A família Tanaka pode sentar na 14, tá liberada e o Caleb foi avisado.', at: '19:30', from: 'me' },
      unread: 0 },
    // Caleb · garçom da praça
    { id: 'th-caleb',    other: { name: 'Caleb Souza',        init: 'CS', role: 'GARÇOM',     color: '#4F6BFF', online: true  },
      last: { content: 'A 14 é sua, tudo certo. Família de 6, comemoração.', at: '19:18', from: 'me' },
      unread: 0 },
  ],
};

// ─── MOCK DATA · mensagens por threadId (cronológico, mais antiga primeiro)
// `from`: 'me' (usuário) | 'other' (interlocutor) · `d`: id de dia
// usado pra date separators · `chipAction`: marca bubble que
// disparou um atalho de operação (zone-pause shortcut do V9).
const STAFF_THREAD_MSGS = {
  // POV · gerente vê thread com Caleb (símetrico ao tw-renata da Mariana)
  'tm-caleb': [
    { d: 'today', from: 'me',    at: '19:42', content: 'Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o Henrique.', read: true },
    { d: 'today', from: 'other', at: '19:43', content: 'Beleza, tô indo na 14 agora.' },
    { d: 'today', from: 'other', at: '19:43', content: 'A 21 demora 2 min · cliente acabou de pedir o digestivo.' },
  ],
  // POV · waiter (Mariana) vê thread com Renata · 8 mensagens · 2 dias
  'tw-renata': [
    { d: '2026-05-06', from: 'other', at: '22:14', content: 'Boa noite Mariana, valeu pelo turno de hoje. Encerrou a 18 antes de sair?' },
    { d: '2026-05-06', from: 'me',    at: '22:14', content: 'Boa noite Renata! Encerrei sim, tudo certo.', read: true },
    { d: 'today',      from: 'other', at: '19:42', content: 'Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o Henrique.' },
    { d: 'today',      from: 'me',    at: '19:43', content: 'Beleza, tô indo na 14 agora.', read: true },
    { d: 'today',      from: 'me',    at: '19:43', content: 'A 21 demora 2 min · cliente acabou de pedir o digestivo.', read: true },
    { d: 'today',      from: 'other', at: '19:44', content: 'Tranquilo. Eu cubro com o Henrique enquanto isso.' },
    { d: 'today',      from: 'other', at: '19:46', content: 'Avisa se piorar a fila — posso pausar pedidos novos das suas mesas por 5 min se precisar.' },
    { d: 'today',      from: 'me',    at: '19:46', content: 'Vou avaliar. Se a 14 demorar muito o pedido pode.', read: false },
  ],
  // Variante chip-action: gerente clicou no chip "Pause os pedidos novos
  // das suas mesas por 5 min" do MContactStaffSheet · backend gera
  // uma bubble especial com card de atalho ZONE-PAUSE · waiter vê
  // assim aqui na thread.
  'tw-renata-chip': [
    { d: 'today', from: 'other', at: '19:42', content: 'Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o Henrique.' },
    { d: 'today', from: 'me',    at: '19:43', content: 'Tô apertado · a fila tá grande. 4 pedidos esperando há mais de 12 min.', read: true },
    { d: 'today', from: 'other', at: '19:45', chipAction: { kind: 'zone-pause', minutes: 5 },
      content: 'Pausei os pedidos novos das suas mesas por 5 min. Cliente continua vendo o cardápio normal — só o ETA dele aumenta.' },
    { d: 'today', from: 'me',    at: '19:45', content: 'Salvou. Vou aproveitar pra entregar a 14 e a 7.', read: true },
  ],
};

// ─── DATE SEPARATOR formatter ──────────────────────────────────
// 'today' | 'YYYY-MM-DD' (string · simples · não calcula relativo
// dinâmico — canvas é estático). Hoje = 2026-05-07 (quinta).
const fmtDateSep = (d) => {
  if (d === 'today')      return 'HOJE · 07 MAI · QUINTA';
  if (d === '2026-05-06') return 'ONTEM · 06 MAI · QUARTA';
  if (d === '2026-05-05') return '05 MAI · TERÇA';
  return d;
};

// ============================================================
// SCREEN STAFF MESSAGES · lista de threads (★ V10 ★)
// ────────────────────────────────────────────────────────────
// Tela cheia · `role` define a caixa visível · `state` controla
// variantes do canvas (default · search · empty · more).
// ============================================================
const ScreenStaffMessages = ({
  dark = false,
  role = 'waiter',
  state = 'default',
  onTo = () => {},
}) => {
  const C = useG(dark);
  const isSearch = state === 'search';
  const isEmpty = state === 'empty';
  const showMore = state === 'more';
  const allThreads = STAFF_THREADS[role] || [];
  const threads = isEmpty ? [] : (isSearch ? allThreads.filter(t => /renata/i.test(t.other.name)) : allThreads);

  const backRoute = role === 'manager' ? 'mgr-settings' : role === 'host' ? 'host-me' : 'profile';

  const filterChips = [
    { id: 'all',    label: 'Todas',      count: allThreads.length, active: true },
    { id: 'unread', label: 'Não-lidas',  count: allThreads.reduce((s, t) => s + (t.unread > 0 ? 1 : 0), 0), tone: 'danger' },
    { id: 'team',   label: 'Equipe' },
    { id: 'arch',   label: 'Arquivadas', count: 0 },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink, position: 'relative' }}>
      {/* Topbar */}
      <div style={{
        padding: '12px 10px 12px', borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surface, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <button onClick={() => onTo(backRoute)} style={{
          all: 'unset', cursor: 'pointer',
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, flexShrink: 0,
        }}>{Icon.back(20)}</button>
        {isSearch ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            background: C.bg, border: `1px solid ${C.borderSoft}`,
          }}>
            <span style={{ color: C.faint, display: 'inline-flex' }}>{Icon.search(16)}</span>
            <input
              defaultValue="renata"
              placeholder="Buscar por nome ou conteúdo"
              style={{
                all: 'unset', flex: 1, fontSize: 14, color: C.ink, fontWeight: 500,
              }}
            />
            <button style={{
              all: 'unset', cursor: 'pointer', color: C.faint,
              width: 22, height: 22, borderRadius: 11, background: C.borderSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{Icon.x(12)}</button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2, paddingLeft: 4 }}>
              Mensagens
            </div>
            <button style={{
              all: 'unset', cursor: 'pointer',
              width: 36, height: 36, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, flexShrink: 0,
            }}>{Icon.search(20)}</button>
          </>
        )}
      </div>

      {/* Filter chips · só sem busca + com threads */}
      {!isSearch && !isEmpty && (
        <div style={{
          display: 'flex', gap: 8, padding: '10px 12px 4px',
          overflowX: 'auto', flexShrink: 0,
        }}>
          {filterChips.map(c => (
            <button key={c.id} style={{
              all: 'unset', cursor: 'pointer',
              padding: '7px 12px', borderRadius: 100,
              fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
              border: `1px solid ${c.active ? C.ink : C.borderSoft}`,
              background: c.active ? C.ink : C.bg,
              color: c.active ? C.bg : C.ink,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {c.label}
              {c.count != null && c.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 100,
                  background: c.active ? C.bg : (c.tone === 'danger' ? '#FFE6E6' : C.borderSoft),
                  color:      c.active ? C.ink : (c.tone === 'danger' ? '#A12626' : C.faint),
                  fontVariantNumeric: 'tabular-nums',
                }}>{c.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Resultado da busca · subtítulo */}
      {isSearch && (
        <div style={{
          padding: '10px 16px 4px',
          fontSize: 10.5, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}>{threads.length} {threads.length === 1 ? 'resultado' : 'resultados'}</div>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', textAlign: 'center', gap: 14 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 20,
            background: C.bg, border: `1px solid ${C.borderSoft}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.faint,
          }}>{Icon.chat(34)}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>Nenhuma mensagem ainda</div>
          <div style={{ fontSize: 14, color: C.faint, fontWeight: 500, lineHeight: 1.5, maxWidth: 280 }}>
            Quando alguém da equipe te mandar uma mensagem, aparece aqui.
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {threads.map(t => {
            const firstName = t.other.name.split(' ').slice(0, 2).join(' ');
            return (
              <button key={t.id} onClick={() => onTo('staff-message-thread')} style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: '100%', padding: '12px 10px',
                borderRadius: 14,
                background: 'transparent',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <MAvatar name={t.other.name} init={t.other.init} color={t.other.color} size={42} dark={dark} />
                  {t.other.online && (
                    <span style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 12, height: 12, borderRadius: '50%',
                      background: '#1E8C5A', border: `2px solid ${C.surface}`,
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150,
                      }}>{firstName}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: C.faint, letterSpacing: 0.6,
                        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                        whiteSpace: 'nowrap',
                      }}>· {t.other.role}</span>
                    </div>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, color: C.faint, letterSpacing: 0.5,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>{t.last.at}</span>
                  </div>
                  <div style={{
                    marginTop: 3, fontSize: 13,
                    color: t.unread > 0 ? C.ink : C.mute,
                    fontWeight: t.unread > 0 ? 600 : 500, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                    paddingRight: 12,
                  }}>
                    {t.last.from === 'me' && <span style={{ color: C.faint, fontWeight: 600 }}>você: </span>}
                    {t.last.content}
                  </div>
                </div>
                {t.unread > 0 && (
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#C43A3A', flexShrink: 0, marginTop: 18,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* MoreSheet · long-press numa thread */}
      {showMore && (
        <MoreSheet dark={dark} title="Renata Albuquerque · GERENTE" actions={[
          { icon: Icon.history, label: 'Marcar como não-lida' },
          { icon: Icon.bell,    label: 'Bloquear notificações desta thread', sub: 'Continua na lista, sem som nem push' },
          { icon: Icon.trash,   label: 'Arquivar conversa', sub: 'Some da lista · volta se ela mandar de novo' },
        ]} />
      )}
    </div>
  );
};

// ============================================================
// SCREEN STAFF MESSAGE THREAD · chat-style entre staff (★ V10 ★)
// ────────────────────────────────────────────────────────────
// Tela cheia · `role` (POV) + `threadId` (qual thread mostrar) +
// `state` (variantes do canvas).
//
// Bubbles agrupadas por sequência do mesmo emissor — só a primeira
// mostra avatar+eyebrow, só a última mostra timestamp. Date sep
// mono caps quando o dia muda.
//
// Sticky banner de zone-pause aparece SÓ pro garçom + SÓ se a
// pause está ativa agora (state='pause-active'). Tap leva pra
// ScreenManagerOrdersPause em modo zone (compartilha a tela).
//
// Read receipts: bubble do usuário mostra "ENVIADA" → "LIDA" via
// WS event `message.read` — sem rebobinar leitura > 24h por
// privacidade.
// ============================================================
const ScreenStaffMessageThread = ({
  dark = false,
  role = 'waiter',
  threadId = 'tw-renata',
  state = 'normal',
  onTo = () => {},
}) => {
  const C = useG(dark);
  const showPauseBanner = state === 'pause-active';
  const showMore = state === 'more';
  const isChipAction = state === 'chip-action';

  const dataset = STAFF_THREADS[role] || STAFF_THREADS.waiter;
  // Pra chip-action variant, troca threadId pro com a bubble especial
  const effectiveThreadId = isChipAction ? 'tw-renata-chip' : threadId;
  const thread = dataset.find(t => t.id === threadId) || dataset[0];
  const messages = STAFF_THREAD_MSGS[effectiveThreadId] || [];

  // Group messages with first/last-of-run flags + date separators
  const items = [];
  let lastDate = null;
  let lastFrom = null;
  messages.forEach((m, i) => {
    if (m.d !== lastDate) {
      items.push({ kind: 'date-sep', d: m.d });
      lastDate = m.d;
      lastFrom = null;
    }
    const next = messages[i + 1];
    const isFirstOfRun = lastFrom !== m.from;
    const isLastOfRun = !next || next.from !== m.from || next.d !== m.d;
    items.push({ kind: 'msg', ...m, isFirstOfRun, isLastOfRun });
    lastFrom = m.from;
  });

  const otherFirstName = thread.other.name.split(' ')[0].toUpperCase();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: G_FONT, color: C.ink, position: 'relative' }}>
      {/* Topbar */}
      <div style={{
        padding: '10px 10px 10px', borderBottom: `1px solid ${C.borderFaint}`,
        background: C.bg, display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 5, flexShrink: 0,
      }}>
        <button onClick={() => onTo('staff-messages')} style={{
          all: 'unset', cursor: 'pointer',
          width: 32, height: 32, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, flexShrink: 0,
        }}>{Icon.back(20)}</button>
        <button style={{
          all: 'unset', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <MAvatar name={thread.other.name} init={thread.other.init} color={thread.other.color} size={32} dark={dark} />
            {thread.other.online && (
              <span style={{
                position: 'absolute', bottom: -1, right: -1,
                width: 10, height: 10, borderRadius: '50%',
                background: '#1E8C5A', border: `2px solid ${C.bg}`,
              }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {thread.other.name}
            </div>
            <div style={{
              fontSize: 9, fontWeight: 800, color: C.faint, letterSpacing: 0.6,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              marginTop: 1,
            }}>
              {thread.other.role}{thread.other.online ? ' · ONLINE AGORA' : ''}
            </div>
          </div>
        </button>
        <button style={{
          all: 'unset', cursor: 'pointer',
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, flexShrink: 0,
        }}>{Icon.more(20)}</button>
      </div>

      {/* Sticky zone-pause banner · só quando ativo */}
      {showPauseBanner && (
        <button onClick={() => onTo('mgr-orders-pause-active')} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          width: '100%',
          padding: '10px 14px', background: '#FFF7E6',
          borderBottom: `1px solid #F0DCB6`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9A7212', animation: 'gPulse 1.4s infinite', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{
              fontSize: 9.5, fontWeight: 800, color: '#7A4D10',
              letterSpacing: 0.7, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>· PAUSA ATIVA · 04:23 RESTANTES</div>
            <div style={{ fontSize: 12, color: '#7A4D10', fontWeight: 600, marginTop: 1 }}>
              Só as suas mesas · libera sozinho às 21:13
            </div>
          </div>
          <span style={{ color: '#7A4D10', flexShrink: 0 }}>{Icon.arrow(16)}</span>
        </button>
      )}

      {/* Bubble list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0 14px', display: 'flex', flexDirection: 'column' }}>
        {items.map((it, i) => {
          if (it.kind === 'date-sep') {
            return (
              <div key={i} style={{
                textAlign: 'center', padding: '14px 16px 8px',
                fontSize: 9.5, fontWeight: 800, color: C.faint, letterSpacing: 0.7,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                textTransform: 'uppercase',
              }}>{fmtDateSep(it.d)}</div>
            );
          }
          const isMe = it.from === 'me';
          const gapTop = it.isFirstOfRun ? 12 : 4;

          if (isMe) {
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'flex-end',
                padding: `${gapTop}px 14px 0 60px`,
              }}>
                <div style={{ maxWidth: '78%' }}>
                  <div style={{
                    background: C.ink, color: '#fff',
                    padding: '10px 14px',
                    borderRadius: 14,
                    borderBottomRightRadius: it.isLastOfRun ? 4 : 14,
                    fontSize: 14, fontWeight: 500, letterSpacing: -0.15,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                  }}>{it.content}</div>
                  {it.isLastOfRun && (
                    <div style={{
                      marginTop: 4, textAlign: 'right',
                      fontSize: 9, fontWeight: 700, color: C.faint, letterSpacing: 0.6,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    }}>
                      {it.at} · {it.read ? 'LIDA' : 'ENVIADA'}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // bubble do interlocutor (lado esquerdo)
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: `${gapTop}px 60px 0 14px`,
            }}>
              <div style={{ width: 28, flexShrink: 0 }}>
                {it.isFirstOfRun && (
                  <MAvatar name={thread.other.name} init={thread.other.init} color={thread.other.color} size={28} dark={dark} />
                )}
              </div>
              <div style={{ minWidth: 0, maxWidth: '82%' }}>
                {it.isFirstOfRun && (
                  <div style={{
                    fontSize: 9, fontWeight: 800, color: C.faint, letterSpacing: 0.7,
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    paddingLeft: 4, paddingBottom: 4, textTransform: 'uppercase',
                  }}>
                    {otherFirstName} · {thread.other.role} · {it.at}
                  </div>
                )}
                {it.chipAction && it.chipAction.kind === 'zone-pause' ? (
                  // Card embutido · atalho de zone-pause acionado pelo emissor
                  <div style={{
                    background: '#FFF7E6', border: '1px solid #F0DCB6',
                    borderRadius: 14, borderBottomLeftRadius: it.isLastOfRun ? 4 : 14,
                    padding: 12,
                  }}>
                    <div style={{
                      fontSize: 9.5, fontWeight: 800, color: '#7A4D10',
                      letterSpacing: 0.7, textTransform: 'uppercase',
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9A7212' }} />
                      ATALHO ENVIADO · ZONE-PAUSE · {it.chipAction.minutes} MIN
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: '#1d1c19', letterSpacing: -0.2,
                      marginTop: 6, lineHeight: 1.3,
                    }}>Pausei os pedidos novos das suas mesas</div>
                    <div style={{
                      fontSize: 12.5, color: '#7A4D10', fontWeight: 500, lineHeight: 1.45,
                      marginTop: 6,
                    }}>{it.content}</div>
                    <button onClick={() => onTo('mgr-orders-pause-active')} style={{
                      all: 'unset', cursor: 'pointer',
                      marginTop: 12, padding: '8px 14px', borderRadius: 10,
                      background: '#1d1c19', color: '#fff',
                      fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>Ver pausa <span style={{ marginTop: -1 }}>{Icon.arrow(13)}</span></button>
                  </div>
                ) : (
                  <div style={{
                    background: C.surface, color: C.ink,
                    border: `1px solid ${C.borderSoft}`,
                    padding: '10px 14px',
                    borderRadius: 14,
                    borderBottomLeftRadius: it.isLastOfRun ? 4 : 14,
                    fontSize: 14, fontWeight: 500, letterSpacing: -0.15,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                  }}>{it.content}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{
        padding: '10px 12px 14px', background: C.bg,
        borderTop: `1px solid ${C.borderFaint}`,
        display: 'flex', alignItems: 'flex-end', gap: 8, flexShrink: 0,
      }}>
        <div style={{
          flex: 1, position: 'relative',
          minHeight: 44, padding: '12px 14px 22px',
          borderRadius: 14, border: `1px solid ${C.borderSoft}`,
          background: C.surface,
        }}>
          <div style={{ fontSize: 14, color: C.faint, fontWeight: 500, lineHeight: 1.4 }}>
            Mensagem...
          </div>
          <div style={{
            position: 'absolute', bottom: 5, right: 10,
            fontSize: 9, color: C.faint, fontWeight: 700, letterSpacing: 0.5,
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          }}>0 / 240</div>
        </div>
        <button style={{
          all: 'unset', cursor: 'not-allowed',
          width: 44, height: 44, borderRadius: '50%',
          background: C.borderSoft, color: C.faint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>{Icon.arrow(20)}</button>
      </div>

      {/* MoreSheet (3 pontinhos) */}
      {showMore && (
        <MoreSheet dark={dark} title={`Conversa com ${thread.other.name.split(' ')[0]}`} actions={[
          { icon: Icon.search, label: 'Pesquisar nesta conversa' },
          { icon: Icon.bell,   label: 'Silenciar notificações desta thread', sub: 'Mensagens dela continuam aparecendo, sem som nem push' },
          { icon: Icon.trash,  label: 'Arquivar conversa', sub: 'Some da lista · volta se ela mandar de novo' },
          { icon: Icon.flame,  label: 'Reportar problema com esta conversa', tone: 'danger' },
        ]} />
      )}
    </div>
  );
};

Object.assign(window, {
  ScreenTableDetail, ScreenCallDetail,
  ScreenOrderQuick, ScreenOrderSearch, ScreenOrderItem,
  ScreenShift, ScreenProfile,
  ScreenWaiterNewEntry, ScreenWaiterScanQr, ScreenWaiterTablePicker, ScreenWaiterDeliveryConfirm,
  ScreenWaiterCalls,
  ScreenStaffMessages, ScreenStaffMessageThread,        // ★ V10 ★ caixa de mensagens completa
  STAFF_THREADS, STAFF_THREAD_MSGS,
});
