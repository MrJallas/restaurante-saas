// ============================================================
// GERENTE — telas top-level (parte 1)
// Reutiliza: useG, Icon, G_FONT, G_WAITER de garcom-tokens
// e GBadge, GButton, GAppHeader, GIconBtn de garcom-screens-a
//
// Bottom nav · 5 abas (refatoração 2026-05):
//   Painel · Operação · Equipe · Financeiro · Eu
//
// "Eu" é a 5ª aba normal (não é mais sub-tela acessada pelo nome
// no header). "Operação" funde Salão + Gargalos numa só tela com
// 3 sub-tabs (Alertas · Mapa · Funil) + barra "Agir agora" com as
// 3 ferramentas-chave acessíveis também pelo Painel.
// ============================================================
const { useState: useStateM } = React;

// ─── MOCK DATA — equipe e métricas ─────────────────────────────
// Cada funcionário traz:
//   tables    = nº de mesas atendidas neste turno
//   callsAvg  = tempo médio (min) que ele leva pra atender chamado
//   rating    = média das avaliações (do app do cliente)
//   sales     = vendas que vieram da praça dele neste turno
//   scaled    = chamados que ESCALARAM (outro garçom precisou cobrir)
const M_TEAM = [
  { id: 1, name: 'Caleb Souza',    role: 'Garçom',     init: 'CS', shift: '17:00 — 23:00', status: 'on',  rating: 4.8, callsAvg: 1.2, tables: 7,  sales: 1840, scaled: 0, color: '#4F6BFF', flag: null },
  { id: 2, name: 'Olivia Martins', role: 'Garçom',     init: 'OM', shift: '17:00 — 23:00', status: 'on',  rating: 4.6, callsAvg: 1.8, tables: 6,  sales: 1520, scaled: 1, color: '#E37D2F', flag: 'in-call' },
  { id: 3, name: 'Henrique Lima',  role: 'Garçom',     init: 'HL', shift: '17:00 — 23:00', status: 'on',  rating: 4.4, callsAvg: 2.4, tables: 5,  sales: 1180, scaled: 2, color: '#7A4FBE', flag: 'overload' },
  { id: 4, name: 'Marina Reis',    role: 'Garçom',     init: 'MR', shift: '12:00 — 17:00', status: 'off', rating: 4.7, callsAvg: 1.4, tables: 0,  sales: 0,    scaled: 0, color: '#1E8C5A', flag: null },
  { id: 5, name: 'Bruno Pacheco',  role: 'Cozinheiro', init: 'BP', shift: '17:00 — 23:00', status: 'on',  rating: 4.5, callsAvg: 0,   tables: 0,  sales: 0,    scaled: 0, color: '#C43A3A', flag: null },
  { id: 6, name: 'Júlia Andrade',  role: 'Bartender',  init: 'JA', shift: '17:00 — 23:00', status: 'on',  rating: 4.9, callsAvg: 0.8, tables: 0,  sales: 0,    scaled: 0, color: '#0B7A8B', flag: null },
];

// Dados de gargalo (consumidos por screens-d/Operação)
const M_BOTTLENECKS = {
  funnel: [
    { stage: 'Pedido lançado',     median: 0.3, p95: 0.8, count: 142, ok: true  },
    { stage: 'Confirmado',         median: 0.2, p95: 0.5, count: 142, ok: true  },
    { stage: 'Em preparo',         median: 14,  p95: 28,  count: 138, ok: false },
    { stage: 'Pronto',             median: 0.5, p95: 1.2, count: 134, ok: true  },
    { stage: 'Entregue na mesa',   median: 6,   p95: 14,  count: 130, ok: false },
  ],
  alerts: [
    { id: 1, kind: 'kitchen-slow',   msg: 'Cozinha · Risoto cogumelos esperando há 22 min', sub: 'Mesa 14 · meta 12 min', ts: 'agora', sev: 'high', actions: ['Avisar cozinha', 'Contactar cliente'] },
    { id: 2, kind: 'waiter-late',    msg: 'Henrique · 3 chamados sem resposta há > 4 min',  sub: 'Mesas 7, 9, 12',         ts: '2 min', sev: 'high', actions: ['Realocar mesa', 'Chamar Henrique'] },
    { id: 3, kind: 'table-cold',     msg: 'Mesa 14 · pedido pronto há 9 min, ainda na pass', sub: '2 pratos esperando',    ts: '5 min', sev: 'med',  actions: ['Entregar agora', 'Avisar Caleb'] },
    { id: 4, kind: 'kitchen-queue',  msg: 'Cozinha · fila com 11 pedidos',                  sub: 'capacidade é 8',        ts: '8 min', sev: 'med',  actions: ['Pausar pedidos', 'Ver fila'] },
  ],
};

// ─── PRIMITIVES DO GERENTE ─────────────────────────────────────

// Top bar simples: usado em sub-telas (back / x / fechar). Topo das telas
// top-level usa MAppHeader (mais rico com saudação).
const MTopBar = ({ title, left, right, dark }) => {
  const C = useG(dark);
  return (
    <div style={{
      padding: '14px 16px 12px', borderBottom: `1px solid ${C.borderSoft}`,
      background: C.surface, position: 'sticky', top: 0, zIndex: 5,
      display: 'flex', alignItems: 'center', gap: 12, fontFamily: G_FONT,
    }}>
      {left || <div style={{ width: 32 }} />}
      <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>{title}</div>
      {right || <div style={{ width: 32 }} />}
    </div>
  );
};

// Tab inline (sub-tabs dentro de Operação)
const MTab = ({ active, children, onClick, dark, count }) => {
  const C = useG(dark);
  return (
    <div onClick={onClick} style={{
      flex: 1, textAlign: 'center', padding: '11px 6px',
      fontSize: 13, fontWeight: 600,
      color: active ? C.ink : C.faint,
      borderBottom: `2px solid ${active ? C.ink : 'transparent'}`,
      cursor: 'pointer', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      {children}
      {count != null && (
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 100,
          background: active ? C.ink : C.borderSoft, color: active ? C.bg : C.faint,
        }}>{count}</span>
      )}
    </div>
  );
};

// Stat card com label/value/sub/help. O help é uma frase curta em
// LINGUAGEM COMUM (sem "p95", "throughput", "saturation") — gerente
// não-técnico precisa entender sem aula.
//
// `compact` (usado em OpsAlerts pra caber mais alerta no viewport):
//   tile ~80px (era ~140px), valor 22px (era 24), padding 12.
//   help microcopy esconde por padrão e vira `?` discreto à direita;
//   tap mostra tooltip/popover. Mantém TODA a info, só oculta.
const MStat = ({ label, value, sub, subColor, trend, help, dark, accent, compact = false, onHelp }) => {
  const C = useG(dark);
  const trendColor = trend?.dir === 'up' ? '#1E8C5A' : trend?.dir === 'down' ? '#C43A3A' : C.faint;
  const subFinal = subColor || (trend ? trendColor : C.faint);
  return (
    <div style={{
      padding: compact ? 12 : 14,
      border: `1px solid ${C.borderSoft}`, borderRadius: 12,
      background: C.bg, flex: 1, minWidth: 0,
      position: 'relative',
    }}>
      <div style={{
        fontSize: compact ? 10.5 : 11, color: C.faint, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: compact ? 0.6 : 0.4,
        fontFamily: compact ? 'ui-monospace, SF Mono, JetBrains Mono, monospace' : undefined,
        paddingRight: compact && help ? 18 : 0,
      }}>{label}</div>
      <div style={{
        fontSize: compact ? 22 : 24, fontWeight: 800, color: accent || C.ink,
        marginTop: compact ? 2 : 4,
        letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
      }}>{value}</div>
      {(sub || trend) && (
        <div style={{
          fontSize: compact ? 10 : 11, color: subFinal,
          marginTop: compact ? 3 : 4, fontWeight: subColor ? 700 : 600,
          textTransform: compact ? 'uppercase' : 'none',
          letterSpacing: compact ? 0.6 : 0,
          fontFamily: compact ? 'ui-monospace, SF Mono, JetBrains Mono, monospace' : undefined,
        }}>
          {trend && (trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '·')} {sub}
        </div>
      )}
      {help && !compact && (
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>{help}</div>
      )}
      {help && compact && (
        // `?` discreto · long-press mostra tooltip · tap curto abre detail screen
        // (V8 · 2026-05). Sem onHelp = mantém só tooltip do hover.
        onHelp ? (
          <button
            onClick={(e) => { e.stopPropagation(); onHelp(); }}
            title={help}
            aria-label={`Detalhes sobre ${label}`}
            style={{
              position: 'absolute', top: 7, right: 7,
              width: 22, height: 22, borderRadius: 11,
              border: `1px solid ${C.borderSoft}`, color: C.faint, background: 'transparent',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}>?</button>
        ) : (
          <div title={help} aria-label={`Sobre ${label}: ${help}`} style={{
            position: 'absolute', top: 9, right: 9,
            width: 16, height: 16, borderRadius: 8,
            border: `1px solid ${C.borderSoft}`, color: C.faint,
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'help',
          }}>?</div>
        )
      )}
    </div>
  );
};

// Section com título uppercase + ação opcional (link "Ver tudo →")
const MSection = ({ title, action, onAction, children, dark, sub }) => {
  const C = useG(dark);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: '0 16px 8px',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 2 }}>{sub}</div>}
        </div>
        {action && (
          onAction ? (
            <button onClick={onAction} style={{
              all: 'unset', cursor: 'pointer',
              fontSize: 12, color: C.ink, fontWeight: 700, letterSpacing: -0.1,
            }}>{action}</button>
          ) : (
            <div style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{action}</div>
          )
        )}
      </div>
      {children}
    </div>
  );
};

const MAvatar = ({ name, init, color, size = 38, dark }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: color || '#777', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
    fontFamily: G_FONT, letterSpacing: -0.2,
  }}>{init || name?.split(' ').map(p => p[0]).slice(0,2).join('')}</div>
);

// Pílula tinted reutilizada em vários cards (badge de status, severity,
// flag de funcionário). Tom: 'success' | 'warn' | 'danger' | 'info' | 'mute'.
const MPill = ({ tone = 'mute', children, dark, dot }) => {
  const C = useG(dark);
  const map = {
    success: { bg: '#E5F2EA', fg: '#0F5A37', dot: '#1E8C5A' },
    warn:    { bg: '#FFF3E0', fg: '#7A4D10', dot: '#D98E2B' },
    danger:  { bg: '#FFE6E6', fg: '#A12626', dot: '#C43A3A' },
    info:    { bg: '#EFF3FA', fg: '#1F3784', dot: '#3B5FBE' },
    mute:    { bg: C.surface, fg: C.faint, dot: C.faint },
  };
  const t = map[tone] || map.mute;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 100,
      background: t.bg, color: t.fg,
      fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.dot }} />}
      {children}
    </span>
  );
};

