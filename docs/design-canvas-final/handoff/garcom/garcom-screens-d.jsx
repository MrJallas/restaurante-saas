// ============================================================
// GERENTE — telas top-level (parte 2) e sub-screens
//
// REFATORAÇÃO 2026-05:
//   - "Salão" + "Gargalos" foram fundidos numa só tela: OPERAÇÃO,
//     com 3 sub-tabs (Alertas · Mapa · Funil). A barra "Agir agora"
//     fica fixa em todas as sub-tabs com 2 ferramentas-chave
//     (Cozinha · Pausa). Cortesia saiu da barra — vira ação terciária
//     (MoreSheet de alerta · sub-menu de Contactar cliente · Eu).
//   - "Eu" virou aba normal (5ª) na bottom nav — não é mais sub-tela.
//   - Removidos do app do gerente neste round: StaffPause (pausa de
//     garçom inteira), Security + SecurityAudit (movidos para
//     prototypes/seguranca-qr/), HostReservationDraft (bot do WhatsApp
//     já valida tudo antes de criar).
//   - Adicionado: MContactClientSheet — bottom sheet "Contactar
//     cliente" que substitui o que era "Cortesia mesa" como ação
//     default dos cards de alerta.
//
// Este arquivo cobre: StaffDetail · Operação (Alertas+Mapa+Funil) ·
// Finance · TableTimeline · TableMenu · AlertsAll ·
// KitchenReorder · OrdersPause · OrdersPauseSummary · CompensateClient ·
// ContactClientSheet.
//
// V6 (2026-05): ShiftBoard + ShiftSchedule foram removidos · funcionalidade
// migrou pra ScreenManagerStaff (em screens-c.jsx).
// ============================================================
const { useState: useStateD } = React;

// ============================================================
// DASHBOARD INDIVIDUAL — performance de 1 funcionário (sub-tela)
// Aberta tocando um card em ScreenManagerStaff (Equipe) ou no card
// "Equipe em turno" do Painel. Bottom nav: aba Equipe permanece ativa.
// ============================================================
const ScreenManagerStaffDetail = ({ dark = false, showMenu = false, onTo = () => {} }) => {
  const C = useG(dark);
  const p = M_TEAM[1]; // Olivia
  const days = [
    { d: 'Seg', v: 1240 },
    { d: 'Ter', v: 1380 },
    { d: 'Qua', v: 980 },
    { d: 'Qui', v: 1620 },
    { d: 'Sex', v: 1840 },
    { d: 'Sáb', v: 2100 },
    { d: 'Dom', v: 1520 },
  ];
  const max = Math.max(...days.map((d) => d.v));

  return (
    <div
      style={{
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Desempenho"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
          right={<GIconBtn dark={dark} icon={Icon.more(20)} />}
        />

        {/* hero perfil — avatar + flag tinted da situação atual */}
        <div
          style={{
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          <MAvatar name={p.name} init={p.init} color={p.color} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 2, fontWeight: 500 }}>
              {p.role} · em turno desde 17:00
            </div>
            <div style={{ marginTop: 6 }}>
              <MPill tone="warn" dot dark={dark}>
                Em chamado · mesa 14
              </MPill>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: -0.4,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ★ {p.rating}
            </div>
            <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>312 avaliações</div>
          </div>
        </div>

        {/* janela de tempo */}
        <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6 }}>
          {['Hoje', '7 dias', '30 dias'].map((t, i) => {
            const active = i === 1;
            return (
              <div
                key={t}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '8px',
                  borderRadius: 8,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.ink : 'transparent',
                  color: active ? C.bg : C.ink,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t}
              </div>
            );
          })}
        </div>

        {/* KPIs com help text em linguagem comum */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <MStat
              dark={dark}
              label="Vendas no turno"
              value="R$ 1.520"
              sub="+8% vs média"
              trend={{ dir: 'up' }}
              help="Total que ela vendeu desde que entrou hoje."
            />
            <MStat
              dark={dark}
              label="Mesas atendidas"
              value="6"
              sub="média da equipe 5,2"
              trend={{ dir: 'up' }}
              help="Mesas que passaram por ela neste turno."
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <MStat
              dark={dark}
              label="Tempo de resposta"
              value="1m 48s"
              sub="meta 2 min"
              trend={{ dir: 'up' }}
              help="Quanto demora pra ir na mesa quando o cliente chama."
            />
            <MStat
              dark={dark}
              label="Chamados escalados"
              value="1"
              sub="vs equipe 0,8"
              trend={{ dir: 'down' }}
              accent="#C43A3A"
              help="Vezes que outro garçom precisou cobrir por ela."
            />
          </div>
        </div>

        {/* gráfico vendas semana */}
        <MSection dark={dark} title="Vendas · últimos 7 dias">
          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
              {days.map((d, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        height: `${(d.v / max) * 100}%`,
                        background:
                          i === days.length - 1
                            ? C.ink
                            : i === days.length - 2
                              ? '#888'
                              : '#d8d2c5',
                        borderRadius: '4px 4px 0 0',
                        minHeight: 6,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{d.d}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 8, fontWeight: 500 }}>
              Total · R$ 10.680 · ticket médio R$ 138 · pico no sábado
            </div>
          </div>
        </MSection>

        {/* comparativo equipe */}
        <MSection dark={dark} title="Comparativo · equipe da noite">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { lbl: 'Tempo de resposta', mine: '1m 48s', team: '2m 10s', good: true },
              { lbl: 'Ticket médio', mine: 'R$ 138', team: 'R$ 124', good: true },
              { lbl: 'Chamados escalados', mine: '1', team: '0,8', good: false },
              { lbl: 'Avaliação', mine: '★ 4,6', team: '★ 4,5', good: true },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  background: C.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{row.lbl}</div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: row.good ? '#1E8C5A' : '#C43A3A',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.mine}
                  </div>
                  <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>
                    equipe {row.team}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </MSection>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <GButton dark={dark} full kind="primary" onClick={() => onTo('mgr-staff-edit')}>
            Editar funcionário
          </GButton>
        </div>
      </div>

      {showMenu && (
        <MoreSheet
          dark={dark}
          title={`${p.name} · ${p.role}`}
          actions={[
            { icon: Icon.bell, label: 'Mensagem direta', sub: 'Manda um aviso para o app dela' },
            {
              icon: Icon.table,
              label: 'Realocar mesas',
              sub: 'Passa as mesas dela para outro garçom',
            },
          ]}
        />
      )}
      <MBottomNav active="staff" dark={dark} onTo={onTo} />
    </div>
  );
};

// ============================================================
// 3 · OPERAÇÃO — tela top-level (substitui Salão + Gargalos)
//
// Sub-tabs:
//   ALERTAS — eventos detectados em tempo real, cada um com 2 ações inline
//             (resolver / avisar). Resolver é o caminho feliz, dispensar é
//             botão sutil no rodapé de cada card.
//   MAPA    — grid 4×N de TODAS as mesas com waiter responsável e tempo
//             aberto. Cores: verde OK / amarelo lenta / vermelho crítica.
//             Toque numa mesa lenta → abre Timeline da mesa.
//   FUNIL   — tempo médio em cada etapa do pedido (lançado → confirmado
//             → preparo → pronto → entregue). Barra vermelha onde excede
//             a meta. Sugestão "O que fazer agora" no rodapé.
//
// Barra "Agir agora" fixa entre o conteúdo e a bottom nav: 3 cards-botão
// (Cozinha · Pausa · Cortesia). Resolve o problema de "vi um problema,
// como ajo agora?" sem precisar voltar pra Painel.
// ============================================================
const ScreenManagerOps = ({
  dark = false,
  tab = 'alerts',
  onTo = () => {},
  quickVariant = 'stacked',
}) => {
  const C = useG(dark);
  const [active, setActive] = useStateD(tab);
  const high = M_BOTTLENECKS.alerts.filter((a) => a.sev === 'high').length;
  const med = M_BOTTLENECKS.alerts.filter((a) => a.sev === 'med').length;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MAppHeader dark={dark} title="Operação" />

        {/* sub-tabs */}
        <div
          style={{ display: 'flex', borderBottom: `1px solid ${C.borderSoft}`, background: C.bg }}
        >
          <MTab
            dark={dark}
            active={active === 'alerts'}
            count={high + med}
            onClick={() => setActive('alerts')}
          >
            Alertas
          </MTab>
          <MTab dark={dark} active={active === 'map'} onClick={() => setActive('map')}>
            Mapa
          </MTab>
          <MTab dark={dark} active={active === 'funnel'} onClick={() => setActive('funnel')}>
            Funil
          </MTab>
        </div>

        {active === 'alerts' && <OpsAlerts dark={dark} onTo={onTo} />}
        {active === 'map' && <OpsMap dark={dark} onTo={onTo} />}
        {active === 'funnel' && <OpsFunnel dark={dark} onTo={onTo} />}
      </div>
      <MQuickActionsBar dark={dark} onTo={onTo} variant={quickVariant} />
      <MBottomNav active="ops" dark={dark} onTo={onTo} />
    </div>
  );
};

