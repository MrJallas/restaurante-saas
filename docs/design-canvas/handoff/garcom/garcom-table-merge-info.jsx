// ============================================================
// V17 GARÇOM · ROUND 8c · NOTIFICAÇÕES PASSIVAS DE JUNÇÃO DE MESAS
// ────────────────────────────────────────────────────────────
// Round 8c é majoritariamente customer-side (ver canvas cliente
// V16, seção customer-table-merge-flow). Do lado staff, 3 deltas:
//
//   1) MInProgressCard kind="info-table-merge" · Painel · Em curso
//      border-left ink (não mostarda · só info) · auto-some 60 s
//      mostra "M14 (4) + M15 (2) = 6 pessoas · hosts aprovaram"
//
//   2) Mapa do salão (sub-tab Mapa em ScreenManagerOps · V3) ·
//      mesas juntadas aparecem como CARD ÚNICO LARGO (variante V3
//      "fundidas" · escolhida no V17 entre 3 propostas iniciais
//      V1/V2/V3 · ver histórico de decisões). Tap abre
//      ScreenManagerTableMenu (V5) da session merged.
//
//   3) MInProgressCard kind="staff-recommendation" · IA sugere
//      realocar mesa de garçom sobrecarregado quando junção ou
//      late-arrival eleva carga acima do limiar.
//
// EXPORT: window.GARCOM_TABLE_MERGE_INFO_SECTIONS · 1 DCSection
//   4 frames · iOS (info-card + Mapa V3 canônico + staff-rec)
//   + Android paridade do Mapa V3 · todos no toolkit garcom-tokens.jsx.
// ============================================================

