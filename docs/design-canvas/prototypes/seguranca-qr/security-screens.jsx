// ============================================================
// SEGURANÇA · QR CODES (watcher de tráfego anômalo)
// Estados: overview (default) → investigate (deep-dive numa mesa)
// Bottom nav: aba Operação ativa.
// ============================================================
const ScreenManagerSecurity = ({
  dark = false,
  state = 'overview',
  sevFilter = 'all',
  tableId = 22,
  onTo = () => {},
}) => {
  const C = useG(dark);

  const pending = [
    {
      id: 's1',
      table: 22,
      score: 75,
      signals: ['datacenter', 'fora-horario', 'sem-mobile'],
      openedAt: 'há 3 min',
      escalated: true,
    },
    {
      id: 's2',
      table: 8,
      score: 55,
      signals: ['fora-horario', 'mesa-inativa'],
      openedAt: 'há 1 min',
      escalated: false,
    },
  ];

  const blocks = [
    {
      id: 'b1',
      ip: '35.190.142.81',
      asn: 'AWS',
      reason: '5 tentativas em 1 min · datacenter',
      blockedAt: 'há 18 min',
      autoLiftAt: 'em 42 min',
    },
    {
      id: 'b2',
      ip: '187.45.122.10',
      asn: 'Vivo Fibra',
      reason: 'Init fora do horário (03:42)',
      blockedAt: 'há 2 h',
      autoLiftAt: 'em 22 h',
    },
  ];

  const allEvents = [
    {
      id: 'e1',
      kind: 'datacenter-burst',
      sev: 'high',
      when: '21:14',
      title: '3 tentativas no mesmo IP de datacenter',
      sub: 'IP 35.190.x.x (AWS) · mesas 14, 22, 31 · todas bloqueadas pelo rate-limit',
      canMarkSafe: false,
    },
    {
      id: 'e2',
      kind: 'off-hours',
      sev: 'med',
      when: '03:42',
      title: 'Mesa 11 escaneada às 03:42',
      sub: 'Restaurante fecha 23:30 · IP residencial · sessão rejeitada por horário',
      canMarkSafe: true,
    },
    {
      id: 'e3',
      kind: 'too-many-pending',
      sev: 'low',
      when: '20:08',
      title: '8 sessões pending_review em 5 min',
      sub: 'Pico normal de movimento · todas auto-aprovaram após 30s',
      canMarkSafe: true,
    },
    {
      id: 'e4',
      kind: 'repeat-customer',
      sev: 'low',
      when: '19:55',
      title: 'IP 187.45.x.x abriu 4 mesas hoje',
      sub: 'Provavelmente família/grupo · sem ação necessária',
      canMarkSafe: true,
    },
  ];
  const events = sevFilter === 'all' ? allEvents : allEvents.filter((e) => e.sev === sevFilter);

  const sevColor = (s) => (s === 'high' ? '#C43A3A' : s === 'med' ? '#D98E2B' : '#1E8C5A');
  const sevTone = (s) => (s === 'high' ? 'danger' : s === 'med' ? 'warn' : 'success');
  const sevLabel = (s) => (s === 'high' ? 'Crítico' : s === 'med' ? 'Atenção' : 'Info');

  // ───── DEEP-DIVE ─────
  if (state === 'investigate') {
    const tHistory = [
      {
        t: '21:14',
        ip: '35.190.142.81',
        loc: 'AWS · São Paulo',
        risk: 75,
        decision: 'rejected_by_receptionist',
        decidedBy: 'Renata',
      },
      {
        t: '20:48',
        ip: '35.190.142.81',
        loc: 'AWS · São Paulo',
        risk: 80,
        decision: 'rate_limited',
        decidedBy: 'sistema',
      },
      {
        t: '20:42',
        ip: '35.190.142.81',
        loc: 'AWS · São Paulo',
        risk: 80,
        decision: 'rate_limited',
        decidedBy: 'sistema',
      },
      {
        t: '19:32',
        ip: '177.10.84.211',
        loc: 'Vivo · São Paulo',
        risk: 22,
        decision: 'auto_approved',
        decidedBy: 'sistema',
      },
      {
        t: '12:14',
        ip: '177.10.84.211',
        loc: 'Vivo · São Paulo',
        risk: 18,
        decision: 'approved_by_receptionist',
        decidedBy: 'Renata',
      },
    ];
    const decisionTone = (d) =>
      d.startsWith('approved') || d === 'auto_approved'
        ? 'success'
        : d.startsWith('rejected') || d === 'rate_limited'
          ? 'danger'
          : 'mute';
    const decisionLabel = (d) =>
      ({
        approved_by_receptionist: 'aprovado',
        auto_approved: 'auto-aprovado',
        rejected_by_receptionist: 'rejeitado',
        rate_limited: 'bloqueado',
        approved_by_waiter: 'aprovado · garçom',
        escalated: 'escalado',
      })[d] || d;

    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          fontFamily: G_FONT,
          color: C.ink,
        }}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          <MTopBar
            dark={dark}
            title={`Investigar mesa ${tableId}`}
            left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
          />

          <div style={{ padding: '16px 16px 4px' }}>
            <div
              style={{
                background: '#FFF1F1',
                border: `1px solid #C43A3A`,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#A12626',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Atenção · esta mesa precisa de uma decisão sua
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: '#A12626',
                  letterSpacing: -0.4,
                  marginBottom: 6,
                }}
              >
                3 tentativas no mesmo IP de datacenter
              </div>
              <div style={{ fontSize: 12.5, color: '#A12626', fontWeight: 600, lineHeight: 1.5 }}>
                Mesa {tableId} foi escaneada 3 vezes nas últimas 4 horas a partir do mesmo IP de
                datacenter (AWS · 35.190.142.81). Padrão típico de bot tentando automatizar pedidos.
                As 3 tentativas foram bloqueadas, mas vale ações pra evitar que continue.
              </div>
            </div>
          </div>

          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Histórico de aberturas · mesa {tableId} · últimas 24 h
            </div>
            <div
              style={{ background: C.bg, border: `1px solid ${C.borderSoft}`, borderRadius: 12 }}
            >
              {tHistory.map((h, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    borderTop: i > 0 ? `1px solid ${C.borderSoft}` : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: C.faint,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      width: 38,
                      flexShrink: 0,
                      paddingTop: 2,
                    }}
                  >
                    {h.t}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.ink,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: -0.2,
                      }}
                    >
                      {h.ip}
                    </div>
                    <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 1 }}>
                      {h.loc} · risco {h.risk}
                    </div>
                  </div>
                  <MPill tone={decisionTone(h.decision)} dark={dark}>
                    {decisionLabel(h.decision)}
                  </MPill>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              O que fazer
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                {
                  lbl: 'Bloquear IP 35.190.142.81',
                  sub: 'Permanentemente · esse IP nunca mais abre essa mesa',
                  icon: Icon.shield(18),
                  tint: '#C43A3A',
                  bg: '#FFF1F1',
                  border: '#F4C7C7',
                },
                {
                  lbl: 'Regenerar QR da mesa',
                  sub: 'Novo segredo · QR antigo para de funcionar · você precisa regravar a mesa',
                  icon: Icon.flame(18),
                  tint: '#9A7212',
                  bg: '#FFF7E6',
                  border: '#F0DCB6',
                },
                {
                  lbl: 'Marcar mesa como inativa',
                  sub: 'Sistema rejeita qualquer abertura até você reativar',
                  icon: Icon.pause(18),
                  tint: '#646464',
                  bg: C.bg,
                  border: C.borderSoft,
                },
                {
                  lbl: 'Ver auditoria completa',
                  sub: '90 dias de histórico dessa mesa',
                  icon: Icon.history(18),
                  tint: '#1F3784',
                  bg: '#EFF3FA',
                  border: '#CDD7E8',
                },
              ].map((a, i) => (
                <button
                  key={i}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: 12,
                    border: `1px solid ${a.border}`,
                    borderRadius: 12,
                    background: a.bg,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: a.tint,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {a.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: '#1d1c19',
                        letterSpacing: -0.2,
                      }}
                    >
                      {a.lbl}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: a.tint,
                        marginTop: 2,
                        fontWeight: 600,
                        lineHeight: 1.3,
                      }}
                    >
                      {a.sub}
                    </div>
                  </div>
                  <div style={{ color: a.tint, flexShrink: 0, opacity: 0.7 }}>{Icon.arrow(18)}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 20 }} />
        </div>
        <MBottomNav active="ops" dark={dark} onTo={onTo} />
      </div>
    );
  }
  // ───── /DEEP-DIVE ─────

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Segurança · QR"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
        />

        {/* HERO · resumo do dia */}
        <div style={{ padding: '16px 16px 4px' }}>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Hoje · sábado, 6 de maio
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginTop: 6,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: -0.5,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  248
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: C.mute,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                  }}
                >
                  Mesas abertas
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#D98E2B',
                    letterSpacing: -0.5,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  2
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: C.mute,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                  }}
                >
                  Aguardando você
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#C43A3A',
                    letterSpacing: -0.5,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  3
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: C.mute,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                  }}
                >
                  Bloqueadas auto
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: C.mute,
                fontWeight: 500,
                marginTop: 12,
                lineHeight: 1.4,
              }}
            >
              O sistema monitora cada abertura de mesa. Eventos suspeitos chegam aqui pra você
              revisar.
            </div>
          </div>
        </div>

        {/* PENDING REVIEW */}
        {pending.length > 0 && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
              }}
            >
              Aguardando você decidir
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 8px',
                  borderRadius: 100,
                  background: '#C43A3A',
                  color: '#fff',
                }}
              >
                {pending.length}
              </span>
            </div>
            {pending.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: 14,
                  marginBottom: 10,
                  background: '#FFF1F1',
                  border: `1px solid #C43A3A`,
                  borderRadius: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#C43A3A',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 14,
                      fontWeight: 800,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p.table}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: '#A12626',
                        letterSpacing: -0.2,
                      }}
                    >
                      Mesa {p.table} · risco {p.score}
                    </div>
                    <div
                      style={{ fontSize: 11.5, color: '#A12626', fontWeight: 500, marginTop: 1 }}
                    >
                      Aberta {p.openedAt}
                      {p.escalated ? ' · escalada da recepcionista' : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                  {p.signals.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '3px 9px',
                        background: '#fff',
                        color: '#A12626',
                        border: '1px solid #FFCBCB',
                        borderRadius: 100,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: -0.1,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <GButton dark={dark} full kind="ghost">
                    Investigar
                  </GButton>
                  <GButton dark={dark} full kind="success">
                    Aprovar
                  </GButton>
                  <GButton dark={dark} full kind="danger">
                    Rejeitar
                  </GButton>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* IPs BLOQUEADOS */}
        {blocks.length > 0 && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
              }}
            >
              IPs bloqueados automaticamente
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 8px',
                  borderRadius: 100,
                  background: C.faint,
                  color: '#fff',
                }}
              >
                {blocks.length}
              </span>
            </div>
            <div
              style={{ background: C.bg, border: `1px solid ${C.borderSoft}`, borderRadius: 12 }}
            >
              {blocks.map((b, i) => (
                <div
                  key={b.id}
                  style={{
                    padding: 12,
                    borderTop: i > 0 ? `1px solid ${C.borderSoft}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: '#FFF1F1',
                        color: '#C43A3A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {Icon.shield(16)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: C.ink,
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: -0.2,
                        }}
                      >
                        {b.ip}
                      </div>
                      <div style={{ fontSize: 11, color: C.mute, fontWeight: 500, marginTop: 1 }}>
                        {b.asn} · {b.reason}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginBottom: 8 }}>
                    Bloqueado {b.blockedAt} · libera sozinho {b.autoLiftAt}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <GButton dark={dark} full kind="ghost">
                      Desbloquear
                    </GButton>
                    <GButton dark={dark} full kind="danger">
                      Bloquear permanente
                    </GButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EVENTOS DO WATCHER */}
        <div style={{ padding: '14px 16px 8px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Eventos suspeitos · últimas 24 h
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
            {[
              { id: 'all', lbl: 'Todos', count: allEvents.length },
              {
                id: 'high',
                lbl: 'Críticos',
                count: allEvents.filter((e) => e.sev === 'high').length,
              },
              { id: 'med', lbl: 'Atenção', count: allEvents.filter((e) => e.sev === 'med').length },
              { id: 'low', lbl: 'Info', count: allEvents.filter((e) => e.sev === 'low').length },
            ].map((f) => {
              const active = f.id === sevFilter;
              const c = f.id === 'all' ? C.ink : sevColor(f.id);
              return (
                <button
                  key={f.id}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: 100,
                    border: `1px solid ${active ? c : C.borderSoft}`,
                    background: active ? c : 'transparent',
                    color: active ? '#fff' : c,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: -0.1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  {f.id !== 'all' && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: active ? '#fff' : sevColor(f.id),
                      }}
                    />
                  )}
                  {f.lbl}
                  <span style={{ fontWeight: 600, opacity: 0.8 }}>{f.count}</span>
                </button>
              );
            })}
          </div>
          {events.length === 0 && (
            <div
              style={{
                padding: 24,
                background: C.bg,
                border: `1px dashed ${C.borderSoft}`,
                borderRadius: 12,
                fontSize: 12,
                color: C.faint,
                textAlign: 'center',
                fontWeight: 500,
              }}
            >
              Nenhum evento desse tipo nas últimas 24 h.
            </div>
          )}
          {events.map((e) => (
            <div
              key={e.id}
              style={{
                padding: 12,
                marginBottom: 8,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: sevColor(e.sev),
                  marginTop: 7,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                    {e.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.faint,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {e.when}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: C.mute,
                    fontWeight: 500,
                    marginTop: 3,
                    lineHeight: 1.4,
                  }}
                >
                  {e.sub}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    marginBottom: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <MPill tone={sevTone(e.sev)} dark={dark}>
                    {sevLabel(e.sev)}
                  </MPill>
                  <span
                    style={{
                      fontSize: 10,
                      color: C.faint,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                      marginLeft: 4,
                    }}
                  >
                    · {e.kind.replace(/-/g, ' ')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '5px 10px',
                      borderRadius: 8,
                      border: `1px solid ${C.borderSoft}`,
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.ink,
                    }}
                  >
                    Investigar
                  </button>
                  {e.canMarkSafe && (
                    <button
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        padding: '5px 10px',
                        borderRadius: 8,
                        border: `1px solid ${C.borderSoft}`,
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#1E8C5A',
                      }}
                    >
                      Marcar como seguro
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AUDIT LOG link */}
        <div style={{ padding: '14px 16px 16px' }}>
          <button
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: '100%',
              boxSizing: 'border-box',
              padding: 14,
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: C.surface,
                flexShrink: 0,
                border: `1px solid ${C.borderSoft}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.ink,
              }}
            >
              {Icon.shield(18)}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: -0.1 }}>
                Auditoria completa
              </div>
              <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                248 sessões hoje · histórico de 90 dias
              </div>
            </div>
            <div style={{ color: C.faint, flexShrink: 0 }}>{Icon.arrow(18)}</div>
          </button>
        </div>
      </div>
      <MBottomNav active="ops" dark={dark} onTo={onTo} />
    </div>
  );
};

