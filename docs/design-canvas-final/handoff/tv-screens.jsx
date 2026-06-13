// ============================================================
// TELAS PARA TV — COZINHA (KDS) e BAR
// 1920×1080, tema branco com bordas pretas, Inter
// Otimizadas para visualização à distância em TV
// ============================================================

const { useState, useEffect } = React;

// ============ TOKENS ============
const C = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  border: '#0a0a0a',
  borderSoft: '#e5e5e5',
  mute: '#6b6b6b',
  faint: '#a3a3a3',
  surface: '#f6f5f2',
  danger: '#c43a3a',
  success: '#2f7d4f',
};
const FONT = "'Inter', system-ui, -apple-system, sans-serif";

// ============ MOCK DATA ============
const KITCHEN_ORDERS = [
  {
    id: '#0142',
    table: 'Mesa 12',
    when: '21:34',
    elapsedMin: 4,
    status: 'novo',
    items: [
      { q: 1, n: 'Risoto de camarão', note: 'sem cebola, ponto ao dente', station: 'massas' },
      { q: 1, n: 'Bruschetta caprese', note: null, station: 'entradas' },
      { q: 2, n: 'Filé ao vinho', note: 'um mal passado, um ao ponto', station: 'grelha' },
    ],
  },
  {
    id: '#0141',
    table: 'Mesa 07',
    when: '21:32',
    elapsedMin: 6,
    status: 'preparando',
    items: [
      {
        q: 1,
        n: 'Salmão grelhado',
        note: 'sem alcaparras — ALERGIA',
        alert: true,
        station: 'grelha',
      },
      { q: 1, n: 'Spaghetti al funghi', note: null, station: 'massas' },
      { q: 1, n: 'Tábua de frios', note: 'sem azeitona', station: 'entradas' },
    ],
  },
  {
    id: '#0140',
    table: 'Mesa 03',
    when: '21:28',
    elapsedMin: 10,
    status: 'preparando',
    items: [
      { q: 2, n: 'Lasagna bolonhesa', note: null, station: 'massas' },
      { q: 1, n: 'Carpaccio tradicional', note: 'extra parmesão', station: 'entradas' },
    ],
  },
  {
    id: '#0139',
    table: 'Mesa 18',
    when: '21:24',
    elapsedMin: 14,
    status: 'atrasado',
    items: [
      { q: 1, n: 'Polvo à lagareiro', note: null, station: 'grelha' },
      { q: 1, n: 'Ravioli de burrata', note: 'massa al dente', station: 'massas' },
      {
        q: 1,
        n: 'Petit gâteau',
        note: 'servir junto com o prato principal',
        station: 'sobremesas',
      },
    ],
  },
  {
    id: '#0138',
    table: 'Mesa 21',
    when: '21:20',
    elapsedMin: 18,
    status: 'pronto',
    items: [
      { q: 1, n: 'Risoto de camarão', note: null, station: 'massas' },
      { q: 1, n: 'Tiramisù', note: null, station: 'sobremesas' },
    ],
  },
  {
    id: '#0137',
    table: 'Balcão 02',
    when: '21:18',
    elapsedMin: 20,
    status: 'pronto',
    items: [{ q: 1, n: 'Spaghetti al funghi', note: 'extra parmesão', station: 'massas' }],
  },
];

