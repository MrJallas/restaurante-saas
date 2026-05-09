// ============================================================
// V15 CLIENTE · ROUND 8b · LATE ARRIVAL VIA CUSTOMER-HOST
// ────────────────────────────────────────────────────────────
// Customer-side de chegada tardia. Cliente A (host) aprova;
// cliente B (novo) espera 60s e segue (ou cai pro fluxo de
// chamado normal se host não responde). Staff NÃO entra como
// aprovador · só recebe notificação passiva depois.
//
// EXPORT: window.CLIENTE_LATE_ARRIVAL_SECTIONS · 1 DCSection
//   8 frames iOS · todos no toolkit de cliente-tokens.jsx
//   (C, FONT, MONO, IOSFrame, TopBar, MonoLabel, PillButton,
//    AssistantBlock, ContextualChips, CustomerBubble)
//
// LINGUAGEM:
//   - Push lockscreen do customer-host = INK NEUTRO (não mostarda).
//     Mostarda fica reservada pro vocabulário staff em V15 garçom.
//     Cliente recebendo pergunta social → ink calmo.
//   - Late-arrival eyebrow nas screens = ink/mono caps tiny.
//   - Bubble "X entrou na mesa" = system divider discreto, não
//     ManagerBubble (não é gerente falando · é o sistema avisando).
// ============================================================