// ─── BOTTOM NAV DO GERENTE — 5 ABAS ────────────────────────────
// Refatoração 2026-05: "Eu" entrou como 5ª aba (era sub-tela acessada
// pelo nome no header). "Salão" e "Gargalos" foram fundidos em "Operação"
// como sub-tabs (Alertas · Mapa · Funil) — mantém a feature mas libera
// uma vaga na bottom nav.
const MBottomNav = ({ active = 'home', dark = false, onTo = () => {}, alerts = 4 }) => {
  const C = useG(dark);
  const items = [
    { id: 'home',    label: 'Painel',     icon: Icon.list,    to: 'mgr-home' },
    { id: 'ops',     label: 'Operação',   icon: Icon.flame,   to: 'mgr-ops', badge: alerts },
    { id: 'staff',   label: 'Equipe',     icon: Icon.user,    to: 'mgr-staff' },
    { id: 'finance', label: 'Financeiro', icon: Icon.receipt, to: 'mgr-finance' },
    { id: 'me',      label: 'Eu',         icon: Icon.settings, to: 'mgr-settings' },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${C.borderFaint}`, background: C.bg,
      display: 'flex', justifyContent: 'space-around',
      padding: '8px 4px 14px',
      position: 'sticky', bottom: 0, zIndex: 4,
    }}>
      {items.map(it => {
        const isActive = it.id === active;
        return (
          <button key={it.id} onClick={() => onTo(it.to)} style={{
            all: 'unset', cursor: 'pointer',
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '6px 2px', position: 'relative',
            color: isActive ? C.ink : C.faint,
          }}>
            <div style={{ position: 'relative' }}>
              {it.icon(22)}
              {it.badge && (
                <span style={{
                  position: 'absolute', top: -3, right: -6,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: '#C43A3A', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                }}>{it.badge}</span>
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500, letterSpacing: 0.2 }}>
              {it.label}
            </span>
            {isActive && (
              <span style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 28, height: 2, borderRadius: 1, background: C.ink,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
};

// ============================================================
// HEADER PADRÃO DAS TELAS TOP-LEVEL DO GERENTE
// ───────────────────────────────────────────────────────────
// Reutilizado em Painel, Operação, Equipe, Financeiro.
// (A aba Eu tem header próprio com avatar grande — não reaproveita.)
//
// Top-level NÃO tem botão de voltar — bottom nav é a navegação.
// Carrega: título grande no topo · saudação personalizada com nome ·
// indicador AO VIVO com bolinha verde pulsante · sino com badge.
// ============================================================
const MAppHeader = ({
  dark = false,
  title,
  bellBadge = '3',
  greetingName = 'Renata Albuquerque',
  greeting = 'Boa noite,',
  live = 'AO VIVO · TURNO DA NOITE · 19:42',
}) => {
  const C = useG(dark);
  return (
    <>
      <MTopBar dark={dark} title={title}
        right={<GIconBtn dark={dark} icon={Icon.bell(20)} badge={bellBadge} />}
      />
      {/* saudação · cabeçalho informativo (não é botão — Eu agora é aba) */}
      <div style={{ padding: '4px 16px 14px' }}>
        <div style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>{greeting}</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: C.ink, marginTop: 2 }}>
          {greetingName}
        </div>
      </div>
      {live && (
        <div style={{ padding: '0 16px 4px' }}>
          <div style={{
            display: 'inline-flex', gap: 8, alignItems: 'center',
            fontSize: 11, color: C.faint, fontWeight: 700,
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#1E8C5A',
              animation: 'gPulse 2s infinite',
            }} />
            {live}
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================
// CARD DE OPERAÇÃO EM CURSO (V4 · 2026-05) ───────────────────
// Padrão arquitetural NOVO. Toda operação async que o gerente dispara
// (pausa de pedidos · reorder cozinha · contactar cliente · cortesia)
// vira um card persistente na seção "Em curso" do Painel até resolver.
// Tap no corpo abre a tela cheia preservando estado. Ações rápidas
// inline cancelam ou agem sem entrar — gerente controla a operação
// sem leaving o Painel.
//
// 4 kinds × 2 estados ativos + 1 estado resolved-summary:
//   pause-orders + active            — pausa rodando (countdown grande)
//   kitchen-reorder + waiting        — aviso enviado · aguardando cozinha
//   contact-client + waiting         — mensagem enviada · aguardando leitura
//   courtesy + waiting               — cortesia enviada · aguardando aceitar
//   <kind> + resolved-summary        — substitui o ativo por ~30s antes
//                                      de sumir · KPIs antes/depois
//
// Border-left 3px tematica:
//   pause-orders.active             mostarda  #9A7212
//   waiting (reorder/contact/cortes) azul     #3B5FBE
//   resolved-summary                verde     #1E8C5A
// ============================================================
const MInProgressCard = ({
  kind = 'pause-orders',
  state = 'active',
  // pause-orders + active
  ttl,                  // { remaining: 263, total: 300 } em segundos
  pauseMeta,            // { startedAt: '21:08', endsAt: '21:13' }
  // resolved-summary
  resolvedKicker,       // 'PAUSA TERMINOU · DURAÇÃO 5 MIN'
  resolvedHeadline,     // 'Cozinha caiu de 11 pra 7 pedidos'
  resolvedSub,          // 'Saída média era 22 min · agora 14 min'
  // kitchen-reorder + waiting
  reorderEta,           // '~30s'
  reorderItems,         // 'Mesa 14 · risoto cogumelos · Mesa 7 · filé'
  // contact-client + waiting
  contactTable,         // 14
  contactPreview,       // texto curto da mensagem
  // courtesy + waiting
  courtesyTable,        // 14
  courtesyItem,         // 'Fondant de chocolate · 2 porções'
  // shared
  onTap = () => {},
  onPrimary = () => {},
  onSecondary = () => {},
  onDismiss = () => {},
  dark = false,
}) => {
  const C = useG(dark);
  const isResolved = state === 'resolved-summary';
  const isPauseActive = kind === 'pause-orders' && state === 'active';
  const accent = isResolved      ? '#1E8C5A'
                : isPauseActive  ? '#9A7212'
                :                  '#3B5FBE';

  const kicker = isResolved
    ? (resolvedKicker || 'OPERAÇÃO RESOLVIDA')
    : kind === 'pause-orders'    ? 'PAUSA · RETOMA SOZINHO'
    : kind === 'kitchen-reorder' ? 'REORDENAR · AGUARDANDO COZINHA'
    : kind === 'contact-client'  ? `MENSAGEM · MESA ${contactTable} · AGUARDANDO LEITURA`
    : kind === 'courtesy'        ? `CORTESIA · MESA ${courtesyTable} · AGUARDANDO ACEITAR`
    : '';

  const Spinner = () => (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: accent,
          opacity: 0.7, animation: 'gPulse 1.4s infinite',
          animationDelay: `${i * 0.18}s`,
        }} />
      ))}
    </div>
  );

  // ─── BODY ───────────────────────────────────────────────────
  let body = null;

  if (isResolved) {
    body = (
      <>
        <div style={{
          fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.15,
          lineHeight: 1.35, marginTop: 6,
        }}>
          {resolvedHeadline}
        </div>
        {resolvedSub && (
          <div style={{
            fontSize: 10.5, color: C.faint, fontWeight: 500, marginTop: 4,
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            letterSpacing: 0.3, textTransform: 'uppercase',
          }}>{resolvedSub}</div>
        )}
      </>
    );
  } else if (isPauseActive && ttl) {
    const mm = Math.floor(ttl.remaining / 60).toString().padStart(2, '0');
    const ss = (ttl.remaining % 60).toString().padStart(2, '0');
    const pct = Math.max(0, Math.min(100, ((ttl.total - ttl.remaining) / ttl.total) * 100));
    body = (
      <>
        <div style={{
          fontSize: 30, fontWeight: 800, color: '#7A4D10',
          letterSpacing: -1, fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.05, marginTop: 6,
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}>
          {mm}<span style={{ opacity: 0.45 }}>:</span>{ss}
        </div>
        <div style={{
          marginTop: 8, height: 4, borderRadius: 100,
          background: '#F0DCB6', overflow: 'hidden',
        }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#9A7212' }} />
        </div>
        {pauseMeta && (
          <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 6 }}>
            Pausada às {pauseMeta.startedAt} · termina {pauseMeta.endsAt}
          </div>
        )}
      </>
    );
  } else if (kind === 'kitchen-reorder' && state === 'waiting') {
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <Spinner />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
            Resposta esperada em {reorderEta || '~30s'}
          </div>
        </div>
        {reorderItems && (
          <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 4, lineHeight: 1.4 }}>
            {reorderItems}
          </div>
        )}
      </>
    );
  } else if (kind === 'contact-client' && state === 'waiting') {
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: '#D98E2B',
          animation: 'gPulse 1.2s infinite', flexShrink: 0,
        }} />
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 13, color: C.ink, fontWeight: 500, lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          “{contactPreview}”
        </div>
      </div>
    );
  } else if (kind === 'courtesy' && state === 'waiting') {
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Spinner />
        <div style={{
          flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {courtesyItem}
        </div>
      </div>
    );
  }

  // ─── ACTIONS ────────────────────────────────────────────────
  const stop = (e) => e.stopPropagation();
  const PillBtn = ({ filled, label, onClick }) => (
    <button onClick={(e) => { stop(e); onClick(); }} style={{
      all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
      padding: '7px 12px', height: 32, borderRadius: 8,
      border: filled ? 'none' : `1px solid ${C.borderSoft}`,
      background: filled ? C.ink : 'transparent',
      color: filled ? C.bg : C.ink,
      fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
      display: 'inline-flex', alignItems: 'center',
    }}>{label}</button>
  );

  let actions = null;
  if (isResolved) {
    actions = (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <PillBtn label="Ver detalhes" onClick={onPrimary} />
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { stop(e); onDismiss(); }} aria-label="Dispensar" style={{
          all: 'unset', cursor: 'pointer',
          width: 28, height: 28, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint,
        }}>{Icon.x(16)}</button>
      </div>
    );
  } else if (kind === 'pause-orders') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn label="+5 min" onClick={onSecondary} />
        <PillBtn filled label="Despausar agora" onClick={onPrimary} />
      </div>
    );
  } else if (kind === 'kitchen-reorder') {
    actions = <div style={{ display: 'flex', gap: 6 }}><PillBtn label="Cancelar" onClick={onSecondary} /></div>;
  } else if (kind === 'contact-client') {
    actions = <div style={{ display: 'flex', gap: 6 }}><PillBtn label="Reenviar" onClick={onSecondary} /></div>;
  } else if (kind === 'courtesy') {
    actions = <div style={{ display: 'flex', gap: 6 }}><PillBtn label="Cancelar envio" onClick={onSecondary} /></div>;
  }

  return (
    <div onClick={onTap} role="button" tabIndex={0} style={{
      cursor: 'pointer', userSelect: 'none',
      padding: '12px 12px 12px 14px',
      borderRadius: 14,
      border: `1px solid ${C.borderSoft}`,
      borderLeft: `3px solid ${accent}`,
      background: C.bg,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 800, color: accent,
        letterSpacing: 0.7, textTransform: 'uppercase',
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
      }}>{kicker}</div>
      {body}
      {actions && <div style={{ marginTop: 12 }}>{actions}</div>}
    </div>
  );
};

// ─── PRESETS DE OPERAÇÕES EM CURSO (canvas demo) ──────────────
// Usados pelo App canvas pra renderizar variações de Painel sem
// reimplementar mock data por artboard.
const M_INPROGRESS = {
  pauseActive: {
    id: 'op-pause-1',
    kind: 'pause-orders',
    state: 'active',
    ttl: { remaining: 263, total: 300 },
    pauseMeta: { startedAt: '21:08', endsAt: '21:13' },
    toRoute: 'mgr-orders-pause',
  },
  reorderWaiting: {
    id: 'op-reorder-1',
    kind: 'kitchen-reorder',
    state: 'waiting',
    reorderEta: '~30s',
    reorderItems: 'Puxar pra frente · Mesa 14 risoto · Mesa 7 filé+risoto',
    toRoute: 'mgr-kitchen-reorder',
  },
  contactWaiting: {
    id: 'op-contact-1',
    kind: 'contact-client',
    state: 'waiting',
    contactTable: 14,
    contactPreview: 'Saindo da cozinha em uns 5 min — segura aí, vou monitorar com a Júlia.',
    toRoute: 'mgr-contact-client',
  },
  courtesyWaiting: {
    id: 'op-courtesy-1',
    kind: 'courtesy',
    state: 'waiting',
    courtesyTable: 14,
    courtesyItem: 'Sobremesa · Fondant de chocolate · 2 porções',
    toRoute: 'mgr-compensate',
  },
  pauseSummary: {
    id: 'op-pause-summary-1',
    kind: 'pause-orders',
    state: 'resolved-summary',
    resolvedKicker: 'PAUSA TERMINOU · DURAÇÃO 5 MIN',
    resolvedHeadline: 'Cozinha caiu de 11 pra 7 pedidos',
    resolvedSub: 'Saída média era 22 min · agora 14 min',
    toRoute: 'mgr-pause-summary',
  },
};

// ============================================================
// 1 · PAINEL (HomeA) — primeira tela do gerente · V4 (2026-05)
//
// FILOSOFIA: a primeira tela do gerente responde "o que eu faço agora?".
// V4 reorganiza em 6 blocos pra introduzir o padrão "Em curso":
//
//   1. HERO — saudação 'Boa noite, Renata' + AO VIVO + sino c/ badge
//   2. FERRAMENTAS RÁPIDAS — 2 cards (Cozinha · Pausa) no formato
//      MQuickActionsBar (~56px stacked, sub mantida). Cortesia saiu —
//      virou ação contextual no menu da mesa (Prompt 5). Pausa ganha
//      indicador discreto quando está ativa (mostarda + countdown
//      inline) — gerente sabe do estado mesmo sem ver "Em curso".
//   3. EM CURSO ★ NOVO ★ — operações async que o gerente disparou e
//      aguardam resposta (cozinha aceitar, cliente ler, pausa terminar,
//      cortesia ser aceita). Card persistente até resolver. Tap abre
//      tela cheia preservando estado. Oculta quando 0 operações.
//   4. HOJE NO TURNO — alertas compactos (3 mostrados, era 5+) no
//      mesmo formato da Operação V3 (~108px com 2 ações inline + X).
//   5. EQUIPE EM TURNO — top 4 + warning de sobrecarga (mantém)
//   6. PRÓXIMAS RESERVAS — 3 cards com horário grande (mantém)
//
// KPIs frios (Receita, Ticket) não aparecem aqui — moram no Financeiro.
// Painel é operação ativa.
// ============================================================
const ScreenManagerHomeA = ({ dark = false, onTo = () => {}, inProgress = [] }) => {
  const C = useG(dark);
  const onShift = M_TEAM.filter(t => t.status === 'on');
  const overloaded = onShift.filter(t => t.scaled > 1).length;
  const inCall     = onShift.filter(t => t.flag === 'in-call').length;

  // próximas reservas — em produção vem de /host/reservations?upcoming=true
  const nextReservations = [
    { id: 1, time: '20:00', name: 'Família Costa', party: 4, in: '18 min', table: 'Mesa 9', tag: 'aniversário', tagTone: 'warn' },
    { id: 2, time: '20:30', name: 'Ana Pereira',   party: 2, in: '48 min', table: 'Mesa 3', tag: 'varanda',     tagTone: 'success' },
    { id: 3, time: '21:00', name: 'Grupo João',    party: 6, in: '78 min', table: 'Mesa 7', tag: null,          tagTone: null },
  ];

  // pausa ativa? extrai do inProgress pra poder informar inline na MQuickActionsBar
  const pauseOp = inProgress.find(o => o.kind === 'pause-orders' && o.state === 'active');
  const topAlerts = M_BOTTLENECKS.alerts.slice(0, 3);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* 1 · HERO — saudação + AO VIVO + sino com badge ─────── */}
        <MAppHeader dark={dark} title="Painel" />

        {/* 2 · FERRAMENTAS RÁPIDAS — 2 cards (Cozinha · Pausa) ── */}
        {/* mesmo formato da MQuickActionsBar usada na Operação V3.
            Quando há pausa ativa, o card Pausa mostra countdown inline
            + bolinha mostarda — mesmo se o gerente não ver "Em curso". */}
        <div style={{ marginTop: 4 }}>
          <MQuickActionsBar dark={dark} onTo={onTo}
            pauseActive={pauseOp ? { remaining: pauseOp.ttl?.remaining ?? 0 } : null} />
        </div>

        {/* 3 · EM CURSO ★ NOVO ★ — oculta quando vazia ────────── */}
        {inProgress.length > 0 && (
          <MSection dark={dark} title={`Em curso · ${inProgress.length}`}>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inProgress.map(op => (
                <MInProgressCard
                  key={op.id}
                  dark={dark}
                  kind={op.kind}
                  state={op.state}
                  ttl={op.ttl}
                  pauseMeta={op.pauseMeta}
                  resolvedKicker={op.resolvedKicker}
                  resolvedHeadline={op.resolvedHeadline}
                  resolvedSub={op.resolvedSub}
                  reorderEta={op.reorderEta}
                  reorderItems={op.reorderItems}
                  contactTable={op.contactTable}
                  contactPreview={op.contactPreview}
                  courtesyTable={op.courtesyTable}
                  courtesyItem={op.courtesyItem}
                  onTap={() => onTo(op.toRoute)}
                  onPrimary={() => op.kind === 'pause-orders' && op.state === 'resolved-summary'
                    ? onTo('mgr-pause-summary')
                    : onTo(op.toRoute)}
                  onSecondary={() => onTo(op.toRoute)}
                  onDismiss={() => {}}
                />
              ))}
            </div>
          </MSection>
        )}

        {/* 4 · HOJE NO TURNO — alertas compactos · 3 mostrados ── */}
        <MSection dark={dark} title={`Hoje no turno · ${M_BOTTLENECKS.alerts.length}`} action="Ver todos →" onAction={() => onTo('mgr-alerts-all')}>
          {topAlerts.length === 0 ? (
            <div style={{
              padding: '4px 16px 0',
              fontSize: 10.5, color: C.faint, fontWeight: 700,
              letterSpacing: 0.7, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Tudo tranquilo por aqui</div>
          ) : (
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topAlerts.map(a => {
                const isHigh = a.sev === 'high';
                return (
                  <div key={a.id} style={{
                    position: 'relative',
                    padding: 12, borderRadius: 12,
                    background: C.bg,
                    border: `1px solid ${isHigh ? '#F4C7C7' : '#F0DCB6'}`,
                    borderLeft: `3px solid ${isHigh ? '#C43A3A' : '#D98E2B'}`,
                  }}>
                    <button aria-label="Dispensar" style={{
                      all: 'unset', cursor: 'pointer',
                      position: 'absolute', top: 8, right: 8,
                      width: 24, height: 24, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: C.faint,
                    }}>{Icon.x(14)}</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingRight: 24 }}>
                      <MPill tone={isHigh ? 'danger' : 'warn'} dark={dark}>
                        {isHigh ? 'CRÍTICO' : 'ATENÇÃO'} · há {a.ts}
                      </MPill>
                    </div>
                    <div style={{
                      fontSize: 13.5, fontWeight: 700, color: C.ink,
                      lineHeight: 1.3, letterSpacing: -0.1, paddingRight: 24,
                    }}>{a.msg}</div>
                    <div style={{
                      fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{a.sub}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '6px 12px', borderRadius: 8,
                        background: C.ink, color: C.bg,
                        fontSize: 12, fontWeight: 700,
                      }}>{a.actions[0]}</button>
                      <button style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '6px 12px', borderRadius: 8,
                        background: 'transparent', color: C.ink,
                        border: `1px solid ${C.borderSoft}`,
                        fontSize: 12, fontWeight: 600,
                      }}>{a.actions[1]}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </MSection>

        {/* 3 · EQUIPE EM TURNO — top 4 + warning de sobrecarga ── */}
        <MSection dark={dark} title={`Equipe em turno · ${onShift.length}`} action="Ver mais →" onAction={() => onTo('mgr-staff')}>
          {(overloaded > 0 || inCall > 0) && (
            <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {overloaded > 0 && (
                <MPill tone="danger" dot dark={dark}>{overloaded} sobrecarregado{overloaded !== 1 && 's'}</MPill>
              )}
              {inCall > 0 && (
                <MPill tone="warn" dot dark={dark}>{inCall} em chamado</MPill>
              )}
            </div>
          )}
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {onShift.slice(0, 4).map(p => {
              const flag = p.flag === 'overload' ? { tone: 'danger', label: 'Sobrec.' }
                         : p.flag === 'in-call'  ? { tone: 'warn',   label: 'Em chamado' }
                         : null;
              return (
                <button key={p.id} onClick={() => onTo('mgr-staff-detail')} style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${C.borderSoft}`, background: C.bg,
                }}>
                  <MAvatar name={p.name} init={p.init} color={p.color} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 1 }}>
                      {p.role}{p.tables > 0 && ` · ${p.tables} mesas`}{p.callsAvg > 0 && ` · ${p.callsAvg}m resposta`}
                    </div>
                  </div>
                  {flag && <MPill tone={flag.tone} dark={dark}>{flag.label}</MPill>}
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>★ {p.rating}</div>
                </button>
              );
            })}
            {onShift.length > 4 && (
              <button onClick={() => onTo('mgr-staff')} style={{
                all: 'unset', cursor: 'pointer',
                padding: '10px 12px', borderRadius: 10,
                background: 'transparent',
                fontSize: 12, fontWeight: 600, color: C.ink,
                textAlign: 'center',
                border: `1px dashed ${C.borderSoft}`,
              }}>
                + {onShift.length - 4} no turno · ver todos
              </button>
            )}
          </div>
        </MSection>

        {/* 4 · PRÓXIMAS RESERVAS — 3 cards horizontais ──────── */}
        <MSection dark={dark} title="Próximas reservas" action="Agenda completa →" onAction={() => onTo('host-reservations')}>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nextReservations.map(r => (
              <div key={r.id} style={{
                padding: 12, borderRadius: 12,
                border: `1px solid ${C.borderSoft}`, background: C.bg,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  minWidth: 64, padding: '8px 10px', borderRadius: 10,
                  background: '#F4F0E8', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>{r.time}</div>
                  <div style={{ fontSize: 9.5, color: C.faint, fontWeight: 700, marginTop: 1, letterSpacing: 0.3 }}>EM {r.in.replace(' min', "'")}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 2 }}>
                    {r.party} pessoas · {r.table}
                  </div>
                  {r.tag && (
                    <div style={{ marginTop: 4 }}>
                      <MPill tone={r.tagTone} dark={dark}>{r.tag}</MPill>
                    </div>
                  )}
                </div>
                <div style={{ color: C.faint, opacity: 0.6 }}>{Icon.arrow(16)}</div>
              </div>
            ))}
          </div>
        </MSection>

        <div style={{ height: 24 }} />
      </div>
      <MBottomNav active="home" dark={dark} onTo={onTo} />
    </div>
  );
};

