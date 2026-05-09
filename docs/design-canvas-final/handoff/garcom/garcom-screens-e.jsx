// ============================================================
// GERENTE — KPI DETAIL SCREENS (★ V8 · 2026-05 ★)
// ────────────────────────────────────────────────────────────
// Template ScreenManagerStatDetail. Os 3 KPIs do header de Equipe
// (EM CAMPO · SOBRECARGA · CARGA MÉDIA) deixaram de ser só tooltip
// e viraram tap-targets que abrem uma tela de detalhe granular com:
//
//   • Hero · valor grande + sub colorido + 1 linha de contexto +
//     timestamp mono caps
//   • Bloco "Quem/Onde" · varia por KPI (lista de funcionários)
//   • Bloco "O que fazer agora" · ações contextuais
//   • Bloco opcional "Como esse número é calculado" · fórmula curta
//
// Reutiliza: useG, Icon, G_FONT, MTopBar, MBottomNav, MAvatar, MPill,
// GIconBtn (de garcom-screens-a)
// ============================================================
const { useState: useStateE } = React;

// kpiKind ⇒ qual aba origem o back deve voltar. Equipe (em-campo · sobrecarga ·
// carga-media) volta pra `mgr-staff`. Operação (criticos · atencao · mesas-ativas
// · em-alerta) volta pra `mgr-ops` preservando sub-tab Alertas ou Mapa.
const STAT_DETAIL_BACK = {
  'em-campo':     'mgr-staff',
  'sobrecarga':   'mgr-staff',
  'carga-media':  'mgr-staff',
  'criticos':     'mgr-ops',
  'atencao':      'mgr-ops',
  'mesas-ativas': 'mgr-ops',
  'em-alerta':    'mgr-ops',
};

