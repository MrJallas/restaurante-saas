// ============================================================
// V15 · ROUND 8a · CUSTOMER-HOST FOUNDATION + QR ILEGÍVEL
// ────────────────────────────────────────────────────────────
// Estabelece o princípio arquitetural "customer-host" (primeira
// pessoa a abrir comanda vira host da sessão · aprova decisões
// sociais · staff é fallback) e implementa o flow QR ilegível
// (staff-only · sem customer-host · puramente operacional).
//
// EXPORTS (2 arrays no window pra montagem do canvas):
//   GARCOM_HOST_PATTERN_SECTIONS · 1 DCSection · 2 frames de princípio
//   GARCOM_QR_ISSUE_SECTIONS    · 1 DCSection · 8 frames staff-qr-issue
//
// LINGUAGEM: idêntica ao garcom-tokens.jsx (Inter sans · paleta light/dark
// via useG · mostarda warn p/ qr-issue · mono caps em metadados).
// ============================================================

const { useState: qrUseState } = React;

// ─────────────────────────────────────────────────────────────
// IOSFrame / AndroidFrame — locais ao módulo (Babel escopa cada
// <script>; idêntico ao garcom-complaint.jsx).
// ─────────────────────────────────────────────────────────────
const QrIOSFrame = ({ children, style }) => {
  const ink = '#0a0a0a';
  return (
    <div style={{
      width: 390, height: 844, background: '#ffffff', color: ink,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      border: `1.5px solid ${ink}`, borderRadius: 44, ...style,
    }}>
      <div style={{
        height: 44, padding: '0 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: 13, fontWeight: 600, flexShrink: 0,
      }}>
        <span>9:41</span>
        <div style={{
          position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)',
          width: 110, height: 30, borderRadius: 15, background: ink,
        }} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
          <svg width="17" height="11" viewBox="0 0 17 11">
            <rect x="0" y="6" width="3" height="4" rx="0.6" fill={ink}/>
            <rect x="4.5" y="4" width="3" height="6" rx="0.6" fill={ink}/>
            <rect x="9" y="2" width="3" height="8" rx="0.6" fill={ink}/>
            <rect x="13.5" y="0" width="3" height="10" rx="0.6" fill={ink}/>
          </svg>
          <svg width="15" height="11" viewBox="0 0 15 11">
            <path d="M7.5 2.5C9.6 2.5 11.5 3.4 12.8 4.8L13.8 3.8C12.2 2.2 10 1 7.5 1 5 1 2.8 2.2 1.2 3.8L2.2 4.8C3.5 3.4 5.4 2.5 7.5 2.5Z" fill={ink}/>
            <path d="M7.5 5.8C8.8 5.8 9.9 6.3 10.7 7.1L11.7 6.1C10.6 5 9.1 4.3 7.5 4.3 5.9 4.3 4.4 5 3.3 6.1L4.3 7.1C5.1 6.3 6.2 5.8 7.5 5.8Z" fill={ink}/>
            <circle cx="7.5" cy="9" r="1.3" fill={ink}/>
          </svg>
          <svg width="24" height="11" viewBox="0 0 24 11">
            <rect x="0.5" y="0.5" width="20" height="10" rx="2.8" stroke={ink} strokeOpacity="0.4" fill="none"/>
            <rect x="2" y="2" width="17" height="7" rx="1.5" fill={ink}/>
          </svg>
        </div>
      </div>
      {children}
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 134, height: 5, borderRadius: 3, background: ink, opacity: 0.85,
      }} />
    </div>
  );
};