// ============================================================
// 2 · EQUIPE — tela top-level unificada (★ V6 · 2026-05 ★)
// ────────────────────────────────────────────────────────────
// Funde StaffList (lista simples) + ShiftBoard (KPIs + sugestão IA + ações
// inline) + ShiftSchedule (turnos do dia + próximos eventos). A timeline
// com swimlanes 12-24h foi substituída por uma lista compacta de turnos
// que expande inline pra mostrar quem tá em cada um — gerente sem cabeça
// pra timeline visual lê melhor uma lista de duas linhas.
//
// Props · canvas-driven initial state (cada frame mostra um estado):
//   bannerHidden     — esconde o banner de sugestão IA (estado mais comum)
//   expandedShift    — qual turno começa expandido inline ('manha'|'tarde'|'noite'|null)
//   searchEmptyState — força lista vazia "NENHUM FUNCIONÁRIO ENCONTRADO"
// ============================================================
const ScreenManagerStaff = ({
  dark = false,
  onTo = () => {},
  bannerHidden = false,
  expandedShift = null,
  searchEmptyState = false,
}) => {
  const C = useG(dark);
  const [openShift, setOpen] = useStateM(expandedShift);

  // Status derivado do nº de mesas (mesma heurística do antigo ShiftBoard).
  // CARGA MÉDIA é > meta (5 mesas/garçom) — gatilho do botão "Realocar".
  const statusOf = (p) => {
    if (p.status === 'off')      return { id: 'folga', tone: 'mute',    label: 'Folga' };
    if (p.tables >= 7)           return { id: 'sobre', tone: 'danger',  label: 'Sobrecarregado' };
    if (p.tables >= 5)           return { id: 'media', tone: 'warn',    label: 'Carga média' };
    return                              { id: 'ok',    tone: 'success', label: 'Em turno' };
  };

  const inField = M_TEAM.filter(p => p.status === 'on').length;
  const totalCount = M_TEAM.length;
  const overloadCount = M_TEAM.filter(p => statusOf(p).id === 'sobre').length;
  const totalTables = M_TEAM.reduce((s, p) => s + (p.status === 'on' ? p.tables : 0), 0);
  const avgLoadNum = inField > 0 ? totalTables / inField : 0;
  const avgLoad = inField > 0 ? avgLoadNum.toFixed(1).replace('.', ',') : '—';

  // ★ V7 ★ — sinalização de saúde da CARGA MÉDIA · meta < 5
  // Folgado < 3,5 (verde-moss) · Dentro 3,5–4,99 (faint) · Acima ≥ 5 (brick)
  const META = 5;
  const loadHealth =
    avgLoadNum === 0          ? { state: 'na',   sub: '—',                       color: C.faint, accent: null }
  : avgLoadNum < META * 0.7   ? { state: 'low',  sub: '· FOLGADO',               color: '#1E8C5A', accent: null }
  : avgLoadNum < META         ? { state: 'mid',  sub: '· DENTRO DA META',        color: C.faint,   accent: null }
                              : { state: 'high', sub: '· ACIMA DA META · REALOCAR', color: '#A12626', accent: '#A12626' };

  // Turnos do dia · lista compacta (★ S resolvido ★ — substitui timeline)
  // Status: 'past' (terminou) · 'now' (atual) · 'soon' (futuro)
  const SHIFTS = [
    { id: 'tarde', label: 'TARDE',  range: '12H – 17H', status: 'past', members: M_TEAM.filter(p => p.shift.startsWith('12:00')) },
    { id: 'noite', label: 'NOITE',  range: '17H – 23H', status: 'now',  members: M_TEAM.filter(p => p.shift.startsWith('17:00')) },
    { id: 'enc',   label: 'ENCERRAMENTO', range: '23H – 02H', status: 'soon', members: [] },
  ];

  // Próximos eventos do turno (mantido do ShiftSchedule)
  const NEXT_EVENTS = [
    { time: '21:00', txt: 'Ricardo P. entra · Garçom',         tone: 'success' },
    { time: '23:00', txt: 'Fim de turno · 5 funcionários',     tone: 'ink'     },
    { time: '23:30', txt: 'Bruno P. — hora extra autorizada',  tone: 'warn'    },
  ];

  // Pill 36px full-width · usada nas 2 ações de cada card
  const ActionPill = ({ filled, children, onClick }) => (
    <button onClick={(e) => { e.stopPropagation(); onClick && onClick(); }} style={{
      all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
      flex: 1, height: 36, padding: '0 12px',
      borderRadius: 9,
      border: filled ? 'none' : `1px solid ${C.borderSoft}`,
      background: filled ? C.ink : 'transparent',
      color: filled ? C.bg : C.ink,
      fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>{children}</button>
  );

  // Linha de funcionário · header simples (StaffList) + métricas (ShiftBoard) + ações contextuais
  const StaffCard = ({ p }) => {
    const s = statusOf(p);
    const showActions = s.id === 'sobre' || s.id === 'media';
    return (
      <div onClick={() => onTo('mgr-staff-detail')} role="button" style={{
        cursor: 'pointer',
        padding: 12, borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: s.id === 'folga' ? C.surface : C.bg,
        opacity: s.id === 'folga' ? 0.78 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MAvatar name={p.name} init={p.init} color={p.color} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.name}</div>
            <div style={{ fontSize: 12, color: C.faint, fontWeight: 500, marginTop: 2 }}>
              {p.role} · {p.shift}
            </div>
          </div>
          <MPill tone={s.tone} dark={dark}>{s.label}</MPill>
        </div>

        {p.status === 'on' && (
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: `1px dashed ${C.borderSoft}`,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0,
          }}>
            {[
              { lbl: 'MESAS',    val: p.tables || '—' },
              { lbl: 'RESPOSTA', val: p.callsAvg ? `${p.callsAvg}m` : '—' },
              { lbl: 'VENDIDO',  val: p.sales ? `R$ ${p.sales}` : '—' },
            ].map((m, i) => (
              <div key={m.lbl} style={{
                paddingLeft: i === 0 ? 0 : 12,
                borderLeft: i === 0 ? 'none' : `1px solid ${C.borderFaint}`,
              }}>
                <div style={{
                  fontSize: 9.5, color: C.faint, fontWeight: 700,
                  letterSpacing: 0.6, textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>{m.lbl}</div>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: C.ink, marginTop: 2,
                  letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums',
                }}>{m.val}</div>
              </div>
            ))}
          </div>
        )}

        {p.status === 'on' && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            {showActions ? (
              <>
                <ActionPill filled>Realocar mesas</ActionPill>
                <ActionPill>Mensagem direta</ActionPill>
              </>
            ) : (
              <>
                <ActionPill>Ver mesas</ActionPill>
                <ActionPill>Mover mesa</ActionPill>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 84 }}>
        <MAppHeader dark={dark} title="Equipe" />

        {/* BLOCO 2 · cabeçalho de saúde do turno · 3 KPIs compact (★ V7+V8 ★)
            `?` é tap-target real (onHelp → abre StatDetail).
            Long-press / hover continua mostrando o tooltip via `title=`. */}
        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
          <MStat
            dark={dark}
            compact
            label="Em campo"
            value={
              <span>
                {inField}
                <span style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>/{totalCount}</span>
              </span>
            }
            sub={totalCount - inField > 0 ? `${totalCount - inField} fora` : 'todos OK'}
            help="Funcionários logados com status 'em turno' agora · não inclui pausados ou fora."
            onHelp={() => onTo('mgr-stat-detail-em-campo')}
          />
          <MStat
            dark={dark}
            compact
            label="Sobrecarga"
            value={overloadCount}
            sub={overloadCount > 0 ? '↓ realocar' : 'tudo certo'}
            accent={overloadCount > 0 ? '#A12626' : null}
            subColor={overloadCount > 0 ? '#A12626' : null}
            help="Funcionários com 7+ mesas atendendo simultaneamente · ajuste o limiar em Operação."
            onHelp={() => onTo('mgr-stat-detail-sobrecarga')}
          />
          <MStat
            dark={dark}
            compact
            label="Carga média"
            value={avgLoad}
            accent={loadHealth.accent}
            sub={loadHealth.sub}
            subColor={loadHealth.color}
            help="Mesas abertas dividido por funcionários em campo · meta menor que 5 por garçom."
            onHelp={() => onTo('mgr-stat-detail-carga-media')}
          />
        </div>

        {/* BLOCO 3 · Banner de sugestão IA — oculto quando vazio (não empty state) */}
        {!bannerHidden && (
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{
              background: '#FFF7E6', border: '1px solid #F0DCB6', borderRadius: 12,
              padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7, background: '#9A7212', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{Icon.flame(14)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#1d1c19', lineHeight: 1.4, fontWeight: 500 }}>
                  <b style={{ fontWeight: 700 }}>Caleb está com 7 mesas</b> e Henrique com 5. Mova 1 mesa do Caleb para o Henrique para equilibrar.
                </div>
                <button style={{
                  all: 'unset', cursor: 'pointer', marginTop: 8,
                  padding: '7px 12px', borderRadius: 8,
                  background: C.ink, color: C.bg,
                  fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>Aplicar sugestão</button>
              </div>
            </div>
          </div>
        )}

        {/* BLOCO 4 · Busca + 2 rows de chips */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', border: `1px solid ${C.borderSoft}`,
            borderRadius: 10, background: C.bg,
            color: searchEmptyState ? C.ink : C.faint, fontSize: 13,
            fontWeight: searchEmptyState ? 500 : 400,
          }}>
            {Icon.search(16)}
            <span style={{ flex: 1 }}>
              {searchEmptyState ? 'Xy' : 'Buscar por nome ou CPF'}
            </span>
            {searchEmptyState && (
              <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>×</span>
            )}
          </div>
        </div>
        <div style={{ padding: '8px 16px 0' }}>
          <ChipRow dark={dark}
            items={[
              { label: 'Todos', count: 6, active: !searchEmptyState },
              { label: 'Em turno', count: 4 },
              { label: 'Sobrecarregados', count: 1 },
              { label: 'Folga', count: 0 },
              { label: 'Fora', count: 2 },
            ]}
          />
          <div style={{ height: 6 }} />
          <ChipRow dark={dark}
            items={[
              { label: 'Todos', active: true },
              { label: 'Garçons', count: 4 },
              { label: 'Cozinha+Bar', count: 3 },
              { label: 'Caixa', count: 1 },
            ]}
          />
        </div>

        {/* BLOCO 5 · Lista de funcionários (ou empty state da busca) */}
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {searchEmptyState ? (
            <div style={{
              padding: '28px 20px', textAlign: 'center',
              background: C.bg, border: `1.5px dashed ${C.borderSoft}`, borderRadius: 14,
            }}>
              <div style={{
                fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>Nenhum funcionário encontrado</div>
              <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 6 }}>
                Tente outro nome ou <span style={{ color: C.ink, textDecoration: 'underline', fontWeight: 700 }}>limpar busca</span>.
              </div>
            </div>
          ) : (
            M_TEAM.map(p => <StaffCard key={p.id} p={p} />)
          )}
        </div>

        {/* BLOCO 6 · Turnos do dia (★ S resolvido ★) */}
        <MSection dark={dark} title="Turnos de hoje · 06 mai"
          action="Editar turnos →"
          onAction={() => onTo('mgr-shift-editor')}
        >
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SHIFTS.map(sh => {
              const isOpen = openShift === sh.id;
              return (
                <div key={sh.id}>
                  <button onClick={() => setOpen(isOpen ? null : sh.id)} style={{
                    all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                    width: '100%', padding: '10px 12px',
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: isOpen ? '12px 12px 0 0' : 12,
                    borderBottom: isOpen ? `1px dashed ${C.borderSoft}` : `1px solid ${C.borderSoft}`,
                    background: C.bg,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800, color: C.ink, letterSpacing: 0.6,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      whiteSpace: 'nowrap',
                    }}>
                      {sh.label} · {sh.range}
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: C.mute, fontWeight: 600 }}>
                      {sh.members.length} {sh.members.length === 1 ? 'funcionário' : 'funcionários'}
                    </div>
                    {sh.status === 'now' && <MPill tone="success" dot dark={dark}>Atual</MPill>}
                    <span style={{
                      color: C.faint, opacity: 0.7, transform: isOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 120ms ease',
                    }}>{Icon.arrow(14)}</span>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: '10px 12px',
                      border: `1px solid ${C.borderSoft}`,
                      borderTop: 'none',
                      borderRadius: '0 0 12px 12px',
                      background: C.bg,
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      {sh.members.length === 0 ? (
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 500 }}>
                          Ninguém escalado pra esse turno.
                        </div>
                      ) : sh.members.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <MAvatar name={m.name} init={m.init} color={m.color} size={28} />
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{m.name}</div>
                          <div style={{
                            fontSize: 10, color: C.faint, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                          }}>{m.role}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </MSection>

        {/* BLOCO 7 · Próximos eventos */}
        <MSection dark={dark} title="Próximos eventos do turno">
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {NEXT_EVENTS.map((e, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 12,
                border: `1px solid ${C.borderSoft}`, background: C.bg,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 800, color: e.tone === 'success' ? '#1E8C5A' : e.tone === 'warn' ? '#9A7212' : C.ink,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2, minWidth: 44,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>{e.time}</div>
                <div style={{ flex: 1, fontSize: 13, color: C.ink, fontWeight: 600, letterSpacing: -0.1 }}>
                  {e.txt}
                </div>
              </div>
            ))}
          </div>
        </MSection>
      </div>

      {/* BLOCO 8 · CTA fixa "+ Adicionar funcionário" */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 60,
        padding: '12px 16px', pointerEvents: 'none',
      }}>
        <button onClick={() => onTo('mgr-staff-new')} style={{
          all: 'unset', cursor: 'pointer', pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', boxSizing: 'border-box',
          padding: '14px 16px',
          background: C.ink, color: C.bg,
          borderRadius: 14, fontSize: 14, fontWeight: 700, letterSpacing: -0.1,
          boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
        }}>
          {Icon.plus(18)} Adicionar funcionário
        </button>
      </div>

      <MBottomNav active="staff" dark={dark} onTo={onTo} />
    </div>
  );
};

// Row de chips horizontal scrollable usado nas 2 linhas de filtro
const ChipRow = ({ items, dark }) => {
  const C = useG(dark);
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
      {items.map((it, i) => (
        <div key={i} style={{
          padding: '6px 12px', borderRadius: 999,
          border: `1px solid ${it.active ? C.ink : C.borderSoft}`,
          background: it.active ? C.ink : 'transparent',
          color: it.active ? C.bg : C.ink,
          fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {it.label}
          {it.count != null && (
            <span style={{
              fontSize: 10.5, fontWeight: 800,
              color: it.active ? C.bg : C.faint,
              fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2,
            }}>· {it.count}</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================
// EDITOR DE TURNOS (★ V8 · 2026-05 ★ — substitui placeholder V6/V7)
// ────────────────────────────────────────────────────────────
// Acessível por "Editar turnos →" da seção "Turnos de hoje" (Equipe).
//
// Estrutura:
//   • Topbar back + "Editar turnos" + CTA "+ Novo turno" no canto direito
//   • 3 cards expandíveis (Manhã · Tarde · Noite) — turno atual default expandido
//   • Cada card · header colapsado mostra horário + contagem por função
//   • Cada card · expandido lista membros; tap nos 3-pontinhos abre MoreSheet
//     com 3 ações: "Mover", "Autorizar hora extra", "Remover" (destrutiva)
//   • Ao final do card, link "+ Adicionar funcionário a este turno"
//   • Footer fixo: "Duplicar próxima semana" outline + "Salvar alterações"
//     filled (only visible quando hasChanges=true)
//   • Auto-save indicator discreto no topbar quando dirty=true
//
// Modais:
//   move      — bottom-sheet com 2 outras opções de turno · radios
//   overtime  — bottom-sheet com chips 30min / 1h / 2h / personalizado
//   remove    — confirm destrutivo (vermelho)
//   add       — bottom-sheet com lista de funcionários disponíveis
//
// Props do canvas:
//   defaultExpanded · 'manha' | 'tarde' | 'noite' (default) | 'all'
//   emptyShift      · 'manha'|'tarde'|'noite' — empties that shift's members
//   modal           · 'more'|'move'|'overtime'|'remove'|'add'|null
//   hasChanges      · boolean — controla visibilidade do "Salvar alterações"
// ============================================================

// Mock data dos 3 turnos do dia
const M_SHIFTS_FULL = {
  manha: { id: 'manha', label: 'MANHÃ', range: '06H – 12H', members: [
    { id: 11, name: 'Pedro Aguiar',   init: 'PA', role: 'Garçom',  color: '#5B7CD9' },
    { id: 12, name: 'Lara Mendes',    init: 'LM', role: 'Garçom',  color: '#D9595B' },
    { id: 13, name: 'Tiago Rocha',    init: 'TR', role: 'Cozinha', color: '#3E8C72' },
    { id: 14, name: 'Sofia Brito',    init: 'SB', role: 'Caixa',   color: '#9A4FBE' },
  ]},
  tarde: { id: 'tarde', label: 'TARDE', range: '12H – 17H', members: [
    { id: 4,  name: 'Marina Reis',    init: 'MR', role: 'Garçom',  color: '#1E8C5A' },
    { id: 21, name: 'Bento Soares',   init: 'BS', role: 'Garçom',  color: '#7A4FBE' },
  ]},
  noite: { id: 'noite', label: 'NOITE', range: '17H – 23H', members: [
    { id: 1, name: 'Caleb Souza',     init: 'CS', role: 'Garçom',     color: '#4F6BFF' },
    { id: 2, name: 'Olivia Martins',  init: 'OM', role: 'Garçom',     color: '#E37D2F' },
    { id: 3, name: 'Henrique Lima',   init: 'HL', role: 'Garçom',     color: '#7A4FBE' },
    { id: 5, name: 'Bruno Pacheco',   init: 'BP', role: 'Cozinha',    color: '#C43A3A' },
    { id: 6, name: 'Júlia Andrade',   init: 'JA', role: 'Bartender',  color: '#0B7A8B' },
  ]},
};

// Gera contagem mono caps a partir dos membros: "2 GARÇONS · 1 COZINHA · 1 CAIXA"
const shiftRoleCount = (members) => {
  const buckets = { 'Garçom': 0, 'Cozinha': 0, 'Bartender': 0, 'Caixa': 0 };
  members.forEach(m => { if (buckets[m.role] != null) buckets[m.role] += 1; });
  const order = [
    [buckets['Garçom'],   ['GARÇOM', 'GARÇONS']],
    [buckets['Cozinha'],  ['COZINHA', 'COZINHA']],
    [buckets['Bartender'],['BAR', 'BAR']],
    [buckets['Caixa'],    ['CAIXA', 'CAIXA']],
  ];
  return order.filter(([n]) => n > 0).map(([n, [s, p]]) => `${n} ${n === 1 ? s : p}`).join(' · ');
};

const ScreenManagerShiftEditor = ({
  dark = false,
  onTo = () => {},
  defaultExpanded = 'noite',
  emptyShift = null,
  modal = null,
  hasChanges = false,
}) => {
  const C = useG(dark);

  // Aplica empty-shift override (canvas-only) sem mutar o mock
  const SHIFTS = ['manha', 'tarde', 'noite'].map(id => ({
    ...M_SHIFTS_FULL[id],
    members: emptyShift === id ? [] : M_SHIFTS_FULL[id].members,
    isCurrent: id === 'noite',
  }));

  const [open, setOpen] = useStateM({
    manha: defaultExpanded === 'all' || defaultExpanded === 'manha',
    tarde: defaultExpanded === 'all' || defaultExpanded === 'tarde',
    noite: defaultExpanded === 'all' || defaultExpanded === 'noite',
  });
  const [activeModal, setActiveModal] = useStateM(modal);
  const [dirty, setDirty] = useStateM(hasChanges);
  // Membro alvo do MoreSheet/modais (canvas usa Caleb como exemplo padrão)
  const targetMember = M_SHIFTS_FULL.noite.members[0];

  const toggle = (id) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));

  // Pill mini outline (CTA do topbar e do footer)
  const PillBtn = ({ filled, children, onClick, danger, mini }) => (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
      padding: mini ? '6px 11px' : '0 14px', height: mini ? 30 : 44,
      borderRadius: mini ? 8 : 12,
      border: filled ? 'none' : `1px solid ${danger ? '#C43A3A' : C.borderSoft}`,
      background: filled ? (danger ? '#C43A3A' : C.ink) : 'transparent',
      color: filled ? C.bg : (danger ? '#C43A3A' : C.ink),
      fontSize: mini ? 12 : 14, fontWeight: 700, letterSpacing: -0.1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>{children}</button>
  );

  // Linha de funcionário dentro do card expandido
  const MemberRow = ({ m }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '9px 4px',
      borderTop: `1px solid ${C.borderFaint}`,
    }}>
      <MAvatar name={m.name} init={m.init} color={m.color} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{m.name}</div>
        <div style={{
          fontSize: 9.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace', marginTop: 1,
        }}>{m.role.toUpperCase()}</div>
      </div>
      <button onClick={() => setActiveModal('more')} aria-label={`Ações para ${m.name}`} style={{
        all: 'unset', cursor: 'pointer',
        width: 32, height: 32, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.faint,
      }}>{Icon.more(18)}</button>
    </div>
  );

  // Card de turno (colapsado/expandido)
  const ShiftCard = ({ sh }) => {
    const isOpen = open[sh.id];
    const empty = sh.members.length === 0;
    const count = sh.members.length;
    return (
      <div style={{
        borderRadius: 14,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        overflow: 'hidden',
      }}>
        <button onClick={() => toggle(sh.id)} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          width: '100%', padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: C.ink, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>
              {sh.label} · {sh.range}
            </div>
            <div style={{
              fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 4, lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {empty ? 'Ninguém escalado' : `${count} ${count === 1 ? 'funcionário' : 'funcionários'} · ${shiftRoleCount(sh.members)}`}
            </div>
          </div>
          {sh.isCurrent && <MPill tone="success" dot dark={dark}>Atual</MPill>}
          <span style={{
            color: C.faint, opacity: 0.7,
            transform: isOpen ? 'rotate(90deg)' : 'none',
            transition: 'transform 140ms ease', flexShrink: 0,
          }}>{Icon.arrow(14)}</span>
        </button>
        {isOpen && (
          <div style={{ padding: '4px 14px 12px', borderTop: `1px dashed ${C.borderSoft}` }}>
            {empty ? (
              <div style={{
                margin: '14px 0 8px',
                padding: '20px 14px', textAlign: 'center',
                borderRadius: 12, border: `1.5px dashed ${C.borderSoft}`,
                background: C.surface,
              }}>
                <div style={{
                  fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>Turno vazio</div>
                <div style={{ fontSize: 13, color: C.mute, fontWeight: 500, marginTop: 6, lineHeight: 1.45 }}>
                  Ninguém está escalado pra esse turno ainda.
                </div>
              </div>
            ) : (
              sh.members.map(m => <MemberRow key={m.id} m={m} />)
            )}
            <button onClick={() => setActiveModal('add')} style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 4px', marginTop: 4,
              borderTop: empty ? 'none' : `1px solid ${C.borderFaint}`,
              fontSize: 13, fontWeight: 600, color: C.mute,
              width: '100%',
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: 6,
                border: `1px dashed ${C.borderSoft}`,
                color: C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{Icon.plus(14)}</span>
              Adicionar funcionário a este turno
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink, position: 'relative' }}>
      <MTopBar dark={dark} title="Editar turnos"
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo('mgr-staff')} />}
        right={
          <button onClick={() => setActiveModal('add')} style={{
            all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
            padding: '7px 12px', borderRadius: 999,
            border: `1px solid ${C.borderSoft}`, background: 'transparent',
            color: C.ink, fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>{Icon.plus(13)} Novo turno</button>
        }
      />

      {/* Auto-save indicator discreto · só quando dirty */}
      {dirty && (
        <div style={{
          padding: '8px 16px',
          background: '#FFF7E6', borderBottom: `1px solid #F0DCB6`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#9A7212',
            animation: 'gPulse 1.4s infinite',
          }} />
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: '#7A4D10', letterSpacing: 0.6, textTransform: 'uppercase',
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          }}>Mudanças pendentes · salvas localmente</div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 96px' }}>
        <div style={{
          fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace', marginBottom: 8,
        }}>Quarta-feira · 06 mai</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SHIFTS.map(sh => <ShiftCard key={sh.id} sh={sh} />)}
        </div>
      </div>

      {/* Footer fixo de ações globais */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '10px 14px 18px',
        background: C.surface, borderTop: `1px solid ${C.borderSoft}`,
        display: 'flex', gap: 8,
      }}>
        <button onClick={() => {}} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          flex: dirty ? 1 : 1, height: 44, padding: '0 12px',
          borderRadius: 12, border: `1px solid ${C.borderSoft}`,
          background: 'transparent', color: C.ink,
          fontSize: 12.5, fontWeight: 700, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center',
        }}>
          {Icon.history(14)} Duplicar pra próxima semana
        </button>
        {dirty && (
          <button onClick={() => setDirty(false)} style={{
            all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
            flex: 1, height: 44, padding: '0 12px',
            borderRadius: 12, background: C.ink, color: C.bg,
            fontSize: 13, fontWeight: 800, letterSpacing: -0.1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {Icon.check(14)} Salvar alterações
          </button>
        )}
      </div>

      {/* MoreSheet do membro · 3 ações */}
      {activeModal === 'more' && (
        <div onClick={() => setActiveModal(null)}>
          <MoreSheet dark={dark} title={`${targetMember.name} · ${targetMember.role}`}
            actions={[
              { icon: Icon.arrow,  label: 'Mover para outro turno', sub: 'Escolher turno destino' },
              { icon: Icon.clock,  label: 'Autorizar hora extra',   sub: 'Estende além das 23h' },
              { icon: Icon.trash,  label: 'Remover do turno',       sub: 'Tira da escala de hoje', tone: 'danger' },
            ]}
          />
        </div>
      )}

      {/* Modal · Mover para outro turno */}
      {activeModal === 'move' && (
        <ModalBase dark={dark} onClose={() => setActiveModal(null)}
          title="Mover para outro turno"
          subtitle={<><b>{targetMember.name}</b> sairá do turno NOITE.</>}
          primary={{ label: 'Mover', onClick: () => { setDirty(true); setActiveModal(null); } }}
        >
          {[
            { id: 'manha', label: 'MANHÃ', range: '06H – 12H', selected: false },
            { id: 'tarde', label: 'TARDE', range: '12H – 17H', selected: true },
          ].map(opt => (
            <div key={opt.id} style={{
              padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${opt.selected ? C.ink : C.borderSoft}`,
              background: opt.selected ? C.surface : C.bg,
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: `2px solid ${opt.selected ? C.ink : C.borderSoft}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {opt.selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ink }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, color: C.ink, letterSpacing: 0.6,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>{opt.label} · {opt.range}</div>
              </div>
            </div>
          ))}
        </ModalBase>
      )}

      {/* Modal · Autorizar hora extra */}
      {activeModal === 'overtime' && (
        <ModalBase dark={dark} onClose={() => setActiveModal(null)}
          title="Autorizar hora extra"
          subtitle={<><b>{targetMember.name}</b> · turno termina 23H</>}
          primary={{ label: 'Autorizar', onClick: () => { setDirty(true); setActiveModal(null); } }}
        >
          <div style={{
            fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace', marginBottom: 8,
          }}>Duração</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { lbl: '30 MIN', selected: false },
              { lbl: '1 H',    selected: true  },
              { lbl: '2 H',    selected: false },
              { lbl: 'PERSONALIZADO', selected: false },
            ].map((c, i) => (
              <div key={i} style={{
                padding: '8px 12px', borderRadius: 999,
                border: `1px solid ${c.selected ? C.ink : C.borderSoft}`,
                background: c.selected ? C.ink : 'transparent',
                color: c.selected ? C.bg : C.ink,
                fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>{c.lbl}</div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 14, lineHeight: 1.5 }}>
            Termo de hora extra é gerado e fica no histórico. Cliente paga ou abate na escala da semana seguinte.
          </div>
        </ModalBase>
      )}

      {/* Modal · Remover do turno (destrutiva) */}
      {activeModal === 'remove' && (
        <ModalBase dark={dark} onClose={() => setActiveModal(null)}
          title="Remover do turno?"
          subtitle={<><b>{targetMember.name}</b> sai da escala de hoje. As mesas dele precisam ser realocadas manualmente.</>}
          primary={{ label: 'Remover', danger: true, onClick: () => { setDirty(true); setActiveModal(null); } }}
        />
      )}

      {/* Modal · Adicionar funcionário ao turno */}
      {activeModal === 'add' && (
        <ModalBase dark={dark} onClose={() => setActiveModal(null)}
          title="Adicionar ao turno NOITE"
          subtitle="Funcionários que não estão escalados hoje"
          primary={null}
        >
          {[
            { id: 99, name: 'Marina Reis',   init: 'MR', role: 'Garçom · turno tarde', color: '#1E8C5A' },
            { id: 98, name: 'Ricardo Pinto', init: 'RP', role: 'Garçom · em folga',    color: '#7A4FBE' },
            { id: 97, name: 'Sofia Brito',   init: 'SB', role: 'Caixa · turno manhã',  color: '#9A4FBE' },
          ].map(p => (
            <div key={p.id} style={{
              padding: 10, borderRadius: 12,
              border: `1px solid ${C.borderSoft}`, background: C.bg,
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
            }}>
              <MAvatar name={p.name} init={p.init} color={p.color} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{p.name}</div>
                <div style={{
                  fontSize: 10, color: C.faint, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace', marginTop: 1,
                }}>{p.role}</div>
              </div>
              <button style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                padding: '7px 11px', borderRadius: 8,
                background: C.ink, color: C.bg,
                fontSize: 11.5, fontWeight: 700, letterSpacing: -0.1,
              }}>Adicionar</button>
            </div>
          ))}
        </ModalBase>
      )}
    </div>
  );
};

// ─── Modal base reusável (bottom sheet) ─────────────────────────
// Usado pelos 4 modais do ShiftEditor. Card branco com sticky title +
// area de body (children) + footer com cancelar/primary.
const ModalBase = ({ dark, title, subtitle, children, onClose, primary }) => {
  const C = useG(dark);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.42)',
      animation: 'gFadeIn 180ms ease-out',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.bg,
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        padding: '14px 18px 22px',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          width: 38, height: 4, borderRadius: 2,
          background: dark ? '#3a3a40' : '#dcdcdc',
          margin: '0 auto 14px',
        }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 13, color: C.mute, fontWeight: 500, marginTop: 6, lineHeight: 1.45 }}>
            {subtitle}
          </div>
        )}
        <div style={{ marginTop: 14 }}>{children}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{
            all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
            flex: 1, height: 44, padding: '0 14px',
            borderRadius: 12, border: `1px solid ${C.borderSoft}`,
            color: C.ink, fontSize: 13.5, fontWeight: 700, letterSpacing: -0.1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>Cancelar</button>
          {primary && (
            <button onClick={primary.onClick} style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              flex: 1, height: 44, padding: '0 14px', borderRadius: 12,
              background: primary.danger ? '#C43A3A' : C.ink,
              color: '#fff',
              fontSize: 13.5, fontWeight: 800, letterSpacing: -0.1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{primary.label}</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// EQUIPE · FORMULÁRIO de cadastro / edição
// (sub-tela · botão x no header · não tem bottom nav porque
// é modal-like — gerente está editando um item)
// ============================================================
const ScreenManagerStaffForm = ({ dark = false, mode = 'create' }) => {
  const C = useG(dark);
  const isEdit = mode === 'edit';

  const Field = ({ label, value, placeholder, hint, right }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <div style={{
        padding: '12px 14px', border: `1px solid ${C.borderSoft}`, borderRadius: 10,
        fontSize: 15, color: value ? C.ink : C.faint,
        background: C.bg, fontWeight: value ? 500 : 400,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>{value || placeholder}</span>
        {right}
      </div>
      {hint && <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ height: '100%', overflow: 'auto', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <MTopBar dark={dark}
        title={isEdit ? 'Editar funcionário' : 'Novo funcionário'}
        left={<GIconBtn dark={dark} icon={Icon.x(20)} />}
      />

      {isEdit && (
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${C.borderSoft}`, background: C.bg }}>
          <MAvatar name="Olivia Martins" init="OM" color="#E37D2F" size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>Olivia Martins</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 2, fontWeight: 500 }}>Cadastrada em 12/03/2024</div>
          </div>
          <MPill tone="success" dot dark={dark}>Ativo</MPill>
        </div>
      )}

      <div style={{ padding: 16 }}>
        <Field label="Nome completo" value={isEdit ? 'Olivia Martins' : ''} placeholder="Ex.: Maria Silva" />
        <Field label="CPF" value={isEdit ? '123.456.789-00' : ''} placeholder="000.000.000-00" />
        <Field label="Telefone" value={isEdit ? '(11) 98765-4321' : ''} placeholder="(00) 00000-0000" />
        <Field label="E-mail" value={isEdit ? 'olivia@trattorialuna.com' : ''} placeholder="email@trattoria.com" />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Função</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Garçom', 'Cozinheiro', 'Bartender', 'Caixa', 'Gerente'].map((r, i) => {
              const active = (isEdit && r === 'Garçom') || (!isEdit && i === 0);
              return (
                <div key={r} style={{
                  padding: '8px 14px', borderRadius: 999,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.ink : 'transparent',
                  color: active ? C.bg : C.ink,
                  fontSize: 13, fontWeight: 600,
                }}>{r}</div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Turno padrão</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['Manhã', 'Tarde', 'Noite'].map((s, i) => {
              const active = (isEdit && s === 'Noite') || (!isEdit && i === 2);
              return (
                <div key={s} style={{
                  flex: 1, textAlign: 'center', padding: '10px',
                  borderRadius: 10,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.ink : 'transparent',
                  color: active ? C.bg : C.ink,
                  fontSize: 13, fontWeight: 600,
                }}>{s}</div>
              );
            })}
          </div>
        </div>

        {!isEdit && (
          <div style={{
            padding: 12, borderRadius: 10,
            background: '#FFF7EC', border: `1px solid #F0DCB6`,
            fontSize: 12, color: '#7a4d10', lineHeight: 1.45,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Senha provisória</div>
            Será gerada automaticamente e enviada por SMS para o telefone cadastrado. O funcionário troca no primeiro acesso.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
          <GButton dark={dark} full kind="primary">{isEdit ? 'Salvar alterações' : 'Cadastrar e enviar acesso'}</GButton>
          {isEdit && <GButton dark={dark} full kind="ghost">Desativar funcionário</GButton>}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 5 · EU — perfil do gerente, turno, conta, estabelecimento, sair
//
// É a 5ª ABA da bottom nav (refatoração 2026-05). Não tem botão de
// voltar no header — voltar é tocando outra aba.
//
// Conteúdo:
//   1. HERO — avatar 76px + nome + role+turno + bolinha "em turno desde X"
//   2. ★ V11 ★ MENSAGENS — bloco próprio com 1 ActionRow (badge não-lidas).
//      Subiu pro topo porque é interruptivo: notificação que precisa de
//      ação. KPI passivo desce uma posição.
//   3. KPI rápido — vendas no SEU turno (não dia inteiro)
//   4. OPERAÇÃO — Encerrar turno (CTA dourada · destrutiva)
//                 · Histórico · Folgas · Equipe e escala (atalho) · Cortesias
//   5. CONTA — Notificações · Segurança · Aparência (tema)
//   6. ESTABELECIMENTO (só donos) — Mesas · Horários · Cardápio · Plano
//   7. SAIR — vermelho destrutivo · versão do app no rodapé
//
// Por que separar Mensagens de Operação de Conta de Estabelecimento:
//   • Mensagens é interruptivo (notif staff↔staff, badge fica visível
//     no abrir da tela sem scroll) — V11 puxou pro 2º bloco
//   • Operação muda TODO turno (encerrar, ver folgas)
//   • Conta muda raramente (senha, push)
//   • Estabelecimento muda quase nunca + só owners têm permissão
// ============================================================
const ScreenManagerSettings = ({ dark = false, role = 'manager', onTo = () => {} }) => {
  const C = useG(dark);
  const isOwner = role === 'owner';

  const ActionRow = ({ icon, lbl, sub, danger, accent, badge, onClick }) => (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer',
      width: '100%', boxSizing: 'border-box',
      padding: '12px 14px', borderRadius: 12,
      border: `1px solid ${C.borderSoft}`,
      background: C.bg,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: danger ? '#FFE9E9' : accent ? '#F0E8D8' : '#F4F0E8',
        color: danger ? '#A12626' : accent ? '#7A4D10' : C.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: danger ? '#A12626' : C.ink, letterSpacing: -0.1 }}>{lbl}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>{sub}</div>}
      </div>
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 22, height: 22, padding: '0 7px', borderRadius: 11,
          background: '#C43A3A', color: '#fff',
          fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>{badge}</span>
      )}
      <div style={{ color: C.faint, opacity: 0.5, flexShrink: 0 }}>{Icon.arrow(16)}</div>
    </button>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Header simples — Eu é aba, não sub-tela; só o título */}
        <MTopBar dark={dark} title="Eu"
          right={<GIconBtn dark={dark} icon={Icon.bell(20)} badge="3" />}
        />

        {/* 1 · HERO ─── */}
        <div style={{
          padding: '20px 16px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: `1px solid ${C.borderSoft}`, background: C.bg,
        }}>
          <MAvatar name="Renata Albuquerque" init="RA" color="#7A4FBE" size={76} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>Renata Albuquerque</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 3, fontWeight: 600 }}>
              {isOwner ? 'Dona' : 'Gerente'} · Turno da noite (17h–02h)
            </div>
            <div style={{ fontSize: 11, color: '#1E8C5A', marginTop: 6, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.3, textTransform: 'uppercase' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E8C5A', animation: 'gPulse 2s infinite' }} />
              em turno desde 17:02
            </div>
          </div>
        </div>

        {/* 2 · MENSAGENS · ★ V11 · 2026-05 ★ ─── bloco próprio, alto na tela
            Subiu de dentro de OPERAÇÃO pra logo após o hero pq é
            interruptivo: badge de não-lidas tem que estar visível
            no momento que a tela abre, sem scroll. */}
        <MSection dark={dark} title="Mensagens">
          <div style={{ padding: '0 16px' }}>
            <ActionRow icon={Icon.chat(18)} lbl="Mensagens" sub="Histórico · 3 não-lidas" badge={3} onClick={() => onTo('staff-messages')} />
          </div>
        </MSection>

        {/* 3 · KPI rápido ─── */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{
            padding: 14, borderRadius: 12,
            background: C.bg,
            border: `1px solid ${C.borderSoft}`,
          }}>
            <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Vendas no SEU turno
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: -0.6, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>R$ 12.847</div>
            <div style={{ fontSize: 11.5, color: '#1E8C5A', marginTop: 4, fontWeight: 700 }}>
              ↑ 18 mesas atendidas · ticket médio R$ 134
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>
              Só o que entrou desde que você abriu o turno (17:02). Veja o dia inteiro no Financeiro.
            </div>
          </div>
        </div>

        {/* 4 · OPERAÇÃO ─── (V11: Mensagens saiu daqui · subiu pro 2º bloco) */}
        <MSection dark={dark} title="Operação">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Encerrar turno · CTA destacada · ação destrutiva (gera resumo + sai) */}
            <button style={{
              all: 'unset', cursor: 'pointer',
              width: '100%', boxSizing: 'border-box',
              padding: '14px 16px', borderRadius: 12,
              background: '#FFF7E6',
              border: `1px solid #F0DCB6`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#9A7212', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{Icon.pause(18)}</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1d1c19', letterSpacing: -0.2 }}>Encerrar turno</div>
                <div style={{ fontSize: 11.5, color: '#9A7212', marginTop: 2, fontWeight: 600 }}>
                  Vai gerar resumo · você sai do app
                </div>
              </div>
              <div style={{ color: '#9A7212', opacity: 0.7 }}>{Icon.arrow(16)}</div>
            </button>
            <ActionRow icon={Icon.list(18)}    lbl="Histórico de turnos"  sub="Vendas, mesas e desempenho dos turnos passados" />
            <ActionRow icon={Icon.user(18)}    lbl="Equipe e turnos"      sub="Mesma tela da aba Equipe · turnos do dia inclusos" onClick={() => onTo('mgr-staff')} />
            <ActionRow icon={Icon.gift(18)}    lbl="Cortesias"            sub="Histórico · criar manualmente" onClick={() => onTo('mgr-courtesies')} />
          </div>
        </MSection>

        {/* 5 · CONTA ─── */}
        <MSection dark={dark} title="Conta">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionRow icon={Icon.bell(18)}    lbl="Notificações"      sub="Avisos do turno · push · sons · lock screen" />
            <ActionRow icon={Icon.shield(18)}  lbl="Segurança e senha" sub="Trocar senha · 2FA · sessões ativas" />
            <ActionRow icon={Icon.flame(18)}   lbl="Aparência"         sub="Modo claro · escuro · automático" />
          </div>
        </MSection>

        {/* 6 · ESTABELECIMENTO (só owners) ─── */}
        {isOwner && (
          <MSection dark={dark} title="Estabelecimento · só donos">
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionRow icon={Icon.table(18)}   lbl="Configuração de mesas"   sub="Número, capacidade, setores · imprimir QR codes" />
              <ActionRow icon={Icon.clock(18)}   lbl="Horários do restaurante" sub="Abertura, fechamento, dias da semana" />
              <ActionRow icon={Icon.list(18)}    lbl="Cardápio"                sub="Editar pratos, preços, fotos, categorias" />
              <ActionRow icon={Icon.receipt(18)} lbl="Plano e cobrança"        sub="Plano atual · histórico · método de pagamento" />
            </div>
          </MSection>
        )}

        {/* 7 · SAIR ─── */}
        <div style={{ padding: '24px 16px 16px' }}>
          <button style={{
            all: 'unset', cursor: 'pointer',
            width: '100%', boxSizing: 'border-box',
            padding: '14px 16px', borderRadius: 12,
            border: `1px solid #F4C7C7`,
            background: '#FFF1F1',
            color: '#A12626',
            fontSize: 14, fontWeight: 700,
            textAlign: 'center',
          }}>
            Sair do app
          </button>
          <div style={{ fontSize: 10.5, color: C.faint, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            Versão 1.1.0 · build 2026-05-06<br />
            Trattoria Luna · Av. Paulista 1234
          </div>
        </div>

      </div>
      <MBottomNav active="me" dark={dark} onTo={onTo} />
    </div>
  );
};

// ============================================================
// CORTESIAS · histórico + criar manualmente ★ V5 ★
// ────────────────────────────────────────────────────────────
// Acessada por Eu > OPERAÇÃO > "Cortesias". Tab segmentada:
//   Histórico (default) — lista cronológica das cortesias enviadas
//   Nova cortesia — atalho frio pra ScreenManagerCompensateClient
//                   (estado select · gerente escolhe a mesa)
//
// Esta tela existe pra fechar a migração V5: Cortesia saiu da
// MQuickActionsBar (V3) e do Painel · Ferramentas rápidas (V4) e
// agora vive em 3 lugares só:
//   1) ScreenManagerTableMenu · Seção Ações (entrada principal)
//   2) MContactClientSheet · sub-menu (chip "Quer uma cortesia")
//   3) Aqui (cold path · histórico + criar manual)
//
// tab: 'history' | 'new'
// ============================================================
const C_COURTESIES = [
  { id: 'cs1', table: 14, type: 'Sobremesa', item: 'Fondant de chocolate · 2 porções', status: 'aceita',     manager: 'Renata Albuquerque',    when: 'há 12 min', responseSec: 32 },
  { id: 'cs2', table: 7,  type: 'Drink',     item: 'Caipirinha · 2 doses',             status: 'aceita',     manager: 'Renata Albuquerque',    when: 'há 1h 02',  responseSec: 47 },
  { id: 'cs3', table: 9,  type: 'Desconto',  item: '15% de desconto na conta',         status: 'pendente',   manager: 'Henrique L.',           when: 'há 2 min',  responseSec: null },
  { id: 'cs4', table: 22, type: 'Couvert',   item: 'Couvert (R$ 18) sai da conta',     status: 'aceita',     manager: 'Renata Albuquerque',    when: 'há 2h 18',  responseSec: 28 },
  { id: 'cs5', table: 3,  type: 'Sobremesa', item: 'Brownie da casa · 1 porção',       status: 'recusada',   manager: 'Henrique L.',           when: 'ontem 22h', responseSec: 184 },
];

const ScreenManagerCourtesies = ({ dark = false, tab = 'history', onTo = () => {} }) => {
  const C = useG(dark);
  const aceitas    = C_COURTESIES.filter(c => c.status === 'aceita').length;
  const pendentes  = C_COURTESIES.filter(c => c.status === 'pendente').length;
  const totalToday = C_COURTESIES.length;

  const StatusPill = ({ status }) => {
    const map = {
      aceita:    { bg: '#EFF5EC', fg: '#0F5A37', label: 'aceita' },
      pendente:  { bg: '#FFF7E6', fg: '#7A4D10', label: 'pendente' },
      recusada:  { bg: '#FFF1F1', fg: '#A12626', label: 'recusada' },
    };
    const s = map[status] || map.pendente;
    return (
      <span style={{
        padding: '3px 8px', borderRadius: 999,
        background: s.bg, color: s.fg,
        fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
        flexShrink: 0,
      }}>{s.label}</span>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Cortesias"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {/* Tab segmentada · histórico · nova cortesia */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.borderSoft}`, background: C.bg }}>
          <MTab dark={dark} active={tab === 'history'} count={totalToday}>Histórico</MTab>
          <MTab dark={dark} active={tab === 'new'}>Nova cortesia</MTab>
        </div>

        {tab === 'history' && (
          <>
            {/* KPIs do dia · 3 mini-tiles compact */}
            <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, padding: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 12, background: C.bg }}>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace" }}>Hoje</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{totalToday}</div>
              </div>
              <div style={{ flex: 1, padding: 12, border: `1px solid #C0DEC9`, borderRadius: 12, background: '#EFF5EC' }}>
                <div style={{ fontSize: 10, color: '#0F5A37', fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace" }}>Aceitas</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: '#0F5A37', fontVariantNumeric: 'tabular-nums' }}>{aceitas}</div>
              </div>
              <div style={{ flex: 1, padding: 12, border: `1px solid #F0DCB6`, borderRadius: 12, background: '#FFF7E6' }}>
                <div style={{ fontSize: 10, color: '#7A4D10', fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace" }}>Pendentes</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: '#7A4D10', fontVariantNumeric: 'tabular-nums' }}>{pendentes}</div>
              </div>
            </div>

            <div style={{ padding: '14px 16px 6px', fontSize: 11.5, color: C.faint, fontWeight: 500, lineHeight: 1.4 }}>
              Últimas cortesias enviadas · ordenadas por mais recente.
            </div>

            <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {C_COURTESIES.map(c => (
                <div key={c.id} style={{
                  padding: 14, border: `1px solid ${C.borderSoft}`, borderRadius: 12, background: C.bg,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 9.5, fontWeight: 800, color: C.faint,
                        letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4,
                        fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                      }}>Mesa {c.table} · {c.when}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, letterSpacing: -0.2 }}>
                        {c.type}
                      </div>
                      <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 2, lineHeight: 1.4 }}>
                        {c.item}
                      </div>
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: 8, marginTop: 6, borderTop: `1px solid ${C.borderFaint}`,
                  }}>
                    <div style={{
                      fontSize: 11, color: C.faint, fontWeight: 600,
                      letterSpacing: 0.1,
                    }}>
                      por <b style={{ color: C.ink, fontWeight: 700 }}>{c.manager}</b>
                    </div>
                    {c.responseSec != null && (
                      <div style={{
                        fontSize: 10, color: C.faint, fontWeight: 700,
                        letterSpacing: 0.5, textTransform: 'uppercase',
                        fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                        fontVariantNumeric: 'tabular-nums',
                      }}>resposta · {c.responseSec}s</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'new' && (
          <>
            {/* ★ V7 ★ — texto limpo · sem hero verde · sem "como achar mais rápido" */}
            <div style={{ padding: '32px 16px 0' }}>
              <div style={{
                fontSize: 24, fontWeight: 700, color: C.ink,
                letterSpacing: -0.4, lineHeight: 1.15,
              }}>
                Nova cortesia
              </div>
              <div style={{
                fontSize: 14, fontWeight: 500, color: C.mute,
                marginTop: 6, lineHeight: 1.45,
              }}>
                Escolha uma mesa e mande um mimo.
              </div>
            </div>

            <div style={{ height: 110 }} />
          </>
        )}
      </div>

      {/* Footer · CTA muda por tab */}
      {tab === 'new' && (
        <div style={{ padding: '12px 16px 18px', background: C.bg, borderTop: `1px solid ${C.borderSoft}` }}>
          <button
            onClick={() => onTo('mgr-compensate')}
            style={{
              all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
              width: '100%', textAlign: 'center',
              padding: '14px 16px', borderRadius: 12,
              background: C.ink, color: C.bg,
              fontSize: 14, fontWeight: 800, letterSpacing: -0.1, fontFamily: G_FONT,
            }}>Abrir compositor</button>
        </div>
      )}

      <MBottomNav active="me" dark={dark} onTo={onTo} />
    </div>
  );
};

Object.assign(window, {
  ScreenManagerHomeA,
  ScreenManagerStaff,                 // ★ V6 ★ unificada (StaffList + ShiftBoard + ShiftSchedule)
  ScreenManagerShiftEditor,           // ★ V8 ★ tela funcional · 3 cards expandíveis + 4 modais
  ScreenManagerStaffForm,
  ScreenManagerSettings,
  ScreenManagerCourtesies,            // ★ V5 ★
  C_COURTESIES,
  M_TEAM, M_BOTTLENECKS, M_INPROGRESS,
  MTopBar, MTab, MStat, MSection, MAvatar, MBottomNav, MAppHeader, MPill,
  MInProgressCard,
});