const BAR_ORDERS = [
  {
    id: '#0142',
    table: 'Mesa 12',
    when: '21:34',
    elapsedMin: 2,
    status: 'novo',
    items: [
      { q: 2, n: 'Aperol Spritz', note: 'sem azeitona, com fatia de laranja' },
      { q: 1, n: 'Suco de limão', note: 'pouco açúcar' },
    ],
  },
  {
    id: '#0141',
    table: 'Mesa 07',
    when: '21:32',
    elapsedMin: 4,
    status: 'preparando',
    items: [
      { q: 4, n: 'Chopp Pilsen', note: null },
      { q: 1, n: 'Água com gás', note: null },
    ],
  },
  {
    id: '#0140',
    table: 'Mesa 03',
    when: '21:30',
    elapsedMin: 6,
    status: 'preparando',
    items: [
      { q: 1, n: 'Garrafa vinho tinto Malbec', note: 'servir em decanter' },
      { q: 4, n: 'Taça vinho tinto', note: null },
    ],
  },
  {
    id: '#0139',
    table: 'Mesa 18',
    when: '21:26',
    elapsedMin: 10,
    status: 'atrasado',
    items: [
      { q: 2, n: 'Caipirinha', note: 'uma de cachaça, uma de vodka' },
      { q: 1, n: 'Negroni', note: null },
      { q: 1, n: 'Gin Tônica', note: 'gin premium' },
    ],
  },
  {
    id: '#0138',
    table: 'Mesa 21',
    when: '21:22',
    elapsedMin: 14,
    status: 'pronto',
    items: [{ q: 2, n: 'Heineken long neck', note: null }],
  },
  {
    id: '#0137',
    table: 'Balcão 02',
    when: '21:20',
    elapsedMin: 16,
    status: 'pronto',
    items: [{ q: 1, n: 'Limonada suíça', note: null }],
  },
];