const QrAndroidFrame = ({ children, style }) => {
  const ink = '#0a0a0a';
  return (
    <div style={{
      width: 390, height: 844, background: '#ffffff', color: ink,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      border: `1.5px solid ${ink}`, borderRadius: 36, ...style,
    }}>
      <div style={{
        height: 32, padding: '0 18px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: 13, fontWeight: 500,
        flexShrink: 0, position: 'relative',
      }}>
        <span>9:30</span>
        <div style={{
          position: 'absolute', left: '50%', top: 8, transform: 'translateX(-50%)',
          width: 18, height: 18, borderRadius: 9, background: ink,
        }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="14" height="11" viewBox="0 0 14 11"><path d="M7 10L0 3a9 9 0 0114 0L7 10z" fill={ink}/></svg>
          <svg width="14" height="11" viewBox="0 0 14 11"><path d="M13 10V0L1 10h12z" fill={ink}/></svg>
          <svg width="20" height="11" viewBox="0 0 20 11">
            <rect x="2" y="1.5" width="14" height="8" rx="1.2" fill="none" stroke={ink}/>
            <rect x="3.5" y="3" width="11" height="5" rx="0.6" fill={ink}/>
            <rect x="16.5" y="4" width="1.5" height="3" rx="0.4" fill={ink}/>
          </svg>
        </div>
      </div>
      {children}
      <div style={{
        height: 18, display: 'flex', justifyContent: 'center', alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ width: 100, height: 3, borderRadius: 2, background: ink, opacity: 0.7 }} />
      </div>
    </div>
  );
};

// helper builder (mesma estrutura do fG do complaint)
const fQ = ({ label, platform = 'iOS', screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard key={'v15g-' + label + '-' + platform} id={'v15g-' + label + '-' + platform}
      label={`${label} · ${platform}`}
      width={414} height={844 + captionH + 24}
      style={{ background: '#f0eee9', borderRadius: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px', gap: 18 }}>
        {screen}
        {note && (
          <div style={{
            marginTop: 14, maxWidth: 420, fontSize: 12, color: '#6b6b6b', lineHeight: 1.5,
            fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: -0.05,
          }}>{note}</div>
        )}
      </div>
    </DCArtboard>
  );
};

// QR riscado custom — usado no card de Operação · Alertas pra qr-issue
const IconQrSlash = ({ s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
    <path d="M14 14h2M18 14v2M20 18v2M14 18h2M16 20h2" />
    <line x1="3" y1="21" x2="21" y2="3" strokeWidth="2.2" />
  </svg>
);

// ═════════════════════════════════════════════════════════════
// SEÇÃO 1 · CUSTOMER-HOST PATTERN — 2 FRAMES DE PRINCÍPIO
// ═════════════════════════════════════════════════════════════

// Frame conceitual — NÃO é tela do app. Renderiza dentro de QrIOSFrame
// pra manter consistência visual com o resto do canvas (1 device-shape
// por artboard). O conteúdo é texto + ilustração esquemática.
const HostPrincipioFrame = () => {
  const C = useG(false);
  const accent = '#9A7212'; // mostarda — coerente com qr-issue depois
  return (
    <QrIOSFrame>
      <div style={{
        flex: 1, overflow: 'hidden', background: '#FBF7EE',
        fontFamily: G_FONT, color: C.ink,
        display: 'flex', flexDirection: 'column',
        padding: '32px 24px 28px',
      }}>
        <div style={{
          fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
          fontWeight: 800, color: accent,
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}>PRINCÍPIO · CUSTOMER-HOST</div>

        <div style={{
          fontSize: 32, fontWeight: 800, letterSpacing: -0.8,
          lineHeight: 1.1, color: C.ink, marginTop: 14,
        }}>
          Quem abre a comanda<br/>
          vira <span style={{ color: accent }}>host</span> da mesa.
        </div>

        <div style={{
          fontSize: 14, lineHeight: 1.5, color: C.mute, marginTop: 14,
          fontWeight: 500, letterSpacing: -0.05,
        }}>
          A primeira pessoa que escaneia o QR e abre a comanda vira
          <i> host</i> da sessão. Tem privilégio de aprovar decisões{' '}
          <b>sociais</b> da mesa antes do staff.
        </div>

        {/* Ilustração esquemática · mesa + 4 cadeiras · 1 highlighted */}
        <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center' }}>
          <svg width="220" height="180" viewBox="0 0 220 180">
            {/* mesa */}
            <ellipse cx="110" cy="90" rx="58" ry="36"
              fill="#fff" stroke={C.ink} strokeWidth="1.5" />
            {/* 4 cadeiras (círculos) */}
            <circle cx="110" cy="22" r="14" fill={accent} stroke={C.ink} strokeWidth="1.5" />
            <circle cx="36"  cy="90" r="11" fill="#fff"  stroke={C.ink} strokeWidth="1.5" />
            <circle cx="184" cy="90" r="11" fill="#fff"  stroke={C.ink} strokeWidth="1.5" />
            <circle cx="110" cy="158" r="11" fill="#fff" stroke={C.ink} strokeWidth="1.5" />
            {/* badge HOST */}
            <rect x="78" y="42" width="64" height="20" rx="10"
              fill={accent} stroke="none" />
            <text x="110" y="55" textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize="10" fontWeight="800" letterSpacing="1.4"
              fill="#fff">HOST</text>
            {/* setinha do badge pro avatar */}
            <path d="M110 38 L110 32" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* 3 bullets · privilégios do host */}
        <div style={{
          marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {[
            { tag: 'LATE-ARRIVAL', text: 'Aprova chegada tardia (amigo atrasou 20 min)' },
            { tag: 'TABLE-MERGE', text: 'Aprova juntar com a mesa do lado' },
            { tag: 'JANELA · 60s',  text: 'Sem resposta → cascata escala pro staff' },
          ].map(b => (
            <div key={b.tag} style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
            }}>
              <span style={{
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, color: accent,
                whiteSpace: 'nowrap', minWidth: 96,
              }}>{b.tag}</span>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: 500, letterSpacing: -0.05 }}>
                {b.text}
              </span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          fontSize: 10.5, color: C.mute, fontWeight: 500, letterSpacing: -0.05,
          lineHeight: 1.5, paddingTop: 12, borderTop: `1px solid ${C.borderSoft}`,
        }}>
          Walk-in (sessão aberta direto pelo staff) tem <code style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 10,
            background: C.surface, padding: '1px 5px', borderRadius: 3,
          }}>host_customer_id = NULL</code> · cascata começa direto no
          recepcionista.
        </div>
      </div>
    </QrIOSFrame>
  );
};

// Frame da cascata · 4 steps verticais com timer
const HostCascataFrame = () => {
  const C = useG(false);
  const accent = '#9A7212';
  const steps = [
    { idx: 1, role: 'Customer-host',  who: 'Caleb (host da mesa 14)', time: '60 s',  tone: accent, sub: '↓ sem resposta · ou host = NULL' },
    { idx: 2, role: 'Recepcionista',  who: 'Olivia · em turno',        time: '60 s',  tone: '#3B5FBE', sub: '↓ sem resposta' },
    { idx: 3, role: 'Manager',        who: 'Renata · em turno',        time: '60 s',  tone: '#3B5FBE', sub: '↓ sem resposta' },
    { idx: 4, role: 'Garçom',         who: 'Broadcast em turno',       time: '60 s',  tone: '#3B5FBE', sub: '↓ ainda sem resposta após 240 s totais' },
    { idx: 5, role: 'Sistema',        who: 'Recusa amigável (ou resolução por tipo)', time: 'fallback', tone: C.faint, sub: null, terminal: true },
  ];
  return (
    <QrIOSFrame>
      <div style={{
        flex: 1, overflow: 'auto', background: '#FBF7EE',
        fontFamily: G_FONT, color: C.ink,
        display: 'flex', flexDirection: 'column',
        padding: '24px 20px 22px',
      }}>
        <div style={{
          fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
          fontWeight: 800, color: accent,
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        }}>CASCATA PADRÃO · ESCALATION_CHAINS</div>

        <div style={{
          fontSize: 26, fontWeight: 800, letterSpacing: -0.6,
          lineHeight: 1.1, color: C.ink, marginTop: 10,
        }}>
          Customer-host →<br/>recepcionista → manager → garçom
        </div>

        <div style={{
          fontSize: 12.5, lineHeight: 1.5, color: C.mute, marginTop: 10,
          fontWeight: 500, letterSpacing: -0.05,
        }}>
          Reusada em todos os flows que envolvem decisão social
          (late-arrival · table-merge · futuro). QR ilegível pula direto
          pro staff (sem decisão social).
        </div>

        <div style={{
          marginTop: 18, display: 'flex', flexDirection: 'column', gap: 0,
        }}>
          {steps.map((s, i) => (
            <div key={s.idx} style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${C.borderSoft}`,
                borderLeft: `3px solid ${s.tone}`,
                background: '#fff',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 13,
                  background: s.terminal ? '#fff' : s.tone,
                  border: s.terminal ? `1.5px dashed ${C.faint}` : 'none',
                  color: s.terminal ? C.faint : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                }}>{s.terminal ? '·' : s.idx}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.15 }}>{s.role}</div>
                    <div style={{
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.7, color: s.tone,
                      textTransform: 'uppercase',
                    }}>{s.time}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 1, letterSpacing: -0.05 }}>
                    {s.who}
                  </div>
                </div>
              </div>
              {s.sub && (
                <div style={{
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
                  color: C.faint, padding: '6px 0 6px 28px',
                }}>{s.sub}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 16, padding: '10px 12px', borderRadius: 10,
          background: '#F6F2E5', border: `1px dashed ${accent}`,
          fontSize: 11, color: '#6b5a1f', fontWeight: 500, lineHeight: 1.45,
          letterSpacing: -0.05,
        }}>
          <b style={{ color: accent }}>QR ilegível pula a etapa 1</b> · não é
          decisão social, é problema operacional. Cascata vira{' '}
          <i>manager → outro manager → dono → pendência fria</i>.
        </div>
      </div>
    </QrIOSFrame>
  );
};

// ═════════════════════════════════════════════════════════════
// SEÇÃO 2 · STAFF QR-ISSUE FLOW · 8 FRAMES
// ═════════════════════════════════════════════════════════════

// ─── frame 1 · ScreenWaiterReportQrIssue (sheet · compose mode)
const ScreenWaiterReportQrIssue = ({ mode = 'compose', table = 14, andro = false }) => {
  const C = useG(false);
  const Frame = andro ? QrAndroidFrame : QrIOSFrame;
  const accent = '#9A7212';

  return (
    <Frame>
      {/* ScreenWaiterNewEntry esmaecido como background context */}
      <div style={{
        position: 'absolute', inset: 0, top: andro ? 32 : 44,
        bottom: andro ? 18 : 8,
        background: C.surface, opacity: 0.45, pointerEvents: 'none',
      }}>
        <div style={{ padding: '54px 16px 12px', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.bg, border: `1px solid ${C.borderSoft}` }} />
          <div style={{ width: 100, height: 14, borderRadius: 4, background: C.borderSoft, alignSelf: 'center' }} />
          <div style={{ width: 40 }} />
        </div>
        <div style={{ padding: '24px 24px', textAlign: 'center' }}>
          <div style={{ width: 220, height: 24, borderRadius: 6, background: C.borderSoft, margin: '0 auto' }} />
          <div style={{ width: 280, height: 12, borderRadius: 4, background: C.borderSoft, margin: '12px auto 0' }} />
        </div>
        <div style={{ padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 96, borderRadius: 16, background: C.ink, opacity: 0.4 }} />
          <div style={{ height: 96, borderRadius: 16, background: C.bg, border: `1.5px solid ${C.borderSoft}` }} />
        </div>
      </div>

      {/* Sheet bottom · vaul */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: andro ? 18 : 8,
        background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        animation: 'gFadeIn 200ms ease-out',
        top: andro ? 200 : 220,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div style={{
          background: C.bg, color: C.ink,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          padding: '8px 0 24px',
          fontFamily: G_FONT,
          maxHeight: '100%', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            width: 38, height: 4, borderRadius: 2,
            background: '#dcdcdc', margin: '0 auto 14px',
          }} />

          <div style={{ padding: '0 22px 6px' }}>
            <div style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
              textTransform: 'uppercase', color: accent,
            }}>REPORTAR QR · TRATTORIA LUNA</div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 6, letterSpacing: -0.3,
            }}>Qual a mesa com QR ilegível?</div>
            <div style={{
              fontSize: 13, color: C.mute, marginTop: 6, fontWeight: 500, lineHeight: 1.5,
            }}>
              O gerente vai ver agora · enquanto isso, use{' '}
              <span style={{ fontWeight: 700, color: C.ink }}>Inserir manualmente</span>.
            </div>
          </div>

          {/* Stepper · seleção de mesa */}
          <div style={{ padding: '18px 22px 4px' }}>
            <div style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
              textTransform: 'uppercase', color: C.faint,
              marginBottom: 8,
            }}>NÚMERO DA MESA</div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: `1.5px solid ${C.ink}`, borderRadius: 14,
              padding: '6px 8px', background: C.bg,
            }}>
              <button aria-label="Diminuir" style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: 44, height: 44, borderRadius: 10,
                background: C.surface, color: C.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{Icon.minus(20)}</button>
              <div style={{
                fontSize: 32, fontWeight: 800, color: C.ink, letterSpacing: -1,
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>{table}</div>
              <button aria-label="Aumentar" style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: 44, height: 44, borderRadius: 10,
                background: C.surface, color: C.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{Icon.plus(20)}</button>
            </div>

            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <button style={{
                all: 'unset', cursor: 'pointer',
                fontSize: 12, color: C.mute, fontWeight: 600,
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}>Não sei o número →</button>
            </div>
          </div>

          {/* ContextualInputExpand · descrição */}
          <div style={{ padding: '14px 22px 4px' }}>
            <div style={{
              border: `1.3px solid ${C.borderSoft}`, borderRadius: 12,
              padding: '12px 14px', background: C.bg,
              minHeight: 72,
            }}>
              <div style={{
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
                textTransform: 'uppercase', color: C.faint, marginBottom: 6,
              }}>DESCRIÇÃO · OPCIONAL</div>
              <div style={{
                fontSize: 14, color: C.mute, fontWeight: 500, lineHeight: 1.5,
                fontStyle: 'italic',
              }}>
                O que rolou? (ex: QR borrado, descolou da mesa…)
              </div>
              <div style={{
                marginTop: 8, display: 'flex', justifyContent: 'flex-end',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7,
                textTransform: 'uppercase', color: C.faint,
              }}>0 / 200</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Footer · CTA + cancelar */}
          <div style={{
            padding: '14px 22px 0', display: 'flex', flexDirection: 'column',
            gap: 8,
          }}>
            <button style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              padding: '0 16px', height: 50, borderRadius: 12,
              background: C.ink, color: '#fff',
              fontSize: 15, fontWeight: 700, letterSpacing: -0.1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>Reportar pra gerente</button>
            <button style={{
              all: 'unset', cursor: 'pointer',
              padding: '12px 16px',
              fontSize: 13, color: C.mute, fontWeight: 600, textAlign: 'center',
            }}>Cancelar</button>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ─── frame 2 · ScreenWaiterReportQrIssue · estado pós-envio (sheet shrinka)
const ScreenWaiterReportQrIssueSent = () => {
  const C = useG(false);
  const accent = '#9A7212';
  return (
    <QrIOSFrame>
      {/* mesmo background esmaecido */}
      <div style={{
        position: 'absolute', inset: 0, top: 44, bottom: 8,
        background: C.surface, opacity: 0.45, pointerEvents: 'none',
      }}>
        <div style={{ padding: '54px 16px 12px', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.bg, border: `1px solid ${C.borderSoft}` }} />
          <div style={{ width: 100, height: 14, borderRadius: 4, background: C.borderSoft, alignSelf: 'center' }} />
          <div style={{ width: 40 }} />
        </div>
        <div style={{ padding: '24px 24px', textAlign: 'center' }}>
          <div style={{ width: 220, height: 24, borderRadius: 6, background: C.borderSoft, margin: '0 auto' }} />
        </div>
      </div>

      {/* Sheet shrinkado · só o bloco confirmação */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 8,
        background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        top: 480,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div style={{
          background: C.bg, color: C.ink,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          padding: '8px 0 22px', fontFamily: G_FONT,
        }}>
          <div style={{
            width: 38, height: 4, borderRadius: 2,
            background: '#dcdcdc', margin: '0 auto 16px',
          }} />

          <div style={{ padding: '0 22px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: '#1E8C5A', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{Icon.check(13)}</div>
              <span style={{
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
                textTransform: 'uppercase', color: '#1E8C5A',
              }}>ENVIADO · 19:42</span>
            </div>

            {/* Bubble preview da mensagem enviada */}
            <div style={{
              marginTop: 12, padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              borderLeft: `3px solid ${accent}`,
              background: C.surface,
            }}>
              <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.45 }}>
                Mesa 14 · QR ilegível · gerente avisado
              </div>
              <div style={{
                fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 4, lineHeight: 1.4,
              }}>
                "QR borrado · descolou da mesa"
              </div>
            </div>

            {/* Status pill · pulse */}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 14px', borderRadius: 100,
                background: '#F6F2E5', border: `1px solid #E5D9B0`,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 4, background: accent,
                  animation: 'gPulse 1.6s infinite',
                }} />
                <span style={{
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
                  textTransform: 'uppercase', color: '#6b5a1f',
                }}>AGUARDANDO RESPOSTA DO GERENTE...</span>
              </div>
            </div>

            <div style={{
              marginTop: 14, fontSize: 11.5, color: C.faint,
              fontWeight: 500, textAlign: 'center', lineHeight: 1.5,
            }}>
              Auto-fecha em 5 s · enquanto isso, continue com{' '}
              <span style={{ fontWeight: 700, color: C.mute }}>Inserir manualmente</span>.
            </div>

            <button style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              width: '100%', marginTop: 14,
              padding: '12px 16px', borderRadius: 10,
              border: `1px solid ${C.borderSoft}`,
              background: 'transparent', color: C.ink,
              fontSize: 14, fontWeight: 600, textAlign: 'center',
            }}>Voltar agora</button>
          </div>
        </div>
      </div>
    </QrIOSFrame>
  );
};

