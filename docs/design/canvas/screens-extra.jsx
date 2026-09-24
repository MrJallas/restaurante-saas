// ============ SCREEN P1: Dividir a conta ============
const SP1_SplitBill = () => {
  const people = [
    { name: 'Caleb', color: C.ink, initial: 'C', total: 88 },
    { name: 'Marina', color: '#2f7d4f', initial: 'M', total: 56 },
    { name: 'João', color: '#c43a3a', initial: 'J', total: 112 },
    { name: 'Ana', color: '#c78a1f', initial: 'A', total: 56 },
  ];
  const items = [
    { n: 'Tábua de frios', p: 88, shared: true },
    { n: 'Risoto de camarão', p: 78, by: 'C' },
    { n: 'Filé ao vinho', p: 92, by: 'J' },
    { n: 'Bruschetta caprese', p: 28, by: 'M' },
  ];
  return (
    <Frame>
      <TopBar />
      <div style={{ padding: '4px 22px 12px', flexShrink: 0 }}>
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
          Mesa 12 · 4 pessoas
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>Dividir conta</div>
      </div>

      <div style={{ padding: '0 22px 14px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            padding: 4,
            background: C.surface,
            borderRadius: 999,
            border: `1px solid ${C.borderSoft}`,
            gap: 2,
          }}
        >
          <div
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 999,
              color: C.mute,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Igual
          </div>
          <div
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 999,
              background: C.ink,
              color: '#fff',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Por item
          </div>
          <div
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 999,
              color: C.mute,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Customizado
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 22px 20px' }}>
        <div
          style={{
            fontSize: 11,
            color: C.mute,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Itens da mesa
        </div>
        {items.map((it, i) => {
          const p = it.shared ? null : people.find((x) => x.initial === it.by);
          return (
            <div
              key={i}
              style={{
                padding: '12px 0',
                borderBottom: `1px solid ${C.borderSoft}`,
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
                <div style={{ fontSize: 14, fontWeight: 500 }}>{it.n}</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  R$ {it.p.toFixed(2).replace('.', ',')}
                </div>
              </div>
              {it.shared ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: C.mute,
                      fontWeight: 500,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    Dividido entre
                  </span>
                  <div style={{ display: 'flex' }}>
                    {people.map((p, j) => (
                      <div
                        key={p.name}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          background: p.color,
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1.5px solid #fff',
                          marginLeft: j === 0 ? 0 : -6,
                        }}
                      >
                        {p.initial}
                      </div>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: C.mute, marginLeft: 'auto' }}>
                    R$ {(it.p / 4).toFixed(2).replace('.', ',')} cada
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: p.color,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {p.initial}
                  </div>
                  <span style={{ fontSize: 12, color: C.mute }}>somente {p.name}</span>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Resumo por pessoa
          </div>
          {people.map((p, i) => {
            const share = 88 / 4; // tábua compartilhada
            const me = p.initial === 'C';
            return (
              <div
                key={p.name}
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: `1.3px solid ${me ? C.ink : C.borderSoft}`,
                  background: me ? '#fff' : '#fff',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    background: p.color,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {p.initial}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {p.name}
                    {me && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: C.ink,
                          color: '#fff',
                          fontWeight: 600,
                          letterSpacing: 0.3,
                        }}
                      >
                        VOCÊ
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.mute }}>
                    + taxa 10% · R$ {(p.total * 1.1).toFixed(2).replace('.', ',')}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  R$ {p.total.toFixed(2).replace('.', ',')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <PillButton style={{ flex: 1 }}>Enviar resumo</PillButton>
        <PillButton variant="filled" style={{ flex: 1 }}>
          Pagar R$ 96,80
        </PillButton>
      </div>
    </Frame>
  );
};

// ============ SCREEN P2: QR Code Pix gerado ============
const SP2_PixQR = () => (
  <Frame>
    <TopBar restaurant="Pagamento Pix" table="Mesa 12" showMenu={false} />
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '0 24px 12px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '4px 0 16px' }}>
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
          Aguardando pagamento
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5 }}>Escaneie o QR Code</div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 4, textWrap: 'pretty' }}>
          Abra o app do seu banco e aponte a câmera para o código.
        </div>
      </div>

      {/* QR Code */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div
          style={{
            width: 230,
            height: 230,
            background: '#fff',
            border: `1.5px solid ${C.ink}`,
            borderRadius: 16,
            padding: 14,
            position: 'relative',
          }}
        >
          <QRPattern />
          {/* Logo Pix no centro */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 44,
              height: 44,
              background: '#fff',
              borderRadius: 8,
              border: `1.5px solid ${C.ink}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            PIX
          </div>
        </div>
      </div>

      {/* Timer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 6,
          alignItems: 'center',
          marginBottom: 16,
          fontSize: 12,
          color: C.mute,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: C.ink,
            animation: 'blink 1.2s infinite',
          }}
        />
        <span>
          Código expira em <b style={{ color: C.ink, fontVariantNumeric: 'tabular-nums' }}>09:47</b>
        </span>
      </div>

      {/* Valor */}
      <div
        style={{
          padding: 16,
          borderRadius: 14,
          border: `1.3px solid ${C.borderSoft}`,
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Valor a pagar
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: -0.4,
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
            }}
          >
            R$ 96,80
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.mute, textAlign: 'right', lineHeight: 1.4 }}>
          Sua parte
          <br />
          (inclui taxa 10%)
        </div>
      </div>

      {/* Copia e cola */}
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          border: `1.3px solid ${C.borderSoft}`,
          background: C.surface,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              color: C.mute,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Copia e cola
          </div>
          <div
            style={{
              fontSize: 11,
              color: C.ink,
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            00020126580014br.gov.bcb.pix01362a9f38...
          </div>
        </div>
        <div
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: `1.2px solid ${C.ink}`,
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          Copiar
        </div>
      </div>

      <div
        style={{ fontSize: 10, color: C.faint, textAlign: 'center', lineHeight: 1.5, marginTop: 8 }}
      >
        Assim que o pagamento for confirmado, você será direcionado
        <br />
        automaticamente para a próxima etapa.
      </div>
    </div>

    <div style={{ padding: '10px 22px 26px', flexShrink: 0 }}>
      <PillButton style={{ width: '100%' }}>Cancelar pagamento</PillButton>
    </div>
  </Frame>
);

// QR Pattern — SVG pseudo-aleatório estável
const QRPattern = () => {
  // Grid 21x21 com quadrados pretos determinísticos
  const size = 21;
  const cells = [];
  const seed = (i, j) => (i * 73 + j * 41 + i * j * 13) % 7 < 3;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (seed(i, j)) cells.push([i, j]);
    }
  }
  // Os 3 cantos de posicionamento (corner markers)
  const corner = (ox, oy) => (
    <g key={`c-${ox}-${oy}`}>
      <rect x={ox} y={oy} width="7" height="7" fill="#000" />
      <rect x={ox + 1} y={oy + 1} width="5" height="5" fill="#fff" />
      <rect x={ox + 2} y={oy + 2} width="3" height="3" fill="#000" />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" shapeRendering="crispEdges">
      {cells.map(([i, j]) => {
        // Skip posições dos corner markers
        if ((i < 7 && j < 7) || (i < 7 && j > size - 8) || (i > size - 8 && j < 7)) return null;
        return <rect key={`${i}-${j}`} x={j} y={i} width="1" height="1" fill="#000" />;
      })}
      {corner(0, 0)}
      {corner(size - 7, 0)}
      {corner(0, size - 7)}
    </svg>
  );
};

// ============ SCREEN P3: Erro de pagamento ============
const SP3_PaymentError = () => (
  <Frame>
    <TopBar />
    <div
      style={{
        flex: 1,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 14,
          paddingBottom: 20,
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            border: `2px solid ${C.danger}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.danger,
            fontSize: 36,
            marginBottom: 18,
          }}
        >
          !
        </div>
        <div
          style={{
            fontSize: 11,
            color: C.danger,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Pagamento não autorizado
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.5,
            textAlign: 'center',
            textWrap: 'pretty',
            lineHeight: 1.2,
            marginBottom: 10,
          }}
        >
          Algo deu errado com seu Pix
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.mute,
            textAlign: 'center',
            textWrap: 'pretty',
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          Seu banco recusou a transação. Sua conta não foi debitada — você pode tentar novamente
          agora.
        </div>
      </div>

      {/* Detalhes */}
      <div
        style={{
          padding: 16,
          border: `1.3px solid ${C.borderSoft}`,
          borderRadius: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: C.mute,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Detalhes do erro
        </div>
        <Row l="Código" v="E-104" />
        <Row l="Horário" v="21:47" />
        <Row l="Valor tentado" v="R$ 96,80" />
        <Row l="Mesa" v="12" />
      </div>

      <div
        style={{
          padding: 14,
          borderRadius: 12,
          background: '#fdf2f2',
          border: `1px solid #f3d5d5`,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, color: '#7a1f1f', lineHeight: 1.5, textWrap: 'pretty' }}>
          <b>Motivo provável:</b> tempo de expiração do QR Code. Gere um novo código ou tente outra
          forma de pagamento.
        </div>
      </div>

      {/* Alternativas */}
      <div
        style={{
          fontSize: 11,
          color: C.mute,
          fontWeight: 600,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Outras opções
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <OptionRow label="Cartão de crédito" sub="Visa, Master, Elo" />
        <OptionRow label="Cartão de débito" sub="Débito em conta" />
        <OptionRow label="Pedir ajuda ao garçom" sub="Pagamento presencial" />
      </div>
    </div>

    <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
      <PillButton style={{ flex: 1 }}>Voltar</PillButton>
      <PillButton variant="filled" style={{ flex: 2 }}>
        Tentar Pix novamente
      </PillButton>
    </div>
  </Frame>
);

const OptionRow = ({ label, sub }) => (
  <div
    style={{
      padding: '12px 14px',
      borderRadius: 12,
      border: `1.2px solid ${C.borderSoft}`,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}
  >
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11, color: C.mute }}>{sub}</div>
    </div>
    <div style={{ color: C.faint, fontSize: 14 }}>›</div>
  </div>
);

// ============ SCREEN W1: Chamar garçom — confirmação ============
const SW1_CallWaiter = () => (
  <Frame>
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
      }}
    >
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
        Chamar garçom
      </div>
      <div
        style={{
          fontSize: 13,
          color: C.mute,
          textAlign: 'center',
          marginBottom: 22,
          textWrap: 'pretty',
        }}
      >
        Avise-nos do que você precisa para agilizar o atendimento.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {[
          { l: 'Trazer o cardápio', sel: false },
          { l: 'Fazer um pedido', sel: true },
          { l: 'Servir bebida / vinho', sel: false },
          { l: 'Pedir a conta', sel: false },
          { l: 'Outro motivo', sel: false },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              padding: '13px 16px',
              borderRadius: 14,
              border: `1.3px solid ${m.sel ? C.ink : C.borderSoft}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#fff',
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                border: `1.5px solid ${m.sel ? C.ink : C.borderSoft}`,
                background: m.sel ? C.ink : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {m.sel && (
                <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />
              )}
            </div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{m.l}</span>
          </div>
        ))}
      </div>

      <PillButton variant="filled" style={{ width: '100%' }}>
        Chamar agora
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

// ============ SCREEN W2: Garçom a caminho ============
const SW2_WaiterComing = () => {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <Frame>
      <TopBar />
      <div
        style={{
          flex: 1,
          padding: '10px 24px 20px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 30,
            paddingBottom: 26,
          }}
        >
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              border: `2px solid ${C.ink}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 22,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: -8,
                borderRadius: 58,
                border: `2px solid ${C.ink}`,
                opacity: 0.15,
                animation: 'ripple 2s infinite',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: -16,
                borderRadius: 66,
                border: `2px solid ${C.ink}`,
                opacity: 0.1,
                animation: 'ripple 2s infinite 0.5s',
              }}
            />
            <span style={{ fontSize: 44 }}>◔</span>
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
            Chamado recebido
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: -0.5,
              textAlign: 'center',
              textWrap: 'pretty',
              lineHeight: 1.2,
            }}
          >
            Um garçom está a caminho{'.'.repeat(dots)}
          </div>
          <div
            style={{
              fontSize: 13,
              color: C.mute,
              textAlign: 'center',
              marginTop: 10,
              textWrap: 'pretty',
              maxWidth: 300,
              lineHeight: 1.5,
            }}
          >
            Ele foi notificado e já está se dirigindo à sua mesa.
          </div>
        </div>

        <div
          style={{
            padding: 16,
            border: `1.3px solid ${C.ink}`,
            borderRadius: 18,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: C.surface,
              border: `1.2px solid ${C.ink}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            R
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                color: C.mute,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Seu garçom
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3, marginTop: 2 }}>
              Rodrigo
            </div>
            <div style={{ fontSize: 11, color: C.mute, marginTop: 1 }}>Tempo estimado: 2 min</div>
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: C.surface,
            border: `1px solid ${C.borderSoft}`,
            marginBottom: 14,
            fontSize: 12,
            color: C.ink,
            lineHeight: 1.5,
            textWrap: 'pretty',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: 14 }}>✦</span>
          <div>
            <b>Motivo:</b> Fazer um pedido.
            <br />
            <span style={{ color: C.mute }}>
              Enquanto espera, você pode continuar navegando pelo cardápio.
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 22px 26px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <PillButton style={{ flex: 1 }}>Cancelar chamado</PillButton>
        <PillButton variant="filled" style={{ flex: 1 }}>
          Ver cardápio
        </PillButton>
      </div>

      <style>{`
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.25; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </Frame>
  );
};

// ============ SCREEN D1: Detalhe de bebida (layout simplificado) ============
const SD1_DrinkDetail = () => (
  <Frame>
    <TopBar />
    <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 20px' }}>
      {/* Back */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          background: '#fff',
          border: `1.2px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
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

      {/* Visual — ícone grande da bebida em vez de foto */}
      <div
        style={{
          background: `repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #efede8 6px, #efede8 12px)`,
          border: `1.3px solid ${C.borderSoft}`,
          borderRadius: 24,
          padding: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
          height: 200,
        }}
      >
        {/* Copo SVG estilizado */}
        <svg width="110" height="140" viewBox="0 0 110 140" fill="none">
          <path
            d="M20 20 L90 20 L80 130 Q55 138 30 130 Z"
            stroke={C.ink}
            strokeWidth="2"
            fill="#fff"
            strokeLinejoin="round"
          />
          <path d="M24 40 L86 40" stroke={C.ink} strokeWidth="1" opacity="0.3" />
          <path d="M26 60 Q55 55 84 60 L80 130 Q55 138 30 130 Z" fill={C.ink} opacity="0.1" />
          {/* Bolhas */}
          <circle cx="45" cy="80" r="2.5" fill={C.ink} opacity="0.3" />
          <circle cx="62" cy="90" r="2" fill={C.ink} opacity="0.3" />
          <circle cx="40" cy="100" r="1.8" fill={C.ink} opacity="0.3" />
          <circle cx="68" cy="70" r="1.5" fill={C.ink} opacity="0.3" />
          {/* Fatia de laranja */}
          <circle cx="55" cy="22" r="12" fill="#fff" stroke={C.ink} strokeWidth="1.5" />
          <circle
            cx="55"
            cy="22"
            r="8"
            fill="none"
            stroke={C.ink}
            strokeWidth="0.8"
            opacity="0.5"
          />
        </svg>
      </div>

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
          ★ mais pedido
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
          com álcool
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, marginBottom: 4, letterSpacing: -0.6 }}>
        Aperol Spritz
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 14,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        R$ 34,00
      </div>
      <div
        style={{
          fontSize: 14,
          color: C.mute,
          lineHeight: 1.6,
          marginBottom: 22,
          textWrap: 'pretty',
        }}
      >
        Aperitivo italiano leve e refrescante. Aperol, prosecco brut, água com gás, servido com uma
        fatia de laranja e gelo.
      </div>

      {/* Customização — tamanho */}
      <div style={{ marginBottom: 18 }}>
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
          Tamanho
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { l: 'Taça', p: '34,00', sel: true },
            { l: 'Jarra 1L', p: '128,00' },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: 14,
                border: `1.3px solid ${s.sel ? C.ink : C.borderSoft}`,
                background: '#fff',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.l}</div>
              <div
                style={{
                  fontSize: 12,
                  color: C.mute,
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                R$ {s.p}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extras */}
      <div style={{ marginBottom: 18 }}>
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
          Preferências
        </div>
        {[
          { l: 'Com gelo', sel: true },
          { l: 'Com fatia de laranja', sel: true },
          { l: 'Azeitona', sel: false },
        ].map((e, i) => (
          <div
            key={i}
            style={{
              padding: '10px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom: i < 2 ? `1px solid ${C.borderSoft}` : 'none',
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: `1.3px solid ${e.sel ? C.ink : C.borderSoft}`,
                background: e.sel ? C.ink : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {e.sel && '✓'}
            </div>
            <span style={{ fontSize: 14 }}>{e.l}</span>
          </div>
        ))}
      </div>

      {/* Quantidade */}
      <div style={{ marginBottom: 18 }}>
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
          Quantidade
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              background: '#fff',
              border: `1.3px solid ${C.ink}`,
              fontSize: 18,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            −
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 24,
              textAlign: 'center',
            }}
          >
            1
          </div>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              background: C.ink,
              border: `1.3px solid ${C.ink}`,
              color: '#fff',
              fontSize: 18,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </div>
        </div>
      </div>
    </div>

    <div style={{ padding: '10px 22px 26px', flexShrink: 0 }}>
      <PillButton variant="filled" style={{ width: '100%' }}>
        Adicionar ao pedido · R$ 34,00
      </PillButton>
    </div>
  </Frame>
);

Object.assign(window, {
  SP1_SplitBill,
  SP2_PixQR,
  SP3_PaymentError,
  SW1_CallWaiter,
  SW2_WaiterComing,
  SD1_DrinkDetail,
  OptionRow,
  QRPattern,
});