// ============ COMPONENTES COMPARTILHADOS ============
const KdsCounter = ({ label, n, active, dot, alert }) => (
  <div
    style={{
      padding: '10px 18px',
      borderRadius: 12,
      background: active ? '#fff' : 'transparent',
      color: active ? C.ink : '#fff',
      border: `1.3px solid ${active ? '#fff' : 'rgba(255,255,255,0.25)'}`,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      animation: alert && n > 0 ? 'kdsAlertPulse 1.6s infinite' : 'none',
    }}
  >
    {dot && (
      <span style={{ width: 10, height: 10, borderRadius: 5, background: dot, flexShrink: 0 }} />
    )}
    <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>
      {label}
    </span>
    <span
      style={{
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: -0.5,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {n}
    </span>
  </div>
);

// ============ COZINHA · KDS · TV ============
const TV_KitchenKDS = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const counts = {
    todos: KITCHEN_ORDERS.length,
    novo: KITCHEN_ORDERS.filter((o) => o.status === 'novo').length,
    preparando: KITCHEN_ORDERS.filter((o) => o.status === 'preparando').length,
    atrasado: KITCHEN_ORDERS.filter((o) => o.status === 'atrasado').length,
    pronto: KITCHEN_ORDERS.filter((o) => o.status === 'pronto').length,
  };

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: '#fff',
        color: C.ink,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          height: 88,
          background: C.ink,
          color: '#fff',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 36px',
          borderBottom: `1.5px solid ${C.ink}`,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            border: `1.5px solid #fff`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: -0.5,
            marginRight: 18,
          }}
        >
          TL
        </div>
        <div style={{ marginRight: 40 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Cozinha · KDS</div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            Trattoria Luna · Estação principal
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <KdsCounter label="Todos" n={counts.todos} active />
          <KdsCounter label="Novos" n={counts.novo} dot="#fff" />
          <KdsCounter label="Em preparo" n={counts.preparando} dot="#f0c542" />
          <KdsCounter label="Atrasados" n={counts.atrasado} dot={C.danger} alert />
          <KdsCounter label="Prontos" n={counts.pronto} dot={C.success} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              terça · 03 de maio
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: -1,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
              }}
            >
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: C.success,
              animation: 'kdsPulse 2s infinite',
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: 'min-content',
          gap: 18,
          background: '#f6f5f2',
          overflow: 'hidden',
        }}
      >
        {KITCHEN_ORDERS.map((o) => (
          <KdsOrderCard key={o.id} order={o} />
        ))}
      </div>

      <style>{`
        @keyframes kdsPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes kdsAlertPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(196,58,58,0.6); }
          50%   { box-shadow: 0 0 0 6px rgba(196,58,58,0); }
        }
        @keyframes kdsBlink { 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
};

const KdsOrderCard = ({ order }) => {
  const isLate = order.status === 'atrasado';
  const isReady = order.status === 'pronto';
  const isNew = order.status === 'novo';
  const headerBg = isLate ? C.danger : isReady ? C.success : C.ink;

  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${isLate ? C.danger : C.ink}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation: isLate ? 'kdsAlertPulse 1.8s infinite' : 'none',
      }}
    >
      <div
        style={{
          background: headerBg,
          color: '#fff',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              fontWeight: 500,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {order.id}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, marginTop: -2 }}>
            {order.table}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 0.5 }}>há</div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: -0.5,
              fontVariantNumeric: 'tabular-nums',
              marginTop: -2,
              animation: isLate ? 'kdsBlink 1s infinite' : 'none',
            }}
          >
            {order.elapsedMin} min
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '8px 18px',
          background: isLate ? '#fdf2f2' : isReady ? '#eef7f1' : '#f6f5f2',
          borderBottom: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: isLate ? C.danger : isReady ? C.success : isNew ? C.ink : '#f0c542',
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: isLate ? C.danger : isReady ? C.success : C.ink,
          }}
        >
          {isLate
            ? 'ATRASADO'
            : isReady
              ? 'Pronto p/ servir'
              : isNew
                ? 'Novo pedido'
                : 'Em preparo'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: C.mute,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          recebido {order.when}
        </span>
      </div>

      <div style={{ padding: '6px 18px 8px' }}>
        {order.items.map((it, i) => (
          <div
            key={i}
            style={{
              padding: '14px 0',
              borderBottom: i < order.items.length - 1 ? `1px solid ${C.borderSoft}` : 'none',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                flexShrink: 0,
                background: C.ink,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: -0.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {it.q}×
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  letterSpacing: -0.3,
                  lineHeight: 1.15,
                  marginBottom: 4,
                  textWrap: 'pretty',
                }}
              >
                {it.n}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: C.mute,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {it.station}
              </div>
              {it.note && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: it.alert ? C.danger : '#fff7d6',
                    border: `1.5px solid ${it.alert ? C.danger : '#e8c84a'}`,
                    color: it.alert ? '#fff' : '#5a4500',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    textWrap: 'pretty',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {it.alert ? '⚠' : '✎'}
                  </span>
                  <span style={{ flex: 1 }}>
                    {it.alert && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          letterSpacing: 1.5,
                          textTransform: 'uppercase',
                          opacity: 0.85,
                          marginBottom: 2,
                          fontWeight: 700,
                        }}
                      >
                        Atenção · observação importante
                      </span>
                    )}
                    {it.note}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '12px 14px',
          borderTop: `1.5px solid ${C.ink}`,
          display: 'flex',
          gap: 8,
          background: '#fafaf8',
        }}
      >
        {isReady ? (
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              background: C.success,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            ✓ Servir agora
          </div>
        ) : isNew ? (
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              background: C.ink,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            ▶ Iniciar preparo
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              background: '#fff',
              color: C.ink,
              border: `1.3px solid ${C.ink}`,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            Marcar pronto
          </div>
        )}
        <div
          style={{
            width: 46,
            padding: '12px 0',
            borderRadius: 10,
            background: '#fff',
            border: `1.3px solid ${C.borderSoft}`,
            fontSize: 18,
            textAlign: 'center',
            color: C.mute,
          }}
        >
          ⋯
        </div>
      </div>
    </div>
  );
};

// ============ BAR · TV ============
const TV_BarBoard = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const counts = {
    todos: BAR_ORDERS.length,
    novo: BAR_ORDERS.filter((o) => o.status === 'novo').length,
    preparando: BAR_ORDERS.filter((o) => o.status === 'preparando').length,
    atrasado: BAR_ORDERS.filter((o) => o.status === 'atrasado').length,
    pronto: BAR_ORDERS.filter((o) => o.status === 'pronto').length,
  };
  const totalDrinks = BAR_ORDERS.reduce((s, o) => s + o.items.reduce((a, b) => a + b.q, 0), 0);

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: '#fff',
        color: C.ink,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          height: 88,
          background: C.ink,
          color: '#fff',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 36px',
          borderBottom: `1.5px solid ${C.ink}`,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            border: `1.5px solid #fff`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 700,
            marginRight: 18,
          }}
        >
          🍷
        </div>
        <div style={{ marginRight: 40 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Bar · Bebidas</div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            Trattoria Luna · {totalDrinks} drinks na fila
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <KdsCounter label="Todos" n={counts.todos} active />
          <KdsCounter label="Novos" n={counts.novo} dot="#fff" />
          <KdsCounter label="Preparando" n={counts.preparando} dot="#f0c542" />
          <KdsCounter label="Atrasados" n={counts.atrasado} dot={C.danger} alert />
          <KdsCounter label="Prontos" n={counts.pronto} dot={C.success} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              terça · 03 de maio
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: -1,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
              }}
            >
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: C.success,
              animation: 'kdsPulse 2s infinite',
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 20,
          padding: 24,
          background: '#f6f5f2',
          overflow: 'hidden',
        }}
      >
        {BAR_ORDERS.map((o) => (
          <BarOrderCard key={o.id} order={o} />
        ))}
      </div>
    </div>
  );
};