// ─── Barra "Agir agora" — 2 cards-botão de ferramenta ─────────
// Cortesia saiu daqui (decisão deliberada · vira ação terciária no
// MoreSheet de um alerta OU dentro de "Contactar cliente"). Ferramentas
// que sobram são as que afetam fluxo do salão inteiro. Layout 50%/50%.
//
// V3 (2026-05): compactado de 88px → ~56px. Layout em LINHA (icon 24 +
// label inline + sub abaixo em line-height tight). `variant`:
//   'stacked'  — icon 24 + (label · sub stacked) ← DEFAULT/PREFERIDA
//   'inline'   — icon 24 + label inline grande, sub vira tooltip (?)
//                — alternativa mostrada no canvas pra escolha do gerente
//
// V4 (2026-05): aceita `pauseActive` — quando o gerente tem pausa ativa,
// o card "Pausa" mostra countdown inline em mono + bolinha mostarda
// pulsando no canto sup direito. Garante que o gerente saiba do estado
// mesmo se rolar pelo Painel sem ver a seção "Em curso".
const MQuickActionsBar = ({ dark, onTo = () => {}, variant = 'stacked', pauseActive = null }) => {
  const C = useG(dark);
  const tools = [
    {
      id: 'reorder',
      icon: Icon.flame(16),
      tint: '#C2401A',
      tintBg: '#FFF1EC',
      label: 'Cozinha',
      sub: 'Reordenar fila',
      to: 'mgr-kitchen-reorder',
    },
    {
      id: 'pause',
      icon: Icon.pause(16),
      tint: '#9A7212',
      tintBg: '#FFF7E6',
      label: 'Pausa',
      sub: 'Pedidos novos',
      to: 'mgr-orders-pause',
    },
  ];

  // formata countdown da pausa em mm:ss
  let pauseCountdown = null;
  if (pauseActive && typeof pauseActive.remaining === 'number') {
    const r = Math.max(0, pauseActive.remaining);
    pauseCountdown = `${Math.floor(r / 60)
      .toString()
      .padStart(2, '0')}:${(r % 60).toString().padStart(2, '0')}`;
  }

  return (
    <div
      style={{
        padding: '8px 16px 10px',
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.bg,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.7,
          marginBottom: 6,
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}
      >
        Agir agora
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {tools.map((t) => {
          const showPauseState = t.id === 'pause' && pauseCountdown != null;
          const sub = showPauseState ? `${pauseCountdown} restantes` : t.sub;
          return (
            <button
              key={t.id}
              onClick={() => onTo(t.to)}
              title={variant === 'inline' ? `${t.label} · ${sub}` : undefined}
              style={{
                all: 'unset',
                cursor: 'pointer',
                flex: 1,
                height: 56,
                padding: '0 12px',
                border: `1px solid ${showPauseState ? '#F0DCB6' : C.borderSoft}`,
                borderRadius: 12,
                background: showPauseState ? '#FFF7E6' : C.surface,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                position: 'relative',
              }}
            >
              {showPauseState && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#9A7212',
                    animation: 'gPulse 1.2s infinite',
                  }}
                />
              )}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: t.tintBg,
                  color: t.tint,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {t.icon}
              </div>
              {variant === 'inline' ? (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 14,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: -0.1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.label}
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: C.ink,
                      letterSpacing: -0.1,
                      lineHeight: 1.1,
                    }}
                  >
                    {t.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: showPauseState ? '#7A4D10' : C.faint,
                      fontWeight: showPauseState ? 700 : 500,
                      lineHeight: 1.2,
                      marginTop: 1,
                      fontVariantNumeric: showPauseState ? 'tabular-nums' : 'normal',
                      fontFamily: showPauseState
                        ? 'ui-monospace, SF Mono, JetBrains Mono, monospace'
                        : undefined,
                      letterSpacing: showPauseState ? 0.2 : 0,
                    }}
                  >
                    {sub}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── ALERTAS sub-tab ──────────────────────────────────────────
// V3 (2026-05): densificado pra caber ~5-6 alertas + KPIs no viewport
// (era ~2-3). Mudanças: MStat compact (help vira tooltip ?), cards de
// alerta ~108px (eram ~150-170), pill mono caps inline com ícone, sub
// truncate em 1 linha, X dispense no canto sup direito (libera a row
// de ações). Conteúdo idêntico — só compactado.
const OpsAlerts = ({ dark, onTo = () => {} }) => {
  const C = useG(dark);
  const high = M_BOTTLENECKS.alerts.filter((a) => a.sev === 'high').length;
  const med = M_BOTTLENECKS.alerts.filter((a) => a.sev === 'med').length;
  return (
    <div>
      {/* resumo dos KPIs em tiles compactos · ~80px com help-as-tooltip
          ★ V9 ★ — `?` agora é tap-target real (onHelp → abre StatDetail).
          Long-press / hover continua mostrando o tooltip via `help`. */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
        <MStat
          dark={dark}
          compact
          label="Críticos"
          value={`${high}`}
          sub="resolver agora"
          accent={high > 0 ? '#C43A3A' : null}
          help="Pedido ou chamado passou muito da meta — cliente está esperando."
          onHelp={() => onTo('mgr-stat-detail-criticos')}
        />
        <MStat
          dark={dark}
          compact
          label="Atenção"
          value={`${med}`}
          sub="próx. 10 min"
          accent={med > 0 ? '#9A7212' : null}
          help="Vai virar crítico se não agir logo."
          onHelp={() => onTo('mgr-stat-detail-atencao')}
        />
      </div>

      <div
        style={{
          padding: '10px 16px 4px',
          fontSize: 9.5,
          color: C.faint,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}
      >
        Cada alerta · 2 ações inline · X dispensa
      </div>

      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {M_BOTTLENECKS.alerts.map((a) => {
          const isHigh = a.sev === 'high';
          return (
            <div
              key={a.id}
              style={{
                borderRadius: 12,
                position: 'relative',
                border: `1px solid ${isHigh ? '#F4C7C7' : '#F0DCB6'}`,
                background: C.bg,
                borderLeft: `3px solid ${isHigh ? '#C43A3A' : '#D98E2B'}`,
                padding: '9px 10px',
              }}
            >
              {/* X dispense — canto sup direito, libera a row de ações */}
              <button
                title="Dispensar"
                aria-label="Dispensar alerta"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: 'transparent',
                  color: C.faint,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {Icon.x(13)}
              </button>

              {/* Linha 1: ícone + pill mono caps tiny inline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 26 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: isHigh ? '#C43A3A' : '#D98E2B',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {Icon.flame(13)}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    color: isHigh ? '#A12626' : '#7A4D10',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}
                >
                  {isHigh ? 'CRÍTICO' : 'ATENÇÃO'} · há {a.ts}
                </div>
              </div>

              {/* Título — Inter 13/700, tighter line-height */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.ink,
                  lineHeight: 1.25,
                  letterSpacing: -0.1,
                  marginTop: 5,
                  paddingRight: 26,
                }}
              >
                {a.msg}
              </div>

              {/* Sub — 1 linha truncate, sem wrap */}
              <div
                style={{
                  fontSize: 11,
                  color: C.faint,
                  fontWeight: 500,
                  marginTop: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.sub}
              </div>

              {/* Ações 32px de altura, padding horizontal 10 */}
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '0 10px',
                    height: 32,
                    borderRadius: 8,
                    background: '#1d1c19',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {a.actions[0]}
                </button>
                <button
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '0 10px',
                    height: 32,
                    borderRadius: 8,
                    background: 'transparent',
                    color: '#1d1c19',
                    border: `1px solid ${C.borderSoft}`,
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {a.actions[1]}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── MAPA sub-tab ─────────────────────────────────────────────
// Substitui o antigo ScreenManagerFloor — grid 4×N com mesas
// coloridas por status. Toque numa mesa lenta abre Timeline.
// V3-bis (2026-05): KPIs viraram compact — mesma transformação que
// OpsAlerts. Operação é tela de ação rápida, descrição longa atrapalha
// e desperdiça viewport antes da grid de mesas. Help vira `?` tooltip.
const OpsMap = ({ dark, onTo = () => {} }) => {
  const C = useG(dark);

  const tables = [
    { n: 1, st: 'ok', wait: 4, waiter: 'CS', val: 142 },
    { n: 2, st: 'ok', wait: 7, waiter: 'CS', val: 88 },
    { n: 3, st: 'warn', wait: 22, waiter: 'HL', val: 312 },
    { n: 4, st: 'ok', wait: 11, waiter: 'OM', val: 64 },
    { n: 5, st: 'free' },
    { n: 6, st: 'warn', wait: 18, waiter: 'OM', val: 184 },
    { n: 7, st: 'ok', wait: 9, waiter: 'CS', val: 96 },
    { n: 8, st: 'ok', wait: 5, waiter: 'HL', val: 220 },
    { n: 9, st: 'ok', wait: 14, waiter: 'CS', val: 412 },
    { n: 10, st: 'free' },
    { n: 11, st: 'crit', wait: 28, waiter: 'OM', val: 156 },
    { n: 12, st: 'ok', wait: 8, waiter: 'HL', val: 78 },
    { n: 13, st: 'ok', wait: 12, waiter: 'CS', val: 244 },
    { n: 14, st: 'crit', wait: 31, waiter: 'HL', val: 168 },
    { n: 15, st: 'free' },
    { n: 16, st: 'ok', wait: 7, waiter: 'OM', val: 110 },
  ];
  const stColors = {
    ok: { bg: C.bg, border: C.borderSoft, fg: C.ink, dot: '#1E8C5A' },
    warn: { bg: '#FFF7EC', border: '#F0DCB6', fg: '#7a4d10', dot: '#D98E2B' },
    crit: { bg: '#FFF1F1', border: '#F4C7C7', fg: '#A12626', dot: '#C43A3A' },
    free: { bg: 'transparent', border: C.borderSoft, fg: C.faint, dot: null },
  };

  const occupied = tables.filter((t) => t.st !== 'free').length;
  const free = tables.length - occupied;
  const critical = tables.filter((t) => t.st === 'crit').length;
  const warn = tables.filter((t) => t.st === 'warn').length;

  return (
    <div>
      {/* KPIs do salão · compact (V3-bis) — help vira tooltip `?`
          ★ V9 ★ — `?` agora é tap-target real (onHelp → StatDetail). */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
        <MStat
          dark={dark}
          compact
          label="Mesas ativas"
          value={`${occupied}/${tables.length}`}
          sub={`${free} livres`}
          help="Mesas com cliente sentado agora · resto está vazio."
          onHelp={() => onTo('mgr-stat-detail-mesas-ativas')}
        />
        <MStat
          dark={dark}
          compact
          label="Em alerta"
          value={`${critical + warn}`}
          sub={critical > 0 ? `${critical} críticas` : 'nenhuma crítica'}
          accent={critical > 0 ? '#C43A3A' : null}
          help="Mesas onde o pedido passou da meta de tempo."
          onHelp={() => onTo('mgr-stat-detail-em-alerta')}
        />
      </div>

      {/* legenda em texto plano */}
      <div
        style={{
          padding: '12px 16px 6px',
          fontSize: 11.5,
          color: C.faint,
          fontWeight: 500,
          lineHeight: 1.5,
        }}
      >
        Toque numa mesa pra ver detalhes.{' '}
        <span style={{ color: '#1E8C5A', fontWeight: 700 }}>Verde</span> = ok ·{' '}
        <span style={{ color: '#D98E2B', fontWeight: 700 }}>amarelo</span> = lenta ·{' '}
        <span style={{ color: '#C43A3A', fontWeight: 700 }}>vermelho</span> = crítica.
      </div>

      {/* grade de mesas */}
      <div
        style={{
          padding: '4px 16px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}
      >
        {tables.map((t) => {
          const c = stColors[t.st];
          if (t.st === 'free') {
            return (
              <div
                key={t.n}
                style={{
                  aspectRatio: '1/1',
                  padding: 8,
                  border: `1px dashed ${c.border}`,
                  borderRadius: 10,
                  background: 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  color: c.fg,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800 }}>{t.n}</div>
                <div style={{ fontSize: 10, fontWeight: 600 }}>livre</div>
              </div>
            );
          }
          const waiter = M_TEAM.find((x) => x.init === t.waiter);
          // V5 · TODAS as mesas ocupadas roteiam pro menu da mesa.
          // Antes só crit/warn iam pra Timeline; agora Timeline virou
          // uma das ações dentro do menu.
          const onClick = () => onTo('mgr-table-menu');
          return (
            <button
              key={t.n}
              onClick={onClick}
              style={{
                all: 'unset',
                cursor: 'pointer',
                aspectRatio: '1/1',
                padding: 8,
                boxSizing: 'border-box',
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                background: c.bg,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: c.fg,
                    letterSpacing: -0.3,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t.n}
                </div>
                {c.dot && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: c.dot,
                      marginTop: 2,
                    }}
                  />
                )}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: c.fg,
                    letterSpacing: -0.2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t.wait}m
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: waiter?.color || '#777',
                      color: '#fff',
                      fontSize: 8,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {t.waiter}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: c.fg,
                      fontWeight: 600,
                      opacity: 0.85,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    R${t.val}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* carga por garçom */}
      <MSection dark={dark} title="Carga por garçom · em turno">
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { p: M_TEAM[0], load: 4, total: 7, val: 1192 },
            { p: M_TEAM[1], load: 3, total: 6, val: 920 },
            { p: M_TEAM[2], load: 4, total: 5, val: 660 },
          ].map((row, i) => {
            const pct = (row.load / row.total) * 100;
            const overload = pct >= 80;
            return (
              <div
                key={i}
                style={{
                  padding: 10,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  background: C.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <MAvatar name={row.p.name} init={row.p.init} color={row.p.color} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {row.p.name.split(' ')[0]} {row.p.name.split(' ')[1]}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: overload ? '#C43A3A' : C.ink,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.load}/{row.total} mesas
                    </div>
                  </div>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: C.borderSoft,
                      marginTop: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: overload ? '#C43A3A' : C.ink,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </MSection>
    </div>
  );
};

// ─── FUNIL sub-tab ────────────────────────────────────────────
const OpsFunnel = ({ dark }) => {
  const C = useG(dark);
  const max = Math.max(...M_BOTTLENECKS.funnel.map((s) => s.median));
  return (
    <div style={{ padding: 16 }}>
      <div
        style={{ fontSize: 12, color: C.faint, fontWeight: 500, marginBottom: 14, lineHeight: 1.5 }}
      >
        Tempo médio em cada etapa do pedido.{' '}
        <span style={{ color: '#C43A3A', fontWeight: 700 }}>Vermelho</span> = passou da meta ·{' '}
        <span style={{ color: C.ink, fontWeight: 700 }}>preto</span> = no ritmo.
      </div>

      {M_BOTTLENECKS.funnel.map((s, i) => {
        const pct = (s.median / max) * 100;
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                {i + 1}. {s.stage}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: s.ok ? C.ink : '#C43A3A',
                    letterSpacing: -0.3,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.median} min
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.faint,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  pior caso {s.p95} min
                </div>
              </div>
            </div>
            <div
              style={{ height: 8, borderRadius: 4, background: C.borderSoft, overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: s.ok ? C.ink : '#C43A3A',
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4, fontWeight: 500 }}>
              {s.count} pedidos
              {!s.ok && (
                <span style={{ color: '#C43A3A', fontWeight: 700 }}>
                  {' · '}
                  {i === 2 ? 'Cozinha sobrecarregada às 19h' : 'Pratos esfriando na pass'}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* sugestão "o que fazer agora" */}
      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 14,
          background: C.ink,
          color: C.bg,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            opacity: 0.7,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: 8,
          }}
        >
          O que fazer agora
        </div>
        <ol
          style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, fontWeight: 500 }}
        >
          <li style={{ marginBottom: 6 }}>
            Verifique a cozinha — pratos quentes estão 17% acima da meta.
          </li>
          <li style={{ marginBottom: 6 }}>
            Coloque mais garçons levando pedidos prontos pras mesas.
          </li>
          <li>Se piorar, pause pedidos novos por 5 min até a fila baixar.</li>
        </ol>
      </div>
    </div>
  );
};

// ============================================================
// 4 · FINANCEIRO — top-level (bottom nav)
//
// Refatoração 2026-05:
//   - 4 KPIs com help text (antes eram só rótulos secos)
//   - Mini-chart por hora — preto sólido, sem cores extras
//   - Top 3 CATEGORIAS com barras (antes era top 5 itens em lista) —
//     gerente entende "Pratos quentes 38%" mais rápido que "Risoto R$ 720"
//   - Métodos de pagamento: visual com 2 barras grossas (App vs Maquininha)
//   - Ranking dos 3 melhores garçons do dia
//   - SEM botão de exportar (decisão de design — gerente exporta no admin web)
// ============================================================
const ScreenManagerFinance = ({ dark = false, onTo = () => {} }) => {
  const C = useG(dark);
  const periods = ['Hoje', 'Semana', 'Mês'];
  const hours = [
    { h: '12h', v: 320 },
    { h: '13h', v: 580 },
    { h: '14h', v: 410 },
    { h: '15h', v: 220 },
    { h: '16h', v: 180 },
    { h: '17h', v: 380 },
    { h: '18h', v: 720 },
    { h: '19h', v: 1240 },
    { h: '20h', v: 1840 },
    { h: '21h', v: 1620 },
    { h: '22h', v: 910 },
  ];
  const max = Math.max(...hours.map((d) => d.v));

  // Top 3 categorias (em vez de top 5 itens) — leitura mais rápida
  const categories = [
    { n: 'Pratos quentes', val: 3220, pct: 38, qty: 47 },
    { n: 'Bar', val: 2180, pct: 26, qty: 92 },
    { n: 'Sobremesas', val: 1240, pct: 15, qty: 28 },
  ];

  // Métodos de pagamento (visual em barras, não lista)
  const payMethods = [
    { lbl: 'Pelo app', pct: 68, color: '#1E8C5A', sub: '40 mesas · ticket R$ 142' },
    { lbl: 'Maquininha', pct: 32, color: C.ink, sub: '19 mesas · ticket R$ 138' },
  ];

  // Ranking dos 3 melhores garçons do dia
  const ranking = [
    { p: M_TEAM[0], val: 2440, mesas: 11 },
    { p: M_TEAM[1], val: 1920, mesas: 9 },
    { p: M_TEAM[2], val: 1380, mesas: 7 },
  ];
  const maxRank = Math.max(...ranking.map((r) => r.val));

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MAppHeader dark={dark} title="Financeiro" />

        {/* período */}
        <div style={{ padding: '4px 16px 0', display: 'flex', gap: 6 }}>
          {periods.map((p, i) => {
            const active = i === 0;
            return (
              <div
                key={p}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '8px',
                  borderRadius: 8,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.ink : 'transparent',
                  color: active ? C.bg : C.ink,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {p}
              </div>
            );
          })}
        </div>

        {/* hero · receita do dia */}
        <div style={{ padding: '16px 16px 8px' }}>
          <div
            style={{
              fontSize: 11,
              color: C.faint,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Receita bruta · hoje
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: -1.4,
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            R$ 8.420
          </div>
          <div style={{ fontSize: 13, color: '#1E8C5A', fontWeight: 700 }}>↑ +12% vs ontem</div>
        </div>

        {/* mini-chart por hora */}
        <div style={{ padding: '4px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110 }}>
            {hours.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      height: `${(h.v / max) * 100}%`,
                      background: h.v === max ? C.ink : '#d8d2c5',
                      borderRadius: '3px 3px 0 0',
                      minHeight: 4,
                    }}
                  />
                </div>
                <div style={{ fontSize: 8, color: C.faint, fontWeight: 600 }}>{h.h}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, fontWeight: 500 }}>
            Pico das 20h · R$ 1.840 · 14 mesas atendidas
          </div>
        </div>

        {/* 4 KPIs com help text · gerente não-técnico precisa entender */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <MStat
              dark={dark}
              label="Mesas fechadas"
              value="59"
              sub="média 32 min/mesa"
              help="Quantas mesas pagaram e foram liberadas hoje."
            />
            <MStat
              dark={dark}
              label="Ticket médio"
              value="R$ 142"
              sub="+R$ 8 vs ontem"
              trend={{ dir: 'up' }}
              help="Quanto cada mesa gastou em média."
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <MStat
              dark={dark}
              label="Pago pelo app"
              value="68%"
              sub="32% maquininha"
              help="Quantos pagaram pelo QR · resto na maquininha."
            />
            <MStat
              dark={dark}
              label="Gorjeta"
              value="R$ 720"
              sub="8,5% sobre venda"
              help="Soma do que clientes deixaram pra equipe."
            />
          </div>
        </div>

        {/* top 3 categorias com barras */}
        <MSection dark={dark} title="Top categorias · hoje" sub="Em vendas, não em quantidade">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {categories.map((cat, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  background: C.bg,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{cat.n}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: C.ink,
                        letterSpacing: -0.2,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      R$ {cat.val.toLocaleString('pt-BR')}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.faint,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {cat.pct}%
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: C.borderSoft,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${cat.pct * 2}%`,
                      maxWidth: '100%',
                      height: '100%',
                      background: C.ink,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 4, fontWeight: 500 }}>
                  {cat.qty} unidades vendidas
                </div>
              </div>
            ))}
          </div>
        </MSection>

        {/* métodos de pagamento — visual em barras */}
        <MSection dark={dark} title="Métodos de pagamento" sub="Hoje · 59 mesas fechadas">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payMethods.map((m, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  background: C.bg,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{m.lbl}</div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: m.color,
                      letterSpacing: -0.3,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {m.pct}%
                  </div>
                </div>
                <div
                  style={{
                    height: 10,
                    borderRadius: 5,
                    background: C.borderSoft,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${m.pct}%`,
                      height: '100%',
                      background: m.color,
                      borderRadius: 5,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 6, fontWeight: 500 }}>
                  {m.sub}
                </div>
              </div>
            ))}
          </div>
        </MSection>

        {/* ranking 3 melhores garçons */}
        <MSection
          dark={dark}
          title="Top 3 garçons · hoje"
          action="Ver todos →"
          onAction={() => onTo('mgr-staff')}
        >
          <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ranking.map((r, i) => {
              const pct = (r.val / maxRank) * 100;
              const medal = ['🥇', '🥈', '🥉'][i];
              return (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                    background: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{medal}</div>
                  <MAvatar name={r.p.name} init={r.p.init} color={r.p.color} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: C.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.p.name}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: C.ink,
                          letterSpacing: -0.2,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        R$ {r.val.toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: C.borderSoft,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ width: `${pct}%`, height: '100%', background: r.p.color }} />
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 4, fontWeight: 500 }}>
                      {r.mesas} mesas · ticket médio R$ {Math.round(r.val / r.mesas)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </MSection>
      </div>
      <MBottomNav active="finance" dark={dark} onTo={onTo} />
    </div>
  );
};

// ─── helpers de botão inline (usados em ShiftBoard, AlertsAll) ─
const btnPrimary = (C) => ({
  flex: 1,
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${C.ink}`,
  background: C.ink,
  color: C.bg,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: G_FONT,
  cursor: 'pointer',
});
const btnGhost = (C) => ({
  flex: 1,
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${C.borderSoft}`,
  background: 'transparent',
  color: C.ink,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: G_FONT,
  cursor: 'pointer',
});

// ============================================================
// TIMELINE DA MESA — sub-tela aberta de Operação · Mapa ou Alertas
// Mostra etapas reais do pedido (timestamps de order_status_history),
// chamados de garçom abertos e o que fazer agora em 3 passos.
// ============================================================
const ScreenManagerTableTimeline = ({ dark = false, onTo = () => {} }) => {
  const C = useG(dark);

  const steps = [
    { label: 'Pedido feito', t: '20:42', delta: null, status: 'done', meta: '6 itens · R$ 156,00' },
    { label: 'Confirmado', t: '20:42', delta: 0.4, status: 'done', meta: 'auto · 24s' },
    {
      label: 'Cozinha começou',
      t: '20:54',
      delta: 12,
      status: 'slow',
      meta: 'meta: 2 min · ⚠ excedeu',
    },
    { label: 'Em preparo', t: '—', delta: 16, status: 'open', meta: 'há 16 min · meta 12 min' },
    { label: 'Pronto', t: '—', delta: null, status: 'wait', meta: '' },
    { label: 'Entregue na mesa', t: '—', delta: null, status: 'wait', meta: '' },
  ];

  const callsTimeline = [
    { time: '20:50', txt: 'Cliente chamou garçom (água)', resolved: '20:53', diff: '3 min' },
    {
      time: '21:04',
      txt: 'Cliente chamou garçom (status do pedido)',
      resolved: null,
      diff: 'sem resposta há 6 min',
    },
  ];

  const dotColor = (s) => {
    if (s === 'done') return '#1E8C5A';
    if (s === 'slow') return '#D98E2B';
    if (s === 'open') return '#C43A3A';
    return C.borderSoft;
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Mesa 11 · timeline"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {/* HERO · quanto tempo está parada */}
        <div style={{ padding: '18px 16px 4px' }}>
          <div
            style={{
              background: '#FFF1F1',
              border: '1px solid #C43A3A',
              borderRadius: 14,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                background: '#C43A3A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: 17,
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              28′
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MPill tone="danger" dark={dark}>
                Crítica
              </MPill>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1c19', marginTop: 6 }}>
                Pedido em preparo há 16 min — meta 12 min
              </div>
              <div style={{ fontSize: 12, color: '#A12626', marginTop: 2, fontWeight: 600 }}>
                Garçom: Olivia M. · R$ 156,00
              </div>
            </div>
          </div>
        </div>

        {/* AÇÃO SUGERIDA — linguagem de comando */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div
            style={{
              background: C.ink,
              color: C.bg,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.6,
                opacity: 0.7,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              O que fazer agora
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
              <li style={{ marginBottom: 4 }}>
                <b>Verifique a cozinha</b> — pergunte se o prato está pronto.
              </li>
              <li style={{ marginBottom: 4 }}>
                <b>Avise um garçom</b> pra levar o pedido assim que sair.
              </li>
              <li>
                <b>Fale com o cliente</b> — explique que já está saindo.
              </li>
            </ol>
          </div>
        </div>

        {/* TIMELINE DAS ETAPAS DO PEDIDO */}
        <div style={{ padding: '18px 16px 4px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: C.faint,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Etapas do pedido
          </div>
          <div style={{ position: 'relative', paddingLeft: 22 }}>
            <div
              style={{
                position: 'absolute',
                left: 9,
                top: 6,
                bottom: 6,
                width: 2,
                background: C.borderSoft,
              }}
            />
            {steps.map((s, i) => (
              <div
                key={i}
                style={{ position: 'relative', paddingBottom: 14, display: 'flex', gap: 12 }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -22,
                    top: 3,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: dotColor(s.status),
                    border: s.status === 'wait' ? `2px dashed ${C.borderSoft}` : 'none',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: s.status === 'wait' ? C.faint : C.ink,
                      }}
                    >
                      {s.label}
                    </span>
                    {s.t && (
                      <span
                        style={{
                          fontSize: 12,
                          color: C.faint,
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                        }}
                      >
                        {s.t}
                      </span>
                    )}
                  </div>
                  {s.meta && (
                    <div
                      style={{
                        fontSize: 12,
                        color:
                          s.status === 'open'
                            ? '#C43A3A'
                            : s.status === 'slow'
                              ? '#9A7212'
                              : C.faint,
                        marginTop: 2,
                        fontWeight: s.status === 'open' || s.status === 'slow' ? 600 : 500,
                      }}
                    >
                      {s.meta}
                    </div>
                  )}
                  {s.delta != null && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.faint,
                        marginTop: 2,
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                      }}
                    >
                      Δ {s.delta} min
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CHAMADOS NA MESA */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: C.faint,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Chamados de garçom
          </div>
          {callsTimeline.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '12px 14px',
                border: `1px solid ${c.resolved ? C.borderSoft : '#C43A3A'}`,
                borderRadius: 12,
                marginBottom: 8,
                background: c.resolved ? C.bg : '#FFF1F1',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>{c.txt}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: C.faint,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                  }}
                >
                  {c.time}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: c.resolved ? '#1E8C5A' : '#C43A3A',
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                {c.resolved ? `Resolvido em ${c.diff}` : c.diff}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 16px 24px', display: 'flex', gap: 10 }}>
          <GButton dark={dark} full kind="ghost">
            Avisar cozinha
          </GButton>
          <GButton dark={dark} full kind="primary">
            Cortesia
          </GButton>
        </div>
      </div>
      <MBottomNav active="ops" dark={dark} onTo={onTo} />
    </div>
  );
};

// ============================================================
// MENU DA MESA · role-aware (manager + host) ★ V5 ★
// ────────────────────────────────────────────────────────────
// Substitui o tap default em mesa: Operação · Mapa · Equipe ·
// HostHome · Painel agora abrem ESSA tela. Timeline da mesa lenta
// (ScreenManagerTableTimeline) virou uma das ações dentro daqui.
//
// 3 atributos editáveis: pessoas (stepper · permite exceder com
// confirmação), observação, cliente. Capacidade excedida sinaliza
// "+1 EXCEDENTE" em mostarda — caso real de mesas que juntam
// cadeiras. Ações são role-specific:
//   manager → Cortesia · Contactar · Timeline · Imprimir · Transferir · Fechar
//   host    → Trocar mesa · Avisar gerente · Cancelar liberação
//
// modal: 'capacity' | 'observation' | 'client' | 'more' | 'closeConfirm' | null
// state: 'normal' | 'exceeded' (mostra +1 EXCEDENTE)
// ============================================================
const ScreenManagerTableMenu = ({
  dark = false,
  role = 'manager',
  modal = null,
  state = 'normal',
  partyOverride = null,
  onTo = () => {},
}) => {
  const C = useG(dark);
  const exceeded = state === 'exceeded';
  const party = partyOverride ?? (exceeded ? 5 : 4);
  const seats = 4;
  const excedente = Math.max(0, party - seats);

  // Hero data — mesa 14 da Trattoria, mesa principal de exemplos
  const tableNum = 14;
  const tableStatus = 'crit'; // ok | warn | crit
  const statusLabel = { ok: 'Em andamento', warn: 'Lenta', crit: 'Crítica' }[tableStatus];
  const statusTone = { ok: 'success', warn: 'warn', crit: 'danger' }[tableStatus];

  // Helpers
  const RowDivider = () => <div style={{ height: 1, background: C.borderSoft }} />;

  // Linha de atributo · com edição inline ou tap-to-modal
  const AttrRow = ({ label, value, sub, action, danger, mono }) => (
    <div
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: C.faint,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: value ? C.ink : C.faint,
            fontStyle: value ? 'normal' : 'italic',
            letterSpacing: -0.2,
            marginTop: 4,
            fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          }}
        >
          {value || sub}
        </div>
        {value && sub && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: danger ? '#9A7212' : C.faint,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginTop: 3,
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            }}
          >
            {sub}
          </div>
        )}
      </div>
      {action}
    </div>
  );

  // Stepper para party-size
  const Stepper = ({ value, min = 1 }) => {
    const minusDisabled = value <= min;
    const baseBtn = {
      width: 36,
      height: 36,
      borderRadius: 10,
      border: `1px solid ${C.borderSoft}`,
      background: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          style={{
            all: 'unset',
            boxSizing: 'border-box',
            ...baseBtn,
            opacity: minusDisabled ? 0.35 : 1,
            cursor: minusDisabled ? 'default' : 'pointer',
            color: C.ink,
          }}
        >
          {Icon.minus(16)}
        </button>
        <div
          style={{
            minWidth: 28,
            textAlign: 'center',
            fontSize: 17,
            fontWeight: 800,
            color: C.ink,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: -0.3,
          }}
        >
          {value}
        </div>
        <button
          style={{
            all: 'unset',
            boxSizing: 'border-box',
            ...baseBtn,
            cursor: 'pointer',
            color: C.ink,
          }}
        >
          {Icon.plus(16)}
        </button>
      </div>
    );
  };

  // Lápis discreto · tap-to-edit
  const PencilBtn = () => (
    <button
      style={{
        all: 'unset',
        cursor: 'pointer',
        width: 36,
        height: 36,
        borderRadius: 10,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        color: C.mute,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
      </svg>
    </button>
  );

  // Linha de ação clicável — icon + label + sub + chevron
  const ActionRow = ({ icon, lbl, sub, danger, accent, last }) => {
    const fg = danger ? '#A12626' : accent ? '#7A4D10' : C.ink;
    const tintBg = danger ? '#FFF1F1' : accent ? '#FFF7E6' : C.surface;
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderBottom: last ? 'none' : `1px solid ${C.borderFaint}`,
          background: C.bg,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: tintBg,
            color: fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: fg, letterSpacing: -0.1 }}>{lbl}</div>
          {sub && (
            <div
              style={{
                fontSize: 11.5,
                color: danger ? '#A12626' : C.faint,
                fontWeight: 500,
                marginTop: 2,
                lineHeight: 1.35,
                opacity: danger ? 0.85 : 1,
              }}
            >
              {sub}
            </div>
          )}
        </div>
        <div style={{ color: C.faint, opacity: 0.5, flexShrink: 0 }}>{Icon.arrow(16)}</div>
      </div>
    );
  };

  // Ações de manager (6 linhas) ─────────────────────────
  const managerActions = (
    <>
      <ActionRow
        icon={Icon.gift(18)}
        lbl="Mandar cortesia"
        sub="Sobremesa, drink, desconto ou só uma mensagem"
      />
      <ActionRow
        icon={Icon.chat(18)}
        lbl="Contactar cliente"
        sub="Mandar mensagem rápida — sugestões inteligentes"
      />
      <ActionRow
        icon={Icon.history(18)}
        lbl="Ver timeline da mesa"
        sub="Diagnóstico · ações sugeridas · histórico"
      />
      <ActionRow
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
          </svg>
        }
        lbl="Imprimir conta"
        sub="Conta detalhada · vai pra impressora do salão"
      />
      <ActionRow
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
        }
        lbl="Transferir mesa"
        sub="Mover pra outra mesa · pedidos vão junto"
      />
      <ActionRow
        icon={Icon.x(18)}
        lbl="Fechar mesa"
        sub="Encerra a sessão · só com conta paga"
        danger
        last
      />
    </>
  );

  // Ações de host (3 linhas) ────────────────────────────
  const hostActions = (
    <>
      <ActionRow
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
        }
        lbl="Trocar pra outra mesa"
        sub="Move família pra mesa diferente · pedidos vão junto"
      />
      <ActionRow icon={Icon.chat(18)} lbl="Avisar gerente" sub="Pedir ajuda com a mesa" />
      <ActionRow
        icon={Icon.x(18)}
        lbl="Cancelar liberação"
        sub="Volta a mesa pra livre · só se cliente não chegou"
        accent
        last
      />
    </>
  );

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
        position: 'relative',
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title={`Mesa ${tableNum}`}
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
          right={<GIconBtn dark={dark} icon={Icon.more(20)} />}
        />

        {/* HERO · info da mesa */}
        <div style={{ padding: '16px 16px 4px' }}>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              padding: '14px 14px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: -0.6,
                    lineHeight: 1.05,
                  }}
                >
                  Mesa {tableNum}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.faint,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    marginTop: 6,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                  }}
                >
                  {party} pessoas · aberta há 1h 04 · total R$ 612,40
                </div>
              </div>
              <MPill tone={statusTone} dark={dark}>
                {statusLabel}
              </MPill>
            </div>
          </div>
        </div>

        {/* SEÇÃO 1 · ATRIBUTOS EDITÁVEIS */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
              paddingLeft: 4,
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            }}
          >
            Esta mesa
          </div>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <AttrRow
              label="Pessoas na mesa"
              value={`${party}`}
              sub={
                excedente > 0
                  ? `Mesa comporta ${seats} · +${excedente} excedente`
                  : `Mesa comporta ${seats}`
              }
              danger={excedente > 0}
              mono
              action={<Stepper value={party} />}
            />
            <RowDivider />
            <AttrRow
              label="Observação"
              value="Aniversário · pediu mesa perto da janela"
              action={<PencilBtn />}
            />
            <RowDivider />
            <AttrRow label="Cliente" value="Caleb Souza" action={<PencilBtn />} />
          </div>
        </div>

        {/* SEÇÃO 2 · AÇÕES (varia por role) */}
        <div style={{ padding: '14px 16px 24px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
              paddingLeft: 4,
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            }}
          >
            Ações
          </div>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            {role === 'host' ? hostActions : managerActions}
          </div>

          {role === 'manager' && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                fontSize: 11,
                color: C.faint,
                fontWeight: 500,
                lineHeight: 1.45,
                letterSpacing: 0.1,
              }}
            >
              Pra ações secundárias — reportar problema, marcar VIP, ver auditoria — toque no{' '}
              <b>· · ·</b> do header.
            </div>
          )}
        </div>
      </div>

      {/* MODALS · vaul-style sheets sobre a tela */}
      {modal === 'capacity' && (
        <CapacityExceededModal dark={dark} tableNum={tableNum} party={party} seats={seats} />
      )}
      {modal === 'observation' && (
        <TextEditModal
          dark={dark}
          title="Observação da mesa"
          sub={`Mesa ${tableNum}`}
          placeholder="Ex: aniversário · alergia a frutos do mar · pediu mesa perto da janela"
          initial="Aniversário · pediu mesa perto da janela"
          multiline
        />
      )}
      {modal === 'client' && (
        <TextEditModal
          dark={dark}
          title="Cliente da mesa"
          sub={`Mesa ${tableNum}`}
          placeholder="Nome ou telefone"
          initial="Caleb Souza"
          hint="Salvo só nesta sessão · vira contato no DB com confirmação do cliente."
        />
      )}
      {modal === 'more' && (
        <MoreSheet
          dark={dark}
          title={`Mesa ${tableNum} · mais ações`}
          actions={[
            {
              icon: Icon.flame,
              label: 'Reportar problema com a mesa',
              sub: 'Cadeira quebrada, lâmpada queimada — marca pra manutenção',
            },
            {
              icon: Icon.sparkle,
              label: 'Marcar como VIP nessa sessão',
              sub: 'Puxa pra prioridade alta dos chamados',
            },
            {
              icon: Icon.history,
              label: 'Ver auditoria',
              sub: 'Quem abriu, fechou ou transferiu a mesa',
            },
          ]}
        />
      )}
      {modal === 'closeConfirm' && <CloseTableModal dark={dark} tableNum={tableNum} />}

      <MBottomNav active={role === 'host' ? 'tables' : 'ops'} dark={dark} onTo={onTo} />
    </div>
  );
};

// ============================================================
// MODAL · CAPACIDADE EXCEDIDA (vaul) ★ V5 ★
// ────────────────────────────────────────────────────────────
// Dispara na primeira vez que o stepper passa party > seats.
// Caso de uso real: mesa juntou cadeiras e virou de 4 pra 6.
// Sistema aceita TODOS os pedidos das pessoas extras na mesma
// conta — não bloqueia, só confirma intenção.
// ============================================================
const CapacityExceededModal = ({ dark = false, tableNum = 14, party = 5, seats = 4 }) => {
  const C = useG(dark);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        animation: 'gFadeIn 180ms ease-out',
      }}
    >
      <div
        style={{
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          paddingTop: 8,
          paddingBottom: 24,
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: dark ? '#3a3a40' : '#dcdcdc',
            margin: '0 auto 14px',
          }}
        />

        <div style={{ padding: '6px 22px 4px' }}>
          {/* Eyebrow mono caps */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: '#9A7212',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            }}
          >
            Confirmar capacidade
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: -0.4,
              lineHeight: 1.2,
            }}
          >
            Mais pessoas que a capacidade da mesa
          </div>

          {/* Sub */}
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: C.mute,
              lineHeight: 1.5,
              marginTop: 8,
            }}
          >
            Mesa {tableNum} comporta{' '}
            <b style={{ color: C.ink, fontWeight: 700 }}>{seats} lugares</b> · você está marcando{' '}
            <b style={{ color: C.ink, fontWeight: 700 }}>{party} pessoas</b>. Confirma que juntaram
            cadeiras ou expandiram a mesa?
          </div>

          {/* Visual diagram · seats vs people */}
          <div
            style={{
              margin: '14px 0 16px',
              padding: '12px 14px',
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 12,
              background: C.surface,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 8,
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
              }}
            >
              Visual
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {Array.from({ length: party }).map((_, i) => {
                const over = i >= seats;
                return (
                  <div
                    key={i}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: over ? '#FFF7E6' : C.bg,
                      border: over ? `1.5px dashed #9A7212` : `1.5px solid ${C.borderSoft}`,
                      color: over ? '#9A7212' : C.ink,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {Icon.user(14)}
                  </div>
                );
              })}
              <div
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#9A7212',
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                }}
              >
                +{party - seats} excedente
              </div>
            </div>
          </div>

          {/* Stack de CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <button
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'center',
                padding: '14px 16px',
                borderRadius: 12,
                background: C.ink,
                color: C.bg,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
              }}
            >
              Sim · {party} pessoas na mesa {tableNum}
            </button>
            <button
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'center',
                padding: '14px 16px',
                borderRadius: 12,
                background: 'transparent',
                color: C.ink,
                border: `1.5px solid ${C.borderSoft}`,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
              }}
            >
              Cancelar · manter em {seats}
            </button>
          </div>

          {/* Sub-info */}
          <div
            style={{
              marginTop: 14,
              padding: '0 4px',
              fontSize: 10,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              lineHeight: 1.5,
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            }}
          >
            A comanda da mesa aceita todos os pedidos das {party} pessoas na mesma conta.
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MODAL · EDITAR ATRIBUTO DE TEXTO (vaul · genérico) ★ V5 ★
// ────────────────────────────────────────────────────────────
// Usado pra Observação (textarea multiline) e Cliente (input
// single-line). 2 CTAs: Salvar (ink filled) · Cancelar (outline).
// ============================================================
const TextEditModal = ({
  dark = false,
  title = 'Editar',
  sub = '',
  placeholder = '',
  initial = '',
  multiline = false,
  hint = null,
}) => {
  const C = useG(dark);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        animation: 'gFadeIn 180ms ease-out',
      }}
    >
      <div
        style={{
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          paddingTop: 8,
          paddingBottom: 22,
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: dark ? '#3a3a40' : '#dcdcdc',
            margin: '0 auto 14px',
          }}
        />

        <div style={{ padding: '6px 22px 4px' }}>
          {sub && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 6,
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
              }}
            >
              {sub}
            </div>
          )}
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: -0.3,
              marginBottom: 14,
            }}
          >
            {title}
          </div>

          <div
            style={{
              background: C.surface,
              border: `1.5px solid ${C.borderSoft}`,
              borderRadius: 12,
              padding: 14,
              fontSize: 14,
              color: C.ink,
              fontWeight: 500,
              lineHeight: 1.45,
              minHeight: multiline ? 100 : 'auto',
            }}
          >
            {initial || <span style={{ color: C.faint, fontStyle: 'italic' }}>{placeholder}</span>}
            <span
              style={{
                display: 'inline-block',
                width: 1.5,
                height: 16,
                background: C.ink,
                marginLeft: 1,
                animation: 'gBlink 1s infinite',
                verticalAlign: 'middle',
              }}
            />
          </div>

          {hint && (
            <div
              style={{
                fontSize: 11.5,
                color: C.faint,
                fontWeight: 500,
                marginTop: 8,
                padding: '0 4px',
                lineHeight: 1.45,
              }}
            >
              {hint}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                flex: 1,
                textAlign: 'center',
                padding: '13px 16px',
                borderRadius: 12,
                background: 'transparent',
                color: C.ink,
                border: `1.5px solid ${C.borderSoft}`,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
              }}
            >
              Cancelar
            </button>
            <button
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                flex: 1,
                textAlign: 'center',
                padding: '13px 16px',
                borderRadius: 12,
                background: C.ink,
                color: C.bg,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MODAL · FECHAR MESA (confirmação destrutiva) ★ V5 ★