// ─── frame 3 · Push lockscreen · qr-issue (mostarda · não crítico)
const QrIssuePushIOS = () => (
  <QrIOSFrame style={{ background: '#0e0c12' }}>
    <div style={{ position: 'absolute', inset: 0, top: 44, bottom: 8 }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, #2e261a 0%, #1f1a14 60%, #0e0c12 100%)',
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
          }}>19:42</div>
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
              boxShadow: '0 0 0 1.5px rgba(217,142,43,0.65), 0 6px 20px rgba(217,142,43,0.18)',
            }}>
              <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: '#0a0a0a', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Inter', system-ui", fontWeight: 700, fontSize: 14,
                  letterSpacing: -0.5, position: 'relative',
                }}>
                  TL
                  <span style={{
                    position: 'absolute', top: -3, right: -3,
                    width: 12, height: 12, borderRadius: 6, background: '#D98E2B',
                    border: '2px solid rgba(255,255,255,0.9)',
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0,
                  fontFamily: '-apple-system, system-ui', color: '#000' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
                      QR ilegível · Mesa 14
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)', flexShrink: 0, marginLeft: 8 }}>agora</div>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: '20px', color: '#000', marginTop: 1, letterSpacing: -0.2 }}>
                    Mariana Costa: "QR borrado · descolou da mesa"
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
  </QrIOSFrame>
);

