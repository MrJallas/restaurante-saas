const { useState, useEffect, useRef } = React;

// ============ TOKENS — white theme, black borders ============
const C = {
  bg: '#ffffff',
  ink: '#0a0a0a', // near-black for text / borders
  border: '#0a0a0a',
  borderSoft: '#e5e5e5',
  mute: '#6b6b6b',
  faint: '#a3a3a3',
  surface: '#f6f5f2', // very subtle warm off-white for surfaces
  accent: '#0a0a0a', // monochrome — black is the accent
  danger: '#c43a3a',
  success: '#2f7d4f',
};

const FONT = "'Inter', system-ui, -apple-system, sans-serif";

// ============ iOS FRAME (390×844) ============
const Frame = ({ children, style, hideStatusBar }) => (
  <div
    style={{
      width: 390,
      height: 844,
      background: C.bg,
      color: C.ink,
      fontFamily: FONT,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      border: `1.5px solid ${C.border}`,
      borderRadius: 44,
      ...style,
    }}
  >
    {!hideStatusBar && (
      <div
        style={{
          height: 44,
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 10,
            transform: 'translateX(-50%)',
            width: 110,
            height: 30,
            borderRadius: 15,
            background: C.ink,
          }}
        />
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
          <span>●●●●</span>
          <span>􀙇</span>
          <span>100%</span>
        </div>
      </div>
    )}
    {children}
  </div>
);

// ============ TOP BAR (minimalista, white/black) ============
const TopBar = ({ table = 'Mesa 12', restaurant = 'Trattoria Luna', showMenu = true }) => (
  <div
    style={{
      padding: '8px 22px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    }}
  >
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{restaurant}</div>
      <div style={{ fontSize: 11, color: C.mute, marginTop: 1, letterSpacing: 0.5 }}>{table}</div>
    </div>
    {showMenu && (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          border: `1.2px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M2 8h12M2 12h12" stroke={C.ink} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
    )}
  </div>
);

// ============ PRIMITIVES ============
const PillButton = ({ children, style, variant = 'outline' }) => {
  const variants = {
    outline: { background: '#fff', border: `1.3px solid ${C.border}`, color: C.ink },
    filled: { background: C.ink, border: `1.3px solid ${C.ink}`, color: '#fff' },
  };
  return (
    <button
      style={{
        padding: '14px 26px',
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 500,
        fontFamily: FONT,
        cursor: 'pointer',
        letterSpacing: -0.1,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
};

// Play button icon — matches uploaded reference (circle + dark triangle)
const PlayIcon = ({ size = 38 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: '#fff',
      border: `${Math.max(2, size * 0.08)}px solid ${C.ink}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    }}
  >
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 20 20" fill="none">
      <path
        d="M5 3.5 L16 10 L5 16.5 Z"
        fill={C.ink}
        strokeLinejoin="round"
        strokeLinecap="round"
        stroke={C.ink}
        strokeWidth="1.5"
      />
    </svg>
  </div>
);

// Placeholder for food imagery (monochrome diagonal stripes)
const FoodPlaceholder = ({ label = 'prato', h = 120, style }) => (
  <div
    style={{
      width: '100%',
      height: h,
      borderRadius: 14,
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
      background: `repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #efede8 6px, #efede8 12px)`,
      border: `1px solid ${C.borderSoft}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    }}
  >
    <span
      style={{
        fontFamily: 'ui-monospace, "SF Mono", monospace',
        fontSize: 10,
        color: C.faint,
        letterSpacing: 1,
        textTransform: 'lowercase',
      }}
    >
      {label}
    </span>
  </div>
);

// ============ SCREEN 1: Splash ============
const S1_Splash = () => (
  <Frame>
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          border: `1.5px solid ${C.ink}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        TL
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Trattoria Luna</div>
        <div style={{ fontSize: 11, color: C.mute, letterSpacing: 2, marginTop: 4 }}>MESA 12</div>
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                background: C.ink,
                animation: `bounce 1s ${d}ms infinite`,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 13, color: C.mute, textAlign: 'center' }}>
          Preparando sua experiência
        </div>
      </div>
    </div>
    <style>{`@keyframes bounce {
      0%,100% { transform: translateY(0); opacity: 0.3; }
      50% { transform: translateY(-6px); opacity: 1; }
    }`}</style>
  </Frame>
);

// ============ SCREEN 2: Welcome Modal ============
const S2_Welcome = () => (
  <Frame>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 18,
        right: 18,
        top: '50%',
        transform: 'translateY(-50%)',
        background: '#fff',
        border: `1.5px solid ${C.ink}`,
        borderRadius: 24,
        padding: 26,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          textAlign: 'center',
          color: C.ink,
          marginBottom: 6,
          letterSpacing: -0.5,
          textWrap: 'pretty',
        }}
      >
        Bem-vindo ao Trattoria Luna
      </div>
      <div
        style={{
          fontSize: 13,
          color: C.mute,
          textAlign: 'center',
          marginBottom: 22,
          textWrap: 'pretty',
          lineHeight: 1.45,
        }}
      >
        Para personalizar sua experiência, informe seu nome e CPF.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          Nome
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.ink}`,
            fontSize: 15,
            color: C.ink,
          }}
        >
          Caleb Medeiros
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          CPF
        </label>
        <div
          style={{
            marginTop: 6,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1.3px solid ${C.danger}`,
            fontSize: 15,
            color: C.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          123.456.789-0_
        </div>
        <div style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>
          CPF inválido. Verifique os números digitados.
        </div>
      </div>

      <button
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 999,
          background: C.ink,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          border: 'none',
          marginBottom: 8,
          fontFamily: FONT,
          letterSpacing: -0.1,
        }}
      >
        Continuar
      </button>
    </div>
  </Frame>
);

// ============ SCREEN 3: Home (pós-login) — NEW LAYOUT from sketch ============
const S3_HomeFirst = () => (
  <Frame>
    <TopBar />
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 24px',
        position: 'relative',
      }}
    >
      {/* Area central — botões + welcome */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 14,
          paddingBottom: 40,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <PillButton>Chamar garçom</PillButton>
          <PillButton>Ver cardápio</PillButton>
        </div>

        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              fontWeight: 500,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Assistente
          </div>
          <div
            style={{
              fontSize: 20,
              lineHeight: 1.4,
              letterSpacing: -0.3,
              textWrap: 'pretty',
              color: C.ink,
              maxWidth: 320,
            }}
          >
            Olá, Caleb. Seja bem-vindo ao Trattoria Luna. Posso ajudar com sugestões, ingredientes,
            pedido e pagamento.
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 20,
                background: C.ink,
                marginLeft: 3,
                verticalAlign: 'middle',
                animation: 'blink 1s infinite',
              }}
            />
          </div>
        </div>
      </div>

      {/* Liquid glass input fixo na base — com play icon na esquerda */}
      <div style={{ position: 'relative', paddingBottom: 30 }}>
        <LiquidGlassInput placeholder="Digite aqui" />
      </div>
    </div>
    <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
  </Frame>
);

// ============ Liquid Glass Input ============
const LiquidGlassInput = ({ placeholder = 'Digite aqui' }) => (
  <div
    style={{
      position: 'relative',
      borderRadius: 999,
      padding: '8px 8px 8px 8px',
      // liquid glass effect — translucent surface with blur + highlight
      background:
        'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(240,240,240,0.5) 50%, rgba(255,255,255,0.8) 100%)',
      backdropFilter: 'blur(16px) saturate(180%)',
      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      border: `1px solid rgba(10,10,10,0.12)`,
      boxShadow: `
      inset 0 1px 0 rgba(255,255,255,0.9),
      inset 0 -1px 1px rgba(0,0,0,0.05),
      0 2px 8px rgba(0,0,0,0.06),
      0 8px 24px rgba(0,0,0,0.08)
    `,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      overflow: 'hidden',
    }}
  >
    {/* specular highlight */}
    <div
      style={{
        position: 'absolute',
        top: 1,
        left: 20,
        right: 20,
        height: 14,
        borderRadius: 999,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0))',
        pointerEvents: 'none',
      }}
    />
    <PlayIcon size={42} />
    <span
      style={{
        flex: 1,
        fontSize: 15,
        color: C.mute,
        fontWeight: 400,
        letterSpacing: -0.1,
        position: 'relative',
      }}
    >
      {placeholder}
    </span>
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.faint,
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 9h12m0 0-4-4m4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  </div>
);

// ============ SCREEN 4: Home (retorno) ============
const S4_HomeReturn = () => (
  <Frame>
    <TopBar />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 14,
          paddingBottom: 30,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <PillButton>Chamar garçom</PillButton>
          <PillButton>Ver cardápio</PillButton>
          <PillButton variant="filled">↻ Repetir última visita</PillButton>
        </div>

        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              fontWeight: 500,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Assistente · reconheceu você
          </div>
          <div
            style={{
              fontSize: 20,
              lineHeight: 1.4,
              letterSpacing: -0.3,
              textWrap: 'pretty',
              color: C.ink,
              maxWidth: 320,
            }}
          >
            Bem-vindo de volta, Caleb. Da última vez você escolheu
            <b> risoto de camarão</b> e <b>suco de limão</b>. Posso sugerir algo parecido ou mostrar
            novidades.
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', paddingBottom: 30 }}>
        <LiquidGlassInput placeholder="Digite aqui" />
      </div>
    </div>
  </Frame>
);