// ────────────────────────────────────────────────────────────
// Acionada pela ação "Fechar mesa" do menu da mesa do gerente.
// CTA destrutiva é a primeira em vermelho · cancelar é outline.
// ============================================================
const CloseTableModal = ({ dark = false, tableNum = 14 }) => {
  const C = useG(dark);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        animation: 'gFadeIn 180ms ease-out',
      }}
    >
      <div
        style={{
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          paddingTop: 8,
          paddingBottom: 22,
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: dark ? '#3a3a40' : '#dcdcdc',
            margin: '0 auto 14px',
          }}
        />
        <div style={{ padding: '6px 22px 4px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: '#A12626',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 6,
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            }}
          >
            Ação destrutiva
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: -0.4,
              lineHeight: 1.2,
            }}
          >
            Fechar a mesa {tableNum}?
          </div>
          <div
            style={{ fontSize: 14, fontWeight: 500, color: C.mute, lineHeight: 1.5, marginTop: 8 }}
          >
            Encerra a sessão e libera a mesa pro próximo cliente. Só faz isso depois que{' '}
            <b style={{ color: C.ink, fontWeight: 700 }}>a conta foi paga</b>.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <button
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'center',
                padding: '14px 16px',
                borderRadius: 12,
                background: '#A12626',
                color: '#fff',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
              }}
            >
              Fechar mesa {tableNum}
            </button>
            <button
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'center',
                padding: '14px 16px',
                borderRadius: 12,
                background: 'transparent',
                color: C.ink,
                border: `1.5px solid ${C.borderSoft}`,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// REMOVIDO V6 · 2026-05 ★