// helper builder · idêntico em shape ao fQ do garcom-qr-issue.jsx
const fL = ({ label, screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard key={'v15c-' + label} id={'v15c-' + label}
      label={`${label} · iOS`}
      width={414} height={844 + captionH + 24}
      style={{ background: '#f0eee9', borderRadius: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px', gap: 18 }}>
        {screen}
        {note && (
          <div style={{
            marginTop: 14, maxWidth: 420, fontSize: 12, color: '#6b6b6b', lineHeight: 1.5,
            fontFamily: FONT, letterSpacing: -0.05,
          }}>{note}</div>
        )}
      </div>
    </DCArtboard>
  );
};

// avatar circular reutilizável · iniciais sobre ink
// `sub` é opcional · mono caps abaixo do nome (ex: "primeira visita", "3ª visita").
// `you` força o sub pra "Você · host" (ignora qualquer sub passado).
const PersonChip = ({ name, you = false, sub, size = 36 }) => {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const subLine = you ? 'Você · host' : sub;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: size, height: size, borderRadius: size / 2,
        background: you ? C.ink : '#e8e6e0', color: you ? '#fff' : C.ink,
        border: you ? 'none' : `1px solid ${C.borderSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT, fontSize: size >= 40 ? 14 : 12, fontWeight: 700,
        letterSpacing: -0.4, flexShrink: 0,
      }}>{initial}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{name}</span>
        {subLine && (
          <span style={{
            fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.faint,
            letterSpacing: 1, textTransform: 'uppercase',
          }}>{subLine}</span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// FRAME 1 · Push lockscreen (customer-host) · INK NEUTRO
// ─────────────────────────────────────────────────────────────
const PushHostJoinIOS = () => (
  <IOSFrame style={{ background: '#0a0a0a' }}>
    <div style={{ position: 'absolute', inset: 0, top: 44, bottom: 8 }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, #1d1d1f 0%, #131314 60%, #0a0a0a 100%)',
        color: '#fff', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          textAlign: 'center', color: '#fff', paddingTop: 60,
          fontFamily: '-apple-system, "SF Pro Display", system-ui',
        }}>
          <div style={{ fontSize: 21, fontWeight: 500, opacity: 0.95, letterSpacing: 0.3 }}>
            Quinta-feira, 7 de maio
          </div>
          <div style={{
            fontSize: 96, fontWeight: 200, lineHeight: '0.95',
            letterSpacing: -3, marginTop: 4, fontVariantNumeric: 'tabular-nums',
          }}>20:18</div>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '20px 16px 24px', justifyContent: 'center' }}>
          <div style={{ width: 156, height: 64, borderRadius: 14,
            background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(20px)' }} />
          <div style={{ width: 156, height: 64, borderRadius: 14,
            background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(20px)' }} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 110 }}>
          <div style={{ margin: '0 12px', position: 'relative' }}>
            <div style={{
              position: 'relative', borderRadius: 18, overflow: 'hidden',
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.18)',
            }}>
              <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: '#0a0a0a', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: FONT, fontWeight: 700, fontSize: 14,
                  letterSpacing: -0.5, position: 'relative',
                }}>
                  TL
                  <span style={{
                    position: 'absolute', top: -3, right: -3,
                    width: 12, height: 12, borderRadius: 6, background: '#0a0a0a',
                    border: '2px solid rgba(255,255,255,0.9)',
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0,
                  fontFamily: '-apple-system, system-ui', color: '#000' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
                      Alguém quer entrar na sua mesa
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)', flexShrink: 0, marginLeft: 8 }}>agora</div>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: '20px', color: '#000', marginTop: 1, letterSpacing: -0.2 }}>
                    Marina · Mesa 14 — toca pra responder
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 139, height: 5, borderRadius: 100, background: 'rgba(255,255,255,0.7)',
        }} />
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 2 · ScreenCustomerHostApproveJoin (sempre identificado)
//   `requesterName` SEMPRE populado · host nunca vê "?" anônimo.
//   Cliente novo (1ª visita) passa pelo IdentifyBeforeJoin antes
//   da request ser criada, então quando essa tela aparece pro
//   host, o nome já existe. `visitContext` varia o sub mono caps
//   sob o nome: returning ("3ª visita") vs first-timer-just-
//   identified ("primeira visita") · mesmo layout, mesma decisão.
// ─────────────────────────────────────────────────────────────
const ScreenHostApproveJoin = ({ visitContext = 'primeira visita' }) => {
  const requesterName = 'Marina';
  const tableSize = 4;
  const partyNow = 3;
  const sub  = `Tem 1 lugar livre · ${requesterName} pode sentar com vocês.`;
  const hero = `${requesterName} quer juntar a sua mesa`;

  return (
    <IOSFrame>
      <TopBar table="Mesa 14" restaurant="Trattoria Luna" />

      <div style={{
        flex: 1, overflow: 'auto',
        padding: '8px 22px 22px',
        display: 'flex', flexDirection: 'column',
      }}>
        <MonoLabel size={10} color={C.faint}>
          Mesa 14 · alguém quer entrar
        </MonoLabel>

        <div style={{
          marginTop: 10,
          fontSize: 22, fontWeight: 700, lineHeight: 1.2,
          color: C.ink, letterSpacing: -0.4,
        }}>{hero}</div>

        <div style={{
          marginTop: 8,
          fontSize: 14, fontWeight: 500, color: C.mute,
          lineHeight: 1.5, letterSpacing: -0.05,
        }}>{sub}</div>

        {/* Bloco · quem tá na mesa */}
        <div style={{
          marginTop: 22,
          padding: '14px 14px',
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <MonoLabel size={10} color={C.mute}>Quem tá na mesa</MonoLabel>
            <span style={{
              fontFamily: MONO, fontSize: 9.5, color: C.faint,
              fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase',
            }}>{partyNow} de {tableSize} lugares</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PersonChip name="Caleb" you />
            <PersonChip name="Olivia" />
            <PersonChip name="Henrique" />
          </div>
        </div>

        {/* Bloco · quem quer entrar · SEMPRE com nome real + visit context */}
        <div style={{
          marginTop: 12,
          padding: '14px 14px',
          background: '#fff',
          border: `1.3px solid ${C.ink}`,
          borderRadius: 14,
        }}>
          <MonoLabel size={10} color={C.ink}>Quem quer entrar</MonoLabel>
          <div style={{ marginTop: 10 }}>
            <PersonChip name={requesterName} sub={visitContext} size={42} />
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 16 }} />

        {/* CTAs full-width stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
            Sim, pode entrar
          </PillButton>
          <PillButton variant="outline" size="lg" style={{ width: '100%' }}>
            Não, era engano
          </PillButton>
        </div>
      </div>
    </IOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// FRAME 3 · ScreenCustomerIdentifyBeforeJoin
//   Cliente B novo (sem `customers.name` no DB) escaneou QR de
//   mesa ocupada. Bloqueio obrigatório · pede primeiro nome +
//   CPF ANTES de criar a `late_arrival_request`. Host nunca vê
//   "?" anônimo · pergunta social validada com nome real.
//
//   CPF não é exigido pra preenchimento social — backend usa
//   pra LOOKUP de cliente existente (POST /customers/identify):
//     - CPF existe → auto-login · merge sessão · próxima tela
//       saúda com `canonicalName` do banco
//     - CPF novo  → cria registro · `name + cpf_hash` salvos
//   Returning customers (com sessão já identificada · `customers.name`
//   no DB) pulam essa tela inteira.
// ─────────────────────────────────────────────────────────────
const InputField = ({ label, value, placeholder, focused = false, hint }) => {
  const hasValue = value && value.length > 0;
  return (
    <div style={{ marginTop: 18 }}>
      <MonoLabel size={10} color={focused ? C.ink : C.mute} style={{ marginBottom: 8 }}>
        {label}
      </MonoLabel>
      <div style={{
        background: '#fff',
        border: `1.6px solid ${focused ? C.ink : C.borderSoft}`,
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex', alignItems: 'center',
        minHeight: 28,
      }}>
        {focused && (
          <span style={{
            width: 1.5, height: 22, background: C.ink, marginRight: 2, flexShrink: 0,
            animation: 'cCaret 1.1s steps(1, end) infinite',
          }} />
        )}
        <span style={{
          fontFamily: FONT, fontSize: 17, fontWeight: 500,
          color: hasValue ? C.ink : C.faint, letterSpacing: -0.2,
          flex: 1,
          fontVariantNumeric: hint === 'cpf' ? 'tabular-nums' : 'normal',
        }}>
          {hasValue ? value : placeholder}
        </span>
      </div>
    </div>
  );
};

const ScreenCustomerIdentifyBeforeJoin = ({ filled = false }) => {
  const nameValue = filled ? 'Marina' : '';
  const cpfValue  = filled ? '147.852.963-00' : '';
  const hasName   = nameValue.length > 0;
  const hasCpf    = cpfValue.length === 14; // formato 000.000.000-00
  const canSubmit = hasName && hasCpf;

  return (
    <IOSFrame>
      <TopBar table="Mesa 14" restaurant="Trattoria Luna" leftIcon={null} rightIcon={null} />

      <div style={{
        flex: 1, overflow: 'auto',
        padding: '24px 22px 22px',
        display: 'flex', flexDirection: 'column',
      }}>
        <MonoLabel size={10} color={C.faint}>
          Mesa 14 · acabou de escanear
        </MonoLabel>

        <div style={{
          marginTop: 14,
          fontSize: 26, fontWeight: 700, lineHeight: 1.15,
          color: C.ink, letterSpacing: -0.6,
        }}>Quem é você?</div>

        <div style={{
          marginTop: 12,
          fontSize: 15, fontWeight: 500, color: C.mute,
          lineHeight: 1.5, letterSpacing: -0.05, maxWidth: 320,
        }}>
          <b style={{ color: C.ink, fontWeight: 600 }}>Caleb</b>{' '}
          (host da mesa) vai ver seu nome pra decidir se você pode entrar.
        </div>

        {/* Inputs · nome + CPF · gap 14 */}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <InputField
            label="Seu primeiro nome"
            value={nameValue}
            placeholder="Seu primeiro nome"
            focused={true}
          />
          <InputField
            label="Seu CPF"
            value={cpfValue}
            placeholder="000.000.000-00"
            focused={false}
            hint="cpf"
          />
        </div>

        <div style={{
          marginTop: 14,
          fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
          letterSpacing: 0.8, textTransform: 'uppercase', color: C.faint,
          lineHeight: 1.5,
        }}>
          só pra mesa saber quem é · cpf nos ajuda a te reconhecer na próxima visita
        </div>

        <div style={{ flex: 1, minHeight: 20 }} />

        {/* CTA · disabled até ambos válidos */}
        <PillButton
          variant="filled"
          size="lg"
          disabled={!canSubmit}
          style={{
            width: '100%',
            opacity: canSubmit ? 1 : 0.4,
            pointerEvents: canSubmit ? 'auto' : 'none',
          }}
        >
          Continuar
        </PillButton>
      </div>

      <style>{`
        @keyframes cCaret {
          0%, 50%   { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </IOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// FRAMES 4-6 · ScreenCustomerWaitingApproval
//   waiting · approved · failed (timeout/recusa → escape valve)
// ─────────────────────────────────────────────────────────────
const ScreenWaitingApproval = ({ state = 'waiting' }) => {
  const isWaiting  = state === 'waiting';
  const isApproved = state === 'approved';
  const isFailed   = state === 'failed';

  const eyebrow =
    isWaiting  ? 'Aguardando host da mesa · 47 s'
  : isApproved ? 'Você tá na mesa 14'
  :              'Host não respondeu';

  const eyebrowColor =
    isApproved ? C.success
  : isFailed   ? C.mute
  :              C.mute;

  const hero =
    isWaiting  ? 'Esperando aprovação'
  : isApproved ? 'Aprovado!'
  :              'Sem resposta da mesa';

  const sub =
    isWaiting  ? 'Caleb foi avisado · ele tá decidindo se você pode entrar.'
  : isApproved ? 'Te conectando ao chat da mesa em 1 s…'
  :              'Caleb não viu a notificação. Quer chamar a recepcionista presencialmente pra resolver?';

  // Animação central · varia por estado
  const Pulse = () => (
    <div style={{
      width: 96, height: 96, borderRadius: 48,
      border: `1.4px solid ${C.borderSoft}`, background: C.surface,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'cBalloonPulse 2.2s ease-in-out infinite',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 28,
        background: '#fff', border: `1.4px solid ${C.ink}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {Ico.clock(22, C.ink)}
      </div>
    </div>
  );

  const Check = () => (
    <div style={{
      width: 96, height: 96, borderRadius: 48,
      background: C.successWash,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'cCheckPop 480ms cubic-bezier(.4,0,.2,1) both',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 32,
        background: C.success, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{Ico.check(28, '#fff')}</div>
    </div>
  );

  const Sleep = () => (
    <div style={{
      width: 96, height: 96, borderRadius: 48,
      border: `1.4px dashed ${C.borderSoft}`, background: C.surface,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 28,
        background: '#fff', border: `1.4px solid ${C.faint}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.faint, fontSize: 24, fontWeight: 600,
        fontFamily: FONT, letterSpacing: -0.5,
      }}>
        z
      </div>
    </div>
  );

  return (
    <IOSFrame>
      <TopBar table="Mesa 14" restaurant="Trattoria Luna" leftIcon="back" rightIcon={null} />

      <div style={{
        flex: 1, overflow: 'auto',
        padding: '24px 22px 22px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
      }}>
        <span style={{
          fontFamily: MONO, fontSize: 10.5, fontWeight: 700,
          letterSpacing: 1.2, textTransform: 'uppercase',
          color: eyebrowColor,
        }}>
          {isWaiting && (
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: 3,
              background: C.warning, marginRight: 8, verticalAlign: 'middle',
              animation: 'cDot 1.4s ease-in-out infinite',
            }} />
          )}
          {eyebrow}
        </span>

        <div style={{
          marginTop: 14,
          fontSize: 26, fontWeight: 700, lineHeight: 1.15,
          color: C.ink, letterSpacing: -0.6,
        }}>{hero}</div>

        <div style={{
          marginTop: 12,
          fontSize: 15, fontWeight: 500, color: C.mute,
          lineHeight: 1.5, letterSpacing: -0.05, maxWidth: 300,
        }}>{sub}</div>

        <div style={{ marginTop: 38, marginBottom: 38 }}>
          {isWaiting ? <Pulse /> : isApproved ? <Check /> : <Sleep />}
        </div>

        {/* Ladders · 4 dots de cascata · só visível no waiting · ink-on-ink (não staff) */}
        {isWaiting && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 100,
            background: C.surface, border: `1px solid ${C.borderSoft}`,
            fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
            letterSpacing: 0.6, textTransform: 'uppercase', color: C.faint,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: C.ink }} />
            host · 47 s
          </div>
        )}

        {isApproved && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 100,
            background: C.successWash,
            fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
            letterSpacing: 0.6, textTransform: 'uppercase', color: C.success,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: C.success }} />
            redirecionando…
          </div>
        )}

        <div style={{ flex: 1, minHeight: 16 }} />

        {/* CTAs · variam por estado */}
        {isWaiting && (
          <PillButton variant="outline" size="md" style={{ marginTop: 12 }}>
            Cancelar pedido
          </PillButton>
        )}

        {isFailed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 6 }}>
            <PillButton variant="filled" size="lg" style={{ width: '100%' }}>
              Chamar recepcionista
            </PillButton>
            <PillButton variant="outline" size="md" style={{ width: '100%' }}>
              Tentar de novo
            </PillButton>
          </div>
        )}
      </div>

      <style>{`
        @keyframes cBalloonPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.06); opacity: 0.85; }
        }
        @keyframes cCheckPop {
          0%   { transform: scale(0.7); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes cDot {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 1; }
        }
      `}</style>
    </IOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// FRAME 7 · welcome message no chat do cliente novo (após aprovação)