// ============ MENU DATA (10 pratos + 20 bebidas) ============
const MENU_DATA = {
  Entradas: [
    {
      n: 'Bruschetta caprese',
      d: 'Pão rústico, tomate confit, muçarela de búfala, manjericão',
      p: '28,00',
      tags: ['vegetariano'],
    },
    {
      n: 'Tábua de frios',
      d: 'Queijos, embutidos, geleia de pimenta, pães artesanais',
      p: '88,00',
      tags: ['compartilhar'],
    },
    {
      n: 'Carpaccio tradicional',
      d: 'Filé mignon laminado, alcaparras, parmesão, rúcula',
      p: '54,00',
      tags: ['sem lactose'],
    },
  ],
  Principais: [
    {
      n: 'Filé ao vinho',
      d: 'Filé mignon ao ponto, redução de vinho tinto, purê rústico',
      p: '92,00',
      tags: ['★ mais pedido'],
    },
    {
      n: 'Salmão grelhado',
      d: 'Salmão fresco grelhado, legumes assados, molho de ervas',
      p: '86,00',
      tags: ['sem lactose', 'leve'],
    },
    {
      n: 'Polvo à lagareiro',
      d: 'Polvo grelhado, batatas ao murro, azeite, alho confitado',
      p: '118,00',
      tags: ['recomendado'],
    },
  ],
  Massas: [
    {
      n: 'Risoto de camarão',
      d: 'Arroz arbóreo, camarões VM, limão siciliano, azeite trufado',
      p: '78,00',
      tags: ['sem lactose', '★ mais pedido'],
    },
    {
      n: 'Spaghetti al funghi',
      d: 'Massa fresca, cogumelos frescos, parmesão, toque de trufa',
      p: '64,00',
      tags: ['vegetariano'],
    },
    {
      n: 'Lasagna bolonhesa',
      d: 'Massa caseira, ragu de carne, bechamel, parmesão 24 meses',
      p: '68,00',
      tags: [],
    },
    {
      n: 'Ravioli de burrata',
      d: 'Massa recheada, burrata cremosa, manteiga de sálvia, nozes',
      p: '74,00',
      tags: ['vegetariano', 'novo'],
    },
  ],
  Sobremesas: [
    {
      n: 'Petit gâteau',
      d: 'Bolo quente de chocolate meio amargo, sorvete de creme',
      p: '32,00',
      tags: ['★ mais pedido'],
    },
    {
      n: 'Tiramisù',
      d: 'Clássico italiano, mascarpone, café expresso, cacau',
      p: '28,00',
      tags: [],
    },
    {
      n: 'Sorbet de limão',
      d: 'Sorvete artesanal de limão siciliano, hortelã fresca',
      p: '22,00',
      tags: ['sem lactose', 'leve'],
    },
  ],

  // 20 BEBIDAS
  'Sem álcool': [
    { n: 'Água mineral sem gás', d: '500ml', p: '8,00' },
    { n: 'Água com gás', d: '500ml', p: '10,00' },
    { n: 'Suco de limão', d: 'Natural com ou sem açúcar · 400ml', p: '12,00' },
    { n: 'Suco de laranja', d: 'Espremido na hora · 400ml', p: '14,00' },
    { n: 'Suco de maracujá', d: 'Natural da fruta · 400ml', p: '14,00' },
    { n: 'Refrigerante lata', d: 'Coca, Guaraná, Sprite · 350ml', p: '8,00' },
    { n: 'Chá gelado de pêssego', d: 'Garrafa · 300ml', p: '10,00' },
    { n: 'Limonada suíça', d: 'Limão siciliano, leite condensado · 400ml', p: '16,00' },
  ],
  Cervejas: [
    {
      n: 'Chopp Pilsen',
      d: 'Chopp artesanal da casa · 500ml',
      p: '18,00',
      tags: ['★ mais pedido'],
    },
    { n: 'Chopp IPA', d: 'Lúpulo americano, amargor marcante · 500ml', p: '22,00' },
    { n: 'Heineken long neck', d: 'Garrafa · 330ml', p: '14,00' },
    { n: 'Corona long neck', d: 'Garrafa · 355ml', p: '16,00' },
  ],
  Drinks: [
    { n: 'Caipirinha', d: 'Cachaça artesanal, limão, açúcar', p: '24,00', tags: ['clássico'] },
    {
      n: 'Aperol Spritz',
      d: 'Aperol, prosecco, soda, laranja',
      p: '34,00',
      tags: ['★ mais pedido'],
    },
    { n: 'Negroni', d: 'Gin, Campari, vermute rosso', p: '32,00' },
    { n: 'Gin Tônica', d: 'Gin premium, tônica, especiarias', p: '38,00', tags: ['recomendado'] },
  ],
  'Vinhos & Espumantes': [
    { n: 'Taça vinho tinto da casa', d: 'Malbec argentino · 150ml', p: '22,00' },
    { n: 'Taça vinho branco', d: 'Chardonnay chileno · 150ml', p: '22,00' },
    { n: 'Taça espumante brut', d: 'Nacional · 150ml', p: '26,00' },
    {
      n: 'Garrafa vinho tinto',
      d: 'Consulte sommelier · 750ml',
      p: '148,00',
      tags: ['recomendado'],
    },
  ],
};

const CAT_ORDER_FOOD = ['Entradas', 'Principais', 'Massas', 'Sobremesas'];
const CAT_ORDER_DRINKS = ['Sem álcool', 'Cervejas', 'Drinks', 'Vinhos & Espumantes'];