// ────────────────────────────────────────────────────────────
// `ScreenManagerShiftBoard` (3 KPIs + sugestão IA + cards expandidos com
// ações inline) e `ScreenManagerShiftSchedule` (timeline 12-24h com
// swimlanes) foram fundidas com `ScreenManagerStaffList` numa única tela
// `ScreenManagerStaff` (vive em `garcom-screens-c.jsx`).
//
// Motivações:
//   · ShiftBoard era acessada via "Ver mais →" do Painel — pattern morto
//     desde V4 (Painel V4 redirige direto pra rotas terminais), tornando
//     a tela órfã do fluxo.
//   · ShiftSchedule (timeline visual) era difícil de ler pra gerentes sem
//     cabeça pra timeline · virou lista compacta de turnos que expande
//     inline mostrando quem está em cada um (★ S resolvido ★).
//   · KPI "MESAS/PESSOA · 4,6" virou "CARGA MÉDIA · 4,6 mesas/garçom"
//     com sub explicativo e tooltip detalhado (★ Q resolvido ★).
//
// O placeholder `ScreenManagerShiftEditor` (também em screens-c.jsx)
// segura o lugar do "Editar turnos →" pra V6 futura.
// ============================================================

// ============================================================
// ALERTAS · lista completa (abre de "Ver todos →" no Painel)
// Sub-tela com bottom nav active='ops' (alertas vivem em Operação).
// ============================================================
const ScreenManagerAlertsAll = ({ dark = false, onTo = () => {} }) => {
  const C = useG(dark);
  const [filter, setFilter] = useStateD(0);

  const alerts = [
    {
      id: 1,
      sev: 'high',
      kind: 'kitchen-slow',
      t: 'agora',
      ttl: 'Risoto cogumelos · 22 min na cozinha',
      sub: 'Mesa 14 · meta 12 min · Marina chamou 2×',
      actions: ['Avisar cozinha', 'Contactar cliente'],
    },
    {
      id: 2,
      sev: 'high',
      kind: 'waiter-late',
      t: 'agora',
      ttl: 'Henrique · 3 chamados sem resposta há > 4 min',
      sub: 'Mesas 7, 9, 12 · ele está com 5 mesas',
      actions: ['Realocar mesa', 'Chamar Henrique'],
    },
    {
      id: 3,
      sev: 'med',
      kind: 'table-cold',
      t: '5 min',
      ttl: 'Pedido pronto há 9 min · ainda na pass',
      sub: 'Mesa 14 · 2 pratos esperando entrega',
      actions: ['Entregar agora', 'Avisar Caleb'],
    },
    {
      id: 4,
      sev: 'med',
      kind: 'kitchen-queue',
      t: '8 min',
      ttl: 'Cozinha · fila com 11 pedidos',
      sub: 'Capacidade da cozinha é 8 simultâneos',
      actions: ['Pausar pedidos', 'Ver fila'],
    },
    {
      id: 5,
      sev: 'med',
      kind: 'payment-stuck',
      t: '12 min',
      ttl: 'Mesa 8 pediu a conta há 12 min',
      sub: 'Olivia ocupada com mesa 11',
      actions: ['Levar maquininha', 'Pagar pelo app'],
    },
    {
      id: 6,
      sev: 'low',
      kind: 'low-stock',
      t: '20 min',
      ttl: 'Estoque · vinho Malbec acabando',
      sub: '2 garrafas restantes · venda média 3/noite',
      actions: ['Avisar bar', 'Esconder do menu'],
    },
  ];

  const tabs = [
    { lbl: 'Todos', count: alerts.length },
    { lbl: 'Críticos', count: alerts.filter((a) => a.sev === 'high').length },
    { lbl: 'Médios', count: alerts.filter((a) => a.sev === 'med').length },
    { lbl: 'Cozinha', count: alerts.filter((a) => a.kind.startsWith('kitchen')).length },
  ];
  const filtered =
    filter === 0
      ? alerts
      : filter === 1
        ? alerts.filter((a) => a.sev === 'high')
        : filter === 2
          ? alerts.filter((a) => a.sev === 'med')
          : alerts.filter((a) => a.kind.startsWith('kitchen'));

  const sevColor = {
    high: { bar: '#C43A3A', tag: 'danger', label: 'CRÍTICO' },
    med: { bar: '#D98E2B', tag: 'warn', label: 'ATENÇÃO' },
    low: { bar: C.faint, tag: 'mute', label: 'AVISO' },
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Atenção · agora"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
          right={<GIconBtn dark={dark} icon={Icon.search(20)} />}
        />

        {/* RESUMO de KPIs */}
        <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
          <MStat
            dark={dark}
            label="Críticos"
            value={`${tabs[1].count}`}
            sub="resolver agora"
            accent="#C43A3A"
            help="Pedidos ou chamados muito acima da meta — cliente esperando."
          />
          <MStat
            dark={dark}
            label="Atenção"
            value={`${tabs[2].count}`}
            sub="próximos 10 min"
            accent="#9A7212"
            help="Vai virar crítico se não agir logo."
          />
        </div>

        {/* TABS */}
        <div style={{ padding: '14px 16px 4px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {tabs.map((t, i) => (
            <div
              key={t.lbl}
              onClick={() => setFilter(i)}
              style={{
                padding: '6px 12px',
                borderRadius: 100,
                border: `1px solid ${filter === i ? C.ink : C.borderSoft}`,
                background: filter === i ? C.ink : 'transparent',
                color: filter === i ? C.bg : C.ink,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              {t.lbl} · {t.count}
            </div>
          ))}
        </div>

        {/* LISTA com 2 ações inline + dispensar sutil */}
        <div
          style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {filtered.map((a) => {
            const sc = sevColor[a.sev];
            return (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderLeft: `4px solid ${sc.bar}`,
                  background: C.bg,
                }}
              >
                <div style={{ padding: 12 }}>
                  <div style={{ marginBottom: 4 }}>
                    <MPill tone={sc.tag} dark={dark}>
                      {sc.label} · há {a.t}
                    </MPill>
                  </div>
                  <div
                    style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, letterSpacing: -0.1 }}
                  >
                    {a.ttl}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.faint,
                      fontWeight: 500,
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {a.sub}
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                    {a.actions.map((act, i) => (
                      <button key={i} style={i === 0 ? btnPrimary(C) : btnGhost(C)}>
                        {act}
                      </button>
                    ))}
                    <button
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'transparent',
                        color: C.faint,
                        fontSize: 12,
                        fontWeight: 500,
                        fontFamily: G_FONT,
                        cursor: 'pointer',
                      }}
                    >
                      Dispensar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* histórico do dia */}
        <div style={{ padding: '0 16px 24px' }}>
          <div
            style={{
              fontSize: 11,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Resolvidos hoje · 14
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { t: '19:18', txt: 'Mesa 11 · conta paga (8 min)', who: 'Olivia' },
              { t: '19:02', txt: 'Cozinha · fila normalizou (8/8)', who: 'auto' },
              { t: '18:47', txt: 'Mesa 5 · garçom respondeu chamado', who: 'Caleb' },
              { t: '18:30', txt: 'Estoque · cerveja IPA reposta', who: 'bar' },
            ].map((h, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: C.surface,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: C.faint,
                    fontWeight: 700,
                    width: 36,
                  }}
                >
                  {h.t}
                </div>
                <div style={{ flex: 1, fontSize: 12, color: C.ink, fontWeight: 500 }}>{h.txt}</div>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{h.who}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <MBottomNav active="ops" dark={dark} onTo={onTo} />
    </div>
  );
};