const BarOrderCard = ({ order }) => {
  const isLate = order.status === 'atrasado';
  const isReady = order.status === 'pronto';
  const isNew = order.status === 'novo';
  const headerBg = isLate ? C.danger : isReady ? C.success : C.ink;
  const totalQty = order.items.reduce((s, i) => s + i.q, 0);

  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${isLate ? C.danger : C.ink}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation: isLate ? 'kdsAlertPulse 1.8s infinite' : 'none',
      }}
    >
      <div
        style={{
          background: headerBg,
          color: '#fff',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              fontWeight: 500,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {order.id}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, marginTop: -2 }}>
            {order.table}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{totalQty} drinks · há</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.5,
              fontVariantNumeric: 'tabular-nums',
              marginTop: -2,
              animation: isLate ? 'kdsBlink 1s infinite' : 'none',
            }}
          >
            {order.elapsedMin}min
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '8px 18px',
          background: isLate ? '#fdf2f2' : isReady ? '#eef7f1' : '#f6f5f2',
          borderBottom: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: isLate ? C.danger : isReady ? C.success : isNew ? C.ink : '#f0c542',
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: isLate ? C.danger : isReady ? C.success : C.ink,
          }}
        >
          {isLate
            ? 'ATRASADO'
            : isReady
              ? 'Pronto p/ entregar'
              : isNew
                ? 'Novo pedido'
                : 'Preparando'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: C.mute,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {order.when}
        </span>
      </div>

      <div style={{ padding: '6px 18px 10px', flex: 1 }}>
        {order.items.map((it, i) => (
          <div
            key={i}
            style={{
              padding: '14px 0',
              borderBottom: i < order.items.length - 1 ? `1px solid ${C.borderSoft}` : 'none',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                minWidth: 56,
                height: 56,
                padding: '0 8px',
                borderRadius: 12,
                flexShrink: 0,
                background: C.ink,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: -0.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {it.q}×
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: -0.3,
                  lineHeight: 1.15,
                  textWrap: 'pretty',
                }}
              >
                {it.n}
              </div>
              {it.note && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#fff7d6',
                    border: `1.5px solid #e8c84a`,
                    color: '#5a4500',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    textWrap: 'pretty',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>✎</span>
                  <span>{it.note}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '12px 14px',
          borderTop: `1.5px solid ${C.ink}`,
          display: 'flex',
          gap: 8,
          background: '#fafaf8',
        }}
      >
        {isReady ? (
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              background: C.success,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            ✓ Entregar
          </div>
        ) : isNew ? (
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              background: C.ink,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            ▶ Preparar
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              background: '#fff',
              color: C.ink,
              border: `1.3px solid ${C.ink}`,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            Marcar pronto
          </div>
        )}
      </div>
    </div>
  );
};

// ============ APP — empilha as duas TVs ============
const App = () => (
  <div className="tv-stack">
    <div className="tv-label">20 · Cozinha · KDS na TV — 1920×1080</div>
    <div className="tv-frame">
      <TV_KitchenKDS />
    </div>
    <div className="tv-label">21 · Bar · Bebidas na TV — 1920×1080</div>
    <div className="tv-frame">
      <TV_BarBoard />
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