// ============================================================
// AUDITORIA · 90 dias de session_audit_logs (cursor-pagination)
// ============================================================
const ScreenManagerSecurityAudit = ({
  dark = false,
  filter = 'all',
  tableFilter = null,
  onTo = () => {},
}) => {
  const C = useG(dark);

  const all = [
    {
      id: 'l01',
      t: 'Hoje 21:14',
      table: 22,
      ip: '35.190.142.81',
      asn: 'AWS',
      risk: 75,
      decision: 'rejected_by_receptionist',
      by: 'Renata',
    },
    {
      id: 'l02',
      t: 'Hoje 21:08',
      table: 14,
      ip: '35.190.142.81',
      asn: 'AWS',
      risk: 80,
      decision: 'rate_limited',
      by: 'sistema',
    },
    {
      id: 'l03',
      t: 'Hoje 20:48',
      table: 8,
      ip: '187.45.122.10',
      asn: 'Vivo Fibra',
      risk: 22,
      decision: 'auto_approved',
      by: 'sistema',
    },
    {
      id: 'l04',
      t: 'Hoje 20:42',
      table: 22,
      ip: '35.190.142.81',
      asn: 'AWS',
      risk: 80,
      decision: 'rate_limited',
      by: 'sistema',
    },
    {
      id: 'l05',
      t: 'Hoje 20:18',
      table: 11,
      ip: '177.10.84.211',
      asn: 'Vivo Fibra',
      risk: 18,
      decision: 'approved_by_receptionist',
      by: 'Renata',
    },
    {
      id: 'l06',
      t: 'Hoje 20:08',
      table: 6,
      ip: '177.10.84.211',
      asn: 'Vivo Fibra',
      risk: 12,
      decision: 'auto_approved',
      by: 'sistema',
    },
    {
      id: 'l07',
      t: 'Hoje 19:55',
      table: 4,
      ip: '187.45.34.219',
      asn: 'Claro 4G',
      risk: 28,
      decision: 'approved_by_waiter',
      by: 'Caleb',
    },
    {
      id: 'l08',
      t: 'Hoje 19:32',
      table: 22,
      ip: '177.10.84.211',
      asn: 'Vivo Fibra',
      risk: 22,
      decision: 'auto_approved',
      by: 'sistema',
    },
    {
      id: 'l09',
      t: 'Ontem 22:51',
      table: 9,
      ip: '170.245.55.18',
      asn: 'Datacenter',
      risk: 65,
      decision: 'escalated',
      by: 'sistema',
    },
    {
      id: 'l10',
      t: 'Ontem 22:48',
      table: 9,
      ip: '170.245.55.18',
      asn: 'Datacenter',
      risk: 65,
      decision: 'rejected_by_receptionist',
      by: 'Letícia',
    },
    {
      id: 'l11',
      t: 'Ontem 21:30',
      table: 14,
      ip: '177.10.84.211',
      asn: 'Vivo Fibra',
      risk: 14,
      decision: 'auto_approved',
      by: 'sistema',
    },
    {
      id: 'l12',
      t: '03 mai 03:42',
      table: 11,
      ip: '189.12.44.55',
      asn: 'Vivo Fibra',
      risk: 35,
      decision: 'rejected_by_receptionist',
      by: 'sistema',
    },
    {
      id: 'l13',
      t: '03 mai 21:08',
      table: 22,
      ip: '187.45.122.10',
      asn: 'Vivo Fibra',
      risk: 18,
      decision: 'auto_approved',
      by: 'sistema',
    },
    {
      id: 'l14',
      t: '02 mai 20:14',
      table: 17,
      ip: '177.10.84.211',
      asn: 'Vivo Fibra',
      risk: 12,
      decision: 'auto_approved',
      by: 'sistema',
    },
  ];

  const groupOf = (d) => {
    if (d.startsWith('approved') || d === 'auto_approved') return 'approved';
    if (d.startsWith('rejected')) return 'rejected';
    if (d === 'rate_limited') return 'blocked';
    if (d === 'escalated') return 'escalated';
    return 'other';
  };

  const filtered = all.filter((r) => {
    if (filter !== 'all' && groupOf(r.decision) !== filter) return false;
    if (tableFilter && r.table !== tableFilter) return false;
    return true;
  });

  const counts = {
    all: all.length,
    approved: all.filter((r) => groupOf(r.decision) === 'approved').length,
    rejected: all.filter((r) => groupOf(r.decision) === 'rejected').length,
    blocked: all.filter((r) => groupOf(r.decision) === 'blocked').length,
    escalated: all.filter((r) => groupOf(r.decision) === 'escalated').length,
  };

  const decisionInfo = (d) => {
    if (d.startsWith('approved') || d === 'auto_approved')
      return {
        tone: 'success',
        label: d === 'auto_approved' ? 'auto' : d === 'approved_by_waiter' ? 'garçom' : 'recepção',
      };
    if (d.startsWith('rejected')) return { tone: 'danger', label: 'rejeitado' };
    if (d === 'rate_limited') return { tone: 'danger', label: 'bloqueado' };
    if (d === 'escalated') return { tone: 'warn', label: 'escalado' };
    return { tone: 'mute', label: d };
  };

  const riskColor = (r) => (r >= 50 ? '#C43A3A' : r >= 25 ? '#D98E2B' : '#1E8C5A');

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title="Auditoria · 90 dias"
          left={<GIconBtn dark={dark} icon={Icon.back(20)} />}
          right={<GIconBtn dark={dark} icon={Icon.search(20)} />}
        />

        <div style={{ padding: '12px 16px 0' }}>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Total de aberturas · 90 dias
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  color: C.ink,
                  letterSpacing: -1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {all.length}
              </div>
              <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, lineHeight: 1.5 }}>
                <span style={{ color: '#1E8C5A', fontWeight: 700 }}>{counts.approved}</span>{' '}
                aprovadas ·{' '}
                <span style={{ color: '#A12626', fontWeight: 700 }}>
                  {counts.rejected + counts.blocked}
                </span>{' '}
                negadas ·{' '}
                <span style={{ color: '#7A4D10', fontWeight: 700 }}>{counts.escalated}</span>{' '}
                escaladas
              </div>
            </div>
            {tableFilter && (
              <div
                style={{
                  marginTop: 10,
                  padding: '6px 10px',
                  background: '#FFF7E6',
                  border: '1px solid #F0DCB6',
                  borderRadius: 8,
                  fontSize: 11.5,
                  color: '#7A4D10',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Filtrando por mesa {tableFilter}</span>
                <span style={{ color: '#9A7212', textDecoration: 'underline' }}>limpar</span>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px 8px',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {[
            { id: 'all', label: 'Todas', count: counts.all, dot: null },
            { id: 'approved', label: 'Aprovadas', count: counts.approved, dot: '#1E8C5A' },
            { id: 'rejected', label: 'Rejeitadas', count: counts.rejected, dot: '#C43A3A' },
            { id: 'blocked', label: 'Bloqueadas', count: counts.blocked, dot: '#C43A3A' },
            { id: 'escalated', label: 'Escaladas', count: counts.escalated, dot: '#D98E2B' },
          ].map((f) => {
            const sel = f.id === filter;
            return (
              <div
                key={f.id}
                style={{
                  flexShrink: 0,
                  padding: '7px 12px',
                  borderRadius: 100,
                  border: `1px solid ${sel ? C.ink : C.borderSoft}`,
                  background: sel ? C.ink : C.bg,
                  color: sel ? C.bg : C.ink,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: -0.1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {f.dot && (
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: f.dot }} />
                )}
                {f.label}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '0 6px',
                    borderRadius: 100,
                    background: sel ? 'rgba(255,255,255,0.18)' : C.surface,
                    color: sel ? C.bg : C.faint,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {f.count}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '32px 18px',
                textAlign: 'center',
                fontSize: 13,
                color: C.mute,
                lineHeight: 1.5,
                background: C.bg,
                borderRadius: 12,
                border: `1px dashed ${C.borderSoft}`,
              }}
            >
              Nenhum registro com esse filtro nos últimos 90 dias.
            </div>
          ) : (
            filtered.map((r) => {
              const di = decisionInfo(r.decision);
              return (
                <div
                  key={r.id}
                  style={{
                    padding: 12,
                    background: C.bg,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <div style={{ flexShrink: 0, minWidth: 60 }}>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: C.ink,
                        letterSpacing: -0.4,
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {r.table}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: C.faint,
                        fontWeight: 700,
                        marginTop: 1,
                        letterSpacing: 0.3,
                        textTransform: 'uppercase',
                      }}
                    >
                      Mesa
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: C.faint,
                        marginTop: 6,
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 500,
                      }}
                    >
                      {r.t}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MPill tone={di.tone} dark={dark}>
                        {di.label}
                      </MPill>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: riskColor(r.risk),
                          fontWeight: 800,
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: 0.2,
                        }}
                      >
                        risco {r.risk}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: C.ink,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: -0.05,
                      }}
                    >
                      {r.ip}
                    </div>
                    <div style={{ fontSize: 11, color: C.mute, marginTop: 2, fontWeight: 500 }}>
                      {r.asn} · decidido por {r.by}
                    </div>
                  </div>

                  <div style={{ color: C.faint, flexShrink: 0, marginTop: 2 }}>
                    {Icon.arrow(16)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {filtered.length > 0 && (
          <div style={{ padding: '0 16px 18px' }}>
            <div
              style={{
                padding: '12px 14px',
                textAlign: 'center',
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                background: C.bg,
                fontSize: 13,
                fontWeight: 700,
                color: C.ink,
                letterSpacing: -0.1,
              }}
            >
              Carregar mais 20 registros
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: C.faint,
                marginTop: 8,
                textAlign: 'center',
                fontWeight: 500,
              }}
            >
              Mostrando {filtered.length} de {filter === 'all' ? all.length : filtered.length} ·
              retenção máxima 90 dias · limpeza automática diária
            </div>
          </div>
        )}
      </div>
      <MBottomNav active="ops" dark={dark} onTo={onTo} />
    </div>
  );
};

// Expor pra cena Babel inline e pro canvas isolado.
Object.assign(window, { ScreenManagerSecurity, ScreenManagerSecurityAudit });