// ============================================================
// FERRAMENTA · ALTERAR ORDEM DE PREPARO
// (gerente → cozinha · 3 estados: select → sent → accepted)
// ============================================================
const ScreenManagerKitchenReorder = ({ dark = false, state = 'select' }) => {
  const C = useG(dark);

  const queue = [
    {
      id: '#142',
      table: 14,
      items: 'Risoto cogumelos',
      minutes: 22,
      meta: 12,
      late: true,
      waiter: 'OM',
      waiterName: 'Olivia M.',
      selected: true,
    },
    {
      id: '#143',
      table: 7,
      items: 'Filé + risoto · 2 pratos',
      minutes: 18,
      meta: 12,
      late: true,
      waiter: 'CS',
      waiterName: 'Caleb S.',
      selected: true,
    },
    {
      id: '#144',
      table: 9,
      items: 'Pizza margherita',
      minutes: 15,
      meta: 18,
      late: false,
      waiter: 'HL',
      waiterName: 'Henrique L.',
      selected: false,
    },
    {
      id: '#145',
      table: 12,
      items: 'Salada césar · 2',
      minutes: 8,
      meta: 8,
      late: false,
      waiter: 'CS',
      waiterName: 'Caleb S.',
      selected: false,
    },
    {
      id: '#146',
      table: 5,
      items: 'Tagliatelle · 1 prato',
      minutes: 5,
      meta: 14,
      late: false,
      waiter: 'OM',
      waiterName: 'Olivia M.',
      selected: false,
    },
  ];

  const selected = queue.filter((q) => q.selected);
  const heroByState = {
    select: {
      bg: '#FFF1EC',
      bd: '#C2401A',
      fg: '#7A3010',
      label: 'Cozinha lenta agora',
      title: 'Fila com 11 pedidos · 2 já passaram da meta',
      meta: 'Selecione abaixo quais puxar pra frente.',
    },
    sent: {
      bg: '#EFF3FA',
      bd: '#3B5FBE',
      fg: '#1F3784',
      label: 'Aguardando cozinha',
      title: 'Aviso enviado · cozinha vai responder',
      meta: 'Resposta esperada em ~30 segundos. Você pode cancelar.',
    },
    accepted: {
      bg: '#EFF5EC',
      bd: '#1E8C5A',
      fg: '#0F5A37',
      label: 'Cozinha aceitou',
      title: '2 pedidos foram puxados pra frente',
      meta: 'Os garçons das mesas afetadas foram avisados.',
    },
  };
  const hero = heroByState[state];

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Alterar ordem de preparo"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        <div style={{ padding: '16px 16px 4px' }}>
          <div
            style={{
              background: hero.bg,
              border: `1px solid ${hero.bd}`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {hero.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: -0.2,
                marginBottom: hero.meta ? 4 : 0,
              }}
            >
              {hero.title}
            </div>
            {hero.meta && (
              <div style={{ fontSize: 12.5, color: hero.fg, fontWeight: 600 }}>{hero.meta}</div>
            )}
            {state === 'sent' && (
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: hero.bd,
                      opacity: 0.6,
                      animation: 'gPulse 1.4s infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {state === 'select' && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Fila atual · toque pra selecionar
              </div>
              {queue.map((p) => {
                const sel = p.selected;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      marginBottom: 8,
                      background: sel ? '#FFF1EC' : C.bg,
                      border: `1px solid ${sel ? '#C2401A' : C.borderSoft}`,
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: sel ? '#C2401A' : 'transparent',
                        border: `1.5px solid ${sel ? '#C2401A' : C.borderSoft}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                        color: '#fff',
                      }}
                    >
                      {sel && Icon.check(14)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: C.ink,
                            letterSpacing: -0.2,
                          }}
                        >
                          Mesa {p.table}{' '}
                          <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>
                            · {p.id}
                          </span>
                        </div>
                        {p.late ? (
                          <MPill tone="danger" dark={dark}>
                            {p.minutes} min · atrasada
                          </MPill>
                        ) : (
                          <MPill tone="mute" dark={dark}>
                            {p.minutes} min
                          </MPill>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 3 }}>
                        {p.items}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.faint,
                          fontWeight: 500,
                          marginTop: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: M_TEAM.find((x) => x.init === p.waiter)?.color || '#777',
                            color: '#fff',
                            fontSize: 8,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {p.waiter}
                        </span>
                        {p.waiterName} · meta {p.meta} min
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Por quê (opcional)
              </div>
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 64,
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                Mesa 14 está há 22 min esperando · cliente comemorando aniversário, queremos servir
                junto da mesa 7.
              </div>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 6 }}>
                A cozinha vê o motivo. Ajuda eles a decidir.
              </div>
            </div>

            <div style={{ height: 110 }} />
          </>
        )}

        {state === 'sent' && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Pedidos a puxar pra frente
              </div>
              {selected.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: 12,
                    marginBottom: 8,
                    background: C.bg,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: '#EFF3FA',
                      color: '#1F3784',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 800,
                      letterSpacing: -0.3,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p.table}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}
                    >
                      Mesa {p.table}{' '}
                      <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>
                        · {p.id}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 3 }}>
                      {p.items} · {p.minutes} min em preparo
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 12.5,
                  color: C.mute,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: C.ink, fontWeight: 700 }}>Motivo enviado.</span> Mesa 14 está
                há 22 min esperando — cliente comemorando aniversário, queremos servir junto da mesa
                7.
              </div>
            </div>
            <div style={{ height: 110 }} />
          </>
        )}

        {state === 'accepted' && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Garçons avisados
              </div>
              {[
                {
                  name: 'Olivia M.',
                  init: 'OM',
                  table: 14,
                  item: 'Risoto cogumelos',
                  eta: '~5 min',
                },
                { name: 'Caleb S.', init: 'CS', table: 7, item: 'Filé + risoto', eta: '~8 min' },
              ].map((w) => (
                <div
                  key={w.init}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: 12,
                    marginBottom: 8,
                    background: C.bg,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                >
                  <MAvatar
                    name={w.name}
                    init={w.init}
                    color={M_TEAM.find((x) => x.init === w.init)?.color || '#777'}
                    size={38}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}
                    >
                      {w.name}{' '}
                      <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>
                        · mesa {w.table}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                      Sai em {w.eta} · {w.item}
                    </div>
                  </div>
                  <div style={{ color: '#1E8C5A', flexShrink: 0 }}>{Icon.check(20)}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: C.faint,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  O que aconteceu
                </div>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: C.ink,
                  }}
                >
                  <li style={{ marginBottom: 4 }}>
                    A cozinha <b>repriorizou</b> a fila — pedidos #142 e #143 viraram primeiros.
                  </li>
                  <li style={{ marginBottom: 4 }}>
                    Olivia e Caleb receberam push <b>"seu pedido foi adiantado"</b>.
                  </li>
                  <li>Outros pedidos da fila são empurrados pra trás na ordem que estavam.</li>
                </ol>
              </div>
            </div>
            <div style={{ height: 110 }} />
          </>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        {state === 'select' && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 12, color: C.mute, fontWeight: 600 }}>
                <span style={{ color: C.ink, fontWeight: 800 }}>{selected.length} pedidos</span>{' '}
                selecionados
              </div>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>
                A cozinha decide se aceita
              </div>
            </div>
            <GButton dark={dark} full kind="primary">
              Avisar cozinha · puxar {selected.length} pra frente
            </GButton>
          </>
        )}
        {state === 'sent' && (
          <GButton dark={dark} full kind="ghost">
            Cancelar pedido
          </GButton>
        )}
        {state === 'accepted' && (
          <GButton dark={dark} full kind="primary">
            Voltar pro painel
          </GButton>
        )}
      </div>
    </div>
  );
};

// ============================================================
// FERRAMENTA · PAUSAR PEDIDOS NOVOS (modo silencioso)
// Cliente não vê — pra ele, ETA aumenta. Estados: confirm → active.
// ============================================================
const ScreenManagerOrdersPause = ({ dark = false, state = 'confirm', duration = 5 }) => {
  const C = useG(dark);
  const durations = [5, 10, 15, 30];

  if (state === 'confirm') {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          fontFamily: G_FONT,
          color: C.ink,
        }}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          <MTopBar
            dark={dark}
            title="Pausar pedidos novos"
            left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
          />

          <div style={{ padding: '16px 16px 4px' }}>
            <div
              style={{
                background: '#FFF7E6',
                border: '1px solid #F0DCB6',
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#7A4D10',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Cozinha sobrecarregada
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#7A4D10',
                  letterSpacing: -0.2,
                  marginBottom: 6,
                }}
              >
                Fila com 11 pedidos · capacidade da cozinha é 8
              </div>
              <div style={{ fontSize: 12.5, color: '#7A4D10', fontWeight: 600, lineHeight: 1.4 }}>
                Pausar entrada de pedidos novos por alguns minutos pra cozinha alcançar o ritmo.
              </div>
            </div>
          </div>

          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Importante · cliente não vê pausa
              </div>
              <ol
                style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: C.ink }}
              >
                <li style={{ marginBottom: 6 }}>
                  O cardápio do cliente <b>continua aberto</b> — ele faz pedido normalmente.
                </li>
                <li style={{ marginBottom: 6 }}>
                  O <b>tempo estimado de preparo aumenta</b> silenciosamente — soma o tempo da pausa
                  ao ETA.
                </li>
                <li style={{ marginBottom: 6 }}>
                  Os pedidos novos ficam em fila de espera. Quando a pausa acabar, entram na
                  cozinha.
                </li>
                <li>
                  Sistema <b>retoma sozinho</b> no fim do tempo. Você recebe um push avisando.
                </li>
              </ol>
            </div>
          </div>

          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Quanto tempo
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {durations.map((min) => {
                const sel = min === duration;
                return (
                  <div
                    key={min}
                    style={{
                      padding: '14px 8px',
                      textAlign: 'center',
                      borderRadius: 12,
                      background: sel ? C.ink : C.bg,
                      border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                      color: sel ? C.bg : C.ink,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: -0.5,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {min}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        marginTop: 1,
                        opacity: sel ? 0.85 : 1,
                      }}
                    >
                      min
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 8 }}>
              Recomendação: 5–10 min é o suficiente pra fila baixar sem afetar muito o cliente.
            </div>
          </div>

          <div style={{ height: 30 }} />
        </div>

        <div
          style={{
            padding: '12px 16px 18px',
            background: C.bg,
            borderTop: `1px solid ${C.borderSoft}`,
          }}
        >
          <GButton dark={dark} full kind="primary">
            Pausar pedidos por {duration} min
          </GButton>
          <div
            style={{
              fontSize: 11,
              color: C.faint,
              fontWeight: 500,
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            Você pode despausar antes a qualquer momento.
          </div>
        </div>
      </div>
    );
  }

  // state === 'active'
  const elapsed = duration * 60 - 263;
  const remaining = duration * 60 - elapsed;
  const mm = Math.floor(remaining / 60)
    .toString()
    .padStart(2, '0');
  const ss = (remaining % 60).toString().padStart(2, '0');
  const pctElapsed = (elapsed / (duration * 60)) * 100;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Pedidos pausados"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        <div style={{ padding: '20px 16px 4px' }}>
          <div
            style={{
              background: '#FFF7E6',
              border: '1px solid #F0DCB6',
              borderRadius: 16,
              padding: '20px 16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#7A4D10',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Pausa ativa · retoma sozinho
            </div>
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: -2,
                color: '#7A4D10',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {mm}
              <span style={{ opacity: 0.5 }}>:</span>
              {ss}
            </div>
            <div
              style={{
                marginTop: 14,
                height: 6,
                borderRadius: 100,
                background: '#F0DCB6',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pctElapsed}%`,
                  height: '100%',
                  background: '#9A7212',
                  transition: 'width 1s linear',
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#7A4D10', fontWeight: 700, marginTop: 8 }}>
              Pausada às 21:08 · termina às 21:13
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px 4px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Enquanto está pausado
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                padding: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.faint,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                Cliente vendo
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: C.ink,
                  marginTop: 3,
                  letterSpacing: -0.2,
                }}
              >
                Cardápio normal
              </div>
              <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                ETA aumentado em +5 min
              </div>
            </div>
            <div
              style={{
                padding: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.faint,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                Pedidos na fila
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: C.ink,
                  marginTop: 1,
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                3
              </div>
              <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                entram quando retomar
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <div
              style={{
                padding: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.faint,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                Cozinha · fila
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#1E8C5A',
                  marginTop: 1,
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                7
              </div>
              <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                era 11 · caindo
              </div>
            </div>
            <div
              style={{
                padding: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.faint,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                Saída média
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: C.ink,
                  marginTop: 1,
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                14 min
              </div>
              <div style={{ fontSize: 11, color: '#1E8C5A', fontWeight: 700, marginTop: 2 }}>
                ↓ era 22 min
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px 4px' }}>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: C.ink,
                color: C.bg,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.shield(16)}
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                Cliente não percebe a pausa
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.mute,
                  fontWeight: 500,
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                Pra ele, o cardápio funciona normal e o tempo estimado é maior. Sem mensagem de
                "indisponível", sem carrinho bloqueado.
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 110 }} />
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <GButton dark={dark} full kind="ghost">
            +5 min
          </GButton>
          {/* V4 (2026-05): "Despausar agora" também dispara o estado
              `resolved-summary` na seção "Em curso" do Painel — mesmo
              padrão do auto-resume, mas sem push (manual). Tap leva
              pro ScreenManagerOrdersPauseSummary com KPIs antes/depois. */}
          <GButton dark={dark} full kind="primary">
            Despausar agora
          </GButton>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MOpSummary — TEMPLATE DE POST-MORTEM LEVE (V4 · 2026-05)
// ────────────────────────────────────────────────────────────
// Padrão reusável: quando uma operação async termina (auto ou manual),
// abre uma tela cheia mostrando O QUE MELHOROU — duração, KPIs antes/
// depois, timeline real do que aconteceu durante, e sugestão de
// próximo passo se IA detectar.
//
// Hoje implementado pra `pause-orders` (ScreenManagerOrdersPauseSummary).
// Reusável pra:
//   • kitchen-reorder resolvida → "Cozinha aceitou em 23s · 2 pedidos puxados"
//   • contact-client lida → "Cliente leu em 1m12s · resposta em XYZ"
//   • courtesy aceita → "Cliente aceitou em 32s · garçom Olivia avisada"
// ============================================================
const MOpSummary = ({
  dark = false,
  topbarTitle = 'Resumo',
  hero, // { kicker, title }
  kpis = [], // [{ label, before, after, delta, accent, value, sub }]
  timeline = [], // [{ time, text, dot }]
  suggestion, // { text, ctaLabel, onCta } | null
  onBack = () => {},
  onClose = () => {},
}) => {
  const C = useG(dark);
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title={topbarTitle}
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {/* HERO · duração + janela ─────────────────────────── */}
        {hero && (
          <div style={{ padding: '16px 16px 4px' }}>
            <div
              style={{
                background: '#EFF5EC',
                border: '1px solid #2F7D4F',
                borderRadius: 14,
                padding: 14,
              }}
            >
              {hero.kicker && (
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: '#0F5A37',
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}
                >
                  {hero.kicker}
                </div>
              )}
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: '#0F5A37',
                  letterSpacing: -0.3,
                  lineHeight: 1.25,
                }}
              >
                {hero.title}
              </div>
            </div>
          </div>
        )}

        {/* KPIs · 3 tiles compactos lado a lado ────────────── */}
        {kpis.length > 0 && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Antes e depois
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
                gap: 8,
              }}
            >
              {kpis.map((k, i) => {
                const accentMap = { success: '#1E8C5A', warn: '#9A7212', danger: '#C43A3A' };
                const accent = accentMap[k.accent] || C.ink;
                return (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      background: C.bg,
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9.5,
                        color: C.faint,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {k.label}
                    </div>
                    {k.before != null && k.after != null ? (
                      <div style={{ marginTop: 4 }}>
                        <span
                          style={{
                            fontSize: 11,
                            color: C.faint,
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            textDecoration: 'line-through',
                            textDecorationThickness: 1,
                          }}
                        >
                          {k.before}
                        </span>
                        <span style={{ color: C.faint, margin: '0 4px', fontSize: 10 }}>→</span>
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 800,
                            color: C.ink,
                            letterSpacing: -0.5,
                            fontVariantNumeric: 'tabular-nums',
                            lineHeight: 1.1,
                          }}
                        >
                          {k.after}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: C.ink,
                          marginTop: 2,
                          letterSpacing: -0.5,
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight: 1.1,
                        }}
                      >
                        {k.value}
                      </div>
                    )}
                    {(k.delta || k.sub) && (
                      <div
                        style={{
                          fontSize: 10,
                          marginTop: 4,
                          fontWeight: 700,
                          color: accent,
                          letterSpacing: 0.2,
                        }}
                      >
                        {k.delta || k.sub}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TIMELINE · o que aconteceu durante ──────────────── */}
        {timeline.length > 0 && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              O que aconteceu durante
            </div>
            <div
              style={{
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                padding: '6px 14px',
              }}
            >
              {timeline.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: i < timeline.length - 1 ? `1px dashed ${C.borderFaint}` : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      flexShrink: 0,
                      fontSize: 11,
                      color: C.faint,
                      fontWeight: 700,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: 0.2,
                      paddingTop: 1,
                    }}
                  >
                    {ev.time}
                  </div>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: ev.dot || '#1E8C5A',
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 500,
                      color: C.ink,
                      lineHeight: 1.4,
                    }}
                  >
                    {ev.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUGESTÃO ── próximo passo · IA opcional ─────────── */}
        {suggestion && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Próximo passo sugerido</span>
              <MPill tone="info" dark={dark}>
                IA
              </MPill>
            </div>
            <div
              style={{
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 500,
                  lineHeight: 1.5,
                  marginBottom: 10,
                }}
              >
                {suggestion.text}
              </div>
              {suggestion.ctaLabel && (
                <button
                  onClick={suggestion.onCta}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: C.ink,
                    color: C.bg,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: -0.1,
                  }}
                >
                  {suggestion.ctaLabel}
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ height: 30 }} />
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <GButton dark={dark} full kind="primary">
          Voltar pro Painel
        </GButton>
      </div>
    </div>
  );
};

// ============================================================
// SCREEN · RESUMO PÓS-PAUSA (V4 · 2026-05)
// ────────────────────────────────────────────────────────────
// Aberta de 2 entradas:
//   1. Card resolved-summary na seção "Em curso" do Painel · "Ver detalhes"
//   2. Push de retomada automática (lock screen · "ver resumo")
// Mostra a duração, 3 KPIs antes/depois (fila/saída/entraram), timeline
// dos eventos que aconteceram durante a pausa, e sugestão de próximo
// passo (reordenar cozinha) se a saída ainda estiver alta.
// ============================================================
const ScreenManagerOrdersPauseSummary = ({ dark = false, onTo = () => {} }) => {
  return (
    <MOpSummary
      dark={dark}
      topbarTitle="Resumo da pausa"
      hero={{
        kicker: 'PAUSA TERMINOU · DURAÇÃO 5 MIN',
        title: 'Você pausou 5 min entre 21:08 e 21:13',
      }}
      kpis={[
        { label: 'Fila da cozinha', before: 11, after: 7, delta: '↓ 4 pedidos', accent: 'success' },
        {
          label: 'Saída média',
          before: '22 min',
          after: '14 min',
          delta: '↓ 8 min',
          accent: 'success',
        },
        { label: 'Entraram na fila', value: 3, sub: 'entram agora', accent: 'warn' },
      ]}
      timeline={[
        {
          time: '21:08',
          text: 'Pausa iniciada · 11 pedidos na fila · cozinha sobrecarregada',
          dot: '#9A7212',
        },
        { time: '21:09', text: 'Pedido pronto pra entrega · mesa 8', dot: '#1E8C5A' },
        { time: '21:11', text: 'Chamado resolvido · mesa 12 (Caleb atendeu)', dot: '#1E8C5A' },
        { time: '21:12', text: 'Pedido pronto pra entrega · mesa 3', dot: '#1E8C5A' },
        {
          time: '21:13',
          text: 'Pausa terminou · cozinha retomou · 3 pedidos novos entraram',
          dot: '#3B5FBE',
        },
      ]}
      suggestion={{
        text: 'Saída média ainda alta (14 min · meta 12 min). Considerar reordenar cozinha pra puxar mesa 14 pra frente — ela está esperando há 22 min.',
        ctaLabel: 'Reordenar cozinha agora',
        onCta: () => onTo('mgr-kitchen-reorder'),
      }}
      onBack={() => onTo('mgr-home')}
      onClose={() => onTo('mgr-home')}
    />
  );
};

// ============================================================
// FERRAMENTA · CORTESIA (gerente → cliente web · garçom)
// 3 estados: select → sent → accepted
// ============================================================
const ScreenManagerCompensateClient = ({
  dark = false,
  state = 'select',
  preselectedTable = null, // ★ V5 ★ quando vem do TableMenu
}) => {
  const C = useG(dark);

  // Quando preselectedTable está setado (vem do menu da mesa), a mesa
  // de origem é destacada — ela é a única "selected" da lista, e o
  // chamado visual fica mais forte (ring verde sólido + label "vinda
  // do menu"). Sem preselectedTable, a tela é a antiga ferramenta a
  // frio (gerente escolhe a mesa do zero · mesa 14 default).
  const tables = [
    { id: 4, status: 'normal', party: 2, time: '32 min' },
    { id: 7, status: 'normal', party: 4, time: '48 min' },
    { id: 9, status: 'cold', party: 3, time: '52 min' },
    { id: 11, status: 'normal', party: 5, time: '20 min' },
    { id: 12, status: 'normal', party: 2, time: '15 min' },
    { id: 14, status: 'slow', party: 4, time: '1h 04' },
  ].map((t) => ({
    ...t,
    selected: preselectedTable != null ? t.id === preselectedTable : t.id === 14,
    locked: preselectedTable != null && t.id === preselectedTable,
  }));

  // Cortesia = freebie material. Comunicação pura sem brinde fica
  // no fluxo separado "Contactar cliente" (MContactClientSheet).
  const types = [
    {
      id: 'dessert',
      lbl: 'Sobremesa',
      sub: 'Da casa',
      item: 'Fondant de chocolate · 2 porções',
      selected: true,
    },
    { id: 'drink', lbl: 'Drink', sub: 'Bar manda', item: 'Caipirinha · 2 doses', selected: false },
    {
      id: 'couvert',
      lbl: 'Couvert',
      sub: 'Por conta',
      item: 'Couvert (R$ 18) · sai da conta',
      selected: false,
    },
    {
      id: 'discount',
      lbl: 'Desconto',
      sub: '% no total',
      item: '15% de desconto na conta',
      selected: false,
    },
  ];
  const selectedTable = tables.find((t) => t.selected) || tables[5];

  const heroByState = {
    select: {
      bg: '#EFF5EC',
      bd: '#2F7D4F',
      fg: '#0F5A37',
      label: 'Cortesia da casa',
      title: `Mande um mimo pra mesa ${selectedTable.id}`,
    },
    sent: {
      bg: '#EFF3FA',
      bd: '#3B5FBE',
      fg: '#1F3784',
      label: 'Aguardando cliente abrir',
      title: 'Notificação enviada · cliente vai aceitar em segundos',
      meta: 'Você verá aqui quando ele aceitar. O garçom recebe push pra entregar.',
    },
    accepted: {
      bg: '#EFF5EC',
      bd: '#1E8C5A',
      fg: '#0F5A37',
      label: 'Cliente aceitou',
      title: '"Muito obrigado, vocês são incríveis!"',
      meta: 'Olivia foi avisada · ela vai entregar em ~5 min.',
    },
  };
  const hero = heroByState[state];

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Cortesia"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        <div style={{ padding: '16px 16px 4px' }}>
          <div
            style={{
              background: hero.bg,
              border: `1px solid ${hero.bd}`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {hero.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: -0.2,
                marginBottom: hero.meta ? 4 : 0,
              }}
            >
              {hero.title}
            </div>
            {hero.meta && (
              <div style={{ fontSize: 12.5, color: hero.fg, fontWeight: 600 }}>{hero.meta}</div>
            )}
            {state === 'sent' && (
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: hero.bd,
                      opacity: 0.6,
                      animation: 'gPulse 1.4s infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {state === 'select' && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                {preselectedTable
                  ? `Pra mesa ${preselectedTable} · vinda do menu`
                  : 'Pra qual mesa'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tables.map((t) => {
                  const tone =
                    t.status === 'slow' ? '#C2401A' : t.status === 'cold' ? '#9A7212' : C.ink;
                  const bgT =
                    t.status === 'slow' ? '#FFF1EC' : t.status === 'cold' ? '#FFF7E6' : C.bg;
                  return (
                    <div
                      key={t.id}
                      style={{
                        position: 'relative',
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: t.selected ? '#2F7D4F' : bgT,
                        border: `1.5px solid ${t.selected ? '#2F7D4F' : t.status !== 'normal' ? tone : C.borderSoft}`,
                        color: t.selected ? '#fff' : tone,
                        minWidth: 78,
                        textAlign: 'center',
                        // mesa pré-selecionada (vinda do menu) ganha um anel
                        // verde adicional + sombra leve pra puxar o olho
                        boxShadow: t.locked
                          ? '0 0 0 2px #2F7D4F, 0 6px 16px -8px rgba(47,125,79,0.45)'
                          : 'none',
                        outline: t.locked ? '1.5px solid #fff' : 'none',
                        outlineOffset: t.locked ? -3 : 0,
                      }}
                    >
                      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5 }}>
                        Mesa {t.id}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          marginTop: 2,
                          opacity: t.selected ? 0.85 : 0.7,
                        }}
                      >
                        {t.party}p · {t.time}
                      </div>
                      {t.locked && (
                        <div
                          style={{
                            position: 'absolute',
                            top: -7,
                            right: -6,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: '#2F7D4F',
                            color: '#fff',
                            fontSize: 8.5,
                            fontWeight: 800,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                            border: '1.5px solid #fff',
                          }}
                        >
                          do menu
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {preselectedTable && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 10,
                    background: '#EFF5EC',
                    border: `1px solid #C0DEC9`,
                    fontSize: 12,
                    color: '#0F5A37',
                    lineHeight: 1.4,
                    fontWeight: 500,
                  }}
                >
                  Mesa {preselectedTable} já preenchida pelo menu da mesa · escolha o tipo da
                  cortesia abaixo.
                </div>
              )}
            </div>

            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Tipo de cortesia
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {types.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: t.selected ? '#EFF5EC' : C.bg,
                      border: `1px solid ${t.selected ? '#2F7D4F' : C.borderSoft}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: t.selected ? '#2F7D4F' : 'transparent',
                        border: `1.5px solid ${t.selected ? '#2F7D4F' : C.borderSoft}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#fff',
                      }}
                    >
                      {t.selected && Icon.check(14)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}
                      >
                        {t.lbl}{' '}
                        <span style={{ fontSize: 11, color: C.faint, fontWeight: 500 }}>
                          · {t.sub}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                        {t.item}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Mensagem (opcional)
              </div>
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 64,
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                Pelo tempo que você esperou, a Trattoria te oferece uma sobremesa por conta da casa.
                Obrigada pela paciência!
              </div>
            </div>

            <div style={{ height: 110 }} />
          </>
        )}

        {state === 'sent' && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Resumo enviado
              </div>
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: -0.2,
                    marginBottom: 4,
                  }}
                >
                  Mesa {selectedTable.id} · Sobremesa
                </div>
                <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, lineHeight: 1.4 }}>
                  Fondant de chocolate · 2 porções · com mensagem do gerente.
                </div>
              </div>
            </div>
            <div style={{ height: 110 }} />
          </>
        )}

        {state === 'accepted' && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Resposta do cliente
              </div>
              <div
                style={{
                  background: '#EFF5EC',
                  border: `1px solid #2F7D4F`,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 14,
                  color: '#0F5A37',
                  fontWeight: 600,
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                }}
              >
                "Muito obrigado, vocês são incríveis! Vamos voltar com certeza 🥹"
              </div>
            </div>
            <div style={{ padding: '14px 16px 4px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.faint,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Garçom avisado
              </div>
              <div
                style={{
                  padding: 12,
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <MAvatar name="Olivia Martins" init="OM" color="#E37D2F" size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                    Olivia M. · mesa {selectedTable.id}
                  </div>
                  <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                    Push enviado · "Vou pegar a cortesia da mesa 14"
                  </div>
                </div>
                <div style={{ color: '#1E8C5A' }}>{Icon.check(20)}</div>
              </div>
            </div>
            <div style={{ height: 110 }} />
          </>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        {state === 'select' && (
          <GButton dark={dark} full kind="primary">
            Enviar cortesia pra mesa {selectedTable.id}
          </GButton>
        )}
        {state === 'sent' && (
          <GButton dark={dark} full kind="ghost">
            Cancelar envio
          </GButton>
        )}
        {state === 'accepted' && (
          <GButton dark={dark} full kind="primary">
            Voltar pro painel
          </GButton>
        )}
      </div>
    </div>
  );
};

// ============================================================
// REMOVIDO 2026-05 (V3) — ScreenCustomerCompensation
// ────────────────────────────────────────────────────────────
// A vista do CLIENTE da cortesia mora em:
//   handoff/cliente/cliente-screens.jsx · CourtesyArrival / CourtesyConfirmed
// Single source of truth. Não duplicar no canvas do garçom.
// (A cópia anterior aqui usava o estilo antigo cream+serif Iowan+orange
// — divergia do estilo aceito do cliente · branco puro Inter mono caps,
// ink outline pills.)
// ============================================================
const _RemovedScreenCustomerCompensation = ({ state = 'received' }) => {
  const cream = '#FFFAF4';
  const ink = '#1A1410';
  const muted = '#7A6B5C';
  const border = '#F0E4D5';
  const dash = '#C9B89C';
  const orange = '#C36825';
  const serif = '"Iowan Old Style", "Charter", Georgia, serif';

  const Confetti = () => (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5 }}
      aria-hidden
    >
      <rect
        x="42"
        y="120"
        width="14"
        height="4"
        rx="1"
        fill="#E8853A"
        transform="rotate(28 49 122)"
      />
      <rect
        x="320"
        y="160"
        width="12"
        height="4"
        rx="1"
        fill="#1E8C5A"
        transform="rotate(-18 326 162)"
      />
      <rect
        x="68"
        y="690"
        width="16"
        height="4"
        rx="1"
        fill="#C36825"
        transform="rotate(-32 76 692)"
      />
      <rect
        x="300"
        y="700"
        width="14"
        height="4"
        rx="1"
        fill="#9A6B2C"
        transform="rotate(40 307 702)"
      />
      <rect
        x="200"
        y="80"
        width="10"
        height="3"
        rx="1"
        fill="#E8853A"
        transform="rotate(-12 205 82)"
      />
    </svg>
  );

  const Header = () => (
    <>
      <div style={{ height: 44 }} />
      <div
        style={{
          padding: '8px 20px 10px',
          borderBottom: `1px solid ${border}`,
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 600,
          color: muted,
          letterSpacing: 0.3,
        }}
      >
        Trattoria Luna · mesa 14
      </div>
    </>
  );

  if (state === 'received') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: cream,
          position: 'relative',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
          color: ink,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Confetti />
        <Header />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 22,
              background: 'linear-gradient(180deg, #FFE7D0, #F7C99B)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${border}`,
              boxShadow: '0 12px 24px -14px rgba(195,104,37,0.4)',
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke={orange}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 12 20 22 4 22 4 12"></polyline>
              <rect x="2" y="7" width="20" height="5"></rect>
              <line x1="12" y1="22" x2="12" y2="7"></line>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
            </svg>
          </div>

          <div
            style={{
              fontFamily: serif,
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: -0.5,
              marginTop: 22,
              lineHeight: 1.1,
            }}
          >
            Cortesia da casa
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 8, fontWeight: 500 }}>
            Renata, gerente, mandou pra você
          </div>

          <div
            style={{
              background: '#fff',
              border: `1px solid ${border}`,
              borderRadius: 14,
              padding: '14px 18px',
              textAlign: 'center',
              marginTop: 22,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: muted,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Sobremesa · sem cobrança
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, fontFamily: serif }}>
              Tiramisu da casa
            </div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
              Mascarpone, café espresso, cacau amargo
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              border: `1.5px dashed ${dash}`,
              borderRadius: 12,
              padding: '14px 16px',
              textAlign: 'center',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontStyle: 'italic',
                color: '#3D2F26',
                fontFamily: serif,
                lineHeight: 1.45,
              }}
            >
              "Pela espera. Aproveite a sobremesa por nossa conta."
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: muted, fontWeight: 500 }}>
              — Renata, gerente
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 20px 26px', position: 'relative', zIndex: 1 }}>
          <button
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              padding: '15px 16px',
              borderRadius: 14,
              textAlign: 'center',
              background: 'linear-gradient(180deg, #E8853A, #C36825)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 0.1,
              boxShadow:
                '0 10px 22px -10px rgba(195,104,37,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
              border: '1px solid #A85618',
            }}
          >
            Aceitar com gratidão
          </button>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span
              style={{
                fontSize: 13,
                color: muted,
                borderBottom: `1px solid ${dash}`,
                paddingBottom: 1,
              }}
            >
              Não, obrigado
            </span>
          </div>
        </div>
      </div>
    );
  }

  // state === 'accepted'
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: cream,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
        color: ink,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Confetti />
      <Header />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: 'rgba(30,140,90,0.13)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(30,140,90,0.25)',
          }}
        >
          <svg
            width="46"
            height="46"
            viewBox="0 0 48 48"
            fill="none"
            stroke="#1E8C5A"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="8 24 20 36 40 12" />
          </svg>
        </div>

        <div
          style={{
            fontFamily: serif,
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: -0.5,
            marginTop: 22,
            lineHeight: 1.05,
          }}
        >
          Aproveite!
        </div>
        <div
          style={{ fontSize: 13, color: muted, marginTop: 8, fontWeight: 500, textAlign: 'center' }}
        >
          Cortesia confirmada · Olivia já está sabendo
        </div>

        <div
          style={{
            background: '#fff',
            border: `1px solid ${border}`,
            borderRadius: 14,
            padding: '12px 14px',
            marginTop: 22,
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#E37D2F',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            OM
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.1 }}>Olivia Martins</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2, fontWeight: 500 }}>
              Vai trazer agora
            </div>
          </div>
          <div
            style={{
              background: '#1E8C5A',
              color: '#fff',
              fontWeight: 700,
              fontSize: 11,
              padding: '5px 10px',
              borderRadius: 99,
              letterSpacing: 0.3,
            }}
          >
            ~5 min
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 13,
            color: muted,
            textAlign: 'center',
            lineHeight: 1.55,
          }}
        >
          Continue navegando o cardápio.
          <br />
          Seu pedido em andamento não foi alterado.
        </div>
      </div>

      <div style={{ padding: '14px 20px 26px', position: 'relative', zIndex: 1 }}>
        <button
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: '15px 16px',
            borderRadius: 14,
            textAlign: 'center',
            background: '#fff',
            color: ink,
            fontSize: 15,
            fontWeight: 700,
            border: `1.5px solid ${ink}`,
          }}
        >
          Voltar pro cardápio
        </button>
      </div>
    </div>
  );
};

