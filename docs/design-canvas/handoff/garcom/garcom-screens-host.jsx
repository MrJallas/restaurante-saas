// ============================================================
// RECEPCIONISTA — telas exclusivas (mesa grid, liberar, alertas, detalhe)
// Reutiliza: useG, Icon, G_FONT do garcom-tokens
//            GIconBtn do garcom-screens-a
//            MTopBar, MAvatar, M_TEAM do garcom-screens-c
// ============================================================

// ─── MOCK DATA — recepcionista + mesas ─────────────────────────
const H_HOST = {
  name: 'Letícia Aguiar',
  init: 'LA',
  role: 'Recepcionista',
  shift: '17:00 — 23:00',
  color: '#7A4FBE',
};

// Estados da mesa do ponto de vista da recepcionista:
//  livre     — vazia, sem QR liberado, ninguém atribuído ainda
//  liberada  — recepcionista liberou, aguardando o cliente escanear
//              (QR fica ativo até a conta fechar — não expira)
//  ocupada   — cliente sentou e está usando o app
//  alerta    — cliente sentou sem liberação prévia (precisa intervenção)
const H_SECTORS = ['Salão', 'Varanda', 'Mezanino'];
const H_TABLES = [
  // Salão · 16 mesas
  { n: 1,  cap: 4, sector: 'Salão',    st: 'ocupada',   seats: 4, since: '18:42', waiter: 'CS' },
  { n: 2,  cap: 2, sector: 'Salão',    st: 'livre' },
  { n: 3,  cap: 6, sector: 'Salão',    st: 'ocupada',   seats: 5, since: '18:18', waiter: 'HL' },
  { n: 4,  cap: 4, sector: 'Salão',    st: 'liberada',  seats: 3, since: '19:38', waiter: null },
  { n: 5,  cap: 4, sector: 'Salão',    st: 'livre' },
  { n: 6,  cap: 2, sector: 'Salão',    st: 'ocupada',   seats: 2, since: '19:10', waiter: 'OM' },
  { n: 7,  cap: 4, sector: 'Salão',    st: 'livre' },
  { n: 8,  cap: 4, sector: 'Salão',    st: 'ocupada',   seats: 4, since: '18:55', waiter: 'HL' },
  { n: 9,  cap: 6, sector: 'Salão',    st: 'ocupada',   seats: 6, since: '18:20', waiter: 'CS' },
  { n: 10, cap: 2, sector: 'Salão',    st: 'livre' },
  { n: 11, cap: 4, sector: 'Salão',    st: 'ocupada',   seats: 3, since: '19:02', waiter: 'OM' },
  { n: 12, cap: 4, sector: 'Salão',    st: 'livre' },
  { n: 13, cap: 2, sector: 'Salão',    st: 'ocupada',   seats: 2, since: '19:32', waiter: 'CS' },
  { n: 14, cap: 4, sector: 'Salão',    st: 'alerta',    seats: 4, since: '19:40', waiter: null }, // sentou sem liberação
  { n: 15, cap: 6, sector: 'Salão',    st: 'livre' },
  { n: 16, cap: 4, sector: 'Salão',    st: 'liberada',  seats: 2, since: '19:39', waiter: null },
  // Varanda · 8 mesas
  { n: 17, cap: 2, sector: 'Varanda',  st: 'ocupada',   seats: 2, since: '19:05', waiter: 'OM' },
  { n: 18, cap: 4, sector: 'Varanda',  st: 'livre' },
  { n: 19, cap: 4, sector: 'Varanda',  st: 'ocupada',   seats: 4, since: '18:48', waiter: 'HL' },
  { n: 20, cap: 6, sector: 'Varanda',  st: 'livre' },
  { n: 21, cap: 2, sector: 'Varanda',  st: 'ocupada',   seats: 2, since: '19:25', waiter: 'CS' },
  { n: 22, cap: 4, sector: 'Varanda',  st: 'liberada',  seats: 4, since: '19:41', waiter: null },
  { n: 23, cap: 4, sector: 'Varanda',  st: 'livre' },
  { n: 24, cap: 2, sector: 'Varanda',  st: 'ocupada',   seats: 2, since: '18:30', waiter: 'OM' },
  // Mezanino · 8 mesas
  { n: 25, cap: 6, sector: 'Mezanino', st: 'ocupada',   seats: 6, since: '18:15', waiter: 'CS' },
  { n: 26, cap: 4, sector: 'Mezanino', st: 'ocupada',   seats: 3, since: '19:18', waiter: 'HL' },
  { n: 27, cap: 4, sector: 'Mezanino', st: 'livre' },
  { n: 28, cap: 8, sector: 'Mezanino', st: 'ocupada',   seats: 7, since: '18:08', waiter: 'OM' }, // mesa grande
  { n: 29, cap: 2, sector: 'Mezanino', st: 'livre' },
  { n: 30, cap: 4, sector: 'Mezanino', st: 'ocupada',   seats: 4, since: '19:36', waiter: 'CS' },
  { n: 31, cap: 4, sector: 'Mezanino', st: 'livre' },
  { n: 32, cap: 6, sector: 'Mezanino', st: 'liberada',  seats: 5, since: '19:39', waiter: null },
];

// alertas do inbox
const H_ALERTS = [
  { id: 'a1', kind: 'sat-sem-liberacao', mesa: 14, party: 4,
    title: 'Cliente sentou sem liberação',
    body: 'Mesa 14 · 4 pessoas escanearam o QR. Você ainda não liberou.',
    when: 'agora', sev: 'high', cascade: 'host' },
  { id: 'a3', kind: 'reserva-chegou', mesa: 9,
    title: 'Reserva chegou',
    body: 'Família Carvalho · 6 pessoas · 19:30. Toque para liberar a mesa 9.',
    when: 'há 4 min', sev: 'low' },
  { id: 'a4', kind: 'fila', count: 5,
    title: '5 pessoas esperando',
    body: 'Maior espera: 18 min · Família Souza (4 pessoas). Próxima mesa livre · mesa 7.',
    when: 'há 6 min', sev: 'med' },
];

// ─── LISTA DE ESPERA ────────────────────────────────────────────
// Clientes que chegaram e estão aguardando uma mesa do tamanho certo.
// A recepcionista cadastra na chegada e marca como sentado quando libera.
const H_WAITLIST = [
  { id: 'w1', name: 'Família Souza',      party: 4, phone: '(11) 9 8123-4520', cpf: '123.***.***-12',
    addedAt: '19:24', wait: 18, note: 'Aniversário · pediu mesa perto da janela',         status: 'waiting' },
  { id: 'w2', name: 'Renata · 2 amigos',  party: 3, phone: '(11) 9 9450-1188', cpf: null,
    addedAt: '19:30', wait: 12, note: null,                                                status: 'waiting' },
  { id: 'w3', name: 'Bruno · casal',      party: 2, phone: '(11) 9 7322-0091', cpf: '098.***.***-44',
    addedAt: '19:34', wait: 8,  note: 'Sem alergia · sem preferência',                     status: 'waiting' },
  { id: 'w4', name: 'Larissa · 4 col.',   party: 4, phone: '(11) 9 8801-2233', cpf: null,
    addedAt: '19:36', wait: 6,  note: 'Pediu mesa interna · ar condicionado',              status: 'waiting' },
  { id: 'w5', name: 'Paulo · solo',       party: 1, phone: '(11) 9 9990-7711', cpf: null,
    addedAt: '19:38', wait: 4,  note: 'Bar OK',                                            status: 'waiting' },
];

// ─── RESERVAS DO DIA ───────────────────────────────────────────
// Todas as reservas chegam pelo bot do WhatsApp do restaurante. Conversação
// estruturada extrai nome, party, horário e observação — recepcionista vê
// a lista pronta e só libera a mesa quando o cliente chega.
const H_RESERVATIONS = [
  { id: 'r1', name: 'Família Carvalho', party: 6, phone: '(11) 9 7700-1122', when: '19:30',
    table: 9, status: 'arrived',   note: 'Comemoração · 80 anos do avô' },
  { id: 'r2', name: 'André Mendes',     party: 2, phone: '(11) 9 8845-3361', when: '20:00',
    table: null, status: 'awaited', note: 'Vegetariano' },
  { id: 'r3', name: 'Mesa Itaú',        party: 8, phone: '(11) 9 9012-7788', when: '20:15',
    table: 28, status: 'awaited', note: 'Reunião corporativa · pediu sala mais reservada' },
  { id: 'r4', name: 'Joana e Felipe',   party: 2, phone: '(11) 9 7541-9023', when: '20:30',
    table: null, status: 'awaited', note: null },
  { id: 'r5', name: 'Família Tanaka',   party: 5, phone: '(11) 9 8112-4577', when: '21:00',
    table: null, status: 'awaited', note: '2 crianças · pediu cadeirinha' },
];