// Card compacto de item (usado nas listas)
const MenuItemRow = ({ it, compact }) => (
  <div
    style={{
      display: 'flex',
      gap: 14,
      padding: '14px 0',
      borderBottom: `1px solid ${C.borderSoft}`,
    }}
  >
    {!compact && <FoodPlaceholder label="foto" h={84} style={{ width: 84, borderRadius: 12 }} />}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2, marginBottom: 3 }}>
          {it.n}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          R$ {it.p}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: C.mute,
          lineHeight: 1.4,
          marginBottom: 6,
          textWrap: 'pretty',
        }}
      >
        {it.d}
      </div>
      {it.tags && it.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {it.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 999,
                border: `1px solid ${C.border}`,
                color: C.ink,
                fontWeight: 500,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ============ SCREEN 5: Cardápio (pratos) ============
const S5_Menu = () => {
  const [active, setActive] = useState('Principais');
  return (
    <Frame>
      <TopBar />
      <div style={{ padding: '4px 22px 10px', flexShrink: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Cardápio</div>
      </div>

      {/* Toggle Comida / Bebida */}
      <div style={{ padding: '0 22px 10px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            padding: 4,
            background: C.surface,
            borderRadius: 999,
            border: `1px solid ${C.borderSoft}`,
          }}
        >
          <div
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 999,
              background: C.ink,
              color: '#fff',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Comida
          </div>
          <div
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 999,
              color: C.mute,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Bebidas · 20
          </div>
        </div>
      </div>

      <div style={{ padding: '0 22px 10px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 999,
            border: `1.3px solid ${C.border}`,
            background: '#fff',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke={C.ink} strokeWidth="1.3" />
            <path d="m9.5 9.5 3 3" stroke={C.ink} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span style={{ color: C.faint, fontSize: 14 }}>Buscar pratos, ingredientes…</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '6px 22px 10px',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {CAT_ORDER_FOOD.map((c) => (
          <div
            key={c}
            onClick={() => setActive(c)}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              background: active === c ? C.ink : '#fff',
              color: active === c ? '#fff' : C.ink,
              border: `1.2px solid ${C.ink}`,
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {c} · {MENU_DATA[c].length}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 22px 20px' }}>
        <div
          style={{
            fontSize: 11,
            color: C.mute,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            padding: '8px 0 4px',
          }}
        >
          {active} · {MENU_DATA[active].length} opções
        </div>
        {MENU_DATA[active].map((it, i) => (
          <MenuItemRow key={i} it={it} />
        ))}
      </div>
    </Frame>
  );
};

// ============ SCREEN 5b: Cardápio (Bebidas) ============
const S5b_Drinks = () => {
  return (
    <Frame>
      <TopBar />
      <div style={{ padding: '4px 22px 10px', flexShrink: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Cardápio</div>
      </div>

      <div style={{ padding: '0 22px 10px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            padding: 4,
            background: C.surface,
            borderRadius: 999,
            border: `1px solid ${C.borderSoft}`,
          }}
        >
          <div
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 999,
              color: C.mute,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Comida · 13
          </div>
          <div
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 999,
              background: C.ink,
              color: '#fff',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Bebidas
          </div>
        </div>
      </div>

      <div style={{ padding: '0 22px 10px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 999,
            border: `1.3px solid ${C.border}`,
            background: '#fff',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke={C.ink} strokeWidth="1.3" />
            <path d="m9.5 9.5 3 3" stroke={C.ink} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span style={{ color: C.faint, fontSize: 14 }}>Buscar bebidas…</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '6px 22px 10px',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {CAT_ORDER_DRINKS.map((c, i) => (
          <div
            key={c}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: i === 0 ? C.ink : '#fff',
              color: i === 0 ? '#fff' : C.ink,
              border: `1.2px solid ${C.ink}`,
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {c} · {MENU_DATA[c].length}
          </div>
        ))}
      </div>

      {/* Lista por seções — mostra tudo */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 22px 20px' }}>
        {CAT_ORDER_DRINKS.map((cat) => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                color: C.mute,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                padding: '12px 0 4px',
                position: 'sticky',
                top: 0,
                background: C.bg,
                zIndex: 1,
              }}
            >
              {cat} · {MENU_DATA[cat].length}
            </div>
            {MENU_DATA[cat].map((it, i) => (
              <MenuItemRow key={i} it={it} compact />
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
};

// ============ SCREEN 5c: Busca sem resultados ============
const S5c_EmptySearch = () => (
  <Frame>
    <TopBar />
    <div style={{ padding: '4px 22px 10px', flexShrink: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Cardápio</div>
    </div>
    <div style={{ padding: '0 22px 10px', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderRadius: 999,
          border: `1.3px solid ${C.ink}`,
          background: '#fff',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke={C.ink} strokeWidth="1.3" />
          <path d="m9.5 9.5 3 3" stroke={C.ink} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span style={{ color: C.ink, fontSize: 14, flex: 1 }}>sushi</span>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: C.surface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: C.mute,
          }}
        >
          ×
        </div>
      </div>
    </div>

    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        gap: 18,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          border: `1.5px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.faint,
          fontSize: 28,
        }}
      >
        ○
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3, marginBottom: 6 }}>
          Nada encontrado para "sushi"
        </div>
        <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, textWrap: 'pretty' }}>
          Somos uma trattoria italiana. Que tal pedir sugestão para nosso assistente?
        </div>
      </div>
      <PillButton variant="filled" style={{ marginTop: 4 }}>
        ✦ Perguntar à IA
      </PillButton>
    </div>
  </Frame>
);

// ============ SCREEN 6: Detalhe do prato ============
const S6_ItemDetail = () => (
  <Frame hideStatusBar>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ position: 'relative' }}>
        <FoodPlaceholder
          label="foto do prato"
          h={280}
          style={{ borderRadius: '42px 42px 0 0', border: 'none' }}
        />
        <div
          style={{
            position: 'absolute',
            top: 50,
            left: 18,
            width: 36,
            height: 36,
            borderRadius: 18,
            background: '#fff',
            border: `1.2px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 2 3 7l6 5"
              stroke={C.ink}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div style={{ padding: 22 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <span
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              fontWeight: 500,
            }}
          >
            recomendado
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              fontWeight: 500,
            }}
          >
            sem lactose
          </span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, marginBottom: 4, letterSpacing: -0.6 }}>
          Risoto de camarão
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            marginBottom: 16,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          R$ 78,00
        </div>
        <div
          style={{
            fontSize: 14,
            color: C.mute,
            lineHeight: 1.6,
            marginBottom: 20,
            textWrap: 'pretty',
          }}
        >
          Arroz arbóreo cremoso preparado no caldo de camarão, finalizado com camarões VM grelhados,
          raspas de limão siciliano e azeite trufado.
        </div>

        <Section title="Ingredientes">
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Arroz arbóreo, camarão VM, manteiga, vinho branco, limão siciliano, azeite trufado,
            caldo de camarão.
          </div>
        </Section>

        <Section title="Alergênicos">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Crustáceos', 'Sulfitos'].map((a) => (
              <span
                key={a}
                style={{
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: `1px solid ${C.border}`,
                }}
              >
                {a}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Observação">
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: `1.2px dashed ${C.borderSoft}`,
              fontSize: 13,
              color: C.faint,
              minHeight: 40,
            }}
          >
            Ex: sem cebola, ponto da carne…
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <PillButton style={{ flex: 1, padding: '13px 20px' }}>Perguntar à IA</PillButton>
        </div>
        <PillButton variant="filled" style={{ width: '100%' }}>
          Adicionar ao pedido · R$ 78,00
        </PillButton>
      </div>
    </div>
  </Frame>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: C.mute,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

// ============ SCREEN 6b: Review do Pedido (antes de enviar) ============
const S6b_ReviewOrder = () => {
  const items = [
    { q: 1, n: 'Risoto de camarão', p: 78, note: 'Sem cebola, ponto ao dente' },
    { q: 2, n: 'Suco de limão', p: 12, note: 'Pouco açúcar' },
    { q: 1, n: 'Bruschetta caprese', p: 28 },
  ];
  const total = items.reduce((s, i) => s + i.q * i.p, 0);
  return (
    <Frame>
      <TopBar />
      <div style={{ padding: '4px 22px 6px', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: C.mute,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Antes de enviar
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Revise seu pedido</div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>
          Confira os itens antes de mandar para a cozinha.
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 22px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              padding: '14px 0',
              borderBottom: `1px solid ${C.borderSoft}`,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: '#fff',
                  border: `1.2px solid ${C.ink}`,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.ink,
                }}
              >
                −
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.q}</div>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: C.ink,
                  border: `1.2px solid ${C.ink}`,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                +
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.1 }}>{it.n}</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  R$ {(it.q * it.p).toFixed(2).replace('.', ',')}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.mute, marginBottom: 6 }}>
                R$ {it.p.toFixed(2).replace('.', ',')} cada
              </div>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1.2px ${it.note ? 'solid' : 'dashed'} ${it.note ? C.borderSoft : C.faint}`,
                  fontSize: 12,
                  color: it.note ? C.ink : C.faint,
                  fontStyle: it.note ? 'normal' : 'italic',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{it.note || '+ adicionar observação'}</span>
                {it.note && (
                  <span style={{ fontSize: 11, color: C.mute, textDecoration: 'underline' }}>
                    editar
                  </span>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: 16,
                color: C.faint,
                paddingTop: 2,
                cursor: 'pointer',
              }}
            >
              ×
            </div>
          </div>
        ))}

        <div
          style={{
            marginTop: 14,
            padding: '14px 16px',
            borderRadius: 14,
            border: `1.3px dashed ${C.borderSoft}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: C.mute,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 16 }}>+</span>
          <span>Adicionar mais um item</span>
        </div>

        <div style={{ marginTop: 22, padding: '16px 0', borderTop: `1.3px solid ${C.ink}` }}>
          <Row l="Subtotal" v={`R$ ${total.toFixed(2).replace('.', ',')}`} />
          <Row l="Taxa de serviço (10%)" v={`R$ ${(total * 0.1).toFixed(2).replace('.', ',')}`} />
          <div style={{ height: 10 }} />
          <Row
            l={<b style={{ fontSize: 16, color: C.ink }}>Total estimado</b>}
            v={
              <b style={{ fontSize: 20, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                R$ {(total * 1.1).toFixed(2).replace('.', ',')}
              </b>
            }
          />
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: C.surface,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            fontSize: 11,
            color: C.mute,
            lineHeight: 1.5,
            textWrap: 'pretty',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: 12 }}>ⓘ</span>
          <span>
            Após confirmar, você terá <b style={{ color: C.ink }}>15 segundos</b> para revisar antes
            do pedido ir para a cozinha.
          </span>
        </div>
      </div>
      <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <PillButton style={{ flex: 1 }}>Adicionar mais</PillButton>
        <PillButton variant="filled" style={{ flex: 2 }}>
          Enviar para cozinha →
        </PillButton>
      </div>
    </Frame>
  );
};

// ============ SCREEN 6c: Confirmação com countdown 15s ============
const S6c_ConfirmCountdown = () => {
  const items = [
    { q: 1, n: 'Risoto de camarão', p: 78, note: 'Sem cebola, ponto ao dente' },
    { q: 2, n: 'Suco de limão', p: 12, note: 'Pouco açúcar' },
    { q: 1, n: 'Bruschetta caprese', p: 28 },
  ];
  const [reveal, setReveal] = useState(0);
  const [seconds, setSeconds] = useState(15);

  useEffect(() => {
    // reveal items one by one (first item at 0s, then 1, 2...)
    const timers = items.map((_, i) =>
      setTimeout(() => setReveal((r) => Math.max(r, i + 1)), i * 2200 + 200),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const pct = ((15 - seconds) / 15) * 100;
  const total = items.reduce((s, i) => s + i.q * i.p, 0) * 1.1;

  return (
    <Frame>
      <TopBar />

      {/* Progress bar linear em cima */}
      <div style={{ padding: '0 22px', flexShrink: 0 }}>
        <div style={{ height: 3, background: C.borderSoft, borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: C.ink,
              transition: 'width 1s linear',
            }}
          />
        </div>
      </div>

      <div style={{ padding: '16px 22px 6px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: C.mute,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Confirmando pedido
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5 }}>
              Você tem {seconds}s para revisar
            </div>
          </div>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              border: `2px solid ${C.ink}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 600,
              color: C.ink,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {seconds}
            <div
              style={{
                position: 'absolute',
                inset: -4,
                borderRadius: 33,
                border: `2px solid ${C.ink}`,
                clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.cos((pct / 100) * 2 * Math.PI - Math.PI / 2)}% ${50 + 50 * Math.sin((pct / 100) * 2 * Math.PI - Math.PI / 2)}%, 100% 0%)`,
                opacity: 0.15,
              }}
            />
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.mute, textWrap: 'pretty' }}>
          Seus itens estão sendo organizados. Confira cada um abaixo.
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 20px' }}>
        {items.map((it, i) => {
          const shown = i < reveal;
          return (
            <div
              key={i}
              style={{
                padding: '16px 0',
                borderBottom: i < items.length - 1 ? `1px solid ${C.borderSoft}` : 'none',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                opacity: shown ? 1 : 0,
                transform: shown ? 'translateY(0)' : 'translateY(12px)',
                transition: 'opacity 0.5s ease, transform 0.5s ease',
                filter: shown ? 'blur(0)' : 'blur(4px)',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: shown ? C.ink : '#fff',
                  color: shown ? '#fff' : C.faint,
                  border: `1.3px solid ${shown ? C.ink : C.borderSoft}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {it.q}×
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: -0.2 }}>{it.n}</div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                  >
                    R$ {(it.q * it.p).toFixed(2).replace('.', ',')}
                  </div>
                </div>
                {it.note && (
                  <div
                    style={{
                      fontSize: 12,
                      color: C.mute,
                      fontStyle: 'italic',
                      marginTop: 2,
                      lineHeight: 1.4,
                      textWrap: 'pretty',
                    }}
                  >
                    obs: {it.note}
                  </div>
                )}
              </div>
              {shown && (
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: C.success,
                    color: '#fff',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    animation: 'pop 0.4s ease',
                  }}
                >
                  ✓
                </div>
              )}
            </div>
          );
        })}

        {reveal >= items.length && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              background: C.surface,
              border: `1px solid ${C.borderSoft}`,
              fontSize: 13,
              color: C.ink,
              textWrap: 'pretty',
              lineHeight: 1.45,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              animation: 'fadeIn 0.5s ease',
            }}
          >
            <span style={{ fontSize: 14 }}>✦</span>
            <div>
              <b>Tudo certo?</b> Total de{' '}
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>
                R$ {total.toFixed(2).replace('.', ',')}
              </b>
              . O pedido será enviado automaticamente em {seconds}s, ou confirme agora.
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <PillButton style={{ flex: 1 }}>← Editar</PillButton>
        <PillButton variant="filled" style={{ flex: 2 }}>
          Confirmar agora
        </PillButton>
      </div>

      <style>{`
        @keyframes pop {
          0% { transform: scale(0); }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Frame>
  );
};

// ============ SCREEN 6d: Pedido enviado (sucesso) ============
const S6d_OrderSent = () => (
  <Frame>
    <TopBar />
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 24px 20px',
        overflow: 'auto',
      }}
    >
      {/* Success mark */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 20,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            border: `2px solid ${C.success}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.success,
            fontSize: 36,
            marginBottom: 20,
            animation: 'pop 0.5s ease',
          }}
        >
          ✓
        </div>
        <div
          style={{
            fontSize: 11,
            color: C.success,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Enviado para a cozinha
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.5,
            textAlign: 'center',
            textWrap: 'pretty',
            lineHeight: 1.2,
          }}
        >
          Seu pedido está a caminho
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.mute,
            textAlign: 'center',
            marginTop: 8,
            textWrap: 'pretty',
            maxWidth: 280,
          }}
        >
          Estamos preparando tudo. Você vai acompanhar o progresso em tempo real.
        </div>
      </div>

      {/* Tempo estimado */}
      <div
        style={{
          padding: 18,
          border: `1.5px solid ${C.ink}`,
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            border: `1.5px solid ${C.ink}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          ◷
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Tempo estimado
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: -0.4,
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            22–28 minutos
          </div>
        </div>
      </div>

      {/* Status do pedido em etapas */}
      <div
        style={{
          fontSize: 11,
          color: C.mute,
          fontWeight: 600,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Progresso
      </div>
      <div style={{ paddingLeft: 4, marginBottom: 22 }}>
        {[
          { l: 'Recebido pela cozinha', t: 'agora', done: true, active: true },
          { l: 'Em preparo', t: 'em ~2 min', done: false },
          { l: 'Pronto para servir', t: 'em ~25 min', done: false },
          { l: 'Na sua mesa', t: 'em ~28 min', done: false },
        ].map((s, i, a) => (
          <div key={i} style={{ display: 'flex', gap: 14, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: s.done ? C.ink : '#fff',
                  border: `1.5px solid ${s.done || s.active ? C.ink : C.borderSoft}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 10,
                  flexShrink: 0,
                  animation: s.active ? 'pulse 2s infinite' : 'none',
                }}
              >
                {s.done && '✓'}
              </div>
              {i < a.length - 1 && (
                <div
                  style={{
                    width: 1.5,
                    flex: 1,
                    minHeight: 26,
                    background: s.done ? C.ink : C.borderSoft,
                  }}
                />
              )}
            </div>
            <div style={{ paddingBottom: 18, flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: s.active ? 600 : 500,
                  color: s.done || s.active ? C.ink : C.faint,
                }}
              >
                {s.l}
              </div>
              <div style={{ fontSize: 11, color: C.mute, marginTop: 1 }}>{s.t}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Itens enviados (resumo) */}
      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          fontSize: 12,
          color: C.mute,
          lineHeight: 1.6,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6 }}>3 itens · R$ 143,00</div>
        1× Risoto de camarão · 2× Suco de limão · 1× Bruschetta caprese
      </div>
    </div>

    <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
      <PillButton style={{ flex: 1 }}>Ver cardápio</PillButton>
      <PillButton variant="filled" style={{ flex: 1 }}>
        Acompanhar
      </PillButton>
    </div>

    <style>{`
      @keyframes pop { 0% { transform: scale(0); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
      @keyframes pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(10,10,10,0.3); }
        50% { box-shadow: 0 0 0 8px rgba(10,10,10,0); }
      }
    `}</style>
  </Frame>
);

// ============ SCREEN 7b: Pedido vazio (empty state) ============
const S7b_EmptyOrder = () => (
  <Frame>
    <TopBar />
    <div style={{ padding: '4px 22px 12px', flexShrink: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Meu pedido</div>
    </div>
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        gap: 20,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          border: `1.5px dashed ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.faint,
          fontSize: 30,
        }}
      >
        ◉
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, marginBottom: 6 }}>
          Você ainda não pediu nada
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.mute,
            lineHeight: 1.5,
            textWrap: 'pretty',
            maxWidth: 260,
          }}
        >
          Explore o cardápio ou peça uma sugestão personalizada para o assistente.
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 4,
          width: '100%',
          maxWidth: 260,
        }}
      >
        <PillButton variant="filled" style={{ width: '100%' }}>
          Ver cardápio
        </PillButton>
        <PillButton style={{ width: '100%' }}>✦ Pedir sugestão à IA</PillButton>
      </div>
    </div>
  </Frame>
);

// ============ SCREEN 7: Meu Pedido ============
const S7_Order = () => (
  <Frame>
    <TopBar />
    <div style={{ padding: '4px 22px 12px', flexShrink: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Meu pedido</div>
      <div
        style={{
          fontSize: 12,
          color: C.mute,
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 3, background: C.success }} />
        Em preparo · há 8 min
      </div>
    </div>
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '0 22px 20px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {[
        { q: 1, n: 'Risoto de camarão', p: 78, note: 'Sem cebola' },
        { q: 2, n: 'Suco de limão', p: 12 },
        { q: 1, n: 'Bruschetta caprese', p: 28 },
      ].map((it, i) => (
        <div
          key={i}
          style={{
            padding: '16px 0',
            borderBottom: `1px solid ${C.borderSoft}`,
            display: 'flex',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: '#fff',
              border: `1.2px solid ${C.ink}`,
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {it.q}×
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{it.n}</div>
            {it.note && (
              <div style={{ fontSize: 11, color: C.mute, fontStyle: 'italic', marginTop: 2 }}>
                obs: {it.note}
              </div>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            R$ {(it.q * it.p).toFixed(2).replace('.', ',')}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 18, padding: '16px 0', borderTop: `1.3px solid ${C.ink}` }}>
        <Row l="Subtotal" v="R$ 130,00" />
        <Row l="Taxa de serviço (10%)" v="R$ 13,00" />
        <div style={{ height: 10 }} />
        <Row
          l={<b style={{ fontSize: 16, color: C.ink }}>Total</b>}
          v={
            <b style={{ fontSize: 20, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
              R$ 143,00
            </b>
          }
        />
      </div>
    </div>
    <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
      <PillButton style={{ flex: 1 }}>Garçom</PillButton>
      <PillButton variant="filled" style={{ flex: 2 }}>
        Ir para pagamento
      </PillButton>
    </div>
  </Frame>
);

const Row = ({ l, v }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '4px 0',
      fontSize: 13,
      color: C.mute,
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    <span>{l}</span>
    <span>{v}</span>
  </div>
);

// ============ SCREEN 8: Assistente IA ============
const S8_Assistant = () => (
  <Frame>
    <TopBar restaurant="Assistente" table="Trattoria Luna · Mesa 12" showMenu={false} />
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px 22px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Bubble role="ai">
        Olá, Caleb. Posso ajudar com sugestões, ingredientes, alergênicos, harmonizações, pedido e
        pagamento. O que você gostaria?
      </Bubble>
      <Bubble role="user">Quais pratos não têm lactose?</Bubble>
      <Bubble role="ai">
        Temos 5 opções sem lactose hoje: <b>Risoto de camarão</b>, <b>Filé ao vinho</b>,{' '}
        <b>Salada mediterrânea</b>, <b>Carpaccio</b> e <b>Sorbet de limão</b>. Quer detalhes de
        algum?
      </Bubble>
      <Bubble role="user">Como faço programação em Python?</Bubble>
      <Bubble role="ai" blocked>
        Sou o assistente do Trattoria Luna e posso te ajudar com pratos, ingredientes, sugestões,
        pedidos, pagamento e atendimento. Perguntas fora desse contexto não são permitidas.
      </Bubble>
    </div>

    <div style={{ padding: '6px 22px 0', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          margin: '0 -22px',
          padding: '0 22px 8px',
        }}
      >
        {['Sugestão leve', 'Sobremesa combina?', 'Pratos com camarão', 'Como pagar?'].map((s) => (
          <div
            key={s}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              background: '#fff',
              border: `1.2px solid ${C.border}`,
              fontSize: 12,
              color: C.ink,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>

    <div style={{ padding: '8px 22px 26px', flexShrink: 0 }}>
      <LiquidGlassInput placeholder="Digite aqui" />
    </div>
  </Frame>
);

const Bubble = ({ role, blocked, children }) => {
  if (role === 'user') {
    return (
      <div
        style={{
          alignSelf: 'flex-end',
          maxWidth: '82%',
          background: C.ink,
          color: '#fff',
          padding: '11px 15px',
          borderRadius: 18,
          borderBottomRightRadius: 4,
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '86%',
        background: blocked ? '#fdf2f2' : '#fff',
        color: blocked ? '#7a1f1f' : C.ink,
        padding: '11px 15px',
        borderRadius: 18,
        borderBottomLeftRadius: 4,
        fontSize: 14,
        lineHeight: 1.5,
        textWrap: 'pretty',
        border: `1.2px solid ${blocked ? C.danger : C.border}`,
      }}
    >
      {blocked && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: C.danger,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          Fora de escopo
        </div>
      )}
      {children}
    </div>
  );
};

// ============ SCREEN 9: Pagamento ============
const S9_Payment = () => (
  <Frame>
    <TopBar />
    <div style={{ padding: '4px 22px 10px', flexShrink: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Pagar conta</div>
      <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>Mesa 12 · 3 itens</div>
    </div>
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '4px 22px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div style={{ padding: '12px 16px', border: `1.3px solid ${C.border}`, borderRadius: 18 }}>
        <Row l="Risoto de camarão (1×)" v="R$ 78,00" />
        <Row l="Suco de limão (2×)" v="R$ 24,00" />
        <Row l="Bruschetta caprese (1×)" v="R$ 28,00" />
        <div style={{ height: 1, background: C.borderSoft, margin: '10px 0' }} />
        <Row l="Subtotal" v="R$ 130,00" />
        <Row l="Taxa 10%" v="R$ 13,00" />
        <div style={{ height: 6 }} />
        <Row
          l={<b style={{ fontSize: 15, color: C.ink }}>Total</b>}
          v={
            <b style={{ fontSize: 19, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
              R$ 143,00
            </b>
          }
        />
      </div>

      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Forma de pagamento
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { l: 'Pix', d: 'QR Code · aprovação imediata', sel: true },
            { l: 'Cartão de crédito', d: 'Visa, Master, Elo' },
            { l: 'Cartão de débito', d: 'Débito em conta' },
          ].map((m, i) => (
            <div
              key={i}
              style={{
                padding: '14px 16px',
                borderRadius: 14,
                background: '#fff',
                border: `1.3px solid ${m.sel ? C.ink : C.borderSoft}`,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{m.l}</div>
                <div style={{ fontSize: 11, color: C.mute }}>{m.d}</div>
              </div>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  border: `1.5px solid ${m.sel ? C.ink : C.borderSoft}`,
                  background: m.sel ? C.ink : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {m.sel ? '✓' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{ padding: '10px 22px 26px', flexShrink: 0 }}>
      <PillButton variant="filled" style={{ width: '100%' }}>
        Gerar QR Code Pix · R$ 143,00
      </PillButton>
    </div>
  </Frame>
);

// ============ SCREEN 10: Feedback ============
const S10_Feedback = () => (
  <Frame>
    <div
      style={{
        padding: '14px 22px 6px',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <span style={{ fontSize: 12, color: C.mute, textDecoration: 'underline' }}>Agora não</span>
    </div>
    <div
      style={{
        flex: 1,
        padding: '16px 24px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          border: `1.5px solid ${C.success}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.success,
          fontSize: 24,
        }}
      >
        ✓
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 11,
            color: C.success,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            marginBottom: 10,
          }}
        >
          Pagamento confirmado
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            textWrap: 'pretty',
            lineHeight: 1.2,
            letterSpacing: -0.5,
          }}
        >
          Como foi sua experiência?
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 8, textWrap: 'pretty' }}>
          Sua opinião nos ajuda a melhorar.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              background: n <= 4 ? C.ink : '#fff',
              color: n <= 4 ? '#fff' : C.faint,
              border: `1.2px solid ${n <= 4 ? C.ink : C.borderSoft}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            ★
          </div>
        ))}
      </div>

      <div style={{ width: '100%' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: C.mute,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          O que você mais gostou?
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Comida', 'Atendimento', 'Ambiente', 'Rapidez', 'Assistente IA'].map((t, i) => (
            <span
              key={t}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                background: i < 2 ? C.ink : '#fff',
                color: i < 2 ? '#fff' : C.ink,
                border: `1.2px solid ${C.ink}`,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 14,
          border: `1.2px dashed ${C.borderSoft}`,
          fontSize: 13,
          color: C.faint,
          minHeight: 70,
        }}
      >
        Conte mais sobre sua experiência (opcional)…
      </div>
    </div>
    <div style={{ padding: '10px 22px 26px', flexShrink: 0 }}>
      <PillButton variant="filled" style={{ width: '100%' }}>
        Enviar avaliação
      </PillButton>
    </div>
  </Frame>
);

// ============ SAFARI iOS MOCKUPS ============
// Real iPhone viewport: 390×844. Safari chrome:
//  - status bar: 47px (safe-area-inset-top on iPhone 14/15)
//  - bottom address bar: ~56px (default in iOS 15+)
//  - home indicator: 34px (safe-area-inset-bottom)
//  - keyboard: ~291px when open (varies by type)
// Effective usable height WITHOUT keyboard: 844 - 47 - 56 - 34 ≈ 707px
// WITH keyboard + input: 844 - 47 - 56 - 291 ≈ 450px → critical!

const SafariChrome = ({ withKeyboard, url = 'trattoria-luna.app/mesa/12' }) => (
  <>
    {/* Status bar */}
    <div
      style={{
        height: 47,
        padding: '12px 22px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 14,
        fontWeight: 600,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <span>9:41</span>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 10,
          transform: 'translateX(-50%)',
          width: 110,
          height: 30,
          borderRadius: 15,
          background: C.ink,
        }}
      />
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
        <span>●●●●</span>
        <span>􀙇</span>
        <span>100%</span>
      </div>
    </div>
  </>
);

const SafariBottomBar = ({ withTabs = true, compressed }) => (
  <div
    style={{
      background: 'rgba(246,246,246,0.94)',
      backdropFilter: 'blur(20px)',
      borderTop: `0.5px solid rgba(0,0,0,0.2)`,
      flexShrink: 0,
      padding: compressed ? '6px 12px 4px' : '8px 12px 4px',
    }}
  >
    {/* URL bar */}
    <div
      style={{
        background: '#e3e2e8',
        borderRadius: 12,
        padding: compressed ? '6px 12px' : '9px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: compressed ? 0 : 6,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M8 5V3.5a2 2 0 0 0-4 0V5m-1 0h6v5H3V5Z"
          stroke="#333"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          fontSize: 13,
          color: '#1d1d1f',
          flex: 1,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          fontFamily: '-apple-system, SF Pro Text, sans-serif',
        }}
      >
        trattoria-luna.app
      </span>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M4 2v4h2l-3 4-3-4h2V2M9 12V8h-2l3-4 3 4h-2v4"
          stroke="#333"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
    {!compressed && withTabs && (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          paddingTop: 4,
          color: '#007aff',
          fontSize: 22,
        }}
      >
        <span>‹</span>
        <span>›</span>
        <span>⬆</span>
        <span>⧉</span>
        <span>⎙</span>
      </div>
    )}
    {/* Home indicator */}
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: compressed ? 4 : 8,
        paddingBottom: 4,
      }}
    >
      <div style={{ width: 134, height: 5, borderRadius: 3, background: C.ink }} />
    </div>
  </div>
);

// Safari — home do app rodando dentro do navegador real (URL bar em baixo)
const S11_SafariHome = () => (
  <div
    style={{
      width: 390,
      height: 844,
      background: C.bg,
      color: C.ink,
      fontFamily: FONT,
      border: `1.5px solid ${C.border}`,
      borderRadius: 44,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <SafariChrome />
    {/* App content */}
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 24px',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '8px 0 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>Trattoria Luna</div>
        <div style={{ fontSize: 11, color: C.mute, marginTop: 1, letterSpacing: 0.5 }}>Mesa 12</div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <PillButton>Chamar garçom</PillButton>
          <PillButton>Ver cardápio</PillButton>
        </div>
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              fontWeight: 500,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Assistente
          </div>
          <div
            style={{
              fontSize: 19,
              lineHeight: 1.4,
              letterSpacing: -0.3,
              textWrap: 'pretty',
              color: C.ink,
            }}
          >
            Olá, Caleb. Seja bem-vindo ao Trattoria Luna. Posso ajudar com sugestões, ingredientes,
            pedido e pagamento.
          </div>
        </div>
      </div>
      {/* App input above Safari chrome — uses env(safe-area-inset-bottom) */}
      <div style={{ paddingBottom: 12 }}>
        <LiquidGlassInput placeholder="Digite aqui" />
      </div>
    </div>
    <SafariBottomBar />
  </div>
);

// Safari com teclado aberto — app precisa colapsar
const S12_SafariKeyboard = () => (
  <div
    style={{
      width: 390,
      height: 844,
      background: C.bg,
      color: C.ink,
      fontFamily: FONT,
      border: `1.5px solid ${C.border}`,
      borderRadius: 44,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <SafariChrome />
    {/* App content — muito mais comprimido */}
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 24px',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '6px 0 10px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>Trattoria Luna</div>
        <div style={{ fontSize: 11, color: C.mute, letterSpacing: 0.5 }}>Mesa 12</div>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            alignSelf: 'flex-start',
            maxWidth: '86%',
            background: '#fff',
            color: C.ink,
            padding: '10px 14px',
            borderRadius: 16,
            borderBottomLeftRadius: 4,
            fontSize: 13,
            lineHeight: 1.4,
            border: `1.2px solid ${C.border}`,
          }}
        >
          Olá, Caleb. O que você gostaria de saber?
        </div>
        <div
          style={{
            alignSelf: 'flex-end',
            maxWidth: '82%',
            background: C.ink,
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 16,
            borderBottomRightRadius: 4,
            fontSize: 13,
          }}
        >
          Quais pratos sem lactose?
        </div>
      </div>
      {/* Input fica colado ao topo do teclado */}
      <div style={{ paddingTop: 10, paddingBottom: 8 }}>
        <LiquidGlassInput placeholder="Digite aqui" />
      </div>
    </div>
    {/* Safari barra COMPRIMIDA quando teclado está aberto */}
    <SafariBottomBar compressed />
    {/* Teclado iOS */}
    <IosKeyboard />
  </div>
);

const IosKeyboard = () => {
  const row1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const row3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
  return (
    <div
      style={{
        background: '#d1d4da',
        padding: '8px 3px 6px',
        flexShrink: 0,
        fontFamily: '-apple-system, SF Pro Text, sans-serif',
      }}
    >
      {[row1, row2, row3].map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 10,
            paddingLeft: ri === 1 ? 20 : 0,
            paddingRight: ri === 1 ? 20 : 0,
          }}
        >
          {ri === 2 && (
            <div
              style={{
                minWidth: 42,
                padding: '10px 6px',
                background: '#adb3bd',
                borderRadius: 5,
                fontSize: 16,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ⇧
            </div>
          )}
          {row.map((k) => (
            <div
              key={k}
              style={{
                flex: 1,
                padding: '10px 0',
                background: '#fff',
                borderRadius: 5,
                textAlign: 'center',
                fontSize: 20,
                fontWeight: 400,
                boxShadow: '0 1px 0 rgba(0,0,0,0.35)',
                color: '#000',
              }}
            >
              {k}
            </div>
          ))}
          {ri === 2 && (
            <div
              style={{
                minWidth: 42,
                padding: '10px 6px',
                background: '#adb3bd',
                borderRadius: 5,
                fontSize: 14,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ⌫
            </div>
          )}
        </div>
      ))}
      {/* Bottom row */}
      <div style={{ display: 'flex', gap: 6, padding: '0 3px', marginBottom: 6 }}>
        <div
          style={{
            minWidth: 60,
            padding: '10px 6px',
            background: '#adb3bd',
            borderRadius: 5,
            fontSize: 13,
            textAlign: 'center',
            fontWeight: 500,
          }}
        >
          123
        </div>
        <div
          style={{
            width: 36,
            padding: '10px 6px',
            background: '#adb3bd',
            borderRadius: 5,
            fontSize: 16,
            textAlign: 'center',
          }}
        >
          🙂
        </div>
        <div
          style={{
            flex: 1,
            padding: '10px 6px',
            background: '#fff',
            borderRadius: 5,
            fontSize: 13,
            textAlign: 'center',
            color: '#000',
          }}
        >
          espaço
        </div>
        <div
          style={{
            minWidth: 80,
            padding: '10px 6px',
            background: '#007aff',
            borderRadius: 5,
            fontSize: 14,
            color: '#fff',
            textAlign: 'center',
            fontWeight: 500,
          }}
        >
          enviar
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4, paddingBottom: 4 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: '#000' }} />
      </div>
    </div>
  );
};

// Specs diagram — safe areas, bandas críticas
const S13_SafeAreaSpec = () => {
  const band = (h, color, label, px) => (
    <div
      style={{
        height: h,
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: 11,
        color: '#fff',
        fontWeight: 500,
        letterSpacing: 0.3,
        borderBottom: '1px dashed rgba(255,255,255,0.3)',
        fontFamily: 'ui-monospace, SF Mono, monospace',
      }}
    >
      <span>{label}</span>
      <span style={{ opacity: 0.7 }}>{px}px</span>
    </div>
  );
  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: C.bg,
        color: C.ink,
        fontFamily: FONT,
        border: `1.5px solid ${C.border}`,
        borderRadius: 44,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {band(47, '#c43a3a', 'SAFE AREA TOP · status bar', 47)}
      <div
        style={{
          flex: 1,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflow: 'auto',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>Regras Safari iOS</div>
        <ul style={{ fontSize: 12, lineHeight: 1.6, color: C.ink, paddingLeft: 18, margin: 0 }}>
          <li>
            Usar{' '}
            <code
              style={{ background: '#f0f0f0', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}
            >
              100dvh
            </code>{' '}
            em vez de 100vh (reflete chrome dinâmico)
          </li>
          <li>
            Input ancorado com{' '}
            <code
              style={{ background: '#f0f0f0', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}
            >
              env(safe-area-inset-bottom)
            </code>
          </li>
          <li>
            Usar{' '}
            <code
              style={{ background: '#f0f0f0', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}
            >
              visualViewport
            </code>{' '}
            API para detectar teclado
          </li>
          <li>Padding mínimo 34px no bottom sempre (home indicator)</li>
          <li>
            Inputs com{' '}
            <code
              style={{ background: '#f0f0f0', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}
            >
              font-size: 16px+
            </code>{' '}
            evita zoom automático
          </li>
          <li>Testar: iPhone SE (375×667), iPhone 14 (390×844), 14 Pro Max (430×932)</li>
        </ul>
        <div style={{ fontSize: 11, color: C.mute, marginTop: 6 }}>
          Setas → áreas coloridas mostram zonas reservadas pelo sistema.
          <br />
          Nunca colocar CTA ou input dentro delas sem padding.
        </div>
        <div
          style={{
            border: `1.3px solid ${C.border}`,
            borderRadius: 14,
            padding: 14,
            background: '#fafafa',
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            color: '#333',
            lineHeight: 1.6,
          }}
        >
          {`/* CSS base — mobile Safari */
.app {
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
.input-dock {
  position: sticky;
  bottom: env(safe-area-inset-bottom);
}
/* detect keyboard via visualViewport */
window.visualViewport
  .addEventListener('resize', onKb);`}
        </div>
      </div>
      {band(56, '#e9a23a', 'SAFARI URL BAR · bottom default', 56)}
      {band(34, '#2f7d4f', 'HOME INDICATOR · safe-area-inset-bottom', 34)}
    </div>
  );
};

// ============ SCREEN M1: Menu Drawer aberto ============
const SM1_MenuDrawer = () => (
  <Frame>
    {/* overlay */}
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />

    {/* drawer à direita */}
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        background: '#fff',
        borderLeft: `1.5px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.25)',
      }}
    >
      {/* header */}
      <div style={{ padding: '50px 22px 22px', borderBottom: `1px solid ${C.borderSoft}` }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: C.mute,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Mesa 12 · Trattoria Luna
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4 }}>Olá, Caleb</div>
          </div>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              border: `1.2px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              color: C.ink,
            }}
          >
            ×
          </div>
        </div>
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: C.surface,
            border: `1px solid ${C.borderSoft}`,
            fontSize: 11,
            color: C.mute,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: C.success }} />
          <span>Sessão ativa · 4 pessoas na mesa</span>
        </div>
      </div>

      {/* principal */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 0' }}>
        <MenuItem icon="☰" label="Cardápio" sub="Explorar pratos e bebidas" />
        <MenuItem icon="◉" label="Meu pedido" sub="3 itens · R$ 143,00" active />
        <MenuItem
          icon="⊞"
          label="Pedido da mesa"
          sub="Comanda compartilhada · 7 itens"
          badge="2 novos"
        />
        <MenuItem icon="✦" label="Assistente IA" sub="Sugestões e dúvidas" />
        <MenuItem icon="◔" label="Chamar garçom" sub="Pedir atendimento" />
        <MenuItem icon="$" label="Pagar conta" sub="Fechar a conta" />

        <div style={{ height: 1, background: C.borderSoft, margin: '14px 22px' }} />

        <MenuItem icon="↺" label="Trocar perfil" sub="Entrar com outro nome" small />
        <MenuItem icon="?" label="Ajuda" small />
        <MenuItem icon="→" label="Sair da mesa" small danger />
      </div>

      {/* footer */}
      <div
        style={{
          padding: '14px 22px 28px',
          borderTop: `1px solid ${C.borderSoft}`,
          fontSize: 10,
          color: C.faint,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        Sessão iniciada às 20:14
        <br />
        v1.0 · Trattoria Luna
      </div>
    </div>
  </Frame>
);

const MenuItem = ({ icon, label, sub, active, badge, small, danger }) => (
  <div
    style={{
      padding: small ? '10px 22px' : '14px 22px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      background: active ? C.surface : 'transparent',
      borderLeft: active ? `3px solid ${C.ink}` : '3px solid transparent',
      color: danger ? C.danger : C.ink,
      cursor: 'pointer',
    }}
  >
    <div
      style={{
        width: small ? 28 : 34,
        height: small ? 28 : 34,
        borderRadius: small ? 14 : 17,
        border: `1.2px solid ${danger ? C.danger : C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: small ? 12 : 14,
        color: danger ? C.danger : C.ink,
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: small ? 13 : 15, fontWeight: 500, letterSpacing: -0.1 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.mute, marginTop: 1 }}>{sub}</div>}
    </div>
    {badge && (
      <div
        style={{
          padding: '2px 8px',
          borderRadius: 999,
          background: C.ink,
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        {badge}
      </div>
    )}
    {!badge && !small && <div style={{ color: C.faint, fontSize: 14 }}>›</div>}
  </div>
);

// ============ SCREEN M2: Popup escolher comanda ao adicionar ============
const SM2_CommandPicker = () => (
  <Frame>
    {/* Background: tela do detalhe do prato em blur */}
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        opacity: 0.4,
        filter: 'blur(3px)',
      }}
    >
      <TopBar />
      <FoodPlaceholder
        label="foto do prato"
        h={180}
        style={{ borderRadius: 0, border: 'none', margin: 0 }}
      />
      <div style={{ padding: 22 }}>
        <div style={{ fontSize: 24, fontWeight: 600 }}>Risoto de camarão</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>R$ 78,00</div>
      </div>
    </div>

    {/* Sheet modal de baixo */}
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        border: `1.5px solid ${C.border}`,
        borderBottom: 'none',
        padding: '10px 24px 30px',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.2)',
      }}
    >
      {/* handle */}
      <div
        style={{
          width: 44,
          height: 5,
          borderRadius: 3,
          background: C.borderSoft,
          margin: '0 auto 18px',
        }}
      />

      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: -0.5,
          textAlign: 'center',
          marginBottom: 6,
        }}
      >
        Onde adicionar este item?
      </div>
      <div
        style={{
          fontSize: 13,
          color: C.mute,
          textAlign: 'center',
          marginBottom: 22,
          textWrap: 'pretty',
          lineHeight: 1.45,
        }}
      >
        <b style={{ color: C.ink }}>Risoto de camarão · R$ 78,00</b>
      </div>

      {/* Opção 1: comanda individual */}
      <div
        style={{
          padding: 18,
          borderRadius: 18,
          border: `1.5px solid ${C.ink}`,
          background: '#fff',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            border: `1.3px solid ${C.ink}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ◉
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Minha comanda
            <span
              style={{
                fontSize: 9,
                padding: '2px 7px',
                borderRadius: 999,
                background: C.ink,
                color: '#fff',
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              RECOMENDADO
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.mute, lineHeight: 1.4 }}>
            Vai só para você. Ideal se cada um paga o seu no final.
          </div>
          <div style={{ fontSize: 11, color: C.ink, marginTop: 4, fontWeight: 500 }}>
            3 itens · R$ 143,00
          </div>
        </div>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            background: C.ink,
            color: '#fff',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ✓
        </div>
      </div>

      {/* Opção 2: comanda da mesa */}
      <div
        style={{
          padding: 18,
          borderRadius: 18,
          border: `1.3px solid ${C.borderSoft}`,
          background: '#fff',
          marginBottom: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            border: `1.3px solid ${C.faint}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            color: C.mute,
            flexShrink: 0,
          }}
        >
          ⊞
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Comanda da mesa</div>
          <div style={{ fontSize: 11, color: C.mute, lineHeight: 1.4 }}>
            Item compartilhado com todos da Mesa 12. Ideal para entradas, bebidas ou couvert.
          </div>
          <div style={{ fontSize: 11, color: C.ink, marginTop: 4, fontWeight: 500 }}>
            7 itens · 4 pessoas · R$ 312,00
          </div>
        </div>
      </div>

      {/* preferência */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          padding: '10px 14px',
          borderRadius: 12,
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `1.3px solid ${C.ink}`,
            background: '#fff',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, color: C.ink, textWrap: 'pretty', lineHeight: 1.4 }}>
          Usar esta opção para os próximos itens (posso mudar depois)
        </span>
      </div>

      <PillButton variant="filled" style={{ width: '100%' }}>
        Adicionar à minha comanda
      </PillButton>
      <button
        style={{
          width: '100%',
          padding: 10,
          background: 'none',
          border: 'none',
          color: C.mute,
          fontSize: 12,
          textDecoration: 'underline',
          marginTop: 6,
          fontFamily: FONT,
        }}
      >
        Cancelar
      </button>
    </div>
  </Frame>
);

// ============ SCREEN M3: Pedido da Mesa (compartilhado) ============
const SM3_TableOrder = () => {
  const people = [
    { name: 'Caleb', color: C.ink, initial: 'C' },
    { name: 'Marina', color: '#2f7d4f', initial: 'M' },
    { name: 'João', color: '#c43a3a', initial: 'J' },
    { name: 'Ana', color: '#c78a1f', initial: 'A' },
  ];
  const items = [
    { q: 1, n: 'Tábua de frios', p: 88, by: 'shared', ts: '20:24' },
    { q: 2, n: 'Chopp Pilsen 500ml', p: 18, by: 'shared', ts: '20:28' },
    { q: 1, n: 'Bruschetta caprese', p: 28, by: 'M', ts: '20:31' },
    { q: 1, n: 'Risoto de camarão', p: 78, by: 'C', ts: '20:42', status: 'novo' },
    { q: 1, n: 'Filé ao vinho', p: 92, by: 'J', ts: '20:43', status: 'novo' },
    { q: 1, n: 'Água com gás', p: 10, by: 'A', ts: '20:44' },
  ];
  const total = items.reduce((s, i) => s + i.q * i.p, 0);

  return (
    <Frame>
      <TopBar />
      <div style={{ padding: '4px 22px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div
              style={{
                fontSize: 11,
                color: C.mute,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Comanda compartilhada
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Pedido da mesa</div>
          </div>
          <div style={{ display: 'flex', marginLeft: 12 }}>
            {people.map((p, i) => (
              <div
                key={p.name}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  background: p.color,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #fff',
                  marginLeft: i === 0 ? 0 : -8,
                }}
              >
                {p.initial}
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>
          {people.length} pessoas · {items.length} itens · atualizado agora
        </div>
      </div>

      {/* tabs filtro */}
      <div style={{ display: 'flex', gap: 8, padding: '0 22px 14px', flexShrink: 0 }}>
        {['Todos', 'Meus', 'Compartilhados'].map((t, i) => (
          <div
            key={t}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              background: i === 0 ? C.ink : '#fff',
              color: i === 0 ? '#fff' : C.ink,
              border: `1.2px solid ${C.ink}`,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {t}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 22px 20px' }}>
        {items.map((it, i) => {
          const person = it.by === 'shared' ? null : people.find((p) => p.initial === it.by);
          return (
            <div
              key={i}
              style={{
                padding: '14px 0',
                borderBottom: `1px solid ${C.borderSoft}`,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              {/* avatar de quem pediu */}
              {person ? (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: person.color,
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {person.initial}
                </div>
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: '#fff',
                    border: `1.3px dashed ${C.ink}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    color: C.ink,
                    flexShrink: 0,
                  }}
                >
                  ⊞
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.1 }}>
                    {it.q}× {it.n}
                  </div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                  >
                    R$ {(it.q * it.p).toFixed(2).replace('.', ',')}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.mute,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{it.by === 'shared' ? 'compartilhado' : `por ${person.name}`}</span>
                  <span>·</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{it.ts}</span>
                  {it.status === 'novo' && (
                    <span
                      style={{
                        padding: '1px 7px',
                        borderRadius: 999,
                        background: C.ink,
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: 0.3,
                        marginLeft: 2,
                      }}
                    >
                      NOVO
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 18, padding: '16px 0', borderTop: `1.3px solid ${C.ink}` }}>
          <Row l="Subtotal" v={`R$ ${total.toFixed(2).replace('.', ',')}`} />
          <Row l="Taxa de serviço (10%)" v={`R$ ${(total * 0.1).toFixed(2).replace('.', ',')}`} />
          <div style={{ height: 6 }} />
          <Row
            l={<b style={{ fontSize: 15, color: C.ink }}>Total da mesa</b>}
            v={
              <b style={{ fontSize: 19, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                R$ {(total * 1.1).toFixed(2).replace('.', ',')}
              </b>
            }
          />
          <div style={{ fontSize: 11, color: C.mute, textAlign: 'right', marginTop: 2 }}>
            ÷ 4 = R$ {((total * 1.1) / 4).toFixed(2).replace('.', ',')} por pessoa
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <PillButton style={{ flex: 1 }}>Dividir conta</PillButton>
        <PillButton variant="filled" style={{ flex: 1 }}>
          Pagar minha parte
        </PillButton>
      </div>
    </Frame>
  );
};

// ============ CANVAS ============
const App = () => (
  <DesignCanvas>
    <DCSection
      id="s-entrada"
      title="1. Entrada & Identidade"
      subtitle="QR Code → Splash → Onboarding inicial"
    >
      <DCArtboard id="a-splash" label="01 · Splash" width={390} height={844}>
        <S1_Splash />
      </DCArtboard>
      <DCArtboard id="a-welcome" label="02 · Popup de boas-vindas" width={390} height={844}>
        <S2_Welcome />
      </DCArtboard>
    </DCSection>

    <DCSection
      id="s-home"
      title="2. Home (pós-login)"
      subtitle="Layout novo do sketch · branco, bordas pretas, liquid glass"
    >
      <DCArtboard id="a-home-first" label="03 · Home · primeira visita" width={390} height={844}>
        <S3_HomeFirst />
      </DCArtboard>
      <DCArtboard id="a-home-return" label="04 · Home · visita de retorno" width={390} height={844}>
        <S4_HomeReturn />
      </DCArtboard>
    </DCSection>

    <DCSection
      id="s-menu"
      title="3. Cardápio & Pedido"
      subtitle="Navegação, detalhe do prato, resumo de pedido"
    >
      <DCArtboard id="a-menu" label="05 · Cardápio · comida" width={390} height={844}>
        <S5_Menu />
      </DCArtboard>
      <DCArtboard id="a-menu-drinks" label="05b · Cardápio · bebidas" width={390} height={844}>
        <S5b_Drinks />
      </DCArtboard>
      <DCArtboard id="a-menu-empty" label="05c · Busca sem resultados" width={390} height={844}>
        <S5c_EmptySearch />
      </DCArtboard>
      <DCArtboard id="a-item" label="06 · Detalhe do prato" width={390} height={844}>
        <S6_ItemDetail />
      </DCArtboard>
      <DCArtboard id="a-review" label="06b · Review do pedido" width={390} height={844}>
        <S6b_ReviewOrder />
      </DCArtboard>
      <DCArtboard id="a-countdown" label="06c · Confirmando (15s)" width={390} height={844}>
        <S6c_ConfirmCountdown />
      </DCArtboard>
      <DCArtboard id="a-sent" label="06d · Pedido enviado" width={390} height={844}>
        <S6d_OrderSent />
      </DCArtboard>
      <DCArtboard id="a-order-empty" label="07a · Pedido vazio" width={390} height={844}>
        <S7b_EmptyOrder />
      </DCArtboard>
      <DCArtboard id="a-order" label="07 · Meu pedido" width={390} height={844}>
        <S7_Order />
      </DCArtboard>
    </DCSection>

    <DCSection id="s-ai" title="4. Assistente IA" subtitle="Chat com guardrails + liquid glass">
      <DCArtboard id="a-ai" label="08 · Assistente IA" width={390} height={844}>
        <S8_Assistant />
      </DCArtboard>
    </DCSection>

    <DCSection
      id="s-nav"
      title="7. Navegação & Comanda"
      subtitle="Menu hamburger, escolha de comanda, pedido compartilhado da mesa"
    >
      <DCArtboard id="a-drawer" label="14 · Menu hamburger aberto" width={390} height={844}>
        <SM1_MenuDrawer />
      </DCArtboard>
      <DCArtboard
        id="a-command-picker"
        label="15 · Escolher comanda ao adicionar"
        width={390}
        height={844}
      >
        <SM2_CommandPicker />
      </DCArtboard>
      <DCArtboard
        id="a-table-order"
        label="16 · Pedido da mesa (compartilhado)"
        width={390}
        height={844}
      >
        <SM3_TableOrder />
      </DCArtboard>
    </DCSection>

    <DCSection
      id="s-safari"
      title="6. Safari iOS · viewport real"
      subtitle="Barra de URL no rodapé, teclado, safe areas — iPhone 14 · 390×844"
    >
      <DCArtboard id="a-safari-home" label="11 · Home no Safari real" width={390} height={844}>
        <S11_SafariHome />
      </DCArtboard>
      <DCArtboard id="a-safari-kb" label="12 · Com teclado aberto" width={390} height={844}>
        <S12_SafariKeyboard />
      </DCArtboard>
      <DCArtboard id="a-safe-spec" label="13 · Specs de safe-area" width={390} height={844}>
        <S13_SafeAreaSpec />
      </DCArtboard>
    </DCSection>

    <DCSection id="s-checkout" title="5. Pagamento & Feedback" subtitle="Fechamento da jornada">
      <DCArtboard id="a-pay" label="09 · Pagamento" width={390} height={844}>
        <S9_Payment />
      </DCArtboard>
      <DCArtboard id="a-pix" label="09b · QR Code Pix" width={390} height={844}>
        <SP2_PixQR />
      </DCArtboard>
      <DCArtboard id="a-pay-error" label="09c · Erro de pagamento" width={390} height={844}>
        <SP3_PaymentError />
      </DCArtboard>
      <DCArtboard id="a-split" label="09d · Dividir conta" width={390} height={844}>
        <SP1_SplitBill />
      </DCArtboard>
      <DCArtboard id="a-feedback" label="10 · Feedback" width={390} height={844}>
        <S10_Feedback />
      </DCArtboard>
    </DCSection>

    <DCSection
      id="s-tv-kitchen"
      title="9. TV — Cozinha & Bar"
      subtitle="Telas de monitoramento (KDS) — 1920×1080, otimizadas para visualização à distância"
    >
      <DCArtboard id="a-tv-kitchen" label="20 · Cozinha · KDS na TV" width={1920} height={1080}>
        <TV_KitchenKDS />
      </DCArtboard>
      <DCArtboard id="a-tv-bar" label="21 · Bar · Bebidas na TV" width={1920} height={1080}>
        <TV_BarBoard />
      </DCArtboard>
    </DCSection>

    <DCSection
      id="s-waiter"
      title="8. Garçom & Bebidas"
      subtitle="Chamado de atendimento + detalhe de bebida"
    >
      <DCArtboard id="a-waiter-call" label="17 · Chamar garçom" width={390} height={844}>
        <SW1_CallWaiter />
      </DCArtboard>
      <DCArtboard id="a-waiter-coming" label="18 · Garçom a caminho" width={390} height={844}>
        <SW2_WaiterComing />
      </DCArtboard>
      <DCArtboard id="a-drink-detail" label="19 · Detalhe de bebida" width={390} height={844}>
        <SD1_DrinkDetail />
      </DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