// ============================================================
// SHEET · CONTACTAR CLIENTE
// Substitui o que era "Cortesia mesa" como ação default dos cards de
// alerta (Operação). É um bottom-sheet vaul-style sobreposto à
// Operação atual — sem mudança de rota. Drag handle, backdrop 32%
// preto, swipe-down dispense.
//
// Estados (props.state):
//   'idle'     — header + 4 sugestões + textarea vazia + CTA disabled
//   'selected' — chip 2 marcado + textarea pré-preenchida (editável) + CTA enabled
//   'sent'     — sheet shrinka, mostra preview do que foi enviado +
//                "Aguardando leitura..." em pulse + ações Voltar/Reenviar
//
// Sugestões puxadas via POST /ai-service/smart-suggestions (3 camadas
// do guardrail · greeting → regex → LLM com pool determinístico
// primeiro). 4º chip "Quer uma cortesia pela espera?" é a única entrada
// legítima de cortesia a partir desse fluxo — abre Compensate.
// ============================================================
const MContactClientSheet = ({ dark = false, state = 'idle', andro = false }) => {
  const C = useG(dark);
  const sentTime = '19:42';

  // Sugestões contextuais retornadas pelo AI service. Quando state='selected'
  // o índice 1 é o chip ativo. Cada chip carrega um ícone semântico pequeno.
  const suggestions = [
    { id: 's1', icon: Icon.history(14), text: 'Já fui verificar seu pedido na cozinha' },
    { id: 's2', icon: Icon.clock(14), text: 'Saindo da cozinha em uns 5 min' },
    { id: 's3', icon: Icon.user(14), text: 'Estou indo aí em 2 min' },
    {
      id: 's4',
      icon: Icon.gift(14),
      text: 'Quer uma cortesia pela espera?',
      linksTo: 'mgr-compensate',
    },
  ];
  const selectedIdx = state === 'selected' ? 1 : -1;
  const draftText =
    state === 'selected'
      ? 'Saindo da cozinha em uns 5 min — segura aí, vou monitorar com a Júlia.'
      : '';

  // Sheet sent → sheet menor (só preview + status). Outros estados → cheio.
  const sheetH = state === 'sent' ? 360 : 660;

  return (
    <div
      style={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      {/* ─── BACKGROUND ATENUADO (placeholder da Operação) ─── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: dark ? '#1a1816' : '#f6f4ee',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* topo placeholder pra dar dica do que está atrás */}
        <div
          style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${C.borderSoft}`,
            opacity: 0.55,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Operação
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: C.ink,
              marginTop: 2,
              letterSpacing: -0.3,
            }}
          >
            Atenção · agora
          </div>
        </div>
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: 0.45,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                padding: 12,
                borderRadius: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                height: 76,
              }}
            />
          ))}
        </div>
      </div>

      {/* ─── BACKDROP ─── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,12,10,0.32)',
          zIndex: 5,
        }}
      />

      {/* ─── SHEET ─── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: sheetH,
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 36px rgba(0,0,0,0.18)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          transition: 'height 220ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 6px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.borderSoft }} />
        </div>

        {/* HEADER do sheet — comum a idle/selected; muda no sent */}
        {state !== 'sent' ? (
          <div style={{ padding: '8px 18px 14px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: C.faint,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}
            >
              Mesa 14 · Caleb · esperando há 22 min
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.ink,
                letterSpacing: -0.5,
                marginBottom: 4,
              }}
            >
              Mensagem para Mesa 14
            </div>
            <div style={{ fontSize: 13, color: C.mute, fontWeight: 500, lineHeight: 1.45 }}>
              Pedido: <b style={{ color: C.ink, fontWeight: 700 }}>risoto cogumelos</b> · meta 12
              min · 2× chamado
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 18px 14px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: '#1E8C5A',
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#1E8C5A' }} />
              Enviado · {sentTime}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
              Mesa 14 · Caleb
            </div>
          </div>
        )}

        {/* CONTEÚDO (idle/selected) */}
        {state !== 'sent' && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0 18px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* SUGESTÕES */}
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                marginBottom: 10,
              }}
            >
              Sugestões · contexto
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map((s, i) => {
                const sel = i === selectedIdx;
                const isCourtesy = s.linksTo === 'mgr-compensate';
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: '14px 14px',
                      border: `1.3px solid ${sel ? C.ink : C.borderSoft}`,
                      borderRadius: 14,
                      background: sel ? C.ink : C.surface,
                      color: sel ? C.bg : C.ink,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 28, // hit target ≥ 56px contando padding
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        flexShrink: 0,
                        background: sel ? 'rgba(255,255,255,0.14)' : isCourtesy ? '#EFF5EC' : C.bg,
                        color: sel ? C.bg : isCourtesy ? '#2F7D4F' : C.faint,
                        border: sel
                          ? '1px solid rgba(255,255,255,0.2)'
                          : `1px solid ${C.borderSoft}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {s.icon}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: -0.15,
                        lineHeight: 1.35,
                      }}
                    >
                      {s.text}
                    </div>
                    {isCourtesy && (
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: sel ? C.bg : '#2F7D4F',
                          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                          flexShrink: 0,
                        }}
                      >
                        ↗ cortesia
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* DIVIDER mono caps */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '20px 0 12px',
              }}
            >
              <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: C.faint,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}
              >
                ou escreva uma mensagem
              </div>
              <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
            </div>

            {/* TEXTAREA */}
            <div
              style={{
                border: `1.3px solid ${draftText ? C.borderSoft : C.borderSoft}`,
                borderRadius: 14,
                background: C.surface,
                padding: '12px 14px',
                minHeight: 64,
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: draftText ? C.ink : C.faint,
                  letterSpacing: -0.1,
                }}
              >
                {draftText || 'Pessoal pra Caleb…'}
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 6,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: C.faint,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  letterSpacing: 0.3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {draftText.length} / 240
              </div>
            </div>

            <div style={{ height: 14 }} />
          </div>
        )}

        {/* CONTEÚDO (sent) */}
        {state === 'sent' && (
          <div
            style={{
              padding: '4px 18px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              flex: 1,
            }}
          >
            {/* Bubble preview no padrão da ManagerBubble do cliente */}
            <div
              style={{
                padding: '12px 14px',
                background: C.surface,
                borderLeft: `3px solid ${C.ink}`,
                border: `1px solid ${C.borderSoft}`,
                borderLeftWidth: 3,
                borderTopRightRadius: 12,
                borderBottomRightRadius: 12,
                borderTopLeftRadius: 4,
                borderBottomLeftRadius: 4,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: C.ink,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}
              >
                Renata · gerente
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: C.ink,
                  fontWeight: 500,
                  letterSpacing: -0.1,
                }}
              >
                Saindo da cozinha em uns 5 min — segura aí, vou monitorar com a Júlia.
              </div>
            </div>

            {/* Status pulsante */}
            <div
              style={{
                display: 'inline-flex',
                alignSelf: 'flex-start',
                padding: '6px 12px',
                borderRadius: 100,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#D98E2B',
                  animation: 'gPulse 1.2s infinite',
                }}
              />
              Aguardando leitura…
            </div>

            <div style={{ flex: 1 }} />
          </div>
        )}

        {/* FOOTER · CTA(s) */}
        <div
          style={{
            padding: '12px 18px ' + (andro ? '20px' : '28px'),
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          {state === 'sent' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <GButton dark={dark} full kind="ghost">
                Voltar
              </GButton>
              <GButton dark={dark} full kind="primary">
                Reenviar
              </GButton>
            </div>
          ) : state === 'selected' ? (
            <GButton dark={dark} full kind="primary">
              Enviar como Renata
            </GButton>
          ) : (
            <button
              disabled
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                width: '100%',
                textAlign: 'center',
                padding: '14px 16px',
                borderRadius: 12,
                background: C.borderSoft,
                color: C.faint,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
                cursor: 'not-allowed',
              }}
            >
              Enviar como Renata
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MContactStaffSheet (★ V9 · 2026-05 ★)
// ────────────────────────────────────────────────────────────
// Sheet vaul-style espelho do MContactClientSheet, mas pra
// MENSAGEM DIRETA gerente → staff.
//
// Triggers:
//   • ScreenManagerStatDetail variant=sobrecarga · ação "Mensagem direta pro Caleb"
//   • Cards da Equipe · ação inline "Mensagem direta"
//   • ScreenManagerStaffDetail · ação no header
//
// Estados:
//   idle · sugestões + textarea
//   sent · preview da mensagem + status "Aguardando leitura..." pulse
//
// Round-trip:
//   • Persiste em `assistant_messages` com from_role='staff' (ver column do V4)
//     + to_role='staff' + to_staff_id (waiter alvo)
//   • POST /staff/messages dispara push pelo EventsGateway pro device do waiter
//   • Read receipt: POST /staff/messages/:id/read → manager recebe `message.read`
//     via WebSocket → status pill vira "Lido às 19:43" (verde)
// ============================================================
const MContactStaffSheet = ({ dark = false, state = 'idle', andro = false, target = 'Caleb' }) => {
  const C = useG(dark);
  const sentTime = '19:42';

  const suggestions = [
    { id: 's1', icon: Icon.chat(14), text: 'Como tá indo? Precisa de ajuda?' },
    { id: 's2', icon: Icon.user(14), text: 'Vou te mandar reforço · 5 min' },
    {
      id: 's3',
      icon: Icon.pause(14),
      text: 'Pause os pedidos novos das suas mesas por 5 min',
      linksTo: 'mgr-stat-detail-sobrecarga-pause-confirm',
    },
    { id: 's4', icon: Icon.table(14), text: 'Foca nas mesas 14 e 21 · resto eu cuido' },
  ];
  const draftText = '';
  const sheetH = state === 'sent' ? 360 : 660;

  return (
    <div
      style={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      {/* ─── Background atenuado · placeholder do StatDetail SOBRECARGA ─── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: dark ? '#1a1816' : '#f6f4ee',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${C.borderSoft}`,
            opacity: 0.55,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Equipe · Sobrecarga
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: C.ink,
              marginTop: 2,
              letterSpacing: -0.3,
            }}
          >
            1 funcionário sobrecarregado
          </div>
        </div>
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: 0.45,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                padding: 12,
                borderRadius: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                height: 76,
              }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,12,10,0.32)',
          zIndex: 5,
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: sheetH,
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 36px rgba(0,0,0,0.18)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          transition: 'height 220ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 6px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.borderSoft }} />
        </div>

        {state !== 'sent' ? (
          <div style={{ padding: '8px 18px 14px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: C.faint,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}
            >
              Mensagem pra {target} · garçom · 7 mesas
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.ink,
                letterSpacing: -0.5,
                marginBottom: 4,
              }}
            >
              Mensagem para {target}
            </div>
            <div style={{ fontSize: 13, color: C.mute, fontWeight: 500, lineHeight: 1.45 }}>
              {target} está com <b style={{ color: C.ink, fontWeight: 700 }}>7 mesas</b> · 4
              chamados sem resposta há &gt; 4 min
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 18px 14px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: '#1E8C5A',
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#1E8C5A' }} />
              Enviado · {sentTime}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
              {target} · garçom
            </div>
          </div>
        )}

        {state !== 'sent' && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0 18px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                marginBottom: 10,
              }}
            >
              Sugestões · contexto
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map((s) => {
                const isPause = s.linksTo === 'mgr-stat-detail-sobrecarga-pause-confirm';
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: '14px 14px',
                      border: `1.3px solid ${C.borderSoft}`,
                      borderRadius: 14,
                      background: C.surface,
                      color: C.ink,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 28,
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        flexShrink: 0,
                        background: isPause ? '#FFF7E6' : C.bg,
                        color: isPause ? '#9A7212' : C.faint,
                        border: `1px solid ${isPause ? '#F0DCB6' : C.borderSoft}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {s.icon}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: -0.15,
                        lineHeight: 1.35,
                      }}
                    >
                      {s.text}
                    </div>
                    {isPause && (
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: '#9A7212',
                          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                          flexShrink: 0,
                        }}
                      >
                        ↗ pausar
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '20px 0 12px',
              }}
            >
              <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: C.faint,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}
              >
                ou escreva algo
              </div>
              <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
            </div>

            <div
              style={{
                border: `1.3px solid ${C.borderSoft}`,
                borderRadius: 14,
                background: C.surface,
                padding: '12px 14px',
                minHeight: 64,
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: C.faint,
                  letterSpacing: -0.1,
                }}
              >
                Pessoal pra {target}…
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 6,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: C.faint,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  letterSpacing: 0.3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {draftText.length} / 240
              </div>
            </div>

            <div style={{ height: 14 }} />
          </div>
        )}

        {state === 'sent' && (
          <div
            style={{
              padding: '4px 18px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              flex: 1,
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                background: C.surface,
                borderLeft: `3px solid ${C.ink}`,
                border: `1px solid ${C.borderSoft}`,
                borderLeftWidth: 3,
                borderTopRightRadius: 12,
                borderBottomRightRadius: 12,
                borderTopLeftRadius: 4,
                borderBottomLeftRadius: 4,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: C.ink,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}
              >
                Renata · gerente
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: C.ink,
                  fontWeight: 500,
                  letterSpacing: -0.1,
                }}
              >
                Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o
                Henrique.
              </div>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignSelf: 'flex-start',
                padding: '6px 12px',
                borderRadius: 100,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#D98E2B',
                  animation: 'gPulse 1.2s infinite',
                }}
              />
              Aguardando leitura…
            </div>

            <div style={{ flex: 1 }} />
          </div>
        )}

        <div
          style={{
            padding: '12px 18px ' + (andro ? '20px' : '28px'),
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          {state === 'sent' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <GButton dark={dark} full kind="ghost">
                Voltar
              </GButton>
              <GButton dark={dark} full kind="primary">
                Reenviar
              </GButton>
            </div>
          ) : (
            <button
              disabled
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                width: '100%',
                textAlign: 'center',
                padding: '14px 16px',
                borderRadius: 12,
                background: C.borderSoft,
                color: C.faint,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: -0.1,
                fontFamily: G_FONT,
                cursor: 'not-allowed',
              }}
            >
              Enviar como Renata
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  ScreenManagerStaffDetail,
  ScreenManagerOps,
  ScreenManagerFinance,
  ScreenManagerTableTimeline,
  ScreenManagerTableMenu, // ★ V5 ★ role-aware (manager + host)
  ScreenManagerAlertsAll,
  ScreenManagerKitchenReorder,
  ScreenManagerOrdersPause,
  ScreenManagerOrdersPauseSummary,
  ScreenManagerCompensateClient,
  MContactClientSheet,
  MContactStaffSheet, // ★ V9 ★ manager → staff messaging
  // helpers · V5
  CapacityExceededModal,
  TextEditModal,
  CloseTableModal,
  // helpers
  MQuickActionsBar,
  OpsAlerts,
  OpsMap,
  OpsFunnel,
  MOpSummary,
});