const TmIOSFrame = ({ children, style }) => {
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

const TmAndroidFrame = ({ children, style }) => {
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

// helper builder
const fTM = ({ label, platform = 'iOS', screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard key={'v17g-' + label + '-' + platform} id={'v17g-' + label + '-' + platform}
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
// MInProgressCard kind="info-table-merge"
//   border-left ink (não mostarda · só info)
//   eyebrow "INFO · MESAS JUNTADAS"
//   body "M14 (4) + M15 (2) = 6 pessoas"
//   line "hosts aprovaram · há 8s · auto-some em 52 s"
//   2 ações outline · "Dispensar" + "Realocar garçom"
// ─────────────────────────────────────────────────────────────
const MTableMergeInfoCard = ({
  tableA = 14, partyA = 4, tableB = 15, partyB = 2,
  receivedAgo = 'há 8 s', autoDismiss = '52 s',
}) => {
  const C = useG(false);
  return (
    <div style={{
      cursor: 'default', userSelect: 'none', position: 'relative',
      padding: '12px 12px 12px 14px',
      borderRadius: 14,
      border: `1px solid ${C.borderSoft}`,
      borderLeft: `3px solid ${C.ink}`,
      background: C.bg,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 9.5, fontWeight: 800, color: C.faint,
        letterSpacing: 0.7, textTransform: 'uppercase',
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
      }}>
        <span style={{
          padding: '2px 6px', borderRadius: 4, background: '#f0eee9',
          color: C.ink, letterSpacing: 0.7,
        }}>INFO</span>
        <span>MESAS JUNTADAS</span>
      </div>

      <div style={{
        fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.15,
        lineHeight: 1.35, marginTop: 8,
      }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          M{tableA} ({partyA}) + M{tableB} ({partyB}) = {partyA + partyB} pessoas
        </span>
      </div>
      <div style={{
        fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 3,
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        letterSpacing: 0.2,
      }}>
        hosts aprovaram · {receivedAgo} · auto-some em {autoDismiss}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center' }}>
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '7px 12px', height: 32, borderRadius: 8,
          border: `1px solid ${C.borderSoft}`,
          background: 'transparent', color: C.ink,
          fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center',
        }}>Dispensar</button>
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '7px 12px', height: 32, borderRadius: 8,
          border: `1px solid ${C.borderSoft}`,
          background: 'transparent', color: C.ink,
          fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center',
        }}>Realocar garçom</button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MInProgressCard kind="staff-recommendation"
//   IA sugere realoc após junção que sobrecarrega garçom
//   sub mostarda discreto (única recomendação · não alerta)
//   2 ações: "Aplicar sugestão" (filled ink) + "Ignorar" (outline)
// ─────────────────────────────────────────────────────────────
const MStaffRecommendationCard = ({
  observation = 'Caleb agora tem 6 pessoas na M14+M15 (era 4)',
  suggestion = 'Considere realocar 1 mesa dele pro Henrique',
  receivedAgo = 'há 14 s',
}) => {
  const C = useG(false);
  return (
    <div style={{
      cursor: 'default', userSelect: 'none', position: 'relative',
      padding: '12px 12px 12px 14px',
      borderRadius: 14,
      border: `1px solid ${C.borderSoft}`,
      borderLeft: `3px solid ${C.warn}`,    // mostarda · recomendação atencional
      background: C.bg,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 9.5, fontWeight: 800, color: '#9A7212',
        letterSpacing: 0.7, textTransform: 'uppercase',
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
      }}>
        <span style={{
          padding: '2px 6px', borderRadius: 4, background: C.warnBg,
          color: '#7a4d10', letterSpacing: 0.7,
        }}>RECOMENDAÇÃO IA</span>
      </div>

      <div style={{
        fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1,
        lineHeight: 1.45, marginTop: 8,
      }}>
        "{observation}"
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1,
        lineHeight: 1.45, marginTop: 6,
      }}>
        "{suggestion}"
      </div>
      <div style={{
        fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 6,
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
        letterSpacing: 0.2,
      }}>
        {receivedAgo} · pode ser silenciado em settings (futuro)
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center' }}>
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '7px 14px', height: 32, borderRadius: 8,
          background: C.ink, color: '#fff',
          fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center',
        }}>Aplicar sugestão</button>
        <button style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          padding: '7px 12px', height: 32, borderRadius: 8,
          border: `1px solid ${C.borderSoft}`,
          background: 'transparent', color: C.ink,
          fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center',
        }}>Ignorar</button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Frame · Painel · Em curso · MInProgressCard kind="info-table-merge"