// ─── PRIMITIVES DA RECEPCIONISTA ───────────────────────────────
// Bottom nav próprio — 5 abas. Quando o backend devolve role:'host',
// o app substitui o GBottomNav (garçom) pelo HBottomNav.
const HBottomNav = ({ active = 'tables', dark = false }) => {
  const C = useG(dark);
  const items = [
    { id: 'tables',   label: 'Mesas',    icon: Icon.table },
    { id: 'waitlist', label: 'Espera',   icon: Icon.list,   badge: H_WAITLIST.length },
    { id: 'reserva',  label: 'Reservas', icon: Icon.clock,  badge: H_RESERVATIONS.filter(r => r.status === 'awaited').length },
    { id: 'inbox',    label: 'Avisos',   icon: Icon.bell,   badge: 2 },
    { id: 'me',       label: 'Eu',       icon: Icon.user },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${C.borderFaint}`, background: C.bg,
      display: 'flex', justifyContent: 'space-around',
      padding: '8px 4px 14px',
    }}>
      {items.map(it => {
        const isActive = it.id === active;
        return (
          <div key={it.id} style={{
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
                  background: C.danger, color: '#fff',
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
          </div>
        );
      })}
    </div>
  );
};

// Cor / borda / dot por estado de mesa
const HSt = {
  livre:    { bg: '#fff',     bd: '#e5e5e5', fg: '#0a0a0a', dot: '#a3a3a3', label: 'Livre',     dashed: true  },
  liberada: { bg: '#FFF7E8',  bd: '#F0DCB6', fg: '#7a4d10', dot: '#D98E2B', label: 'Liberada',  dashed: false, pulse: true },
  ocupada:  { bg: '#fff',     bd: '#0a0a0a', fg: '#0a0a0a', dot: '#1E8C5A', label: 'Ocupada',   dashed: false },
  alerta:   { bg: '#FFF1F1',  bd: '#C43A3A', fg: '#A12626', dot: '#C43A3A', label: 'Atenção',   dashed: false, pulse: true },
};

// ============================================================
// HOME · DUAS VISTAS (Pra liberar / Mapa)
// ============================================================
// `view` controla a aba ativa: 'liberar' (default, focado em ação)
//   ou 'mapa' (visão geral em grid).
// `sector` é usado APENAS na aba Mapa pra filtrar por seção.
// `state` é usado APENAS na aba Mapa pra filtrar por estado da mesa.
// A intenção é reduzir carga visual: a recepcionista vê primeiro
// SÓ as mesas que precisa liberar, agrupadas por capacidade,
// com botão grande de Liberar inline. Mapa fica como visão de apoio,
// com cards GRANDES + status em texto claro (não só ponto colorido).
const ScreenHostHome = ({ dark = false, view = 'liberar', sector = 'Todas', state = 'all', onTo = () => {} }) => {
  const C = useG(dark);
  const counts = H_TABLES.reduce((acc, t) => {
    acc[t.st] = (acc[t.st] || 0) + 1;
    return acc;
  }, {});
  const livres = counts.livre || 0;
  const ocupadas = counts.ocupada || 0;
  const liberadas = counts.liberada || 0;
  const alerta = counts.alerta || 0;

  // mesas livres agrupadas por capacidade — pra recepcionista achar rápido
  // o tamanho certo pro grupo que está esperando
  const freeByCap = H_TABLES.filter(t => t.st === 'livre').reduce((acc, t) => {
    (acc[t.cap] = acc[t.cap] || []).push(t);
    return acc;
  }, {});
  const freeCapsSorted = Object.keys(freeByCap).map(Number).sort((a, b) => a - b);

  // mesas com QR liberado mas cliente ainda não chegou (mais recente primeiro)
  const liberadasList = H_TABLES.filter(t => t.st === 'liberada')
    .sort((a, b) => (b.since || '').localeCompare(a.since || ''));

  // estado da aba Mapa — DUAS dimensões de filtro: estado + setor
  // Filtro por estado fica no topo (chip grande, com contagem) — recepcionista
  // vê rápido o que precisa de ação. Filtro por setor logo abaixo.
  const stateFilters = [
    { id: 'all',      label: 'Todas',      dot: null,      count: H_TABLES.length, dashed: false },
    { id: 'alerta',   label: 'Atenção',    dot: '#C43A3A', count: alerta,          dashed: false, pulse: true },
    { id: 'liberada', label: 'Aguardando QR', dot: '#D98E2B', count: liberadas,    dashed: false },
    { id: 'ocupada',  label: 'Em uso',     dot: '#1E8C5A', count: ocupadas,        dashed: false },
    { id: 'livre',    label: 'Livres',     dot: '#a3a3a3', count: livres,          dashed: true },
  ];
  const sectorTabs = [
    { id: 'Todas', label: 'Todas', count: H_TABLES.length },
    ...H_SECTORS.map(s => ({ id: s, label: s, count: H_TABLES.filter(t => t.sector === s).length })),
  ];

  const filteredByState = state === 'all' ? H_TABLES : H_TABLES.filter(t => t.st === state);
  const visible = sector === 'Todas' ? filteredByState : filteredByState.filter(t => t.sector === sector);
  const grouped = H_SECTORS
    .map(s => ({ sector: s, items: visible.filter(t => t.sector === s) }))
    .filter(g => g.items.length > 0);

  // helper · card GRANDE do grid (aba Mapa) — 3 colunas, status em texto
  // claro (não só dot+abreviação). Recepcionista vê de longe sem precisar
  // decifrar legendas. Cada card tem: kicker (status em texto), número
  // grande, resumo em linguagem comum, info de tempo/garçom.
  const renderGridCardLarge = (t) => {
    const s = HSt[t.st];

    // Texto em linguagem comum — sem abreviações
    let summary, kicker;
    if (t.st === 'livre') {
      summary = `${t.cap} ${t.cap === 1 ? 'lugar' : 'lugares'}`;
      kicker = 'pronta pra liberar';
    } else if (t.st === 'liberada') {
      summary = `${t.seats} ${t.seats === 1 ? 'pessoa' : 'pessoas'}`;
      kicker = `QR aberto às ${t.since}`;
    } else if (t.st === 'ocupada') {
      summary = `${t.seats}/${t.cap} lugares`;
      kicker = `desde ${t.since}`;
    } else if (t.st === 'alerta') {
      summary = `${t.seats} ${t.seats === 1 ? 'pessoa' : 'pessoas'}`;
      kicker = 'sentaram sem liberar';
    }

    // V5 · mesas com cliente (ocupada/liberada/alerta) abrem o menu
    // da mesa (variante host). Mesas livres não abrem menu — pra
    // liberá-las, a recepcionista usa o fluxo Liberar mesa walkin.
    const isClickable = t.st === 'ocupada' || t.st === 'liberada' || t.st === 'alerta';
    const Tag = isClickable ? 'button' : 'div';
    const clickProps = isClickable
      ? { onClick: () => onTo('host-table-menu'), style: { all: 'unset', cursor: 'pointer', boxSizing: 'border-box' } }
      : {};

    return (
      <Tag key={t.n} {...clickProps} style={{
        ...(clickProps.style || {}),
        padding: '10px 10px 11px',
        border: `${s.dashed ? '1.5px dashed' : '1.5px solid'} ${s.bd}`,
        borderRadius: 12, background: s.bg,
        display: 'flex', flexDirection: 'column',
        minHeight: 138,
        position: 'relative',
        textAlign: 'left',
      }}>
        {/* STATUS KICKER · texto plano + dot pulsante quando aplicável */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          marginBottom: 4,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: s.dot,
            animation: s.pulse ? 'gPulse 1.4s infinite' : 'none',
            border: s.dashed ? '1px dashed #888' : 'none',
            boxSizing: 'border-box',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 9, fontWeight: 800, color: s.fg,
            letterSpacing: 0.5, textTransform: 'uppercase',
            lineHeight: 1.1,
          }}>{s.label}</span>
        </div>

        {/* NÚMERO GRANDE · domina o card */}
        <div style={{
          fontSize: 32, fontWeight: 800, color: s.fg,
          lineHeight: 1, letterSpacing: -0.8,
          marginTop: 1, marginBottom: 6,
        }}>{t.n}</div>

        {/* RESUMO em linguagem comum */}
        <div style={{
          fontSize: 11.5, fontWeight: 700, color: s.fg,
          letterSpacing: -0.1, lineHeight: 1.25,
          fontVariantNumeric: 'tabular-nums',
        }}>{summary}</div>

        {/* KICKER · tempo / motivo / detalhe */}
        <div style={{
          fontSize: 10, fontWeight: 600, color: s.fg,
          opacity: 0.78, marginTop: 2, lineHeight: 1.3,
          display: 'flex', alignItems: 'center', gap: 4,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {t.st === 'ocupada' && t.waiter && (
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: M_TEAM.find(x => x.init === t.waiter)?.color || '#777',
              color: '#fff', fontSize: 8, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{t.waiter}</span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kicker}</span>
        </div>

        {/* CTA · só pra alerta — recepcionista precisa saber que dá pra agir */}
        {t.st === 'alerta' && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '5px 8px', background: '#C43A3A', color: '#fff',
            fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
            borderRadius: '0 0 10px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
            Toque pra resolver {Icon.arrow(10)}
          </div>
        )}
      </Tag>
    );
  };

  // helper · linha grande pra mesa livre (aba Pra liberar) — toque grande, ação inline
  const renderFreeRow = (t) => (
    <div key={t.n} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', marginBottom: 8,
      background: C.bg, border: `1.5px solid ${C.borderSoft}`, borderRadius: 14,
    }}>
      <div style={{
        width: 50, height: 50, borderRadius: 12,
        background: C.surface, border: `1.5px solid ${C.borderSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: C.ink,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{t.n}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
          Mesa {t.n}
        </div>
        <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 2 }}>
          {t.sector} · {t.cap} {t.cap === 1 ? 'lugar' : 'lugares'}
        </div>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '11px 16px', background: '#1E8C5A', color: '#fff',
        borderRadius: 10, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
        flexShrink: 0,
      }}>
        Liberar {Icon.arrow(14)}
      </div>
    </div>
  );

  // helper · linha curta pra mesa liberada (aguardando chegada)
  const renderLiberadaRow = (t) => (
    <div key={t.n} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', marginBottom: 6,
      background: C.bg, border: `1px solid ${C.borderSoft}`, borderRadius: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: '#FFF7E8', border: `1px dashed #F0DCB6`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: '#7a4d10',
      }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{t.n}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
          Mesa {t.n} · {t.seats} {t.seats === 1 ? 'pessoa' : 'pessoas'}
        </div>
        <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 1 }}>
          Liberei às {t.since} · {t.sector}
        </div>
      </div>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: '#D98E2B',
        animation: 'gPulse 1.4s infinite', flexShrink: 0,
      }} />
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* HEADER · Letícia + sino */}
        <div style={{ padding: '14px 16px 10px', background: C.bg, borderBottom: `1px solid ${C.borderSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MAvatar name={H_HOST.name} init={H_HOST.init} color={H_HOST.color} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Recepção · Trattoria Luna
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: C.ink, marginTop: 1 }}>
                Boa noite, Letícia
              </div>
            </div>
            <GIconBtn dark={dark} icon={Icon.bell(20)} badge={alerta + 1} />
          </div>
          <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 6 }}>
            Sábado · 19:42
          </div>
        </div>

        {/* SEGMENTED CONTROL · Pra liberar / Mapa */}
        <div style={{ padding: '12px 16px 8px', background: C.bg, borderBottom: `1px solid ${C.borderSoft}` }}>
          <div style={{
            display: 'flex', gap: 4, padding: 4,
            background: C.surface, borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
          }}>
            {[
              { id: 'liberar', label: 'Pra liberar', count: livres },
              { id: 'mapa',    label: 'Mapa',        count: H_TABLES.length },
            ].map(t => {
              const sel = t.id === view;
              return (
                <div key={t.id} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 9,
                  background: sel ? C.bg : 'transparent',
                  border: sel ? `1px solid ${C.borderSoft}` : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 13, fontWeight: sel ? 700 : 600,
                  color: sel ? C.ink : C.mute,
                  letterSpacing: -0.1,
                  boxShadow: sel ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}>
                  {t.label}
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '1px 7px',
                    borderRadius: 100,
                    background: sel ? C.ink : 'transparent',
                    color: sel ? C.bg : C.faint,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{t.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {view === 'liberar' ? (
          <>
            {/* STATS COMPACTO · 1 linha, 3 indicadores */}
            <div style={{ padding: '12px 16px 4px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { lbl: 'Em uso',     n: ocupadas,           dot: '#1E8C5A' },
                { lbl: 'Aguardando', n: liberadas,          dot: '#D98E2B' },
                { lbl: 'Espera',     n: H_WAITLIST.length,  dot: '#7A4FBE' },
              ].map(s => (
                <div key={s.lbl} style={{
                  padding: '10px 12px', background: C.bg,
                  border: `1px solid ${C.borderSoft}`, borderRadius: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
                    <span style={{ fontSize: 9.5, color: C.faint, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{s.lbl}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{s.n}</div>
                </div>
              ))}
            </div>

            {/* CARD VERMELHO DE ATENÇÃO · só se houver alerta */}
            {alerta > 0 && (
              <div style={{ padding: '8px 16px 0' }}>
                <div style={{
                  padding: 14, background: '#FFF1F1',
                  border: `1.5px solid #C43A3A`, borderRadius: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: '#C43A3A', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>{Icon.bell(18)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#A12626', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        Atenção agora
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#A12626', letterSpacing: -0.2, marginTop: 1 }}>
                        Mesa 14 · sentaram sem você liberar
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#A12626', fontWeight: 500, marginBottom: 10 }}>
                    4 pessoas escanearam o QR há 12 segundos.
                  </div>
                  <div style={{
                    padding: '12px 16px', background: '#C43A3A',
                    color: '#fff', borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: 14, fontWeight: 700, letterSpacing: -0.1,
                  }}>
                    Ver mesa 14 {Icon.arrow(14)}
                  </div>
                </div>
              </div>
            )}

            {/* MESAS LIVRES POR CAPACIDADE */}
            <div style={{ padding: '14px 16px 8px' }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: C.faint,
                letterSpacing: 0.6, textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                Pronta pra liberar · escolha o tamanho
              </div>
              {freeCapsSorted.length === 0 ? (
                <div style={{
                  padding: '28px 20px', textAlign: 'center',
                  background: C.bg, border: `1.5px dashed ${C.borderSoft}`, borderRadius: 14,
                  color: C.mute, fontSize: 13, fontWeight: 600,
                }}>
                  Tudo cheio agora. Quando alguém sair, aparece aqui.
                </div>
              ) : freeCapsSorted.map(cap => {
                const list = freeByCap[cap];
                return (
                  <div key={cap} style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 800, color: C.ink,
                      letterSpacing: -0.1,
                      marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8,
                    }}>
                      <span style={{
                        background: C.ink, color: C.bg, padding: '3px 9px',
                        borderRadius: 100, fontSize: 11, fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                      }}>{cap} {cap === 1 ? 'lugar' : 'lugares'}</span>
                      <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                        {list.length} {list.length === 1 ? 'mesa livre' : 'mesas livres'}
                      </span>
                    </div>
                    {list.map(renderFreeRow)}
                  </div>
                );
              })}
            </div>

            {/* AGUARDANDO CHEGAREM */}
            {liberadasList.length > 0 && (
              <div style={{ padding: '4px 16px 16px' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: C.faint,
                  letterSpacing: 0.6, textTransform: 'uppercase',
                  marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 8,
                }}>
                  Aguardando chegarem
                  <span style={{ fontSize: 11, color: C.faint, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                    · {liberadasList.length}
                  </span>
                </div>
                {liberadasList.map(renderLiberadaRow)}
              </div>
            )}
          </>
        ) : (
          <>
            {/* FILTRO POR ESTADO · chips com texto + contagem
                Substitui a legenda pequena. Recepcionista clica em
                "Atenção 1" pra isolar só o que precisa de ação. */}
            <div style={{
              padding: '12px 16px 4px', display: 'flex', gap: 6,
              overflowX: 'auto', scrollbarWidth: 'none',
            }}>
              {stateFilters.map(f => {
                const sel = f.id === state;
                const isAlert = f.id === 'alerta' && f.count > 0;
                return (
                  <div key={f.id} style={{
                    flexShrink: 0, padding: '8px 12px', borderRadius: 100,
                    border: `1.5px ${f.dashed ? 'dashed' : 'solid'} ${sel ? (isAlert ? '#C43A3A' : C.ink) : (isAlert ? '#C43A3A' : C.borderSoft)}`,
                    background: sel ? (isAlert ? '#C43A3A' : C.ink) : C.bg,
                    color: sel ? C.bg : (isAlert ? '#A12626' : C.ink),
                    fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    {f.dot && (
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: sel ? C.bg : f.dot,
                        animation: f.pulse && f.count > 0 ? 'gPulse 1.4s infinite' : 'none',
                        flexShrink: 0,
                      }} />
                    )}
                    {f.label}
                    <span style={{
                      fontSize: 11, fontWeight: 800, padding: '1px 7px',
                      borderRadius: 100,
                      background: sel ? 'rgba(255,255,255,0.22)' : (isAlert && f.count > 0 ? '#C43A3A' : C.surface),
                      color: sel ? C.bg : (isAlert && f.count > 0 ? '#fff' : C.faint),
                      fontVariantNumeric: 'tabular-nums',
                    }}>{f.count}</span>
                  </div>
                );
              })}
            </div>

            {/* FILTRO POR SETOR · row de pills menor */}
            <div style={{
              padding: '6px 16px 8px', display: 'flex', gap: 5,
              overflowX: 'auto', scrollbarWidth: 'none',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: C.faint,
                letterSpacing: 0.4, textTransform: 'uppercase',
                alignSelf: 'center', marginRight: 4, flexShrink: 0,
              }}>Setor</span>
              {sectorTabs.map(tab => {
                const sel = tab.id === sector;
                return (
                  <div key={tab.id} style={{
                    flexShrink: 0, padding: '5px 10px', borderRadius: 100,
                    border: `1px solid ${sel ? C.ink : C.borderSoft}`,
                    background: sel ? C.surface : 'transparent',
                    color: sel ? C.ink : C.mute,
                    fontSize: 11, fontWeight: sel ? 700 : 600, letterSpacing: -0.1,
                  }}>
                    {tab.label}
                  </div>
                );
              })}
            </div>

            {/* GRID 3-COL · cards GRANDES com texto claro
                Quando filtra por estado/setor e fica vazio, mostra empty state. */}
            {visible.length === 0 ? (
              <div style={{ padding: '20px 16px' }}>
                <div style={{
                  padding: '32px 20px', textAlign: 'center',
                  background: C.bg, border: `1.5px dashed ${C.borderSoft}`, borderRadius: 14,
                  color: C.mute, fontSize: 13, fontWeight: 600,
                }}>
                  Nenhuma mesa com esse filtro agora.
                </div>
              </div>
            ) : (state === 'all' && sector === 'Todas') ? (
              // visão padrão · agrupada por seção
              <div style={{ padding: '0 16px 12px' }}>
                {grouped.map(g => (
                  <div key={g.sector} style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: C.ink,
                      letterSpacing: 0.4, textTransform: 'uppercase',
                      marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: 2, background: C.ink }} />
                      {g.sector}
                      <span style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>· {g.items.length} mesas</span>
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                    }}>
                      {g.items.map(renderGridCardLarge)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // visão filtrada · grid simples
              <div style={{
                padding: '0 16px 12px',
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              }}>
                {visible.map(renderGridCardLarge)}
              </div>
            )}
          </>
        )}
      </div>
      <HBottomNav active="tables" dark={dark} />
    </div>
  );
};