// ─── frame 4 · MInProgressCard kind="qr-issue" no Painel · Em curso
const MQrIssueInProgressCard = ({
  table = 14, waiter = 'Mariana', receivedAgo = 'há 2 min',
  preview = '"QR borrado · descolou da mesa"',
}) => {
  const C = useG(false);
  const accent = '#D98E2B';
  return (
    <div style={{
      cursor: 'pointer', userSelect: 'none',
      padding: '12px 12px 12px 14px',
      borderRadius: 14,
      border: `1px solid ${C.borderSoft}`,
      borderLeft: `3px solid ${accent}`,
      background: C.bg,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 800, color: '#9A7212',
        letterSpacing: 0.7, textTransform: 'uppercase',
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
      }}>QR ILEGÍVEL · MESA {table}</div>

      <div style={{
        fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.15,
        lineHeight: 1.35, marginTop: 6,
      }}>{waiter} reportou · {receivedAgo}</div>
      <div style={{
        fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 3,
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        letterSpacing: 0.2, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{preview}</div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center' }}>
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '7px 12px', height: 32, borderRadius: 8,
          background: '#D98E2B', color: '#fff',
          fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center',
        }}>Tô indo verificar</button>
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '7px 12px', height: 32, borderRadius: 8,
          border: `1px solid ${C.borderSoft}`,
          background: 'transparent', color: C.ink,
          fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center',
        }}>Já mandei reimprimir</button>
      </div>
    </div>
  );
};