// ─────────────────────────────────────────────────────────────
const ScreenNewClientWelcome = () => (
  <IOSFrame>
    <TopBar table="Mesa 14 · com Caleb" restaurant="Trattoria Luna" />

    <div style={{
      flex: 1, overflow: 'auto',
      padding: '8px 22px 24px',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Notice de chegada · system divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <span style={{ flex: 1, height: 1, background: C.borderSoft }} />
        <MonoLabel size={9.5} color={C.faint}>Você entrou agora · 20:19</MonoLabel>
        <span style={{ flex: 1, height: 1, background: C.borderSoft }} />
      </div>

      {/* Welcome do assistente · estilo AssistantBlock (inline, sem bubble) */}
      <AssistantBlock label="Assistente">
        Bem-vindo à mesa do <b>Caleb</b>! Eles tão pedindo agora. Posso te
        trazer o cardápio?
      </AssistantBlock>

      <ContextualChips
        chips={[
          { label: 'Quero ver o cardápio', primary: true },
          { label: 'Já vou pedir' },
          { label: 'Quem tá na mesa?' },
        ]}
      />

      <div style={{ flex: 1 }} />

      {/* Composer skeleton · só pra terminar a tela */}
      <div style={{
        marginTop: 8,
        padding: '10px 14px',
        background: C.surface,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 999,
        display: 'flex', alignItems: 'center', gap: 10,
        color: C.faint, fontSize: 14,
      }}>
        <span style={{ flex: 1 }}>Pergunte alguma coisa…</span>
        <span style={{
          width: 32, height: 32, borderRadius: 16,
          background: C.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Ico.send(14, '#fff')}</span>
      </div>
    </div>
  </IOSFrame>
);

// ─────────────────────────────────────────────────────────────
// FRAME 8 · bubble "Marina entrou na mesa de vocês" · chat do já-na-mesa
// ─────────────────────────────────────────────────────────────
const ScreenJoinedNotice = () => (
  <IOSFrame>
    <TopBar table="Mesa 14" restaurant="Trattoria Luna" />

    <div style={{
      flex: 1, overflow: 'auto',
      padding: '8px 22px 24px',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Bubble do cliente (Caleb) · contexto pré-existente */}
      <CustomerBubble when="20:14">
        Pode trazer mais uma água com gás pra mesa?
      </CustomerBubble>

      {/* Resposta do assistente */}
      <AssistantBlock label="Assistente">
        Combinado · adicionei <b>Água com gás · 500 ml</b> no pedido.
      </AssistantBlock>

      <ContextualChips
        chips={[
          { label: 'Pedir mais alguma coisa' },
          { label: 'Ver pedido' },
        ]}
      />

      {/* SYSTEM JOIN NOTICE · não é manager · não é AI · é o sistema */}
      <div style={{
        margin: '8px -8px 0',
        padding: '12px 14px',
        background: C.surface,
        border: `1px dashed ${C.borderSoft}`,
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 16,
          background: '#fff', border: `1.3px solid ${C.ink}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink,
          letterSpacing: -0.4,
        }}>M</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MonoLabel size={9.5} color={C.faint}>Mesa 14 · agora</MonoLabel>
          <div style={{
            fontSize: 14, fontWeight: 600, color: C.ink,
            letterSpacing: -0.1, marginTop: 2,
          }}>
            <b>Marina</b> entrou na mesa de vocês.
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        marginTop: 8,
        padding: '10px 14px',
        background: C.surface,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 999,
        display: 'flex', alignItems: 'center', gap: 10,
        color: C.faint, fontSize: 14,
      }}>
        <span style={{ flex: 1 }}>Pergunte alguma coisa…</span>
        <span style={{
          width: 32, height: 32, borderRadius: 16,
          background: C.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Ico.send(14, '#fff')}</span>
      </div>
    </div>
  </IOSFrame>
);

// ═════════════════════════════════════════════════════════════
// DCSection EXPORT
// ═════════════════════════════════════════════════════════════
window.CLIENTE_LATE_ARRIVAL_SECTIONS = [
  {
    id: 'customer-late-arrival-flow',
    title: 'Late-arrival via customer-host · flow do cliente',
    subtitle:
      'Cliente B escaneia QR de mesa ocupada. ' +
      'Se ainda anônimo (1ª visita · sem nome no DB), bloqueio obrigatório "Quem é você?" ANTES da request ser criada — ' +
      'pede nome + CPF · backend faz lookup por CPF (auto-login se já existe · welcome canônico) e host SEMPRE vê o ' +
      'nome real do solicitante, nunca um "?" anônimo (pergunta social só funciona com nome). ' +
      'Cliente A (host) recebe push · aprova ou não. ' +
      'Sem cascata pro staff: se host não responder em 60 s, cliente B vê escape-valve "chamar recepcionista" ' +
      '(reusa o flow de chamado existente). Staff só recebe notificação passiva depois (ver canvas garçom V16). ' +
      'Spec completo · `/docs/features/customer-host-model.md`.',
    frames: [
      fL({
        label: '01 push lockscreen · customer-host',
        screen: <PushHostJoinIOS />,
        note:
          'Push pro cliente-host (Caleb). INK NEUTRO · não mostarda. Mostarda fica reservada pro vocabulário staff (atenção operacional). ' +
          'Cliente recebendo pergunta social = ink calmo, não-urgente. Sub-line do push sempre tem nome real do solicitante ' +
          '("Marina · Mesa 14") · zero "Cliente novo" anônimo, zero "?", graças ao IdentifyBeforeJoin (frame 03).',
      }),
      fL({
        label: '02 ScreenCustomerHostApproveJoin · sempre identificado',
        screen: <ScreenHostApproveJoin visitContext="primeira visita" />,
        note:
          'Solicitante SEMPRE identificada por nome · `requesterName` nunca null. Mostrado aqui com sub "primeira visita" ' +
          '(first-timer-just-identified · acabou de passar pelo IdentifyBeforeJoin no frame 03). Returning customers veem ' +
          'a mesma tela com sub "3ª visita" / "5ª visita" etc — só varia o sub mono caps sob o nome no bloco "Quem quer entrar". ' +
          'Sub diz "Tem 1 lugar livre". CTAs full-width stacked: "Sim, pode entrar" (filled ink) + "Não, era engano" (outline).',
      }),
      fL({
        label: '03 ScreenCustomerIdentifyBeforeJoin · nome + CPF · auto-login',
        screen: <ScreenCustomerIdentifyBeforeJoin />,
        note:
          'Cliente B novo (sem `customers.name` na sessão) escaneou QR de mesa ocupada. Antes de criar a ' +
          '`late_arrival_request`, app mostra esse bloqueio · 2 inputs: nome (validação não-vazio) + CPF (mask ' +
          '`000.000.000-00` · validação dígitos verificadores no front). CTA filled Continuar disabled até ambos válidos. ' +
          'Após submit, `POST /customers/identify` faz lookup por CPF: se existe → auto-login · merge sessão · próxima ' +
          'tela usa `canonicalName` do banco (welcome "Bem-vindo de volta, [nome]" se diferente do digitado); se novo → ' +
          'cria registro · `name + cpf_hash` salvos · request prossegue. Mono caps: "SÓ PRA MESA SABER QUEM É · CPF NOS ' +
          'AJUDA A TE RECONHECER NA PRÓXIMA VISITA". Returning customers (sessão já identificada) pulam essa tela.',
      }),
      fL({
        label: '04 ScreenCustomerWaitingApproval · aguardando host',
        screen: <ScreenWaitingApproval state="waiting" />,
        note:
          'Cliente novo (B) esperando o host responder. Eyebrow mostra countdown único (47 s · 60 s total). Animação central · cBalloonPulse 2.2s. CTA outline "Cancelar pedido". TTL termina aos 0 s → vai pro estado failed (frame 06).',
      }),
      fL({
        label: '05 ScreenCustomerWaitingApproval · aprovado',
        screen: <ScreenWaitingApproval state="approved" />,
        note:
          'Host aprovou. Success animation · check ink-success em wash verde. Pill mono caps "REDIRECIONANDO…". Em ~1 s transiciona pro frame 07 (welcome message). Sem CTA visível: tela é de passagem.',
      }),
      fL({
        label: '06 ScreenCustomerWaitingApproval · timeout / recusa · escape valve',
        screen: <ScreenWaitingApproval state="failed" />,
        note:
          'Host não respondeu em 60s OU disse "Não, era engano". Mesmo frame nos 2 casos · copy neutra ("Sem resposta da mesa") · não vermelho/erro. CTA filled "Chamar recepcionista" cai no waiter-call existente (humano resolve com humano · sem cascata automática pro staff). CTA outline "Tentar de novo" pra retry.',
      }),
      fL({
        label: '07 welcome no chat do cliente novo',
        screen: <ScreenNewClientWelcome />,
        note:
          'Cliente novo (Marina) acabou de ser conectada à sessão da mesa 14. TopBar mostra "Mesa 14 · com Caleb" pra deixar claro que ela entrou na mesa de outra pessoa. Welcome do assistente · referência ao host. Chips contextuais primeiros (cardápio · pedir · ver mesa).',
      }),
      fL({
        label: '08 chat dos já-na-mesa · "Marina entrou"',
        screen: <ScreenJoinedNotice />,
        note:
          'Chat do Caleb (host) e dos demais já-na-mesa. System join notice · não é ManagerBubble (não é gerente falando) · não é AssistantBlock (não é IA falando) · é evento de sistema · card dashed ink. Aparece logo abaixo da última troca · não interrompe o fluxo.',
      }),
    ],
  },
];

Object.assign(window, {
  // expostos só pra debug · não usados de fora
  PushHostJoinIOS,
  ScreenHostApproveJoin,
  ScreenCustomerIdentifyBeforeJoin,
  ScreenWaitingApproval,
  ScreenNewClientWelcome,
  ScreenJoinedNotice,
});