// ============================================================
// DETALHE DA MESA · LIBERAR (para mesa livre)
// ============================================================
// Liberate · 3 modos:
//  walkin        — recepcionista escolhe mesa livre direto, ainda pergunta party
//  reservation   — vem da Reserva (party já conhecido). Mostra mesa pré-atribuída
//                  e CTA grande direto. Form colapsa pra 1 toque.
//  reservation-no-fit — mesma coisa, mas a mesa pré-atribuída é menor que o
//                  party. Sugere alternativas que cabem (mesmo setor primeiro).
const ScreenHostTableLiberate = ({
  dark = false,
  peopleCount = 3,
  mode = 'walkin', // 'walkin' | 'reservation' | 'reservation-no-fit'
  reservation = null, // { name, party, table, when, note }
}) => {
  const C = useG(dark);
  // mesa pré-atribuída ou default walkin
  const baseTable = mode !== 'walkin' && reservation
    ? H_TABLES.find(x => x.n === reservation.table) || { n: reservation.table || 9, cap: 6 }
    : { n: 7, cap: 4 };
  const party = mode !== 'walkin' && reservation ? reservation.party : peopleCount;
  const fits = baseTable.cap >= party;

  // sugestões de mesa quando a pré-atribuída não cabe (ou recepcionista quer trocar)
  const suggestions = H_TABLES
    .filter(x => x.st === 'livre' && x.cap >= party)
    .sort((a, b) => {
      // mesmo setor primeiro
      const sameA = a.sector === baseTable.sector ? 0 : 1;
      const sameB = b.sector === baseTable.sector ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      // capacidade mais próxima depois (sem gastar mesa de 8 pra grupo de 2)
      return a.cap - b.cap;
    })
    .slice(0, 3);

  const fromRes = mode === 'reservation' || mode === 'reservation-no-fit';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title={fromRes ? 'Liberar reserva' : `Mesa ${baseTable.n}`}
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {/* hero VARIA: walkin = mesa-livre / reservation = card da reserva */}
        {fromRes && reservation ? (
          <div style={{
            margin: 16, padding: 14, borderRadius: 14,
            background: C.surface, border: `1.5px solid ${C.borderSoft}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10.5, fontWeight: 700, color: '#1E8C5A', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#1E8C5A' }} /> Reserva chegou · {reservation.when}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, marginTop: 6, color: C.ink }}>
              {reservation.name}
            </div>
            <div style={{ fontSize: 13, color: C.mute, fontWeight: 600, marginTop: 4 }}>
              {reservation.party} pessoas · {reservation.phone}
            </div>
            {reservation.note && (
              <div style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 10,
                background: C.bg, border: `1px solid ${C.borderSoft}`,
                fontSize: 12.5, color: C.ink, lineHeight: 1.5, fontStyle: 'italic',
              }}>"{reservation.note}"</div>
            )}
          </div>
        ) : (
          <div style={{
            padding: '20px 16px',
            display: 'flex', alignItems: 'center', gap: 16,
            borderBottom: `1px solid ${C.borderSoft}`,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 14,
              background: C.surface, border: `1.5px dashed ${C.borderSoft}`,
              color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, fontWeight: 800, letterSpacing: -0.6,
            }}>{baseTable.n}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 9px', borderRadius: 100, background: '#f5f5f5', color: C.mute,
                border: `1px solid ${C.borderSoft}`,
                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: '#a3a3a3' }} />
                Livre
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginTop: 6, color: C.ink }}>
                {baseTable.cap} lugares
              </div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 2, fontWeight: 500 }}>
                Disponível desde 19:14 · 28 min
              </div>
            </div>
          </div>
        )}

        {/* MESA ESCOLHIDA · mostra match/no-match com cor */}
        {fromRes && (
          <div style={{ padding: '0 16px 4px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>
              Mesa atribuída pelo sistema
            </div>
            <div style={{
              padding: 14, borderRadius: 14,
              border: `1.5px solid ${fits ? '#C9E2D2' : '#F4C7C7'}`,
              background: fits ? '#E9F4ED' : '#FFF1F1',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12,
                background: fits ? '#1E8C5A' : '#C43A3A',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 800, letterSpacing: -0.4,
              }}>{baseTable.n}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: -0.2 }}>
                  Mesa {baseTable.n} · {baseTable.cap} lugares
                </div>
                <div style={{ fontSize: 12, color: fits ? '#2f5d40' : '#A12626', fontWeight: 600, marginTop: 3 }}>
                  {fits
                    ? `Cabe os ${party} convidados · setor ${baseTable.sector}`
                    : `Não cabe os ${party} convidados (cap ${baseTable.cap}) · escolha outra abaixo`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUGESTÕES · sempre visível em modo reserva (caso família peça outra mesa
            ou caso a pré-atribuída não caiba). Algoritmo: livres com cap >= party,
            mesmo setor primeiro, capacidade mais próxima depois. */}
        {fromRes && suggestions.length > 0 && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                {mode === 'reservation-no-fit' ? 'Outras opções que cabem' : 'Trocar para outra mesa'}
              </div>
              <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>
                {suggestions.length} disponíveis
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map(s => {
                const sameSector = s.sector === baseTable.sector;
                return (
                  <div key={s.n} style={{
                    padding: 12, borderRadius: 12,
                    background: C.surface, border: `1px solid ${C.borderSoft}`,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10,
                      background: C.bg, border: `1.5px dashed ${C.borderSoft}`,
                      color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 800, letterSpacing: -0.3,
                    }}>{s.n}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                        Mesa {s.n} · {s.cap} lugares
                      </div>
                      <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                        {s.sector} {sameSector && <span style={{ color: '#1E8C5A', fontWeight: 700 }}>· mesmo setor</span>}
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 12px', borderRadius: 8,
                      background: C.ink, color: C.surface,
                      fontSize: 12, fontWeight: 700,
                    }}>Usar essa</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* form WALKIN · só aparece quando NÃO vem de reserva */}
        {!fromRes && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Quantas pessoas?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const sel = n === peopleCount;
                const over = n > baseTable.cap;
                return (
                  <div key={n} style={{
                    flex: 1, padding: '14px 0', textAlign: 'center',
                    border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                    borderRadius: 12,
                    background: sel ? C.ink : (over ? C.surface : C.bg),
                    color: sel ? C.bg : (over ? C.faint : C.ink),
                    fontSize: 17, fontWeight: 700, letterSpacing: -0.3,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {n}{n === 5 && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>+</span>}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
                Reserva ou nome (opcional)
              </div>
              <div style={{
                padding: '14px 14px', borderRadius: 12,
                border: `1.5px solid ${C.borderSoft}`,
                fontSize: 14, color: C.faint, fontWeight: 500,
              }}>Buscar reserva ou digitar nome…</div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
                Observação (opcional)
              </div>
              <div style={{
                padding: '14px 14px', borderRadius: 12,
                border: `1.5px solid ${C.borderSoft}`,
                fontSize: 14, color: C.faint, fontWeight: 500, minHeight: 56,
              }}>Aniversário, alergia, preferência…</div>
            </div>
          </div>
        )}

        {/* dica · QR fica ativo até fechar a conta */}
        <div style={{
          margin: '14px 16px 18px', padding: 12,
          background: C.surface, borderRadius: 12,
          border: `1px solid ${C.borderSoft}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <div style={{ color: C.mute, marginTop: 1 }}>{Icon.check(16)}</div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.mute, lineHeight: 1.45 }}>
            <span style={{ color: C.ink, fontWeight: 700 }}>QR fica ativo até a conta fechar.</span> Os clientes podem escanear quando chegarem na mesa, sem prazo.
          </div>
        </div>
      </div>

      {/* sticky CTA · varia por modo */}
      <div style={{
        padding: '12px 16px 18px', borderTop: `1px solid ${C.borderSoft}`,
        background: C.bg, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {mode === 'reservation-no-fit' ? (
          <GButton kind="secondary" dark={dark} full>
            Liberar mesa {baseTable.n} mesmo assim
          </GButton>
        ) : (
          <GButton kind="primary" dark={dark} full icon={Icon.check(18)}>
            {fromRes
              ? `Liberar mesa ${baseTable.n} · ${party} ${party === 1 ? 'pessoa' : 'pessoas'}`
              : `Liberar QR · ${party} ${party === 1 ? 'pessoa' : 'pessoas'}`}
          </GButton>
        )}
      </div>
    </div>
  );
};

// ============================================================
// SUCESSO · MESA LIBERADA (sem countdown — QR fica ativo até fechar)
// ============================================================
const ScreenHostTableLiberada = ({ dark = false }) => {
  const C = useG(dark);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Mesa 7"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {/* hero · sucesso */}
        <div style={{
          padding: '24px 20px 22px', textAlign: 'center',
          background: '#E9F4ED', borderBottom: `1px solid #C9E2D2`,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: '#1E8C5A', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>{Icon.check(34)}</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: '#0a0a0a' }}>
            Mesa 7 liberada
          </div>
          <div style={{ fontSize: 13, color: '#2f5d40', marginTop: 4, fontWeight: 500 }}>
            3 pessoas · QR ativo até a conta fechar
          </div>
        </div>

        {/* status persistente · sem countdown */}
        <div style={{
          margin: 16, padding: 18, borderRadius: 14,
          border: `1.5px solid ${C.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28,
            background: '#E9F4ED', color: '#1E8C5A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{Icon.check(28)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
              QR ativo · aguardando escaneamento
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>
              Os clientes podem escanear o QR a qualquer momento. A mesa só volta a ficar Livre depois que a conta for fechada.
            </div>
          </div>
        </div>

        {/* o que acontece a seguir */}
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>
            O que acontece agora
          </div>
          {[
            { i: 1, title: 'Cliente escaneia o QR da mesa 7', sub: 'Abre o cardápio digital. Status muda para Ocupada.' },
            { i: 2, title: 'Pedidos vão direto para a cozinha', sub: 'Você não precisa fazer mais nada nessa mesa.' },
            { i: 3, title: 'Garçom é atribuído automaticamente', sub: 'Sistema escolhe quem está com menos carga na zona.' },
          ].map(s => (
            <div key={s.i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                background: C.ink, color: C.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>{s.i}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.45 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* sticky · 2 ações secundárias */}
      <div style={{
        padding: '12px 16px 18px', borderTop: `1px solid ${C.borderSoft}`,
        background: C.bg, display: 'flex', gap: 8,
      }}>
        <GButton kind="secondary" dark={dark} full>Cancelar liberação</GButton>
        <GButton kind="primary" dark={dark} full icon={Icon.arrow(18)}>Voltar ao salão</GButton>
      </div>
    </div>
  );
};

// ============================================================
// INBOX · CENTRAL DE AVISOS DA RECEPCIONISTA
// ============================================================
const ScreenHostInbox = ({ dark = false }) => {
  const C = useG(dark);
  const sevConfig = {
    high: { dot: '#C43A3A', bg: '#FFF1F1', bd: '#F4C7C7', label: 'Urgente' },
    med:  { dot: '#D98E2B', bg: '#FFF7E8', bd: '#F0DCB6', label: 'Atenção' },
    low:  { dot: '#1E8C5A', bg: '#fff',    bd: C.borderSoft, label: 'Aviso' },
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Avisos"
          right={<GIconBtn dark={dark} icon={Icon.settings(20)} />}
        />

        {/* contagem */}
        <div style={{ padding: '12px 16px 8px', display: 'flex', gap: 8, fontSize: 11, color: C.faint, fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C43A3A', animation: 'gPulse 1.4s infinite' }} />Urgentes · 1
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D98E2B' }} />Atenção · 2
          </span>
          <span style={{ marginLeft: 'auto' }}>4 ativos</span>
        </div>

        {/* lista */}
        <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {H_ALERTS.map(a => {
            const sev = sevConfig[a.sev];
            return (
              <div key={a.id} style={{
                padding: 12, borderRadius: 12,
                background: sev.bg, border: `1.5px solid ${sev.bd}`,
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: sev.dot, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {a.kind === 'sat-sem-liberacao' && Icon.bell(16)}
                  {a.kind === 'reserva-chegou' && Icon.user(16)}
                  {a.kind === 'fila' && Icon.list(16)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: C.mute, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{a.when}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>{a.body}</div>
                  {a.cascade === 'host' && (
                    <div style={{ marginTop: 6, fontSize: 10.5, color: '#A12626', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                      ⚡ Em 30 s avisa o gerente · em 60 s avisa o garçom
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <HBottomNav active="inbox" dark={dark} />
    </div>
  );
};

// ============================================================
// ALERTA · CLIENTE SENTOU SEM LIBERAÇÃO (detalhe + ação)
// Esta é a tela que o gerente / garçom também vê (com copy adaptado)
// quando a cascata escala para eles.
// ============================================================
const ScreenHostAlertDetail = ({ dark = false, role = 'host' }) => {
  // role: 'host' | 'manager' | 'waiter' — copy se adapta
  const C = useG(dark);
  const copy = {
    host: {
      eyebrow: 'Avisos · agora',
      title: 'Cliente sentou sem liberação',
      sub: 'Mesa 14 · 4 pessoas escanearam o QR sem você ter liberado a mesa.',
      ctaPrimary: 'Liberar agora',
      ctaSecondary: 'É erro · não liberar',
      timeline: [
        { ts: '19:40:12', text: 'Cliente escaneou o QR da mesa 14', dot: 'red', emp: true },
        { ts: '19:40:12', text: 'Push enviado para Letícia (você)', dot: 'gray' },
      ],
      footer: 'Em 30 s, o sistema avisa o gerente. Em 60 s, avisa o garçom da praça.',
    },
    manager: {
      eyebrow: 'Escalação · você é gerente',
      title: 'Recepção não atendeu mesa 14',
      sub: 'Cliente escaneou o QR há 32 segundos · Letícia não respondeu. Você pode liberar daqui ou ir até a mesa.',
      ctaPrimary: 'Liberar pelo gerente',
      ctaSecondary: 'Ligar para Letícia',
      timeline: [
        { ts: '19:40:12', text: 'Cliente escaneou o QR da mesa 14', dot: 'red', emp: true },
        { ts: '19:40:12', text: 'Push enviado para Letícia · sem resposta', dot: 'gray' },
        { ts: '19:40:42', text: 'Push escalado para você (gerente)', dot: 'red', emp: true },
      ],
      footer: 'Em 30 s, o sistema avisa o garçom da praça da mesa 14 (Caleb).',
    },
    waiter: {
      eyebrow: 'Escalação · sua mesa',
      title: 'Mesa 14 escaneou sem liberar',
      sub: 'Já passou 1 minuto. Vai até a mesa 14, confere quantas pessoas e libera daqui.',
      ctaPrimary: 'Vou agora · liberar',
      ctaSecondary: 'Recusar · não é minha praça',
      timeline: [
        { ts: '19:40:12', text: 'Cliente escaneou o QR · sem liberação', dot: 'red', emp: true },
        { ts: '19:40:12', text: 'Recepção avisada · sem resposta', dot: 'gray' },
        { ts: '19:40:42', text: 'Gerente avisado · sem resposta', dot: 'gray' },
        { ts: '19:41:12', text: 'Push enviado para você (Caleb)', dot: 'red', emp: true },
      ],
      footer: 'Você é o último na cascata. Se recusar, o gerente é chamado de novo.',
    },
  }[role];

  const dotColor = (d) => ({ red: '#C43A3A', amber: '#D98E2B', green: '#1E8C5A', gray: '#a3a3a3' }[d] || '#a3a3a3');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Aviso urgente"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {/* hero vermelho */}
        <div style={{
          padding: '20px 16px',
          background: '#FFF1F1', borderBottom: `1.5px solid #F4C7C7`,
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 100,
            background: '#C43A3A', color: '#fff',
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#fff', animation: 'gPulse 1.4s infinite' }} />
            {copy.eyebrow}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: '#0a0a0a', marginTop: 10, lineHeight: 1.2 }}>
            {copy.title}
          </div>
          <div style={{ fontSize: 13, color: '#7a2828', marginTop: 6, lineHeight: 1.5 }}>
            {copy.sub}
          </div>
        </div>

        {/* dados da mesa */}
        <div style={{ padding: 16 }}>
          <div style={{
            padding: 14, border: `1.5px solid ${C.borderSoft}`, borderRadius: 14,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: C.ink, color: C.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, letterSpacing: -0.5,
            }}>14</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Mesa 14</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.2, marginTop: 2 }}>
                4 pessoas · sem liberação
              </div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 2, fontWeight: 500 }}>
                Praça leste · garçom Caleb
              </div>
            </div>
          </div>

          {/* timeline */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 12 }}>
              Linha do tempo
            </div>
            <div style={{ position: 'relative', paddingLeft: 22 }}>
              {/* linha vertical */}
              <div style={{
                position: 'absolute', left: 8, top: 6, bottom: 6, width: 1.5,
                background: C.borderSoft,
              }} />
              {copy.timeline.map((tl, i) => (
                <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
                  <span style={{
                    position: 'absolute', left: -22, top: 4,
                    width: 16, height: 16, borderRadius: 8,
                    background: dotColor(tl.dot), border: `2px solid ${C.bg}`,
                    boxShadow: `0 0 0 1.5px ${dotColor(tl.dot)}`,
                  }} />
                  <div style={{
                    fontSize: 12, fontWeight: tl.emp ? 700 : 500,
                    color: tl.emp ? C.ink : C.mute,
                    letterSpacing: -0.1, lineHeight: 1.45,
                  }}>{tl.text}</div>
                  <div style={{
                    fontSize: 10.5, color: C.faint, fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums', marginTop: 1,
                  }}>{tl.ts}</div>
                </div>
              ))}
            </div>
          </div>

          {/* aviso da cascata */}
          <div style={{
            marginTop: 14, padding: 12,
            background: C.surface, borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{ color: C.mute, marginTop: 1 }}>{Icon.bell(16)}</div>
            <div style={{ flex: 1, fontSize: 11.5, color: C.mute, lineHeight: 1.5, fontWeight: 500 }}>
              {copy.footer}
            </div>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{
        padding: '12px 16px 18px', borderTop: `1px solid ${C.borderSoft}`,
        background: C.bg, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <GButton kind="primary" dark={dark} full icon={Icon.check(18)}>
          {copy.ctaPrimary}
        </GButton>
        <GButton kind="secondary" dark={dark} full>
          {copy.ctaSecondary}
        </GButton>
      </div>
    </div>
  );
};