// ─────────────────────────────────────────────────────────────
const MgrPainelTableMergeFrame = ({ andro = false }) => {
  const C = useG(false);
  const Frame = andro ? TmAndroidFrame : TmIOSFrame;

  return (
    <Frame>
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
                background: C.ink, color: '#fff',
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
            AO VIVO · TURNO DA NOITE · 20:35
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ marginTop: 18 }}>
            <div style={{ padding: '0 16px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Em curso · 4
              </div>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ★ NOVO V17 · MInProgressCard kind="info-table-merge" no TOPO */}
              <MTableMergeInfoCard
                tableA={14} partyA={4} tableB={15} partyB={2}
                receivedAgo="há 8 s" autoDismiss="52 s" />

              {/* placeholder · info-late-arrival (V16 · ainda relevante) */}
              <div style={{
                padding: '12px 12px 12px 14px', borderRadius: 14,
                border: `1px solid ${C.borderSoft}`,
                borderLeft: `3px solid ${C.ink}`, background: C.bg,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 9.5, fontWeight: 800, color: C.faint,
                  letterSpacing: 0.7, textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>
                  <span style={{ padding: '2px 6px', borderRadius: 4, background: '#f0eee9', color: C.ink }}>INFO</span>
                  <span>MESA 18 EXPANDIU</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                  3 → 4 pessoas · host aprovou
                </div>
              </div>

              {/* placeholder · qr-issue */}
              <div style={{
                padding: '12px 12px 12px 14px', borderRadius: 14,
                border: `1px solid ${C.borderSoft}`,
                borderLeft: `3px solid #D98E2B`, background: C.bg,
              }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 800, color: '#9A7212',
                  letterSpacing: 0.7, textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>QR ILEGÍVEL · MESA 7</div>
                <div style={{
                  marginTop: 6, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>Marcos reportou · há 4 min</div>
              </div>

              {/* placeholder · cortesia */}
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
              Mesas 14 + 15 · junção aprovada · 6 pessoas · 1 comanda
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ─────────────────────────────────────────────────────────────
// Frame · Painel · Em curso · MInProgressCard kind="staff-recommendation"
// ─────────────────────────────────────────────────────────────
const MgrPainelStaffRecFrame = () => {
  const C = useG(false);

  return (
    <TmIOSFrame>
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
            AO VIVO · TURNO DA NOITE · 20:35
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ marginTop: 18 }}>
            <div style={{ padding: '0 16px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Em curso · 3
              </div>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ★ NOVO V17 · MInProgressCard kind="staff-recommendation" no TOPO */}
              <MStaffRecommendationCard
                observation="Caleb agora tem 6 pessoas na M14+M15 (era 4)"
                suggestion="Considere realocar 1 mesa dele pro Henrique"
                receivedAgo="há 14 s" />

              {/* contexto · info-table-merge logo abaixo (recomendação derivou dela) */}
              <MTableMergeInfoCard
                tableA={14} partyA={4} tableB={15} partyB={2}
                receivedAgo="há 22 s" autoDismiss="38 s" />

              {/* placeholder · qr-issue */}
              <div style={{
                padding: '12px 12px 12px 14px', borderRadius: 14,
                border: `1px solid ${C.borderSoft}`,
                borderLeft: `3px solid #D98E2B`, background: C.bg,
              }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 800, color: '#9A7212',
                  letterSpacing: 0.7, textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>QR ILEGÍVEL · MESA 7</div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                  Marcos reportou · há 4 min
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TmIOSFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// MERGE-ICON · variante CANÔNICA V3 "fundidas"
// ─────────────────────────────────────────────────────────────
//
// V3 venceu a comparação contra V1 ("encostadas" · borda contínua) e V2
// ("ligadas" · linha pontilhada + glifo). Card único largo (span 2) com
// divisória interna pontilhada · header "14 ⛓ 15" lado-a-lado · meta
// "6/6 · 1 comanda" no canto. Lê como UMA sessão unificada · trata o par
// como entidade. Maior densidade informacional · cabe a meta "1 comanda"
// no próprio tile sem custo. Aplicado em iOS e Android.
// ─────────────────────────────────────────────────────────────

// Glifo unificador · 2 quadrados encadeados · usado no header do card V3
const MergedGlyph = ({ size = 12, color = '#0a0a0a' }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke={color} strokeWidth="1.4"/>
    <rect x="6" y="6" width="5" height="5" rx="1" stroke={color} strokeWidth="1.4"/>
  </svg>
);

// Card de mesa simples (single)
const MapTileSingle = ({ n, occupied = true, st = 'ok' }) => {
  const C = useG(false);
  const colors = {
    ok:   { bg: C.bg,        border: C.borderSoft, fg: C.ink,    dot: '#1E8C5A' },
    warn: { bg: '#FFF7EC',   border: '#F0DCB6',    fg: '#7a4d10', dot: '#D98E2B' },
    crit: { bg: '#FFF1F1',   border: '#F4C7C7',    fg: '#A12626', dot: '#C43A3A' },
    free: { bg: 'transparent', border: C.borderSoft, fg: C.faint, dot: null },
  };
  const c = colors[st];
  return (
    <div style={{
      aspectRatio: '1/1', padding: 8, boxSizing: 'border-box',
      border: `1px ${st === 'free' ? 'dashed' : 'solid'} ${c.border}`,
      borderRadius: 10, background: c.bg,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      color: c.fg,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
        {c.dot && <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, marginTop: 2 }} />}
      </div>
      {occupied ? (
        <div style={{ fontSize: 12, fontWeight: 800, color: c.fg, letterSpacing: -0.2, fontVariantNumeric: 'tabular-nums' }}>
          {n === 7 ? '9m' : n === 11 ? '28m' : '12m'}
        </div>
      ) : (
        <div style={{ fontSize: 10, fontWeight: 600 }}>livre</div>
      )}
    </div>
  );
};

// V3 · FUNDIDAS · card único largo com divisória interna sutil
// CANÔNICA · escolhida no V17 entre V1/V2/V3 · venceu por densidade
// informacional + leitura como entidade unificada
const MergedTileV3 = () => {
  const C = useG(false);
  return (
    <div style={{
      gridColumn: 'span 2',
      aspectRatio: '2/1', boxSizing: 'border-box',
      border: `1.4px solid ${C.ink}`,
      borderRadius: 10,
      background: 'linear-gradient(180deg, #fafaf8 0%, #ffffff 100%)',
      padding: 8,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6,
        }}>
          <div style={{
            fontSize: 18, fontWeight: 800, color: C.ink,
            letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums',
          }}>14</div>
          <span style={{ color: C.faint }}><MergedGlyph size={11} color={C.faint} /></span>
          <div style={{
            fontSize: 18, fontWeight: 800, color: C.ink,
            letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums',
          }}>15</div>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1E8C5A' }} />
      </div>

      {/* Divisória interna sutil */}
      <div style={{
        position: 'absolute', top: 8, bottom: 28,
        left: '50%', width: 1,
        background: `repeating-linear-gradient(to bottom, ${C.borderSoft}, ${C.borderSoft} 2px, transparent 2px, transparent 4px)`,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.ink, letterSpacing: -0.2, fontVariantNumeric: 'tabular-nums' }}>14m</div>
        <div style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 800,
          letterSpacing: 1, textTransform: 'uppercase', color: C.faint,
        }}>6/6 · 1 comanda</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Frame · Mapa do salão com merged-tile CANÔNICO (V3 fundidas)
// ─────────────────────────────────────────────────────────────
const MgrMapMergedFrame = ({ andro = false }) => {
  const C = useG(false);
  const Frame = andro ? TmAndroidFrame : TmIOSFrame;
  const MergedTile = MergedTileV3;

  // mesas mock · M14+M15 são "merged" · ocupam 2 cells
  // Layout pra grade 4 colunas (igual OpsMap):
  //   1   2   3   4
  //   5   6   7   8
  //   9  10  11  12
  //  13   M14+15 ←−−−┘   16   ← merged ocupa span 2 (cells 14+15)
  // (renderizamos linha 1-12 simples + linha com o merged)

  const tableRow1 = [
    { n: 1,  st: 'ok' },
    { n: 2,  st: 'ok' },
    { n: 3,  st: 'warn' },
    { n: 4,  st: 'ok' },
  ];
  const tableRow2 = [
    { n: 5,  st: 'free' },
    { n: 6,  st: 'warn' },
    { n: 7,  st: 'ok' },
    { n: 8,  st: 'ok' },
  ];
  const tableRow3 = [
    { n: 9,  st: 'ok' },
    { n: 10, st: 'free' },
    { n: 11, st: 'crit' },
    { n: 12, st: 'ok' },
  ];

  return (
    <Frame>
      <div style={{ flex: 1, overflow: 'hidden', background: C.surface,
        fontFamily: G_FONT, color: C.ink, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '14px 16px 8px', borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>Operação</div>
          </div>
          {/* Sub-tabs · Mapa selecionada */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 12,
            fontFamily: 'ui-monospace, monospace', fontSize: 10.5, fontWeight: 700,
            letterSpacing: 0.7, textTransform: 'uppercase',
          }}>
            <div style={{
              padding: '6px 12px', borderRadius: 999,
              background: C.ink, color: '#fff',
            }}>Mapa</div>
            <div style={{
              padding: '6px 12px', borderRadius: 999,
              background: 'transparent', color: C.faint,
              border: `1px solid ${C.borderSoft}`,
            }}>Alertas</div>
            <div style={{
              padding: '6px 12px', borderRadius: 999,
              background: 'transparent', color: C.faint,
              border: `1px solid ${C.borderSoft}`,
            }}>Funil</div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* legenda */}
          <div style={{ padding: '12px 16px 6px', fontSize: 11.5, color: C.faint, fontWeight: 500, lineHeight: 1.5 }}>
            Toque numa mesa pra ver detalhes.
            {' '}<span style={{ color: '#1E8C5A', fontWeight: 700 }}>Verde</span> = ok ·{' '}
            <span style={{ color: '#D98E2B', fontWeight: 700 }}>amarelo</span> = lenta ·{' '}
            <span style={{ color: '#C43A3A', fontWeight: 700 }}>vermelho</span> = crítica ·{' '}
            <span style={{ color: C.ink, fontWeight: 700 }}>borda preta</span> = juntada.
          </div>

          {/* grade · 4 colunas */}
          <div style={{
            padding: '4px 16px 16px',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          }}>
            {tableRow1.map(t => <MapTileSingle key={t.n} n={t.n} occupied={t.st !== 'free'} st={t.st} />)}
            {tableRow2.map(t => <MapTileSingle key={t.n} n={t.n} occupied={t.st !== 'free'} st={t.st} />)}
            {tableRow3.map(t => <MapTileSingle key={t.n} n={t.n} occupied={t.st !== 'free'} st={t.st} />)}
            <MapTileSingle n={13} occupied st="ok" />
            <MergedTile />
            <MapTileSingle n={16} occupied st="ok" />
            <MapTileSingle n={17} occupied st="warn" />
            <MapTileSingle n={18} occupied st="ok" />
            <MapTileSingle n={19} occupied={false} st="free" />
            <MapTileSingle n={20} occupied st="ok" />
          </div>

          {/* explicação inline · variação canônica V3 */}
          <div style={{
            margin: '0 16px 18px', padding: '12px 14px',
            borderRadius: 12, border: `1px dashed ${C.borderSoft}`, background: C.bg,
          }}>
            <div style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 9.5, fontWeight: 800,
              letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 6,
            }}>Variação V3 · canônica · escolhida</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ink }}>
              Card ÚNICO largo (span 2) · divisória interna pontilhada sutil · header
              "14 ⛓ 15" · meta "6/6 · 1 comanda" no canto. Lê como uma sessão unificada ·
              trata o par como entidade. Venceu V1 ("encostadas" · borda contínua) e V2
              ("ligadas" · linha pontilhada) por densidade informacional + leitura como
              entidade unificada. Aplicado em iOS e Android.
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ═════════════════════════════════════════════════════════════
// DCSection EXPORT
// ═════════════════════════════════════════════════════════════
window.GARCOM_TABLE_MERGE_INFO_SECTIONS = [
  {
    id: 'staff-table-merge-info',
    title: 'Junção de mesas · notificação passiva + tratamento no mapa',
    subtitle:
      'Round 8c é majoritariamente customer-side (ver canvas cliente V16, seção customer-table-merge-flow). ' +
      'No staff, 3 deltas: (1) MInProgressCard kind="info-table-merge" no Painel · Em curso (border-left ink · ' +
      'auto-some 60 s · 2 ações outline "Dispensar" + "Realocar garçom"). (2) Mesas juntadas no Mapa do salão ' +
      '(sub-tab Mapa em ScreenManagerOps) com tratamento V3 "fundidas" CANÔNICO (escolhido entre V1/V2/V3 no V17 ' +
      'por densidade informacional + leitura como entidade). (3) MInProgressCard kind="staff-recommendation" · ' +
      'IA sugere realocar garçom sobrecarregado quando junção/late-arrival eleva carga acima do limiar ' +
      '(mostarda · pode ser silenciada em settings).',
    frames: [
      fTM({
        label: '01 Painel · Em curso · MInProgressCard info-table-merge',
        platform: 'iOS',
        screen: <MgrPainelTableMergeFrame />,
        note:
          'Card no TOPO de "Em curso" · 1 dos 4 cards atuais. border-left INK (não mostarda · não vermelho · só info · ' +
          'mesma linguagem do info-late-arrival do V16). Eyebrow "INFO · MESAS JUNTADAS". Body "M14 (4) + M15 (2) = 6 ' +
          'pessoas". Subline "hosts aprovaram · há 8 s · auto-some em 52 s". 2 ações outline: "Dispensar" + ' +
          '"Realocar garçom" (atalho pra ScreenManagerStaffEditor pré-filtrado pelo garçom da mesa). Aparece pros 3 ' +
          'staff roles (recepcionista · manager · garçom) · só awareness operacional.',
      }),
      fTM({
        label: '02 Mapa · merged-tile CANÔNICO V3 · fundidas · iOS',
        platform: 'iOS',
        screen: <MgrMapMergedFrame />,
        note:
          'Variação CANÔNICA V3 · "fundidas". Card ÚNICO largo (span 2) · gradient sutil 0.4% · divisória interna ' +
          'pontilhada vertical · header "14 ⛓ 15" lado-a-lado em ink-bold · meta "6/6 · 1 comanda" mono caps tiny no ' +
          'canto inferior. Lê como UMA sessão unificada · trata o par como entidade. Tap abre ScreenManagerTableMenu (V5) ' +
          'da session merged. Escolhida entre V1 ("encostadas" · borda contínua) e V2 ("ligadas" · linha pontilhada) por ' +
          'densidade informacional (cabe a meta "1 comanda" no próprio tile sem custo) e leitura como entidade unificada ' +
          '(operação trata merged como single-row no fluxo · 1 comanda · 1 conta).',
      }),
      fTM({
        label: '03 Painel · Em curso · MInProgressCard staff-recommendation',
        platform: 'iOS',
        screen: <MgrPainelStaffRecFrame />,
        note:
          'Card no TOPO de "Em curso" · DERIVADO do info-table-merge (mostrado logo abaixo pra contexto). border-left ' +
          'MOSTARDA (recomendação atencional · não alerta · não info pura). Eyebrow "RECOMENDAÇÃO IA" em mostarda-wash. ' +
          'Body em 2 partes: observação ("Caleb agora tem 6 pessoas na M14+M15 (era 4)") + sugestão ("Considere realocar ' +
          '1 mesa dele pro Henrique"). Sub mono caps tiny "há 14 s · pode ser silenciada em settings (futuro)". 2 ações: ' +
          '"Aplicar sugestão" (filled ink → abre realloc pré-preenchido) + "Ignorar" (outline). Critérios de trigger: ' +
          'junção que leva carga total acima do limiar OU late-arrival que faz mesa exceder 6 pessoas.',
      }),
      fTM({
        label: '04 Mapa · merged-tile V3 · paridade Android',
        platform: 'Android',
        screen: <MgrMapMergedFrame andro />,
        note:
          'Paridade Android da variação CANÔNICA V3. Mesma estrutura do iOS · só muda chrome do device (status bar 32 px ' +
          'com punch-hole · gesture bar inferior 18 px · borderRadius 36 vs 44). Mesmo grid 4×N · merged-tile como card ' +
          'único span-2 com header "14 ⛓ 15" + meta "6/6 · 1 comanda". Confirma que o tratamento funciona em ambos os ' +
          'sistemas operacionais sem ajuste · só layouts adjacentes (chrome) variam.',
      }),
    ],
  },
];