const MgrPainelQrIssueFrame = () => {
  const C = useG(false);
  return (
    <QrIOSFrame>
      <div style={{ flex: 1, overflow: 'hidden', background: C.surface,
        fontFamily: G_FONT, color: C.ink, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '14px 16px 12px', borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>Painel</div>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              background: C.bg, border: `1px solid ${C.borderSoft}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.ink, position: 'relative',
            }}>
              {Icon.bell(18)}
              <span style={{
                position: 'absolute', top: -3, right: -3,
                minWidth: 14, height: 14, borderRadius: 7,
                background: '#D98E2B', color: '#fff',
                fontSize: 9, fontWeight: 800, padding: '0 3px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>2</span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.faint, fontWeight: 500, marginTop: 6 }}>Boa noite,</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: C.ink, marginTop: 2 }}>
            Renata Albuquerque
          </div>
          <div style={{
            display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 10,
            fontSize: 11, color: C.faint, fontWeight: 700,
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#1E8C5A',
              animation: 'gPulse 2s infinite',
            }} />
            AO VIVO · TURNO DA NOITE · 19:42
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ marginTop: 18 }}>
            <div style={{ padding: '0 16px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Em curso · 2
              </div>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MQrIssueInProgressCard
                table={14} waiter="Mariana" receivedAgo="há 2 min"
                preview='"QR borrado · descolou da mesa"' />
              {/* placeholder pra contexto */}
              <div style={{
                padding: '12px 12px 12px 14px', borderRadius: 14,
                border: `1px solid ${C.borderSoft}`,
                borderLeft: `3px solid #3B5FBE`, background: C.bg,
              }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 800, color: '#3B5FBE',
                  letterSpacing: 0.7, textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>CORTESIA · MESA 18 · AGUARDANDO ACEITAR</div>
                <div style={{
                  marginTop: 6, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>Sobremesa · Petit gâteau · 2 porções</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22, padding: '0 16px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Hoje no turno
            </div>
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              padding: '10px 12px', borderRadius: 12,
              border: `1px solid ${C.borderSoft}`, background: C.bg,
              fontSize: 12, color: C.faint, fontWeight: 500,
            }}>
              Cozinha · risoto cogumelos esperando há 22 min · meta 12 min
            </div>
          </div>
        </div>
      </div>
    </QrIOSFrame>
  );
};

// ─── frame 5 · Operação · Alertas · card qr-issue
const MgrOpsAlertsQrIssueFrame = () => {
  const C = useG(false);
  return (
    <QrIOSFrame>
      <div style={{ flex: 1, overflow: 'hidden', background: C.surface,
        fontFamily: G_FONT, color: C.ink, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '14px 16px 12px', borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>Operação</div>
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: C.bg, border: `1px solid ${C.borderSoft}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.ink,
          }}>{Icon.bell(18)}</div>
        </div>

        <div style={{ display: 'flex', borderBottom: `1px solid ${C.borderSoft}`, background: C.bg }}>
          {['Alertas', 'Mapa', 'Funil'].map((label, i) => (
            <div key={label} style={{
              flex: 1, textAlign: 'center', padding: '11px 6px',
              fontSize: 13, fontWeight: 600,
              color: i === 0 ? C.ink : C.faint,
              borderBottom: `2px solid ${i === 0 ? C.ink : 'transparent'}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {label}
              {i === 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 100,
                  background: C.ink, color: C.bg,
                }}>4</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, padding: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 12, background: C.bg }}>
              <div style={{
                fontSize: 10.5, color: C.faint, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.6, fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>Críticos</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#C43A3A', marginTop: 2,
                letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>1</div>
            </div>
            <div style={{ flex: 1, padding: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 12, background: C.bg }}>
              <div style={{
                fontSize: 10.5, color: C.faint, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.6, fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>Atenção</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#9A7212', marginTop: 2,
                letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>3</div>
              <div style={{
                fontSize: 10, color: '#9A7212', marginTop: 3, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.6,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>↑ inclui qr-issue</div>
            </div>
          </div>

          <div style={{
            padding: '10px 16px 4px',
            fontSize: 9.5, color: C.faint, fontWeight: 700,
            letterSpacing: 0.7, textTransform: 'uppercase',
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          }}>Cada alerta · 2 ações inline · X dispensa</div>

          <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* QR-ISSUE CARD · TOPO da seção Atenção */}
            <div style={{
              borderRadius: 12, position: 'relative',
              border: `1px solid #E5D9B0`,
              background: C.bg,
              borderLeft: `3px solid #D98E2B`,
              padding: '9px 10px',
            }}>
              <button title="Dispensar" aria-label="Dispensar alerta" style={{
                position: 'absolute', top: 6, right: 6,
                width: 22, height: 22, borderRadius: 11,
                background: 'transparent', color: C.faint,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', padding: 0,
              }}>{Icon.x(13)}</button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 26 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: '#D98E2B', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}><IconQrSlash s={14} /></div>
                <div style={{
                  fontSize: 9.5, fontWeight: 800,
                  letterSpacing: 0.7, textTransform: 'uppercase',
                  color: '#6b5a1f',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>
                  ATENÇÃO · QR ILEGÍVEL · MESA 14
                </div>
              </div>

              <div style={{
                fontSize: 13, fontWeight: 700, color: C.ink,
                lineHeight: 1.25, letterSpacing: -0.1,
                marginTop: 5, paddingRight: 26,
              }}>
                Mariana Costa reportou · há 2 min
              </div>
              <div style={{
                fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                "QR borrado · descolou da mesa"
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '0 10px', height: 32, borderRadius: 8,
                  background: '#D98E2B', color: '#fff',
                  fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center',
                }}>Tô indo verificar</button>
                <button style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '0 10px', height: 32, borderRadius: 8,
                  background: 'transparent', color: '#1d1c19',
                  border: `1px solid ${C.borderSoft}`,
                  fontSize: 12, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center',
                }}>Já mandei reimprimir</button>
              </div>
            </div>

            {/* outros alertas pra contexto */}
            <div style={{
              borderRadius: 12, position: 'relative',
              border: `1px solid #F4C7C7`, background: C.bg,
              borderLeft: `3px solid #C43A3A`, padding: '9px 10px', opacity: 0.62,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 26 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: '#C43A3A', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{Icon.flame(13)}</div>
                <div style={{
                  fontSize: 9.5, fontWeight: 800,
                  letterSpacing: 0.7, textTransform: 'uppercase', color: '#A12626',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>CRÍTICO · HÁ 12 MIN</div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, color: C.ink,
                lineHeight: 1.25, letterSpacing: -0.1, marginTop: 5,
              }}>Cozinha · Risoto cogumelos esperando há 22 min</div>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1 }}>
                Mesa 7 · meta 12 min
              </div>
            </div>
          </div>
        </div>
      </div>
    </QrIOSFrame>
  );
};

// ─── frame 6 + 7 · ScreenCallDetail type="qr-issue"
const QrReplyChip = ({ label, sub, primary = false }) => (
  <div role="button" style={{
    cursor: 'pointer',
    padding: '14px 14px',
    borderRadius: 14,
    border: primary ? '1.5px solid #D98E2B' : '1px solid #e5e5e5',
    background: primary ? '#FBF3DD' : '#fff',
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: primary ? '#D98E2B' : '#f6f5f2',
      color: primary ? '#fff' : '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {primary ? Icon.clock(16) : Icon.arrow(16)}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0a0a0a', letterSpacing: -0.15 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#6b6b6b', marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

const ScreenCallDetailQrIssue = ({ mode = 'chips' }) => {
  const C = useG(false);
  const accent = '#D98E2B';
  const accentBg = '#FBF3DD';
  const accentBorder = '#E5D9B0';
  const accentInk = '#6b5a1f';

  const waiterBubble = (
    <div style={{
      border: `1px solid ${C.borderSoft}`, borderRadius: 12,
      borderLeft: `4px solid ${accent}`, background: C.bg,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 14, lineHeight: 1.45, color: C.ink, letterSpacing: -0.1 }}>
        "QR borrado · descolou da mesa"
      </div>
      <div style={{
        marginTop: 6, fontSize: 11.5, color: C.faint, fontWeight: 500,
      }}>— Mariana Costa · 19:42 · há 2 min</div>
    </div>
  );

  return (
    <QrIOSFrame>
      <div style={{ flex: 1, overflow: 'hidden', background: C.bg, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>

        <div style={{
          padding: '14px 16px 12px', borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: 'transparent', color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon.back(20)}</div>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>QR ilegível</div>
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: 'transparent', color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon.more(20)}</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* HERO MOSTARDA LAVADO */}
          <div style={{
            background: accentBg, color: C.ink, padding: '22px 20px 22px',
            borderBottom: `1px solid ${accentBorder}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                padding: '3px 8px', borderRadius: 100,
                background: accent, color: '#fff',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
              }}>QR ILEGÍVEL · MESA 14</span>
            </div>

            {/* Ícone QR riscado grande */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: accent, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><IconQrSlash s={28} /></div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
                  Mariana reportou agora
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 500, color: accentInk, marginTop: 3,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  letterSpacing: 0.5, textTransform: 'uppercase',
                }}>Continua usando inserir manualmente</div>
              </div>
            </div>

            <div style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase',
              color: accentInk, marginTop: 14,
            }}>MARIANA COSTA · GARÇONETE · HÁ 2 MIN</div>
          </div>

          {/* O QUE ELA DISSE */}
          <div style={{ padding: '20px 16px 8px' }}>
            <div style={{
              fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
              color: C.faint, fontWeight: 700, marginBottom: 10,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>O que ela disse</div>
            {waiterBubble}
          </div>

          {/* RESPOSTA RÁPIDA / CUSTOM COMPOSER */}
          <div style={{ padding: '16px 16px 8px' }}>
            <div style={{
              fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
              color: C.faint, fontWeight: 700, marginBottom: 10,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>{mode === 'custom' ? 'Sua resposta' : 'Resposta rápida'}</div>

            {mode === 'chips' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <QrReplyChip primary label="Tô indo verificar · 2 min" sub="aviso a Mariana e dou uma volta na mesa" />
                <QrReplyChip label="Já mandei reimprimir" sub="QR novo · gráfica leva ~5 min · uso temporário" />
                <QrReplyChip label="Use mesa X temporariamente" sub="abre picker de mesa livre · realloc digital" />
                <QrReplyChip label="Custom · escrever do meu jeito" sub="composer textarea · mensagem pessoal" />
              </div>
            ) : (
              <div>
                <div style={{
                  border: `1.3px solid ${C.ink}`, borderRadius: 14,
                  padding: '14px 16px', background: C.bg, minHeight: 110,
                }}>
                  <div style={{ fontSize: 14.5, lineHeight: 1.5, color: C.ink, letterSpacing: -0.05 }}>
                    Mari, mandei reimprimir agora · pega na recepção em 5 min.
                    Enquanto isso continua com Inserir manualmente. Valeu por reportar.
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 10, fontSize: 11, color: C.faint, fontWeight: 500,
                }}>
                  <span style={{
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase',
                  }}>Pessoal pra Mariana · 142 caracteres</span>
                  <span style={{
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase',
                  }}>Renata · gerente</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ height: 8 }} />
        </div>

        {/* AÇÃO FIXA */}
        <div style={{
          borderTop: `1px solid ${C.borderSoft}`,
          padding: '12px 16px 14px', display: 'flex', gap: 10,
          background: C.bg,
        }}>
          {mode === 'custom' ? (
            <>
              <button style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                padding: '0 14px', height: 44, borderRadius: 10,
                border: `1px solid ${C.borderSoft}`,
                background: 'transparent', color: C.ink,
                fontSize: 14, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center',
              }}>Voltar</button>
              <div style={{ flex: 1 }}>
                <button style={{
                  all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                  width: '100%', padding: '0 14px', height: 44, borderRadius: 10,
                  background: accent, color: '#fff',
                  fontSize: 14, fontWeight: 700, letterSpacing: -0.1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>Enviar resposta</button>
              </div>
            </>
          ) : (
            <>
              <button style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                padding: '0 14px', height: 44, borderRadius: 10,
                border: `1px solid ${C.borderSoft}`,
                background: 'transparent', color: C.ink,
                fontSize: 14, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center',
              }}>Marcar como vista</button>
              <div style={{ flex: 1 }} />
              <span style={{
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
                textTransform: 'uppercase', color: C.faint,
                display: 'inline-flex', alignItems: 'center',
              }}>Toque num chip ↑ para responder</span>
            </>
          )}
        </div>
      </div>
    </QrIOSFrame>
  );
};

// ═════════════════════════════════════════════════════════════
// EXPORTS · 2 ARRAYS PRO CANVAS V15
// ═════════════════════════════════════════════════════════════

window.GARCOM_HOST_PATTERN_SECTIONS = [
  {
    id: 'v15g.host-pattern',
    title: 'Customer-host pattern · princípio + cascata',
    subtitle: 'Round 8a estabelece o princípio arquitetural reusado nos próximos 2 prompts (8b: late-arrival · 8c: table-merge). Spec completo em [`docs/features/customer-host-model.md`](../../docs/features/customer-host-model.md).',
    frames: [
      fQ({ label: 'princípio · primeira pessoa = host', screen: <HostPrincipioFrame />,
        note: 'Frame conceitual (NÃO é tela do app · mora aqui só pra ancorar a narrativa). A primeira pessoa que escaneia o QR e abre comanda vira host. Tem privilégio de aprovar decisões SOCIAIS da mesa antes do staff (late-arrival, table-merge). Walkin (sessão aberta direto pelo staff) tem `host_customer_id = NULL` e a cascata começa direto no recepcionista. Schema: `ALTER TABLE table_sessions ADD COLUMN host_customer_id uuid REFERENCES customers(id);`' }),
      fQ({ label: 'cascata · escalation_chains', screen: <HostCascataFrame />,
        note: 'Cascata padrão reusada por todos os flows com decisão social: customer-host (60s) → recepcionista (60s) → manager (60s) → garçom broadcast (60s) → sistema age fallback (240s totais). Implementada via tabela `escalation_chains` com `type` (qr-issue|late-arrival|table-merge|...) + `current_step` + `steps` jsonb. Eventos WS compartilhados: `escalation.{created,approved,rejected,escalated_to_staff,timeout}`. **QR ilegível pula etapa 1** porque é problema operacional, não decisão social — cascata vira manager → outro manager → dono → pendência fria.' }),
    ],
  },
];

window.GARCOM_QR_ISSUE_SECTIONS = [
  {
    id: 'v15g.qr-issue',
    title: 'Staff QR-issue flow · sem customer-host',
    subtitle: 'Footer "QR ilegível? Contactar gerente" do `ScreenWaiterNewEntry` (V4) vira tap target real abrindo `ScreenWaiterReportQrIssue`. `Call.type` ganha `\'qr-issue\'` (atenção mostarda · não crítico). Aparece em Painel · Em curso, Operação · Alertas, e Push lockscreen. Resposta volta como bubble normal na thread Mensagens (V11) — sem mudança visual, só dispara push manager-message específico.',
    frames: [
      // 1
      fQ({ label: 'reportar QR · sheet compose', screen: <ScreenWaiterReportQrIssue mode="compose" />,
        note: 'Sheet vaul-style com background ScreenWaiterNewEntry esmaecido. Stepper `−[14]+` em mesa · link "Não sei o número" abre lista. ContextualInputExpand opcional pra descrição (max 200 chars · placeholder "QR borrado · descolou…"). CTA filled ink "Reportar pra gerente" + link discreto Cancelar. Dispara `escalation_chain` tipo `qr-issue` direto na etapa 2 (manager).' }),
      // 2
      fQ({ label: 'reportar QR · pós-envio', screen: <ScreenWaiterReportQrIssueSent />,
        note: 'Sheet shrinka pro mínimo. Eyebrow "ENVIADO · 19:42" verde com check, bubble preview "Mesa 14 · QR ilegível · gerente avisado", pill mostarda em pulse "AGUARDANDO RESPOSTA DO GERENTE...". Auto-fecha em 5s OU tap "Voltar agora". Garçom continua o atendimento usando "Inserir manualmente" no chooser do `ScreenWaiterNewEntry`.' }),
      // 3
      fQ({ label: 'push · qr-issue · ios', screen: <QrIssuePushIOS />,
        note: 'Push lockscreen iOS · som notification médio (NÃO crítico, diferente do `complaint`). Border 1.5px mostarda em opacidade reduzida (não pulsa · diferente da reclamação que pulsa em vermelho saturado). Dot mostarda no app icon. Título "QR ilegível · Mesa 14" · sub "Mariana Costa: \\"QR borrado · descolou da mesa\\"". Pulse haptic leve. Tap abre `ScreenCallDetail type="qr-issue"`.' }),
      // 4
      fQ({ label: 'painel · em-curso · qr-issue', screen: <MgrPainelQrIssueFrame />,
        note: 'Painel renderiza `MQrIssueInProgressCard` na seção "Em curso" ao lado de outras operações. Border-left mostarda 3px, kicker mono "QR ILEGÍVEL · MESA 14", headline Inter 14/700 "Mariana reportou · há 2 min", sub mono tiny faint com descrição truncada em 1 linha. 2 ações inline: "Tô indo verificar" filled mostarda (primária) + "Já mandei reimprimir" outline. Tap no corpo abre `ScreenCallDetail type="qr-issue"`.' }),
      // 5
      fQ({ label: 'ops · alertas · qr-issue', screen: <MgrOpsAlertsQrIssueFrame />,
        note: 'Card no topo da Operação · Alertas (sub-tab Alertas) com border-left mostarda + ícone QR riscado custom (24×24 mostarda) + pill mono caps "ATENÇÃO · QR ILEGÍVEL · MESA 14". Tile "Atenção" do KPI bumpa de 2 → 3 quando entra um qr-issue (não vira "Crítico" — diferente do complaint). Mesmas 2 ações inline + X dispense canto sup direito.' }),
      // 6
      fQ({ label: 'qr-issue detail · 4 chips', screen: <ScreenCallDetailQrIssue mode="chips" />,
        note: '`ScreenCallDetail type="qr-issue"`. Hero mostarda lavado com pill "QR ILEGÍVEL · MESA 14" + ícone QR riscado 48×48 + headline "Mariana reportou agora" + reminder mono tiny "CONTINUA USANDO INSERIR MANUALMENTE" (lembrete operacional pro gerente). Eyebrow assinatura "MARIANA COSTA · GARÇONETE · HÁ 2 MIN". Bubble da garçonete com a fala. 4 chips: `Tô indo verificar · 2 min` (primário mostarda · mais usado), `Já mandei reimprimir`, `Use mesa X temporariamente` (abre picker de mesa livre), `Custom · escrever do meu jeito`.' }),
      // 7
      fQ({ label: 'qr-issue detail · custom composer', screen: <ScreenCallDetailQrIssue mode="custom" />,
        note: 'Chip "Custom" expandido · chips somem e textarea pessoal aparece com border ink (focused state). Eyebrow mono "PESSOAL PRA MARIANA · 142 caracteres". CTA "Voltar" outline + "Enviar resposta" filled mostarda. Backend grava em `assistant_messages` com `from_role="staff"`, `to_role="staff"`, `to_staff_id=<mariana>`, `metadata: { qrIssueId, escalationChainId }`. Resposta volta pra Mariana como bubble NORMAL na thread Mensagens (V11) sem chip-action inset · só dispara push manager-message específico ("Renata respondeu sobre o QR").' }),
      // 8 · Android paridade
      fQ({ label: 'reportar QR · sheet compose', platform: 'Android', screen: <ScreenWaiterReportQrIssue mode="compose" andro />,
        note: 'Paridade Android · status bar + gesture nav corretos. Pattern do sheet, stepper, descrição opcional e CTAs idênticos. Largura mantida em 390 pra parear com iOS no canvas.' }),
    ],
  },
];