const ScreenManagerStatDetail = ({
  dark = false,
  onTo = () => {},
  kpiKind = 'em-campo',  // 'em-campo' | 'sobrecarga' | 'carga-media' | 'criticos' | 'atencao' | 'mesas-ativas' | 'em-alerta'
  state = 'default',     // varia por kpiKind
  pauseConfirm = false,  // ★ V9 ★ — sobrecarga · mostra modal vaul de "Pausar mesas do Caleb"
}) => {
  const backScreen = STAT_DETAIL_BACK[kpiKind] || 'mgr-staff';
  const navTab = backScreen === 'mgr-ops' ? 'ops' : 'staff';
  const C = useG(dark);

  // ── Building blocks ─────────────────────────────────────────
  const SectionLabel = ({ children }) => (
    <div style={{
      padding: '0 16px 8px',
      fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: 0.6,
      textTransform: 'uppercase',
    }}>{children}</div>
  );

  const PersonRow = ({ p, badgeMono, badgeColor, expandable }) => {
    const [open, setOpen] = useStateE(false);
    return (
      <div style={{
        padding: 12, borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
      }}>
        <button onClick={() => expandable && setOpen(o => !o)} style={{
          all: 'unset', cursor: expandable ? 'pointer' : 'default', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        }}>
          <MAvatar name={p.name} init={p.init} color={p.color} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14.5, fontWeight: 700, color: C.ink, letterSpacing: -0.15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.name}</div>
            <div style={{
              fontSize: 10, color: badgeColor || C.faint, fontWeight: 800, letterSpacing: 0.55, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace', marginTop: 2,
            }}>{badgeMono}</div>
          </div>
          {expandable && (
            <span style={{
              color: C.faint, opacity: 0.7,
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 140ms ease', flexShrink: 0,
            }}>{Icon.arrow(14)}</span>
          )}
        </button>
        {expandable && open && (
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: `1px dashed ${C.borderSoft}`,
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {p.tables?.map(t => (
              <span key={t} style={{
                padding: '5px 9px', borderRadius: 7,
                border: `1px solid ${C.borderSoft}`, background: C.surface,
                fontSize: 11, fontWeight: 700, color: C.ink, letterSpacing: -0.1,
                fontVariantNumeric: 'tabular-nums',
              }}>Mesa {t}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ActionPill = ({ filled, accent, danger, children, onClick }) => (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
      width: '100%', padding: '12px 14px',
      borderRadius: 12,
      border: filled ? 'none' : `1px solid ${C.borderSoft}`,
      background: filled ? (accent || C.ink) : 'transparent',
      color: filled ? '#fff' : (danger ? '#A12626' : C.ink),
      fontSize: 13.5, fontWeight: 700, letterSpacing: -0.1,
      display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10,
    }}>{children}</button>
  );

  const Formula = ({ children }) => (
    <div style={{
      margin: '0 16px',
      padding: 14, borderRadius: 12,
      background: C.surface, border: `1px solid ${C.borderFaint}`,
    }}>
      <div style={{
        fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace', marginBottom: 8,
      }}>Como esse número é calculado</div>
      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );

  // ── Variant: EM CAMPO ───────────────────────────────────────
  if (kpiKind === 'em-campo') {
    const off = [
      { id: 31, name: 'Ricardo Pinto', init: 'RP', color: '#7A4FBE', reason: 'NÃO LOGOU AINDA', reasonColor: '#A12626', ctaLabel: 'Avisar quem está fora', actionable: true },
    ];
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
        <MTopBar dark={dark} title="Em campo"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo(backScreen)} />}
        />
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{
              fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Atualizado às 19:42</div>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: -1, color: C.ink, marginTop: 6,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
            }}>
              5<span style={{ fontSize: 20, color: C.faint, fontWeight: 600 }}>/6</span>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: C.faint, marginTop: 4,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              letterSpacing: 0.4, textTransform: 'uppercase',
            }}>1 fora</div>
            <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
              5 funcionários ativos no turno · 1 esperado mas ausente.
            </div>
          </div>

          {/* Quem está fora */}
          <SectionLabel>Quem está fora</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {off.map(p => (
              <PersonRow key={p.id} p={p} badgeMono={p.reason} badgeColor={p.reasonColor} />
            ))}
          </div>

          {/* O que fazer agora */}
          <SectionLabel>O que fazer agora</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionPill filled>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.bell(13)}</span>
              Avisar Ricardo · ele ainda não logou
            </ActionPill>
            <ActionPill>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.clock(13)}</span>
              Marcar folga retroativa
            </ActionPill>
            <ActionPill>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.user(13)}</span>
              Substituir por outro funcionário
            </ActionPill>
          </div>

          <div style={{ height: 18 }} />
          <Formula>
            Funcionários com status <b>em turno</b> agora · não inclui pausados ou fora. Escala configurada em <span style={{ color: C.ink, fontWeight: 700 }}>Editar turnos</span>.
          </Formula>
        </div>
        <MBottomNav active={navTab} dark={dark} onTo={onTo} />
      </div>
    );
  }

  // ── Variant: SOBRECARGA ─────────────────────────────────────
  if (kpiKind === 'sobrecarga') {
    const overloaded = [
      { id: 1, name: 'Caleb Souza', init: 'CS', color: '#4F6BFF', tables: [3, 5, 9, 12, 14, 18, 21] },
    ];
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
        <MTopBar dark={dark} title="Sobrecarga"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo(backScreen)} />}
        />
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{
              fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Atualizado às 19:42</div>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: -1, color: '#A12626', marginTop: 6,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
            }}>1</div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: '#9A7212', marginTop: 4,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              letterSpacing: 0.4, textTransform: 'uppercase',
            }}>↓ realocar mesas</div>
            <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
              1 funcionário com carga acima do limiar (7+ mesas).
            </div>
          </div>

          {/* Quem está sobrecarregado */}
          <SectionLabel>Quem está sobrecarregado</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overloaded.map(p => (
              <PersonRow key={p.id} p={p} expandable
                badgeMono="7 MESAS · LIMITE 6"
                badgeColor="#A12626"
              />
            ))}
          </div>

          {/* Banner sugestão IA */}
          <div style={{ padding: '14px 16px 0' }}>
            <div style={{
              background: '#FFF7E6', border: '1px solid #F0DCB6', borderRadius: 12,
              padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7, background: '#9A7212', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{Icon.sparkle(14)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 9.5, color: '#7A4D10', fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                }}>Sugestão</div>
                <div style={{ fontSize: 13, color: '#1d1c19', lineHeight: 1.4, fontWeight: 500, marginTop: 4 }}>
                  Mover <b style={{ fontWeight: 700 }}>1 mesa do Caleb para o Henrique</b> equilibra a praça em ~2 min.
                </div>
              </div>
            </div>
          </div>

          {/* O que fazer agora */}
          <SectionLabel>O que fazer agora</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionPill filled accent="#9A7212">
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.sparkle(13)}</span>
              Aplicar sugestão · mover 1 mesa
            </ActionPill>
            <ActionPill filled>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.table(13)}</span>
              Realocar mesas manualmente
            </ActionPill>
            <ActionPill onClick={() => onTo('mgr-contact-staff')}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.chat(13)}</span>
              Mensagem direta pro Caleb
            </ActionPill>
            {/* ★ V9 ★ — copy reescrita · "praça" é jargão · texto claro */}
            <div>
              <ActionPill>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.pause(13)}</span>
                Pausar mesas do Caleb por 5 min
              </ActionPill>
              <div style={{
                fontSize: 12, color: C.faint, fontWeight: 500, lineHeight: 1.45,
                padding: '6px 14px 0',
              }}>
                Só as mesas que ele atende · resto do salão funciona normal.
              </div>
            </div>
          </div>

          <div style={{ height: 18 }} />
          <Formula>
            Funcionários com <b>7+ mesas</b> simultaneamente OU <b>3+ chamados sem resposta</b> há mais de 2 min · ajuste limiares em <span style={{ color: C.ink, fontWeight: 700 }}>Operação</span>.
          </Formula>
        </div>
        <MBottomNav active={navTab} dark={dark} onTo={onTo} />

        {/* ★ V9 ★ — Modal vaul · confirmação "Pausar mesas do Caleb" + chip-row de duração */}
        {pauseConfirm && (
          <>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(15,12,10,0.34)', zIndex: 30,
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              background: C.bg,
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              boxShadow: '0 -10px 36px rgba(0,0,0,0.18)',
              padding: '8px 18px 26px', zIndex: 31,
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 14px' }}>
                <div style={{ width: 38, height: 4, borderRadius: 2, background: C.borderSoft }} />
              </div>
              <div style={{
                fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.3,
              }}>Pausar mesas do Caleb?</div>
              <div style={{
                fontSize: 14, color: C.mute, fontWeight: 500, lineHeight: 1.5, marginTop: 8,
              }}>
                Os pedidos novos das <b style={{ color: C.ink, fontWeight: 700 }}>7 mesas</b> que o Caleb atende ficam parados por 5 min · cliente não vê pausa explícita · ETA aumenta silenciosamente.
              </div>

              {/* Chip-row de duração · 5 (selecionado) · 10 · 15 · 30 */}
              <div style={{
                fontSize: 9.5, fontWeight: 800, color: C.faint,
                letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 18, marginBottom: 8,
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}>Duração</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {[5, 10, 15, 30].map((m, i) => (
                  <button key={m} style={{
                    all: 'unset', cursor: 'pointer',
                    flex: 1, textAlign: 'center',
                    padding: '10px 0', borderRadius: 10,
                    border: `1px solid ${i === 0 ? C.ink : C.borderSoft}`,
                    background: i === 0 ? C.ink : 'transparent',
                    color: i === 0 ? C.bg : C.ink,
                    fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{m} min</button>
                ))}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.faint, marginTop: 0, marginBottom: 14,
              }}>
                Ao pausar, dispara o fluxo da feature <span style={{
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  fontSize: 10.5, color: C.ink, fontWeight: 700, letterSpacing: 0.4,
                }}>zone-pause</span> · aparece um card "Em curso" no Painel com countdown + botão Liberar agora.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ActionPill filled accent="#9A7212">
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.pause(13)}</span>
                  Pausar 5 min · só mesas dele
                </ActionPill>
                <ActionPill>
                  Cancelar
                </ActionPill>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Variant: CARGA MÉDIA ────────────────────────────────────
  // state controla bloco de ações:
  //   'within-target'  · 3,6 (default mock) — bloco oculto
  //   'above-target'   · 5,2 — bloco visível com 3 ações
  //   'below-target'   · 2,1 — bloco oculto (folgado)
  if (kpiKind === 'carga-media') {
    const aboveTarget = state === 'above-target';
    const belowTarget = state === 'below-target';
    const heroVal = aboveTarget ? '5,2' : belowTarget ? '2,1' : '3,6';
    const subColor = aboveTarget ? '#A12626' : belowTarget ? '#1E8C5A' : C.faint;
    const subText = aboveTarget ? '· ACIMA DA META · REALOCAR'
                  : belowTarget ? '· FOLGADO'
                                : '· DENTRO DA META';
    const heroAccent = aboveTarget ? '#A12626' : C.ink;
    const showActions = aboveTarget;

    // Distribuição agora · cada garçom em campo + nº de mesas
    const distribution = aboveTarget
      ? [
          { id: 1, name: 'Caleb Souza',    init: 'CS', color: '#4F6BFF', tables: 7, over: true },
          { id: 2, name: 'Olivia Martins', init: 'OM', color: '#E37D2F', tables: 6, over: true },
          { id: 3, name: 'Henrique Lima',  init: 'HL', color: '#7A4FBE', tables: 5, over: false },
        ]
      : belowTarget
      ? [
          { id: 1, name: 'Caleb Souza',    init: 'CS', color: '#4F6BFF', tables: 3 },
          { id: 2, name: 'Olivia Martins', init: 'OM', color: '#E37D2F', tables: 2 },
          { id: 3, name: 'Henrique Lima',  init: 'HL', color: '#7A4FBE', tables: 1 },
        ]
      : [
          { id: 1, name: 'Caleb Souza',    init: 'CS', color: '#4F6BFF', tables: 5 },
          { id: 2, name: 'Olivia Martins', init: 'OM', color: '#E37D2F', tables: 4 },
          { id: 3, name: 'Henrique Lima',  init: 'HL', color: '#7A4FBE', tables: 2 },
        ];

    // Histórico simples · 4 medições mono
    const history = aboveTarget
      ? [{ t: '15:42', v: '4,1' }, { t: '16:42', v: '4,8' }, { t: '17:42', v: '5,0', peak: true }, { t: '18:42', v: '5,2', now: true }]
      : [{ t: '15:42', v: '4,1' }, { t: '16:42', v: '3,8' }, { t: '17:42', v: '4,3', peak: true }, { t: '18:42', v: '3,6', now: true }];

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
        <MTopBar dark={dark} title="Carga média"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo(backScreen)} />}
        />
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{
              fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Atualizado às 19:42</div>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: -1, color: heroAccent, marginTop: 6,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
            }}>{heroVal}</div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: subColor, marginTop: 4,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              letterSpacing: 0.4, textTransform: 'uppercase',
            }}>{subText}</div>
            <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
              Cada garçom atende <b style={{ color: C.ink, fontWeight: 700 }}>{heroVal}</b> mesas em média · meta menor que 5.
            </div>
          </div>

          {/* Distribuição agora */}
          <SectionLabel>Distribuição agora</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {distribution.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${p.over ? '#E7BFBF' : C.borderSoft}`,
                background: p.over ? '#FBEFEF' : C.bg,
              }}>
                <MAvatar name={p.name} init={p.init} color={p.color} size={30} />
                <div style={{ flex: 1, minWidth: 0,
                  fontSize: 14, fontWeight: 600, color: p.over ? '#7A1818' : C.ink, letterSpacing: -0.1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</div>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: p.over ? '#A12626' : C.ink,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2,
                }}>
                  {p.tables} <span style={{ color: C.faint, fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>MESAS</span>
                </div>
              </div>
            ))}
          </div>

          {/* Histórico das últimas 4 horas · lista mono */}
          <SectionLabel>Histórico das últimas 4 horas</SectionLabel>
          <div style={{ padding: '0 16px' }}>
            <div style={{
              padding: 14, borderRadius: 12,
              border: `1px solid ${C.borderSoft}`, background: C.bg,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map((h, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '4px 0',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: h.now ? C.ink : C.faint,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      letterSpacing: 0.5, minWidth: 50,
                    }}>{h.t}</span>
                    <span style={{
                      flex: 1,
                      fontSize: 14.5, fontWeight: 800, color: h.now && aboveTarget ? '#A12626' : C.ink,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      fontVariantNumeric: 'tabular-nums', letterSpacing: -0.1,
                    }}>{h.v}</span>
                    {h.peak && !h.now && (
                      <span style={{
                        padding: '2px 7px', borderRadius: 5,
                        background: C.surface, border: `1px solid ${C.borderFaint}`,
                        fontSize: 9, fontWeight: 800, color: C.faint, letterSpacing: 0.6,
                        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      }}>PICO</span>
                    )}
                    {h.now && (
                      <span style={{
                        padding: '2px 7px', borderRadius: 5,
                        background: C.ink, color: C.bg,
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
                        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      }}>AGORA</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 12, paddingTop: 10,
                borderTop: `1px dashed ${C.borderSoft}`,
                display: 'flex', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{
                    fontSize: 9.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}>Pico do turno</div>
                  <div style={{
                    fontSize: 13, fontWeight: 800, color: C.ink, marginTop: 2,
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{aboveTarget ? '5,2' : '4,3'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 9.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}>Média do dia</div>
                  <div style={{
                    fontSize: 13, fontWeight: 800, color: C.ink, marginTop: 2,
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{aboveTarget ? '4,8' : '4,0'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* O que fazer agora · só quando above-target */}
          {showActions && (
            <>
              <SectionLabel>O que fazer agora</SectionLabel>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ActionPill filled>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.table(13)}</span>
                  Realocar mesas
                </ActionPill>
                <ActionPill>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.pause(13)}</span>
                  Pausar pedidos novos por 5 min
                </ActionPill>
                <ActionPill>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.user(13)}</span>
                  Chamar funcionário da folga
                </ActionPill>
              </div>
            </>
          )}

          <div style={{ height: 18 }} />
          <Formula>
            Total de mesas abertas dividido pelos funcionários em campo · atualizado a cada 30s · meta <b style={{ color: C.ink, fontWeight: 700 }}>menor que 5</b> por garçom.
          </Formula>
        </div>
        <MBottomNav active={navTab} dark={dark} onTo={onTo} />
      </div>
    );
  }

  // ── Variant: CRÍTICOS (Operação · Alertas) ────────────────────
  if (kpiKind === 'criticos') {
    const C = useG(dark);
    const criticals = [
      { id: 'c1', mesa: 14, msg: 'Risoto da mesa 14 esfriou', sub: '12 min na pass · cliente esperando', ts: '4 min', actions: ['Resolver', 'Avisar Caleb'] },
      { id: 'c2', mesa: 21, msg: 'Mesa 21 chamou 3× sem resposta', sub: 'Caleb atende · sobrecarga 7 mesas',  ts: '6 min', actions: ['Atender agora', 'Realocar'] },
    ];
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
        <MTopBar dark={dark} title="Críticos"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo(backScreen)} />}
        />
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{
              fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Atualizado às 19:42</div>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: -1, color: '#A12626', marginTop: 6,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
            }}>{criticals.length}</div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: '#A12626', marginTop: 4,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              letterSpacing: 0.4, textTransform: 'uppercase',
            }}>· RESOLVER AGORA</div>
            <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
              {criticals.length} alertas com cliente esperando além da meta.
            </div>
          </div>

          {/* Lista crítica · cada card com 2 ações inline */}
          <SectionLabel>O que está crítico</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {criticals.map(a => (
              <div key={a.id} style={{
                borderRadius: 12, padding: '10px 12px', position: 'relative',
                border: '1px solid #F4C7C7', background: C.bg,
                borderLeft: '3px solid #C43A3A',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 5, background: '#C43A3A', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{Icon.flame(12)}</div>
                  <div style={{
                    fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
                    color: '#A12626',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}>CRÍTICO · há {a.ts}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.25, marginTop: 6 }}>
                  {a.msg}
                </div>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1 }}>{a.sub}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '0 10px', height: 30, borderRadius: 7,
                    background: C.ink, color: C.bg,
                    fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                    display: 'inline-flex', alignItems: 'center',
                  }}>{a.actions[0]}</button>
                  <button style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '0 10px', height: 30, borderRadius: 7,
                    background: 'transparent', color: C.ink,
                    border: `1px solid ${C.borderSoft}`,
                    fontSize: 12, fontWeight: 600, letterSpacing: -0.1,
                    display: 'inline-flex', alignItems: 'center',
                  }}>{a.actions[1]}</button>
                </div>
              </div>
            ))}
          </div>

          <SectionLabel>O que fazer agora</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionPill filled accent="#A12626">
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.flame(13)}</span>
              Resolver todos em sequência
            </ActionPill>
            <ActionPill onClick={() => onTo('mgr-contact-staff')}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.bell(13)}</span>
              Avisar todos os garçons da praça
            </ActionPill>
          </div>

          <div style={{ height: 18 }} />
          <Formula>
            Pedidos ou chamados que <b>excederam a meta de tempo</b> · meta varia por tipo (12 min cozinha · 5 min chamado · etc).
          </Formula>
        </div>
        <MBottomNav active={navTab} dark={dark} onTo={onTo} />
      </div>
    );
  }

  // ── Variant: ATENÇÃO (Operação · Alertas) ─────────────────────
  if (kpiKind === 'atencao') {
    const C = useG(dark);
    const empty = state === 'empty';
    const items = empty ? [] : [
      { id: 'a1', mesa: 6,  msg: 'Mesa 6 sem garçom há 7 min',         sub: 'Olivia atende · 5 mesas · ainda dentro', ts: '7 min',  actions: ['Avisar Olivia', 'Realocar'] },
      { id: 'a2', mesa: 11, msg: 'Filé da mesa 11 está há 9 min na pass', sub: 'meta cozinha 12 min · vai virar crítico', ts: '9 min',  actions: ['Adiantar', 'Avisar cozinha'] },
    ];
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
        <MTopBar dark={dark} title="Atenção"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo(backScreen)} />}
        />
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{
              fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Atualizado às 19:42</div>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: -1, color: empty ? C.ink : '#9A7212', marginTop: 6,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
            }}>{items.length}</div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: empty ? C.faint : '#9A7212', marginTop: 4,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              letterSpacing: 0.4, textTransform: 'uppercase',
            }}>{empty ? '· ATÉ AGORA NADA EM ATENÇÃO' : '· PRÓXIMOS 10 MIN'}</div>
            <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
              {empty
                ? 'Nenhum alerta em atenção. Volta aqui se algo se aproximar do limite.'
                : `${items.length} alertas vão virar críticos se não agir logo.`}
            </div>
          </div>

          {!empty && (
            <>
              <SectionLabel>O que está em atenção</SectionLabel>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(a => (
                  <div key={a.id} style={{
                    borderRadius: 12, padding: '10px 12px', position: 'relative',
                    border: '1px solid #F0DCB6', background: C.bg,
                    borderLeft: '3px solid #D98E2B',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 5, background: '#D98E2B', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{Icon.clock(12)}</div>
                      <div style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
                        color: '#7A4D10',
                        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      }}>ATENÇÃO · há {a.ts}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.25, marginTop: 6 }}>
                      {a.msg}
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1 }}>{a.sub}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '0 10px', height: 30, borderRadius: 7,
                        background: C.ink, color: C.bg,
                        fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                        display: 'inline-flex', alignItems: 'center',
                      }}>{a.actions[0]}</button>
                      <button style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '0 10px', height: 30, borderRadius: 7,
                        background: 'transparent', color: C.ink,
                        border: `1px solid ${C.borderSoft}`,
                        fontSize: 12, fontWeight: 600, letterSpacing: -0.1,
                        display: 'inline-flex', alignItems: 'center',
                      }}>{a.actions[1]}</button>
                    </div>
                  </div>
                ))}
              </div>

              <SectionLabel>O que fazer agora</SectionLabel>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ActionPill>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.clock(13)}</span>
                  Adiantar todos
                </ActionPill>
              </div>
            </>
          )}

          <div style={{ height: 18 }} />
          <Formula>
            Pedidos ou chamados a <b>80% da meta</b> de tempo · vai virar crítico em ~10 min se não agir.
          </Formula>
        </div>
        <MBottomNav active={navTab} dark={dark} onTo={onTo} />
      </div>
    );
  }

  // ── Variant: MESAS ATIVAS (Operação · Mapa) ───────────────────
  if (kpiKind === 'mesas-ativas') {
    const C = useG(dark);
    // Mock: 13 mesas ocupadas em 16 totais. Agrupado por seção.
    const sections = [
      { name: 'Salão', tables: [
        { n: 1,  waiter: { init: 'CS', color: '#4F6BFF' }, t: '1h 12', val: 142 },
        { n: 2,  waiter: { init: 'CS', color: '#4F6BFF' }, t: '0h 38', val:  88 },
        { n: 3,  waiter: { init: 'HL', color: '#7A4FBE' }, t: '1h 47', val: 312 },
        { n: 4,  waiter: { init: 'OM', color: '#E37D2F' }, t: '0h 52', val:  64 },
        { n: 6,  waiter: { init: 'OM', color: '#E37D2F' }, t: '1h 22', val: 184 },
        { n: 7,  waiter: { init: 'CS', color: '#4F6BFF' }, t: '0h 41', val:  96 },
        { n: 8,  waiter: { init: 'HL', color: '#7A4FBE' }, t: '1h 04', val: 220 },
        { n: 9,  waiter: { init: 'CS', color: '#4F6BFF' }, t: '2h 11', val: 412 },
      ]},
      { name: 'Varanda', tables: [
        { n: 11, waiter: { init: 'OM', color: '#E37D2F' }, t: '1h 38', val: 156 },
        { n: 12, waiter: { init: 'HL', color: '#7A4FBE' }, t: '0h 28', val:  78 },
        { n: 13, waiter: { init: 'CS', color: '#4F6BFF' }, t: '1h 14', val: 244 },
        { n: 14, waiter: { init: 'HL', color: '#7A4FBE' }, t: '2h 03', val: 168 },
        { n: 16, waiter: { init: 'OM', color: '#E37D2F' }, t: '0h 47', val: 110 },
      ]},
    ];
    const total = 16;
    const occ = sections.reduce((s, sec) => s + sec.tables.length, 0);
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
        <MTopBar dark={dark} title="Mesas ativas"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo(backScreen)} />}
        />
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{
              fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Atualizado às 19:42</div>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: -1, color: C.ink, marginTop: 6,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
            }}>
              {occ}<span style={{ fontSize: 20, color: C.faint, fontWeight: 600 }}>/{total}</span>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: C.faint, marginTop: 4,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              letterSpacing: 0.4, textTransform: 'uppercase',
            }}>· {total - occ} LIVRES</div>
            <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
              {occ} mesas com cliente sentado agora · {total - occ} livres.
            </div>
          </div>

          {sections.map(sec => (
            <React.Fragment key={sec.name}>
              <SectionLabel>{sec.name} · {sec.tables.length} mesas</SectionLabel>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sec.tables.map(t => (
                  <button key={t.n} onClick={() => onTo('mgr-table-menu')} style={{
                    all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                    width: '100%',
                    padding: '10px 12px', borderRadius: 10,
                    border: `1px solid ${C.borderSoft}`, background: C.bg,
                    display: 'flex', alignItems: 'center', gap: 11,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: C.surface, color: C.ink,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      fontSize: 14, fontWeight: 800, letterSpacing: -0.2,
                      fontVariantNumeric: 'tabular-nums',
                    }}>{t.n}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%', background: t.waiter.color,
                          color: '#fff', fontSize: 8.5, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{t.waiter.init}</div>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: C.ink, letterSpacing: -0.1,
                          fontVariantNumeric: 'tabular-nums',
                        }}>{t.t} aberta</div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: -0.1,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}>R$ {t.val}</div>
                    <span style={{ color: C.faint, opacity: 0.7, flexShrink: 0 }}>{Icon.arrow(14)}</span>
                  </button>
                ))}
              </div>
            </React.Fragment>
          ))}

          <SectionLabel>O que fazer agora</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionPill onClick={() => onTo('mgr-ops')}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.table(13)}</span>
              Ver no Mapa →
            </ActionPill>
          </div>

          <div style={{ height: 18 }} />
          <Formula>
            Total de mesas com <b>sessão aberta</b> dividido pelo total de mesas configuradas no estabelecimento.
          </Formula>
        </div>
        <MBottomNav active={navTab} dark={dark} onTo={onTo} />
      </div>
    );
  }

  // ── Variant: EM ALERTA (Operação · Mapa) ──────────────────────
  if (kpiKind === 'em-alerta') {
    const C = useG(dark);
    const items = [
      { n: 11, waiter: { init: 'OM', color: '#E37D2F', name: 'Olivia' }, t: '1h 38', state: 'CRÍTICA', stateColor: '#A12626', borderColor: '#F4C7C7', bg: '#FFF1F1' },
      { n: 14, waiter: { init: 'HL', color: '#7A4FBE', name: 'Henrique' }, t: '2h 03', state: 'CRÍTICA', stateColor: '#A12626', borderColor: '#F4C7C7', bg: '#FFF1F1' },
      { n: 3,  waiter: { init: 'HL', color: '#7A4FBE', name: 'Henrique' }, t: '1h 47', state: 'LENTA',   stateColor: '#9A7212', borderColor: '#F0DCB6', bg: '#FFF7E6' },
      { n: 6,  waiter: { init: 'OM', color: '#E37D2F', name: 'Olivia' },   t: '1h 22', state: 'LENTA',   stateColor: '#9A7212', borderColor: '#F0DCB6', bg: '#FFF7E6' },
    ];
    const crit = items.filter(i => i.state === 'CRÍTICA').length;
    const lent = items.filter(i => i.state === 'LENTA').length;
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.surface, fontFamily: G_FONT, color: C.ink }}>
        <MTopBar dark={dark} title="Em alerta"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => onTo(backScreen)} />}
        />
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{
              fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            }}>Atualizado às 19:42</div>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: -1, color: '#A12626', marginTop: 6,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
            }}>{items.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 800, color: '#A12626',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                letterSpacing: 0.4, textTransform: 'uppercase',
              }}>· {crit} CRÍTICAS</div>
              <div style={{
                fontSize: 12.5, fontWeight: 800, color: '#9A7212',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                letterSpacing: 0.4, textTransform: 'uppercase',
              }}>· {lent} LENTAS</div>
            </div>
            <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
              {items.length} mesas onde algo passou da meta de tempo.
            </div>
          </div>

          <SectionLabel>Mesas em alerta</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map(t => (
              <button key={t.n} onClick={() => onTo('mgr-table-menu')} style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: '100%',
                padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${t.borderColor}`, background: t.bg,
                display: 'flex', alignItems: 'center', gap: 11,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: '#fff', color: t.stateColor,
                  border: `1px solid ${t.borderColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 14, fontWeight: 800, letterSpacing: -0.2,
                  fontVariantNumeric: 'tabular-nums',
                }}>{t.n}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 800, color: t.stateColor,
                    letterSpacing: 0.7, textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  }}>{t.state}</div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: t.stateColor, letterSpacing: -0.1, marginTop: 2,
                  }}>{t.waiter.name} · {t.t} aberta</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 800, color: t.stateColor, letterSpacing: 0.4,
                  fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                  textTransform: 'uppercase', marginRight: 4,
                }}>VER →</span>
              </button>
            ))}
          </div>

          <SectionLabel>O que fazer agora</SectionLabel>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionPill filled accent="#A12626">
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.table(13)}</span>
              Realocar mesas críticas
            </ActionPill>
            <ActionPill onClick={() => onTo('mgr-contact-staff')}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink }}>{Icon.chat(13)}</span>
              Mensagem direta pros garçons das críticas
            </ActionPill>
          </div>

          <div style={{ height: 18 }} />
          <Formula>
            Mesas com pedido ou chamado que <b>passou da meta</b> · ATENÇÃO se &gt;80% da meta · CRÍTICA se &gt;100%.
          </Formula>
        </div>
        <MBottomNav active={navTab} dark={dark} onTo={onTo} />
      </div>
    );
  }

  return null;
};

Object.assign(window, {
  ScreenManagerStatDetail,
});