// ============================================================
// LISTA DE ESPERA · CLIENTES AGUARDANDO MESA
// Mostra todos os clientes cadastrados ao chegar (chips top de tamanho:
// solo / casal / 3-4 / 5+) e a próxima mesa livre compatível.
// ============================================================
const ScreenHostWaitlist = ({ dark = false, partyFilter = 'all' }) => {
  const C = useG(dark);
  // mapa de filtro de tamanho
  const matchParty = (p) => {
    if (partyFilter === 'all') return true;
    if (partyFilter === 'solo')  return p === 1;
    if (partyFilter === 'duo')   return p === 2;
    if (partyFilter === '3-4')   return p >= 3 && p <= 4;
    if (partyFilter === '5+')    return p >= 5;
    return true;
  };
  const visible = H_WAITLIST.filter(w => matchParty(w.party));
  // próxima mesa livre por tamanho — orienta a recepcionista
  const livres = H_TABLES.filter(t => t.st === 'livre').sort((a, b) => a.cap - b.cap);
  const nextFree = visible[0]
    ? livres.find(t => t.cap >= visible[0].party)
    : null;

  const filters = [
    { id: 'all',  label: 'Todos',  count: H_WAITLIST.length },
    { id: 'solo', label: '1',      count: H_WAITLIST.filter(w => w.party === 1).length },
    { id: 'duo',  label: '2',      count: H_WAITLIST.filter(w => w.party === 2).length },
    { id: '3-4',  label: '3-4',    count: H_WAITLIST.filter(w => w.party >= 3 && w.party <= 4).length },
    { id: '5+',   label: '5+',     count: H_WAITLIST.filter(w => w.party >= 5).length },
  ];

  // tempo de espera com cor (verde até 10, amarelo 10-20, vermelho 20+)
  const waitColor = (m) => m >= 20 ? '#C43A3A' : m >= 10 ? '#D98E2B' : '#1E8C5A';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Lista de espera"
          right={<GIconBtn dark={dark} icon={Icon.plus(20)} />}
        />

        {/* hero · contagem */}
        <div style={{ padding: '14px 16px 6px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            Aguardando mesa
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
              {H_WAITLIST.length}
            </div>
            <div style={{ fontSize: 13, color: C.mute, fontWeight: 500 }}>
              {H_WAITLIST.length === 1 ? 'pessoa' : 'pessoas'} · maior espera {Math.max(...H_WAITLIST.map(w => w.wait))} min
            </div>
          </div>
        </div>

        {/* sugestão · próximo a sentar */}
        {nextFree && visible[0] && (
          <div style={{
            margin: '8px 16px 12px', padding: 12,
            background: '#E9F4ED', border: `1.5px solid #1E8C5A`, borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 18,
              background: '#1E8C5A', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{Icon.arrow(20)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#1E8C5A', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Próxima mesa livre · {visible[0].party} {visible[0].party === 1 ? 'pessoa' : 'pessoas'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a', marginTop: 2, letterSpacing: -0.1 }}>
                Mesa {nextFree.n} · {nextFree.cap} lugares · chamar {visible[0].name}
              </div>
            </div>
          </div>
        )}

        {/* filtros · tamanho do grupo */}
        <div style={{
          padding: '4px 16px 8px', display: 'flex', gap: 6,
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {filters.map(f => {
            const sel = f.id === partyFilter;
            return (
              <div key={f.id} style={{
                flexShrink: 0, padding: '7px 12px', borderRadius: 100,
                border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                background: sel ? C.ink : C.bg,
                color: sel ? C.bg : C.ink,
                fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                {f.label}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '0 6px',
                  borderRadius: 100, background: sel ? 'rgba(255,255,255,0.18)' : C.surface,
                  color: sel ? C.bg : C.faint, fontVariantNumeric: 'tabular-nums',
                }}>{f.count}</span>
              </div>
            );
          })}
        </div>

        {/* lista */}
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((w, idx) => (
            <div key={w.id} style={{
              padding: 12, background: C.bg, borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              {/* posição na fila */}
              <div style={{
                width: 32, height: 32, borderRadius: 16,
                background: idx === 0 ? C.ink : C.surface,
                color: idx === 0 ? C.bg : C.ink,
                border: idx === 0 ? 'none' : `1.5px solid ${C.borderSoft}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, flexShrink: 0,
                fontVariantNumeric: 'tabular-nums', marginTop: 1,
              }}>{idx + 1}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                    {w.name}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: waitColor(w.wait),
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }}>
                    {w.wait} min
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 2, fontWeight: 500 }}>
                  {w.party} {w.party === 1 ? 'pessoa' : 'pessoas'} · cadastro {w.addedAt}
                </div>
                {w.note && (
                  <div style={{
                    fontSize: 11, color: C.mute, marginTop: 4, padding: '4px 8px',
                    background: C.surface, borderRadius: 6, lineHeight: 1.4,
                  }}>
                    {w.note}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <div style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8,
                    background: C.ink, color: C.bg,
                    fontSize: 12, fontWeight: 700, textAlign: 'center', letterSpacing: -0.1,
                  }}>Sentar agora</div>
                  <div style={{
                    padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${C.borderSoft}`,
                    color: C.mute, display: 'flex', alignItems: 'center', gap: 4,
                  }}>{Icon.phone(14)}</div>
                </div>
              </div>
            </div>
          ))}

          {visible.length === 0 && (
            <div style={{
              padding: 32, textAlign: 'center',
              background: C.bg, border: `1px dashed ${C.borderSoft}`, borderRadius: 12,
            }}>
              <div style={{ color: C.faint, marginBottom: 6 }}>{Icon.list(28)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                Nada na fila desse tamanho
              </div>
              <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>
                Toque + acima para cadastrar alguém
              </div>
            </div>
          )}
        </div>
      </div>
      <HBottomNav active="waitlist" dark={dark} />
    </div>
  );
};

// ============================================================
// CADASTRAR NA LISTA DE ESPERA · FORMULÁRIO
// Captura nome, telefone, CPF (opcional), tamanho do grupo e observação.
// CPF é só pra chamar pelo programa de fidelidade — não obrigatório.
// ============================================================
const ScreenHostWaitlistAdd = ({ dark = false, partySize = 4 }) => {
  const C = useG(dark);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Adicionar à fila"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        <div style={{ padding: '8px 16px 4px' }}>
          <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5 }}>
            Cadastre o cliente na chegada · receba notificação quando uma mesa do tamanho certo abrir.
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {/* tamanho do grupo */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
            Tamanho do grupo *
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, '7+'].map(n => {
              const isNum = typeof n === 'number';
              const sel = isNum ? n === partySize : partySize >= 7;
              return (
                <div key={n} style={{
                  flex: 1, padding: '14px 0', textAlign: 'center',
                  border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                  borderRadius: 10,
                  background: sel ? C.ink : C.bg,
                  color: sel ? C.bg : C.ink,
                  fontSize: 15, fontWeight: 700, letterSpacing: -0.3,
                  fontVariantNumeric: 'tabular-nums',
                }}>{n}</div>
              );
            })}
          </div>

          {/* nome */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Nome *
            </div>
            <div style={{
              padding: '14px 14px', borderRadius: 12,
              border: `1.5px solid ${C.ink}`,
              fontSize: 15, color: C.ink, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>Bruno Machado</span>
              <span style={{ width: 2, height: 18, background: C.ink, animation: 'gPulse 1s infinite' }} />
            </div>
          </div>

          {/* telefone */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                Telefone *
              </div>
              <div style={{ fontSize: 11, color: C.mute, fontWeight: 500 }}>
                pra chamar quando abrir
              </div>
            </div>
            <div style={{
              padding: '14px 14px', borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              fontSize: 15, color: C.faint, fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
            }}>
              (11) 9 _____-____
            </div>
          </div>

          {/* CPF opcional */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                CPF
              </div>
              <div style={{ fontSize: 11, color: C.mute, fontWeight: 500 }}>
                opcional · só pra fidelidade
              </div>
            </div>
            <div style={{
              padding: '14px 14px', borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              fontSize: 15, color: C.faint, fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
            }}>
              ___.___.___-__
            </div>
          </div>

          {/* observação */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Observação
            </div>
            <div style={{
              padding: '14px 14px', borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              fontSize: 14, color: C.faint, fontWeight: 500, minHeight: 56,
              lineHeight: 1.4,
            }}>
              Aniversário, alergia, preferência (mesa interna, perto da janela…)
            </div>
          </div>

          {/* tags rápidas */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Atalhos
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['Aniversário', 'Mesa interna', 'Mesa janela', 'Sem ar-condicionado', 'Cadeirinha', 'Sem alergia'].map(tag => (
                <div key={tag} style={{
                  padding: '6px 10px', borderRadius: 100,
                  border: `1px solid ${C.borderSoft}`,
                  fontSize: 11.5, fontWeight: 600, color: C.mute,
                }}>+ {tag}</div>
              ))}
            </div>
          </div>

          {/* dica · LGPD */}
          <div style={{
            marginTop: 18, padding: 12,
            background: C.surface, borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{ color: C.mute, marginTop: 1 }}>{Icon.shield(16)}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.mute, lineHeight: 1.5 }}>
              <span style={{ color: C.ink, fontWeight: 700 }}>Dados protegidos.</span> CPF fica criptografado e só aparece mascarado (123.***.***-12). Telefone e nome ficam guardados pra fidelidade e métricas. Marketing só dispara se o cliente marcar a opção.
            </div>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{
        padding: '12px 16px 18px', borderTop: `1px solid ${C.borderSoft}`,
        background: C.bg, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <GButton kind="primary" dark={dark} full icon={Icon.check(18)}>
          Cadastrar · {partySize} {partySize === 1 ? 'pessoa' : 'pessoas'}
        </GButton>
        <GButton kind="secondary" dark={dark} full>Cancelar</GButton>
      </div>
    </div>
  );
};

// ============================================================
// RESERVAS DO DIA · LISTA + STATUS DE CHEGADA
// Todas as reservas chegam pelo bot do WhatsApp do restaurante
// Recepcionista vê quem chegou e libera a mesa atribuída.
// ============================================================
const ScreenHostReservations = ({ dark = false, statusFilter = 'all' }) => {
  const C = useG(dark);
  const filterFn = (r) => {
    if (statusFilter === 'all')      return true;
    if (statusFilter === 'awaited')  return r.status === 'awaited';
    if (statusFilter === 'arrived')  return r.status === 'arrived';
    if (statusFilter === 'late')     return r.status === 'awaited'; // agora é 19:42, qualquer com when < 19:42 é atrasado
    return true;
  };
  const visible = H_RESERVATIONS.filter(filterFn);

  // helper · status badge
  const badge = (r) => {
    if (r.status === 'arrived') {
      return { bg: '#E9F4ED', fg: '#1E8C5A', bd: '#C9E2D2', label: 'Chegou', dot: '#1E8C5A' };
    }
    return { bg: '#FFF7E8', fg: '#7a4d10', bd: '#F0DCB6', label: 'Aguardada', dot: '#D98E2B' };
  };

  const counts = {
    all:     H_RESERVATIONS.length,
    awaited: H_RESERVATIONS.filter(r => r.status === 'awaited').length,
    arrived: H_RESERVATIONS.filter(r => r.status === 'arrived').length,
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Reservas"
          right={<GIconBtn dark={dark} icon={Icon.plus(20)} />}
        />

        {/* hero · contagem por status */}
        <div style={{
          padding: '12px 16px', display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          {[
            { lbl: 'Hoje',     n: counts.all,     dot: '#0a0a0a' },
            { lbl: 'Esperadas', n: counts.awaited, dot: '#D98E2B' },
            { lbl: 'Chegaram',  n: counts.arrived, dot: '#1E8C5A' },
          ].map(s => (
            <div key={s.lbl} style={{
              padding: 10, background: C.bg, borderRadius: 10,
              border: `1px solid ${C.borderSoft}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot }} />
                <span style={{ fontSize: 10, color: C.faint, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{s.lbl}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginTop: 2, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
            </div>
          ))}
        </div>

        {/* filtros */}
        <div style={{
          padding: '0 16px 8px', display: 'flex', gap: 6,
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {[
            { id: 'all',     label: 'Todas',     count: counts.all },
            { id: 'awaited', label: 'Esperadas', count: counts.awaited },
            { id: 'arrived', label: 'Chegaram',  count: counts.arrived },
          ].map(f => {
            const sel = f.id === statusFilter;
            return (
              <div key={f.id} style={{
                flexShrink: 0, padding: '7px 12px', borderRadius: 100,
                border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                background: sel ? C.ink : C.bg,
                color: sel ? C.bg : C.ink,
                fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                {f.label}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '0 6px',
                  borderRadius: 100, background: sel ? 'rgba(255,255,255,0.18)' : C.surface,
                  color: sel ? C.bg : C.faint, fontVariantNumeric: 'tabular-nums',
                }}>{f.count}</span>
              </div>
            );
          })}
        </div>

        {/* lista */}
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((r) => {
            const b = badge(r);
            return (
              <div key={r.id} style={{
                padding: 12, background: C.bg, borderRadius: 12,
                border: `1px solid ${C.borderSoft}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* horário grande */}
                  <div style={{
                    width: 60, padding: '8px 0', textAlign: 'center',
                    background: C.surface, borderRadius: 10,
                    border: `1px solid ${C.borderSoft}`,
                    flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>
                      {r.when}
                    </div>
                    <div style={{ fontSize: 9.5, color: C.faint, fontWeight: 600, marginTop: 1, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      hoje
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>{r.name}</div>
                      <div style={{
                        padding: '2px 8px', borderRadius: 100,
                        background: b.bg, border: `1px solid ${b.bd}`,
                        color: b.fg, fontSize: 10, fontWeight: 700,
                        letterSpacing: 0.3, textTransform: 'uppercase',
                        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: 3, background: b.dot }} />
                        {b.label}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: C.mute, marginTop: 2, fontWeight: 500 }}>
                      {r.party} {r.party === 1 ? 'pessoa' : 'pessoas'}
                      {r.table && <> · mesa <span style={{ fontWeight: 700, color: C.ink }}>{r.table}</span></>}
                    </div>

                    {/* telefone */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: C.faint }}>
                      {Icon.phone(13)}
                      <span style={{ fontSize: 11, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{r.phone}</span>
                    </div>

                    {r.note && (
                      <div style={{
                        fontSize: 11, color: C.mute, marginTop: 6, padding: '5px 8px',
                        background: C.surface, borderRadius: 6, lineHeight: 1.4,
                      }}>
                        {r.note}
                      </div>
                    )}

                    {/* CTA · varia por status */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {r.status === 'awaited' ? (
                        <>
                          <div style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8,
                            background: C.ink, color: C.bg,
                            fontSize: 12, fontWeight: 700, textAlign: 'center', letterSpacing: -0.1,
                          }}>Marcar chegada</div>
                          <div style={{
                            padding: '8px 10px', borderRadius: 8,
                            border: `1px solid ${C.borderSoft}`,
                            color: C.mute, display: 'flex', alignItems: 'center', gap: 4,
                          }}>{Icon.phone(14)}</div>
                        </>
                      ) : (
                        <div style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8,
                          background: C.surface, color: C.ink,
                          border: `1.5px solid ${C.borderSoft}`,
                          fontSize: 12, fontWeight: 700, textAlign: 'center', letterSpacing: -0.1,
                        }}>Liberar mesa {r.table}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <HBottomNav active="reserva" dark={dark} />
    </div>
  );
};

// ============================================================
// CADASTRO MANUAL DE RESERVA · recepcionista
// Quando uma reserva NÃO veio pelo bot do WhatsApp (ligação,
// cliente presencial pedindo pra reservar amanhã, WhatsApp
// pessoal da gerência…), a recepcionista cadastra aqui.
//
// O fluxo respeita a mesma lógica do bot:
//   1. Tamanho do grupo (chips)
//   2. Data (Hoje / Amanhã / depois / outra)
//   3. Backend devolve slots disponíveis (não deixa digitar livre)
//   4. Recepcionista escolhe o slot
//   5. Nome + telefone + observação
//   6. Origem (pra estatística — qual canal mais usa: telefone,
//      presencial, WhatsApp pessoal, outro)
//
// Props:
//   partySize: 4         — quantas pessoas (chip selecionado)
//   day: 'today'|'tomorrow'|'after' — data selecionada
//   selectedSlot: '20:30' — slot escolhido (mock)
//   origin: 'phone'|'walkin'|'whatsapp-pessoal'|'other'
// ============================================================
const ScreenHostReservationAdd = ({
  dark = false,
  partySize = 4,
  day = 'today',
  selectedSlot = '20:30',
  origin = 'phone',
}) => {
  const C = useG(dark);

  // slots de disponibilidade — vêm do backend dependendo do dia + party.
  // Função real: findAvailableSlots(date, party) — mesma usada pelo bot.
  // Aqui mock pra ilustrar como a UI se comporta com 4 slots.
  const slotsByDay = {
    today:    ['19:30', '20:00', '20:30', '21:15'],
    tomorrow: ['12:30', '13:00', '19:00', '20:00'],
    after:    ['12:30', '13:30', '19:30', '20:30'],
  };
  const slots = slotsByDay[day] || slotsByDay.today;

  const dayLabels = {
    today:    'Hoje',
    tomorrow: 'Amanhã',
    after:    '7 mai',
  };

  // canais manuais — só aparecem aqui porque o bot é o canal default.
  // Métricas no painel do gerente usam esse campo pra entender quanto
  // ainda chega por canal "fora do bot" e justificar investimento no bot.
  const origins = [
    { id: 'phone',            label: 'Telefone',          icon: Icon.phone },
    { id: 'walkin',           label: 'Presencial',        icon: Icon.user },
    { id: 'whatsapp-pessoal', label: 'WhatsApp pessoal',  icon: Icon.chat },
    { id: 'other',            label: 'Outro',             icon: Icon.more },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark} title="Nova reserva"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        <div style={{ padding: '8px 16px 4px' }}>
          <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5 }}>
            Cadastre uma reserva que veio por <span style={{ color: C.ink, fontWeight: 700 }}>fora do bot</span> — ligação, presencial ou contato direto. Se chegou pelo WhatsApp do restaurante, ela já aparece sozinha nos avisos.
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {/* TAMANHO DO GRUPO */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
            Tamanho do grupo *
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, '7+'].map(n => {
              const isNum = typeof n === 'number';
              const sel = isNum ? n === partySize : partySize >= 7;
              return (
                <div key={n} style={{
                  flex: 1, padding: '14px 0', textAlign: 'center',
                  border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                  borderRadius: 10,
                  background: sel ? C.ink : C.bg,
                  color: sel ? C.bg : C.ink,
                  fontSize: 15, fontWeight: 700, letterSpacing: -0.3,
                  fontVariantNumeric: 'tabular-nums',
                }}>{n}</div>
              );
            })}
          </div>

          {/* DATA */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Data *
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'today',    label: 'Hoje',     sub: 'qua 5/5'  },
                { id: 'tomorrow', label: 'Amanhã',   sub: 'qui 6/5'  },
                { id: 'after',    label: 'Sex 7/5',  sub: null       },
                { id: 'custom',   label: 'Outra',    sub: null, plus: true },
              ].map(d => {
                const sel = d.id === day;
                return (
                  <div key={d.id} style={{
                    flex: '1 1 0', minWidth: 76,
                    padding: '10px 8px', textAlign: 'center',
                    border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                    borderRadius: 10,
                    background: sel ? C.ink : C.bg,
                    color: sel ? C.bg : C.ink,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
                      {d.plus && <span style={{ marginRight: 3 }}>+</span>}
                      {d.label}
                    </div>
                    {d.sub && (
                      <div style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.7, marginTop: 2 }}>
                        {d.sub}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* HORÁRIOS DISPONÍVEIS — mesmo cálculo do bot */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                Horários disponíveis · {dayLabels[day]}
              </div>
              <div style={{ fontSize: 10.5, color: C.mute, fontWeight: 600 }}>
                pra {partySize}{partySize >= 7 ? '+' : ''} pessoas
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {slots.map(t => {
                const sel = t === selectedSlot;
                return (
                  <div key={t} style={{
                    padding: '14px 0', textAlign: 'center',
                    border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                    borderRadius: 10,
                    background: sel ? C.ink : C.bg,
                    color: sel ? C.bg : C.ink,
                    fontSize: 14, fontWeight: 700, letterSpacing: -0.2,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{t}</div>
                );
              })}
            </div>
            <div style={{
              marginTop: 6, padding: '6px 10px',
              background: C.surface, border: `1px solid ${C.borderSoft}`,
              borderRadius: 8, fontSize: 10.5, color: C.mute, lineHeight: 1.5,
            }}>
              Mesma lógica do bot · só aparecem horários que cabem o grupo. Se nenhum servir, ofereça outro dia.
            </div>
          </div>

          {/* NOME */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Nome *
            </div>
            <div style={{
              padding: '14px 14px', borderRadius: 12,
              border: `1.5px solid ${C.ink}`,
              fontSize: 15, color: C.ink, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>Patrícia Lima</span>
              <span style={{ width: 2, height: 18, background: C.ink, animation: 'gPulse 1s infinite' }} />
            </div>
          </div>

          {/* TELEFONE */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                Telefone *
              </div>
              <div style={{ fontSize: 11, color: C.mute, fontWeight: 500 }}>
                pra confirmar 1h antes
              </div>
            </div>
            <div style={{
              padding: '14px 14px', borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              fontSize: 15, color: C.faint, fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
            }}>
              (11) 9 _____-____
            </div>
          </div>

          {/* OBSERVAÇÃO */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Observação
            </div>
            <div style={{
              padding: '14px 14px', borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              fontSize: 14, color: C.faint, fontWeight: 500, minHeight: 56,
              lineHeight: 1.4,
            }}>
              Aniversário, dieta especial, mesa preferida (interna, varanda)…
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {[
                { e: '🎂', label: 'Aniversário' },
                { e: '🤫', label: 'Mesa discreta' },
                { e: '🌱', label: 'Vegetariano' },
                { e: '👶', label: 'Cadeirinha' },
                { e: '🌳', label: 'Varanda' },
              ].map(t => (
                <div key={t.label} style={{
                  padding: '6px 10px', borderRadius: 100,
                  border: `1px solid ${C.borderSoft}`,
                  fontSize: 11.5, fontWeight: 600, color: C.mute,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <span>{t.e}</span>{t.label}
                </div>
              ))}
            </div>
          </div>

          {/* ORIGEM — canal manual */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                Como chegou *
              </div>
              <div style={{ fontSize: 10.5, color: C.mute, fontWeight: 500 }}>
                ajuda o gerente a entender o canal
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {origins.map(o => {
                const sel = o.id === origin;
                return (
                  <div key={o.id} style={{
                    padding: '12px 10px',
                    border: `1.5px solid ${sel ? C.ink : C.borderSoft}`,
                    borderRadius: 10,
                    background: sel ? C.ink : C.bg,
                    color: sel ? C.bg : C.ink,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ flexShrink: 0, opacity: sel ? 1 : 0.7 }}>{o.icon(16)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.1 }}>{o.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DICA · LGPD */}
          <div style={{
            marginTop: 18, padding: 12,
            background: C.surface, borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{ color: C.mute, marginTop: 1 }}>{Icon.shield(16)}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.mute, lineHeight: 1.5 }}>
              <span style={{ color: C.ink, fontWeight: 700 }}>Dados protegidos.</span> Telefone e nome ficam guardados pra confirmação automática 1h antes e métricas. Marketing só dispara se o cliente marcar a opção depois.
            </div>
          </div>
        </div>
      </div>

      {/* STICKY CTA */}
      <div style={{
        padding: '12px 16px 18px', borderTop: `1px solid ${C.borderSoft}`,
        background: C.bg, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <GButton kind="primary" dark={dark} full icon={Icon.check(18)}>
          Reservar · {partySize}{partySize >= 7 ? '+' : ''} {partySize === 1 ? 'pessoa' : 'pessoas'} · {dayLabels[day]} {selectedSlot}
        </GButton>
        <GButton kind="secondary" dark={dark} full>Cancelar</GButton>
      </div>
    </div>
  );
};

// ============================================================
// TABLE SWAP · MOVER FAMÍLIA DE MESA A PARA MESA B
// ============================================================
// Caso de uso: cliente sentou na mesa 9 mas pediu pra trocar (não gostou da
// posição, queria varanda, queria perto da janela, etc). Backend transfere:
//  · QR ativo da mesa A → desativa
//  · QR ativo da mesa B → ativa (cliente continua na mesma sessão visual)
//  · Pedidos em andamento → migrados para mesa B (cozinha continua o fluxo)
//  · Garçom atribuído → reatribui se mudou de zona; mantém se mesma zona
//  · Push pra garçom A ("mesa 9 esvaziou") + garçom B ("família X agora é sua")
//
// Estados: 'select' (escolher destino) | 'confirm' (revisar) | 'success' (feito)
const ScreenHostTableSwap = ({
  dark = false,
  state = 'select',
  // mesa de origem (a que está ocupada agora) e destino (escolhido pra mover)
  fromTable = 9,
  toTable = 12,
  party = 6,
  customerName = 'Família Carvalho',
  reason = null, // motivo opcional · "pediu varanda"
}) => {
  const C = useG(dark);
  const fromMesa = H_TABLES.find(x => x.n === fromTable) || { n: fromTable, cap: 6, sector: 'Salão', waiter: 'CS' };
  const toMesa = H_TABLES.find(x => x.n === toTable) || { n: toTable, cap: 4, sector: 'Salão' };
  const sameWaiter = fromMesa.sector === toMesa.sector;

  // sugestões: livres com cap >= party, mesmo setor primeiro, capacidade próxima
  const suggestions = H_TABLES
    .filter(x => x.st === 'livre' && x.cap >= party && x.n !== fromMesa.n)
    .sort((a, b) => {
      const sameA = a.sector === fromMesa.sector ? 0 : 1;
      const sameB = b.sector === fromMesa.sector ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      return a.cap - b.cap;
    })
    .slice(0, 6);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: G_FONT, color: C.ink }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar dark={dark}
          title={state === 'success' ? 'Mesa movida' : `Mover mesa ${fromTable}`}
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {state === 'success' ? (
          <>
            {/* SUCESSO · hero verde + diagrama da troca */}
            <div style={{
              padding: '24px 20px 22px', textAlign: 'center',
              background: '#E9F4ED', borderBottom: `1px solid #C9E2D2`,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 32,
                background: '#1E8C5A', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>{Icon.check(34)}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: '#0a0a0a' }}>
                {customerName} agora está na mesa {toTable}
              </div>
              <div style={{ fontSize: 13, color: '#2f5d40', marginTop: 4, fontWeight: 500 }}>
                Pedidos e cardápio migrados · Mesa {fromTable} voltou a ficar Livre
              </div>
            </div>

            {/* diagrama visual da migração */}
            <div style={{ padding: '20px 16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
                <div style={{
                  textAlign: 'center', flex: '0 0 auto',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 12,
                    background: C.surface, border: `1.5px dashed ${C.borderSoft}`,
                    color: C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 800, letterSpacing: -0.4,
                  }}>{fromTable}</div>
                  <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    LIVRE
                  </div>
                </div>
                <div style={{ color: C.mute, fontSize: 28 }}>→</div>
                <div style={{
                  textAlign: 'center', flex: '0 0 auto',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 12,
                    background: '#1E8C5A', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 800, letterSpacing: -0.4,
                  }}>{toTable}</div>
                  <div style={{ fontSize: 10.5, color: '#1E8C5A', fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    OCUPADA
                  </div>
                </div>
              </div>
            </div>

            {/* o que aconteceu (efeitos colaterais) */}
            <div style={{ padding: '20px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>
                O que o sistema fez
              </div>
              {[
                { i: 1, title: 'Pedidos em andamento migraram', sub: '2 pedidos abertos agora aparecem na mesa ' + toTable + ' pra cozinha e garçom.' },
                { i: 2, title: 'QR da mesa ' + fromTable + ' foi desativado', sub: 'O QR da mesa ' + toTable + ' já está ativo. Cliente não precisa escanear de novo (mesma sessão).' },
                { i: 3, title: sameWaiter ? `Garçom continua sendo ${fromMesa.waiter || 'CS'}` : 'Garçom da nova zona foi atribuído',
                  sub: sameWaiter
                    ? 'Mesma zona · ' + (fromMesa.waiter || 'CS') + ' já recebeu push avisando.'
                    : 'Caleb saiu da mesa, Henrique recebeu push da nova mesa.' },
              ].map(s => (
                <div key={s.i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12,
                    background: C.ink, color: C.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{s.i}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.45 }}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ORIGEM · mesa que vai esvaziar */}
            <div style={{ padding: '14px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>
                Família que vai mudar
              </div>
              <div style={{
                padding: 14, borderRadius: 14,
                background: C.surface, border: `1.5px solid ${C.borderSoft}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: C.bg, border: `1.5px solid ${C.borderSoft}`,
                    color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 800, letterSpacing: -0.3,
                  }}>{fromTable}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: -0.2 }}>
                      Mesa {fromTable} · {customerName}
                    </div>
                    <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 3 }}>
                      {party} pessoas · garçom {fromMesa.waiter || 'CS'} · 2 pedidos abertos
                    </div>
                  </div>
                </div>
                {reason && (
                  <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: 8,
                    background: '#FFF7E8', border: `1px solid #F0DCB6`,
                    fontSize: 12, color: '#7a4d10', fontWeight: 600,
                  }}>
                    Motivo: {reason}
                  </div>
                )}
              </div>
            </div>

            {state === 'select' ? (
              <>
                {/* SELECT · escolher mesa destino */}
                <div style={{ padding: '20px 16px 4px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>
                    Escolha a nova mesa
                  </div>
                  <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginBottom: 12, lineHeight: 1.5 }}>
                    Mostro só mesas livres que cabem {party} pessoas. As do mesmo setor aparecem primeiro pra não trocar de garçom.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {suggestions.map(s => {
                      const sameSector = s.sector === fromMesa.sector;
                      return (
                        <div key={s.n} style={{
                          padding: 12, borderRadius: 12,
                          background: C.surface, border: `1px solid ${C.borderSoft}`,
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: 10,
                            background: C.bg, border: `1.5px dashed ${C.borderSoft}`,
                            color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, fontWeight: 800, letterSpacing: -0.3,
                          }}>{s.n}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                              Mesa {s.n} · {s.cap} lugares
                            </div>
                            <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                              {s.sector} {sameSector
                                ? <span style={{ color: '#1E8C5A', fontWeight: 700 }}>· mesmo garçom</span>
                                : <span style={{ color: '#D98E2B', fontWeight: 700 }}>· troca garçom</span>}
                            </div>
                          </div>
                          <div style={{
                            padding: '6px 12px', borderRadius: 8,
                            background: C.ink, color: C.surface,
                            fontSize: 12, fontWeight: 700,
                          }}>Mover</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* CONFIRM · revisar antes de mover */}
                <div style={{ padding: '20px 16px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>
                    Confirme a troca
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', padding: '8px 0' }}>
                    <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: 14,
                        background: C.surface, border: `1.5px dashed ${C.borderSoft}`,
                        color: C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 26, fontWeight: 800, letterSpacing: -0.5,
                      }}>{fromTable}</div>
                      <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 700, marginTop: 4 }}>vai esvaziar</div>
                    </div>
                    <div style={{ color: C.ink, fontSize: 32, fontWeight: 800 }}>→</div>
                    <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: 14,
                        background: '#1E8C5A', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 26, fontWeight: 800, letterSpacing: -0.5,
                      }}>{toTable}</div>
                      <div style={{ fontSize: 10.5, color: '#1E8C5A', fontWeight: 700, marginTop: 4 }}>nova mesa</div>
                    </div>
                  </div>
                </div>

                {/* checklist do que vai acontecer */}
                <div style={{ padding: '14px 16px 0' }}>
                  <div style={{
                    padding: 14, borderRadius: 14,
                    background: C.surface, border: `1.5px solid ${C.borderSoft}`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>
                      Vai acontecer
                    </div>
                    {[
                      { ok: true, txt: '2 pedidos abertos migram para a mesa ' + toTable },
                      { ok: true, txt: 'QR e cardápio do cliente continuam funcionando' },
                      { ok: sameWaiter, txt: sameWaiter
                        ? `${fromMesa.waiter || 'CS'} continua sendo o garçom`
                        : 'Garçom muda de ' + (fromMesa.waiter || 'CS') + ' para Henrique (novo setor)' },
                      { ok: true, txt: 'Cozinha recebe aviso de mudança automaticamente' },
                    ].map((it, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8,
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 9,
                          background: it.ok ? '#1E8C5A' : '#D98E2B',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 1, fontSize: 11, fontWeight: 800,
                        }}>{it.ok ? '✓' : '!'}</div>
                        <div style={{ flex: 1, fontSize: 13, color: C.ink, lineHeight: 1.45 }}>
                          {it.txt}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* sticky CTA */}
      {state === 'success' ? (
        <div style={{
          padding: '12px 16px 18px', borderTop: `1px solid ${C.borderSoft}`,
          background: C.bg,
        }}>
          <GButton kind="primary" dark={dark} full icon={Icon.arrow(18)}>Voltar ao salão</GButton>
        </div>
      ) : state === 'confirm' ? (
        <div style={{
          padding: '12px 16px 18px', borderTop: `1px solid ${C.borderSoft}`,
          background: C.bg, display: 'flex', gap: 8,
        }}>
          <GButton kind="secondary" dark={dark} full>Voltar</GButton>
          <GButton kind="primary" dark={dark} full icon={Icon.check(18)}>
            Mover agora
          </GButton>
        </div>
      ) : null}
    </div>
  );
};

// ============================================================
// EU · RECEPCIONISTA (★ V10 · 2026-05 ★)
// ────────────────────────────────────────────────────────────
// 5ª aba "Eu" do HBottomNav. Paridade visual com o Eu do gerente
// (ScreenManagerSettings) e o Profile do garçom — mas conteúdo
// reduzido: recepcionista tem poucas alavancas próprias (não
// encerra turno do salão, não vê financeiro, não cria cortesia).
//
// Estrutura (★ V11 · 2026-05 ★ Mensagens subiu pro 2º bloco):
//   1. Hero · avatar + nome + cargo + indicador "em turno"
//   2. ★ V11 ★ MENSAGENS · bloco próprio com 1 ActionRow.
//      Antes vivia dentro de OPERAÇÃO mas o badge ficava enterrado no
//      scroll. Subiu porque mensagem é interruptiva (notif staff↔staff).
//   3. KPI rápido do turno · mesas liberadas (mais relevante pra
//      recepcionista que vendas) · leitura passiva, fica entre Mensagens
//      e Operação
//   4. OPERAÇÃO · Histórico de turnos (Mensagens saiu daqui)
//   5. CONTA · Notificações · Segurança · Aparência
//   6. Sair
// ============================================================
const ScreenHostProfile = ({ dark = false, onTo = () => {} }) => {
  const C = useG(dark);

  const ActionRow = ({ icon, lbl, sub, badge, danger, onClick }) => (
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
        background: danger ? '#FFE9E9' : '#F4F0E8',
        color: danger ? '#A12626' : C.ink,
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
        <MTopBar dark={dark} title="Eu"
          right={<GIconBtn dark={dark} icon={Icon.bell(20)} badge="2" />}
        />

        {/* HERO */}
        <div style={{
          padding: '20px 16px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: `1px solid ${C.borderSoft}`, background: C.bg,
        }}>
          <MAvatar name={H_HOST.name} init={H_HOST.init} color={H_HOST.color} size={76} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>{H_HOST.name}</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 3, fontWeight: 600 }}>
              {H_HOST.role} · {H_HOST.shift}
            </div>
            <div style={{ fontSize: 11, color: '#1E8C5A', marginTop: 6, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.3, textTransform: 'uppercase' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E8C5A', animation: 'gPulse 2s infinite' }} />
              em turno desde 17:08
            </div>
          </div>
        </div>

        {/* ★ V11 · 2026-05 ★ MENSAGENS · 2º bloco · interruptivo */}
        <MSection dark={dark} title="Mensagens">
          <div style={{ padding: '0 16px' }}>
            <ActionRow icon={Icon.chat(18)} lbl="Mensagens" sub="Histórico" onClick={() => onTo('staff-messages')} />
          </div>
        </MSection>

        {/* KPI · mesas liberadas no turno */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{
            padding: 14, borderRadius: 12,
            background: C.bg, border: `1px solid ${C.borderSoft}`,
          }}>
            <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Suas liberações no turno
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: -0.6, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              23<span style={{ fontSize: 14, color: C.faint, fontWeight: 600, marginLeft: 6 }}>mesas</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#1E8C5A', marginTop: 4, fontWeight: 700 }}>
              ↑ 3 reservas + 20 walkins · espera média 4 min
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>
              Só o que você liberou desde 17:08. Histórico do dia inteiro fica em Avisos &gt; resumo.
            </div>
          </div>
        </div>

        {/* OPERAÇÃO (V11: Mensagens saiu daqui · subiu pro 2º bloco) */}
        <MSection dark={dark} title="Operação">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionRow icon={Icon.history(18)} lbl="Histórico de turnos"  sub="Liberações, esperas e reservas dos turnos passados" />
          </div>
        </MSection>

        {/* CONTA */}
        <MSection dark={dark} title="Conta">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionRow icon={Icon.bell(18)}    lbl="Notificações"      sub="Avisos do turno · push · sons · lock screen" />
            <ActionRow icon={Icon.shield(18)}  lbl="Segurança e senha" sub="Trocar senha · 2FA · sessões ativas" />
            <ActionRow icon={Icon.flame(18)}   lbl="Aparência"         sub="Modo claro · escuro · automático" />
          </div>
        </MSection>

        {/* SAIR */}
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
            Versão 1.1.0 · build 2026-05-08<br />
            Trattoria Luna · Av. Paulista 1234
          </div>
        </div>
      </div>
      <HBottomNav active="me" dark={dark} />
    </div>
  );
};

Object.assign(window, {
  H_HOST, H_TABLES, H_ALERTS, H_WAITLIST, H_RESERVATIONS, H_SECTORS,
  HBottomNav,
  ScreenHostHome,
  ScreenHostTableLiberate,
  ScreenHostTableLiberada,
  ScreenHostTableSwap,
  ScreenHostInbox,
  ScreenHostAlertDetail,
  ScreenHostWaitlist,
  ScreenHostWaitlistAdd,
  ScreenHostReservations,
  ScreenHostReservationAdd,
  ScreenHostProfile,
});
