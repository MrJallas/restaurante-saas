// ============================================================
// V12 · APP DO GARÇOM — RECLAMAÇÃO COMO TIPO DE CHAMADO
// Estende Call.type com 'complaint'. Frames cobrindo:
//   1) Push lockscreen (iOS · som crítico · não silencia em zone-pause)
//   2) Painel · MInProgressCard kind="complaint" no Em curso
//   3) Operação · Alertas · card complaint no topo
//   4) ScreenComplaintDetail default · 4 chips de resposta rápida
//   5) ScreenComplaintDetail · chip "Custom" · composer textarea aberto
//   6) MInProgressCard kind="complaint" state="resolved-summary" (read receipt)
//   7) Android paridade (ScreenComplaintDetail)
//
// LINGUAGEM: idêntica ao garcom-tokens.jsx (Inter sans · brick #C43A3A
// p/ reclamação · light/dark via useG · tabular-nums em métricas).
// ============================================================

const { useState: gcUseState } = React;

// ─────────────────────────────────────────────────────────────
// IOSFrame / AndroidFrame — locais a este módulo (Babel escopa
// cada <script>; não dá pra importar do cliente-tokens.jsx).
// 390×844, dynamic island ou punch-hole, status bar correta.
// ─────────────────────────────────────────────────────────────
const IOSFrame = ({ children, style }) => {
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

const AndroidFrame = ({ children, style }) => {
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

// helper builder no padrão dos outros canvas do garçom
const fG = ({ label, platform = 'iOS', screen, note, dark = false }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard key={'v12g-' + label + '-' + platform} id={'v12g-' + label + '-' + platform}
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

// ─────────────────────────────────────────────────────────────
// 1 · PUSH LOCKSCREEN — complaint (iOS + Android)
// Som crítico · pulse haptic forte · NÃO silencia em zone-pause
// ─────────────────────────────────────────────────────────────
const ComplaintPushIOS = () => (
  <IOSFrame style={{ background: '#0e0c12' }}>
    <div style={{ position: 'absolute', inset: 0, top: 44, bottom: 8 }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, #2a1f2e 0%, #1a1820 60%, #0e0c12 100%)',
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
          }}>21:18</div>
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
              boxShadow: '0 0 0 2px rgba(255,69,58,0.85), 0 8px 24px rgba(255,69,58,0.25)',
              animation: 'gNotifPulse 1.6s infinite',
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
                    width: 12, height: 12, borderRadius: 6, background: '#ff453a',
                    border: '2px solid rgba(255,255,255,0.9)',
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0,
                  fontFamily: '-apple-system, system-ui', color: '#000' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
                      Reclamação · Mesa 14 · Caleb
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)', flexShrink: 0, marginLeft: 8 }}>agora</div>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: '20px', color: '#000', marginTop: 1, letterSpacing: -0.2 }}>
                    "O risoto demorou muito · me trouxeram quando já tava esfriando"
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
// 2 · MComplaintInProgressCard — Painel · Em curso
// Pattern V4 (border-left tematica) com kicker brick + estrelas + ações
// ─────────────────────────────────────────────────────────────
const StarMini = ({ filled = false, size = 12, color = '#C43A3A' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={filled ? color : 'none'}
    stroke={filled ? color : '#a3a3a3'}
    strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
    <path d="M12 2.5l2.93 6.06 6.7.97-4.85 4.69 1.15 6.66L12 17.78l-5.93 3.1 1.15-6.66L2.37 9.53l6.7-.97L12 2.5z"/>
  </svg>
);

const MComplaintInProgressCard = ({
  state = 'active',          // 'active' | 'resolved-summary'
  table = 14, customerName = 'Caleb',
  rating = 3,                // 1-5
  preview = 'O risoto demorou muito · me trouxeram quando já tava esfriando',
  receivedAgo = 'há 2 min',
  // resolved-summary
  resolvedHeadline = 'Caleb leu há 12 s · pode marcar como resolvida',
  resolvedSub = 'RESPOSTA ENVIADA · CHIP "JÁ ESTOU INDO · 2 MIN"',
  dark = false,
}) => {
  const C = useG(dark);
  const isResolved = state === 'resolved-summary';
  const accent = isResolved ? '#1E8C5A' : '#C43A3A';

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
        fontSize: 9.5, fontWeight: 800, color: accent,
        letterSpacing: 0.7, textTransform: 'uppercase',
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
      }}>
        {isResolved
          ? `RECLAMAÇÃO RESOLVIDA · MESA ${table} · ${customerName.toUpperCase()}`
          : `RECLAMAÇÃO · MESA ${table} · ${customerName.toUpperCase()}`}
      </div>

      {!isResolved && (
        <>
          <div style={{
            fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.15,
            lineHeight: 1.35, marginTop: 6,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{preview}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <span style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 10.5, color: C.faint, fontWeight: 500, letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}>RECEBIDA {receivedAgo} ·</span>
            <span style={{ display: 'inline-flex', gap: 1.5 }}>
              {[1,2,3,4,5].map(i => <StarMini key={i} filled={i <= rating} size={11} />)}
            </span>
          </div>
        </>
      )}

      {isResolved && (
        <>
          <div style={{
            fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.15,
            lineHeight: 1.35, marginTop: 6,
          }}>{resolvedHeadline}</div>
          <div style={{
            fontSize: 10.5, color: C.faint, fontWeight: 500, marginTop: 4,
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            letterSpacing: 0.3, textTransform: 'uppercase',
          }}>{resolvedSub}</div>
        </>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center' }}>
        {!isResolved ? (
          <>
            <button style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              padding: '7px 12px', height: 32, borderRadius: 8,
              background: '#C43A3A', color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
              display: 'inline-flex', alignItems: 'center',
            }}>Responder agora</button>
            <button style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              padding: '7px 12px', height: 32, borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: 'transparent', color: C.ink,
              fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
              display: 'inline-flex', alignItems: 'center',
            }}>Marcar como vista</button>
          </>
        ) : (
          <>
            <button style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              padding: '7px 12px', height: 32, borderRadius: 8,
              background: '#1E8C5A', color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
              display: 'inline-flex', alignItems: 'center',
            }}>Marcar como resolvida</button>
            <div style={{ flex: 1 }} />
            <button style={{
              all: 'unset', cursor: 'pointer',
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint,
            }}>{Icon.x(16)}</button>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// PAINEL FRAME — header + Em curso · 1 · com complaint card
// (Versão focada — não monta a Home inteira pra não distrair)
// ─────────────────────────────────────────────────────────────
const MgrPainelComplaintFrame = () => {
  const dark = false;
  const C = useG(dark);
  return (
    <IOSFrame>
      <div style={{ flex: 1, overflow: 'hidden', background: C.surface,
        fontFamily: G_FONT, color: C.ink, display: 'flex', flexDirection: 'column' }}>
        {/* header simulado */}
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
                background: '#C43A3A', color: '#fff',
                fontSize: 9, fontWeight: 800, padding: '0 3px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>4</span>
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
            AO VIVO · TURNO DA NOITE · 21:18
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Em curso section */}
          <div style={{ marginTop: 18 }}>
            <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Em curso · 2
              </div>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MComplaintInProgressCard
                state="active" table={14} customerName="Caleb" rating={3}
                preview="O risoto demorou muito · me trouxeram quando já tava esfriando"
                receivedAgo="há 2 min"
              />
              {/* placeholder pra mostrar que não está sozinha */}
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

          {/* HOJE NO TURNO header só pro contexto */}
          <div style={{ marginTop: 22, padding: '0 16px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Hoje no turno
            </div>
          </div>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              padding: '10px 12px', borderRadius: 12,
              border: `1px solid #F0DCB6`, background: C.bg,
              borderLeft: `3px solid #D98E2B`,
              fontSize: 12, color: C.faint, fontWeight: 500,
            }}>
              Cozinha · risoto cogumelos esperando há 22 min · meta 12 min
            </div>
          </div>
        </div>
      </div>
    </IOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 3 · OPS ALERTAS — frame focado mostrando complaint no topo
// ─────────────────────────────────────────────────────────────
const MgrOpsAlertsComplaintFrame = () => {
  const dark = false;
  const C = useG(dark);
  return (
    <IOSFrame>
      <div style={{ flex: 1, overflow: 'hidden', background: C.surface,
        fontFamily: G_FONT, color: C.ink, display: 'flex', flexDirection: 'column' }}>
        {/* topbar Operação */}
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

        {/* sub-tabs */}
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
                }}>5</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* tiles compactos */}
          <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, padding: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 12, background: C.bg, position: 'relative' }}>
              <div style={{
                fontSize: 10.5, color: C.faint, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.6, fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>Críticos</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#C43A3A', marginTop: 2,
                letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>3</div>
              <div style={{
                fontSize: 10, color: '#C43A3A', marginTop: 3, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.6,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>↑ resolver agora</div>
            </div>
            <div style={{ flex: 1, padding: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 12, background: C.bg }}>
              <div style={{
                fontSize: 10.5, color: C.faint, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.6, fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>Atenção</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#9A7212', marginTop: 2,
                letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>2</div>
              <div style={{
                fontSize: 10, color: '#9A7212', marginTop: 3, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.6,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>· próx. 10 min</div>
            </div>
          </div>

          <div style={{
            padding: '10px 16px 4px',
            fontSize: 9.5, color: C.faint, fontWeight: 700,
            letterSpacing: 0.7, textTransform: 'uppercase',
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          }}>Cada alerta · 2 ações inline · X dispensa</div>

          <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* COMPLAINT CARD NO TOPO */}
            <div style={{
              borderRadius: 12, position: 'relative',
              border: `1px solid #F4C7C7`,
              background: C.bg,
              borderLeft: `3px solid #C43A3A`,
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
                  background: '#C43A3A', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{Icon.chat(13)}</div>
                <div style={{
                  fontSize: 9.5, fontWeight: 800,
                  letterSpacing: 0.7, textTransform: 'uppercase',
                  color: '#A12626',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>
                  CRÍTICO · HÁ 2 MIN · RECLAMAÇÃO
                </div>
              </div>

              <div style={{
                fontSize: 13, fontWeight: 700, color: C.ink,
                lineHeight: 1.25, letterSpacing: -0.1,
                marginTop: 5, paddingRight: 26,
              }}>
                Mesa 14 · Caleb · "O risoto demorou muito"
              </div>
              <div style={{
                fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                3 estrelas · resposta esperada em &lt; 5 min
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '0 10px', height: 32, borderRadius: 8,
                  background: '#C43A3A', color: '#fff',
                  fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center',
                }}>Responder agora</button>
                <button style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '0 10px', height: 32, borderRadius: 8,
                  background: 'transparent', color: '#1d1c19',
                  border: `1px solid ${C.borderSoft}`,
                  fontSize: 12, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center',
                }}>Contactar cliente</button>
              </div>
            </div>

            {/* alertas existentes embaixo, atenuados pra dar contexto */}
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
                Mesa 14 · meta 12 min
              </div>
            </div>
          </div>
        </div>
      </div>
    </IOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 4-5-7 · ScreenComplaintDetail
// Hero brick lavado · pill mono caps · estrelas · bubble do cliente
// 4 chips de resposta rápida · composer "Custom" opcional
// ─────────────────────────────────────────────────────────────
const QuickReplyChip = ({ label, sub, primary = false, onTap }) => (
  <div onClick={onTap} role="button" style={{
    cursor: 'pointer',
    padding: '14px 14px',
    borderRadius: 14,
    border: primary ? '1.5px solid #C43A3A' : '1px solid #e5e5e5',
    background: primary ? '#FDECEC' : '#fff',
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: primary ? '#C43A3A' : '#f6f5f2',
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

const ScreenComplaintDetail = ({ mode = 'chips', dark = false, andro = false }) => {
  const C = useG(dark);
  const Frame = andro ? AndroidFrame : IOSFrame;

  const customerBubble = (
    <div style={{
      border: `1px solid ${C.borderSoft}`, borderRadius: 12,
      borderLeft: `4px solid #C43A3A`, background: C.bg,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          padding: '3px 8px', borderRadius: 100,
          background: '#FDECEC', color: '#A12626',
          fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
        }}>DEMORA</span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.45, color: C.ink, letterSpacing: -0.1 }}>
        "O risoto demorou muito · me trouxeram quando já tava esfriando"
      </div>
      <div style={{
        marginTop: 6, fontSize: 11.5, color: C.faint, fontWeight: 500,
      }}>— Caleb · 21:16 · há 2 min</div>
    </div>
  );

  return (
    <Frame>
      <div style={{ flex: 1, overflow: 'hidden', background: C.bg, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column' }}>

        {/* topbar */}
        <div style={{
          padding: '14px 16px 12px', borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: 'transparent', color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon.back(20)}</div>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>Reclamação</div>
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: 'transparent', color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon.more(20)}</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* HERO BRICK LAVADO */}
          <div style={{
            background: '#FDECEC', color: C.ink, padding: '22px 20px 24px',
            borderBottom: `1px solid #F4C7C7`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                padding: '3px 8px', borderRadius: 100,
                background: '#C43A3A', color: '#fff',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
              }}>RECLAMAÇÃO · CALEB · MESA 14</span>
            </div>

            {/* Star rating do cliente */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
              <span style={{ display: 'inline-flex', gap: 3 }}>
                {[1,2,3,4,5].map(i => <StarMini key={i} filled={i <= 3} size={22} color="#C43A3A" />)}
              </span>
              <span style={{
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase',
                color: '#A12626', marginLeft: 6,
              }}>3 de 5</span>
            </div>

            <div style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase',
              color: '#A12626', marginTop: 14,
            }}>HÁ 2 MIN · NÃO LIDA AINDA</div>
          </div>

          {/* O QUE ELE DISSE */}
          <div style={{ padding: '20px 16px 8px' }}>
            <div style={{
              fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
              color: C.faint, fontWeight: 700, marginBottom: 10,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>O que ele disse</div>
            {customerBubble}
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
                <QuickReplyChip primary label="Já estou indo" sub="chega em 2 min · mais usado" />
                <QuickReplyChip label="Vou verificar com a cozinha" sub="3 min · sem ETA garantido" />
                <QuickReplyChip label="Mando uma cortesia pela espera" sub="abre fluxo de cortesia · pré-seleciona mesa 14" />
                <QuickReplyChip label="Custom · escrever do meu jeito" sub="composer textarea · mensagem pessoal" />
              </div>
            ) : (
              <div>
                <div style={{
                  border: `1.3px solid ${C.ink}`, borderRadius: 14,
                  padding: '14px 16px', background: C.bg, minHeight: 110,
                }}>
                  <div style={{ fontSize: 14.5, lineHeight: 1.5, color: C.ink, letterSpacing: -0.05 }}>
                    Caleb, peço desculpas pelo risoto. Já mandei a cozinha refazer e estou indo até a sua mesa em 3 min.
                    Te trago um café especial pela espera.
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 10, fontSize: 11, color: C.faint, fontWeight: 500,
                }}>
                  <span style={{
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase',
                  }}>Pessoal pra Caleb · 187 caracteres</span>
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
                  background: '#C43A3A', color: '#fff',
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
    </Frame>
  );
};

// ─────────────────────────────────────────────────────────────
// 6 · MComplaintInProgressCard state="resolved-summary" — frame
// Mostra só o card resolved isolado (sem Painel inteiro)
// ─────────────────────────────────────────────────────────────
const MgrPainelComplaintResolvedFrame = () => {
  const dark = false;
  const C = useG(dark);
  return (
    <IOSFrame>
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
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink,
            }}>{Icon.bell(18)}</div>
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
            AO VIVO · TURNO DA NOITE · 21:21
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ marginTop: 18 }}>
            <div style={{ padding: '0 16px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Em curso · 1
              </div>
              <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                Resposta enviada · auto-some em 28s
              </div>
            </div>
            <div style={{ padding: '0 16px' }}>
              <MComplaintInProgressCard
                state="resolved-summary"
                table={14} customerName="Caleb"
                resolvedHeadline="Caleb leu há 12 s · pode marcar como resolvida"
                resolvedSub='RESPOSTA ENVIADA · "JÁ ESTOU INDO · 2 MIN"'
              />
            </div>
          </div>

          {/* timeline acima é vazia agora */}
          <div style={{ marginTop: 22, padding: '0 16px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Atendimento da reclamação · linha do tempo
            </div>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { ts: '21:16', text: 'Caleb enviou reclamação · 3 estrelas' },
              { ts: '21:17', text: 'Você leu · 41 s depois' },
              { ts: '21:18', text: 'Resposta enviada · "Já estou indo · 2 min"' },
              { ts: '21:18', text: 'Caleb visualizou · 12 s depois' },
            ].map((t, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'baseline',
                padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${C.borderSoft}`, background: C.bg,
              }}>
                <span style={{
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: 0.5,
                }}>{t.ts}</span>
                <span style={{ fontSize: 13, color: C.ink, fontWeight: 500, letterSpacing: -0.1 }}>{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </IOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO PRA O CANVAS V12 (gerente)
// ─────────────────────────────────────────────────────────────
window.GARCOM_COMPLAINT_SECTIONS = [
  {
    id: 'v12g.1',
    title: 'Push lockscreen · reclamação',
    subtitle: 'Som crítico · pulse haptic forte · NÃO silencia em zone-pause (reclamação é urgente · passa por cima de qualquer mute). Tap abre `ScreenComplaintDetail`.',
    frames: [
      fG({ label: 'push complaint · ios', screen: <ComplaintPushIOS />,
        note: 'Push iOS lockscreen estilo glass blur, urgent border 2px brick + dot brick no app icon. Título "Reclamação · Mesa 14 · Caleb" · sub é trecho da fala em 1 linha. Animação gNotifPulse 1.6s.' }),
    ],
  },
  {
    id: 'v12g.2',
    title: 'Painel · MInProgressCard kind="complaint"',
    subtitle: 'Padrão V4: card border-left brick (active), kicker mono caps brick, headline com a fala truncada em 1 linha, sub mono tiny "RECEBIDA HÁ 2 MIN · 3 ESTRELAS". 2 ações inline.',
    frames: [
      fG({ label: 'painel · em-curso · complaint ativa', screen: <MgrPainelComplaintFrame />,
        note: 'Painel renderiza o card ao lado de outras operações (cortesia aqui pra dar contexto). Tap no corpo abre ScreenComplaintDetail. "Responder agora" filled brick = primária. "Marcar como vista" = outline (não responde, só sinaliza recebimento).' }),
    ],
  },
  {
    id: 'v12g.3',
    title: 'Operação · Alertas · complaint no topo',
    subtitle: 'Card pattern dos outros alertas (border-left brick + ícone chat + kicker "CRÍTICO · HÁ 2 MIN · RECLAMAÇÃO"). 2 ações inline (Responder agora / Contactar cliente). X dispense canto sup direito.',
    frames: [
      fG({ label: 'ops · alertas · complaint topo', screen: <MgrOpsAlertsComplaintFrame />,
        note: 'Mantém o pattern visual de OpsAlerts. Reclamação aparece como CRÍTICO no topo da lista. "Contactar cliente" abre MContactClientSheet com contexto da reclamação pré-preenchido. Outros alertas atenuados embaixo.' }),
    ],
  },
  {
    id: 'v12g.4',
    title: 'ScreenCallDetail type="complaint" · 4 chips de resposta rápida',
    subtitle: 'Hero brick lavado com pill mono caps + estrelas filled brick + meta mono "HÁ 2 MIN · NÃO LIDA AINDA". Bubble do cliente com chip do tipo · 4 chips empilhados (primário "Já estou indo · 2 min").',
    frames: [
      fG({ label: 'complaint detail · chips', screen: <ScreenComplaintDetail mode="chips" />,
        note: '4 chips: Já estou indo (primário brick), Verificar com cozinha (outline), Cortesia pela espera (atalho pro fluxo existente do V5), Custom (abre composer). Footer "Marcar como vista" outline secundária. MoreSheet do header tem "Resolver sem responder", "Encaminhar", "Reportar problema com sistema".' }),
    ],
  },
  {
    id: 'v12g.5',
    title: 'ScreenCallDetail type="complaint" · chip "Custom" expandido · composer aberto',
    subtitle: 'Quando o gerente toca "Custom · escrever do meu jeito" os chips somem e aparece um textarea pessoal pra Caleb. CTA de envio fica filled brick "Enviar resposta".',
    frames: [
      fG({ label: 'complaint detail · custom composer', screen: <ScreenComplaintDetail mode="custom" />,
        note: 'Textarea com border ink (focused state). Eyebrow mono "PESSOAL PRA CALEB · 187 caracteres". CTA secundário "Voltar" volta pros chips. Backend grava em assistant_messages com from_role="staff" + kind="complaint_response".' }),
    ],
  },
  {
    id: 'v12g.6',
    title: 'MInProgressCard state="resolved-summary" · read receipt',
    subtitle: 'Após enviar resposta, card vira state="resolved-summary" com border-left moss + kicker "RECLAMAÇÃO RESOLVIDA". Headline mostra read receipt em tempo real (Caleb leu há 12 s). Auto-some em 30 s OU tap "Marcar como resolvida".',
    frames: [
      fG({ label: 'painel · resolved-summary', screen: <MgrPainelComplaintResolvedFrame />,
        note: 'Inclui timeline da reclamação abaixo (linha do tempo do atendimento) só pra dar contexto da feature. Em produção essa timeline mora em screen separada · aqui é demonstração. CTA muda pra "Marcar como resolvida" verde + X dispense.' }),
    ],
  },
  {
    id: 'v12g.7',
    title: 'Android · paridade ScreenCallDetail type="complaint"',
    subtitle: 'Mesmo composição em Android · status bar/gesture nav corretos. Pattern visual igual (hero brick · estrelas · bubble · chips).',
    frames: [
      fG({ label: 'complaint detail · chips', platform: 'Android', screen: <ScreenComplaintDetail mode="chips" andro />,
        note: 'Paridade Android. Largura mantida em 390 pra parear com iOS no canvas. Pattern dos chips e do bubble do cliente idênticos.' }),
    ],
  },
];
