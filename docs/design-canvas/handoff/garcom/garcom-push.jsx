// ============================================================
// GARÇOM — TELAS DE NOTIFICAÇÃO PUSH (LOCK SCREEN)
// 4 tipos de notificação, em iOS e Android
// ============================================================

const { useState: gUseState } = React;

// ─────────────────────────────────────────────────────────────
// LOCKSCREEN BACKGROUND — gradiente discreto, simulando wallpaper
// ─────────────────────────────────────────────────────────────
function LockBg({ children, dark = false }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: dark
        ? 'linear-gradient(160deg, #2a1f2e 0%, #1a1820 60%, #0e0c12 100%)'
        : 'linear-gradient(160deg, #d8c8b8 0%, #b8a896 60%, #8a7868 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {children}
    </div>
  );
}

// hora grande do iOS
function IOSLockClock({ dark = false }) {
  const c = dark ? '#fff' : '#fff';
  return (
    <div style={{
      textAlign: 'center', color: c, paddingTop: 60,
      fontFamily: '-apple-system, "SF Pro Display", system-ui',
    }}>
      <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: 0.3, opacity: 0.95 }}>
        Terça-feira, 3 de maio
      </div>
      <div style={{
        fontSize: 96, fontWeight: 200, lineHeight: '0.95', letterSpacing: -3,
        marginTop: 4, fontVariantNumeric: 'tabular-nums',
      }}>
        21:34
      </div>
    </div>
  );
}

// hora grande do Android
function AndroidLockClock() {
  return (
    <div style={{
      textAlign: 'center', color: '#fff', paddingTop: 32,
      fontFamily: 'Roboto, system-ui',
    }}>
      <div style={{
        fontSize: 78, fontWeight: 300, lineHeight: '0.95', letterSpacing: -2,
        fontVariantNumeric: 'tabular-nums',
      }}>21:34</div>
      <div style={{ fontSize: 16, fontWeight: 400, marginTop: 6, opacity: 0.95 }}>
        Terça, 3 de maio
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IOS NOTIFICATION CARD — glass blur, ícone do app, preview
// ─────────────────────────────────────────────────────────────
function IOSNotif({ tone, title, body, time, urgent, stacked = 0 }) {
  const tint = tone === 'danger' ? '#ff453a'
            : tone === 'success' ? '#30d158'
            : tone === 'info'    ? '#0a84ff'
                                 : '#ff9f0a';
  return (
    <div style={{ position: 'relative', margin: '0 12px' }}>
      {/* stacked behind */}
      {stacked > 0 && (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 18, transform: 'scale(0.96) translateY(8px)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset',
          }} />
          {stacked > 1 && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(255,255,255,0.45)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 18, transform: 'scale(0.92) translateY(16px)',
            }} />
          )}
        </>
      )}
      <div style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden',
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: urgent
          ? '0 0 0 2px rgba(255,69,58,0.85), 0 8px 24px rgba(255,69,58,0.25)'
          : '0 1px 0 rgba(255,255,255,0.4) inset, 0 4px 16px rgba(0,0,0,0.06)',
        animation: urgent ? 'gNotifPulse 1.6s infinite' : 'none',
      }}>
        <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 12 }}>
          {/* app icon */}
          <div style={{
            width: 38, height: 38, borderRadius: 9, flexShrink: 0,
            background: '#0a0a0a', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Inter', system-ui", fontWeight: 700, fontSize: 14,
            letterSpacing: -0.5, position: 'relative',
          }}>
            TL
            {urgent && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                width: 12, height: 12, borderRadius: 6, background: tint,
                border: '2px solid rgba(255,255,255,0.9)',
              }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0,
            fontFamily: '-apple-system, system-ui', color: '#000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)', flexShrink: 0, marginLeft: 8 }}>{time}</div>
            </div>
            <div style={{ fontSize: 15, lineHeight: '20px', color: '#000', marginTop: 1, letterSpacing: -0.2 }}>
              {body}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ANDROID NOTIFICATION CARD — Material You estilo
// ─────────────────────────────────────────────────────────────
function AndroidNotif({ tone, title, body, time, urgent, expanded = false, actions = [] }) {
  const tint = tone === 'danger' ? '#ff5449'
            : tone === 'success' ? '#3ddc84'
            : tone === 'info'    ? '#7cb1ff'
                                 : '#f4b942';
  return (
    <div style={{
      margin: '0 8px', borderRadius: 28, overflow: 'hidden',
      background: 'rgba(46,42,52,0.78)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      boxShadow: urgent
        ? `0 0 0 2px ${tint}, 0 6px 18px rgba(255,84,73,0.3)`
        : 'none',
      animation: urgent ? 'gNotifPulse 1.6s infinite' : 'none',
    }}>
      <div style={{ padding: '14px 16px 12px',
        fontFamily: 'Roboto, system-ui', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4,
            background: '#fff', color: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Inter', system-ui", fontWeight: 700, fontSize: 9,
          }}>TL</div>
          <span style={{ fontSize: 12, opacity: 0.85, letterSpacing: 0.1 }}>
            Trattoria Luna · {title}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 'auto' }}>{time}</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: '20px', color: 'rgba(255,255,255,0.95)' }}>
          {body}
        </div>
        {expanded && actions.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 12, marginLeft: -8 }}>
            {actions.map((a, i) => (
              <div key={i} style={{
                padding: '8px 14px', borderRadius: 100,
                fontSize: 13, fontWeight: 500, letterSpacing: 0.1,
                color: a.primary ? '#000' : tint,
                background: a.primary ? tint : 'transparent',
              }}>{a.label}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IOS LOCKSCREEN — várias notificações empilhadas
// ─────────────────────────────────────────────────────────────
const IOSLockscreen = ({ scenario = 'multiple' }) => {
  return (
    <LockBg dark>
      <IOSStatusBar dark />
      <IOSLockClock dark />
      {/* widgets discretos (placeholder) */}
      <div style={{ display: 'flex', gap: 12, padding: '20px 16px 24px', justifyContent: 'center' }}>
        <div style={{
          width: 156, height: 64, borderRadius: 14,
          background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(20px)',
        }} />
        <div style={{
          width: 156, height: 64, borderRadius: 14,
          background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(20px)',
        }} />
      </div>

      <div style={{ flex: 1 }} />

      {/* notificações (do mais antigo embaixo para o mais novo no topo) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 110 }}>
        {scenario === 'multiple' && (
          <>
            <IOSNotif
              tone="danger" urgent
              title="Mesa 18 chamou"
              body="Cliente acionou o botão de chamar garçom."
              time="agora"
            />
            <IOSNotif
              tone="success"
              title="Pronto na cozinha"
              body="Mesa 12 · Risoto de camarão, Filé ao vinho"
              time="há 1 min"
            />
            <IOSNotif
              tone="success"
              title="Pronto no bar"
              body="Mesa 7 · 4× Chopp Pilsen, Água com gás"
              time="há 1 min"
            />
            <IOSNotif
              tone="info"
              title="Mesa 3 pediu a conta"
              body="Total: R$ 612,40 · 5 pessoas"
              time="há 2 min"
              stacked={2}
            />
          </>
        )}
        {scenario === 'urgent' && (
          <>
            <IOSNotif
              tone="danger" urgent
              title="ATRASO · Mesa 21"
              body="Aperol Spritz · 12 min na fila do bar. Verifique com o cliente."
              time="há 12 min"
            />
          </>
        )}
        {scenario === 'single' && (
          <IOSNotif
            tone="success"
            title="Pronto na cozinha"
            body="Mesa 12 · Risoto de camarão, Filé ao vinho. Toque para ver detalhes."
            time="agora"
          />
        )}
        {/* CASCATA · cliente sentou sem liberação — recepcionista é a primeira a saber */}
        {scenario === 'cascade-host' && (
          <IOSNotif
            tone="danger" urgent
            title="Mesa 14 · sentou sem liberação"
            body="4 pessoas escanearam o QR. Libere agora ou marque como erro."
            time="agora"
          />
        )}
        {/* CASCATA · 30s depois sem resposta da recepcionista — gerente é avisado */}
        {scenario === 'cascade-manager' && (
          <>
            <IOSNotif
              tone="danger" urgent
              title="Recepção não atendeu mesa 14"
              body="Letícia tem 32 s sem responder. Você pode liberar daqui ou ir até a mesa."
              time="agora"
            />
            <IOSNotif
              tone="info"
              title="Cliente escaneou QR sem liberação"
              body="Mesa 14 · 4 pessoas · enviado para Letícia primeiro"
              time="há 32 s"
            />
          </>
        )}
        {/* CASCATA · 60s sem resposta — garçom da praça é o último a ser avisado */}
        {scenario === 'cascade-waiter' && (
          <IOSNotif
            tone="danger" urgent
            title="Caleb · sua mesa 14 está sem garçom"
            body="Cliente sentou há 1 min · recepção e gerente não responderam. Vai liberar."
            time="agora"
          />
        )}
        {/* COZINHA REPRIORIZOU · garçom da mesa afetada recebe push */}
        {scenario === 'kitchen-reorder-waiter' && (
          <IOSNotif
            tone="success"
            title="Risoto da mesa 14 vai sair primeiro"
            body="Renata pediu pra puxar pra frente. Cozinha aceitou — sai em ~5 min. Fica de olho."
            time="agora"
          />
        )}
        {/* COZINHA REPRIORIZOU · gerente recebe confirmação */}
        {scenario === 'kitchen-reorder-manager' && (
          <IOSNotif
            tone="success"
            title="Cozinha aceitou alteração da fila"
            body="Mesas 14 e 7 foram puxadas pra frente. Olivia e Caleb foram avisados."
            time="agora"
          />
        )}
        {/* PAUSE AUTO-RESUMIU · gerente é avisado */}
        {scenario === 'pause-auto-resumed' && (
          <IOSNotif
            tone="info"
            title="Pedidos retomados"
            body="A pausa de 5 min terminou · 3 pedidos novos entraram na cozinha. Fila agora em 7."
            time="agora"
          />
        )}
        {/* GARÇOM TERMINOU PAUSA · gerente confirma liberar */}
        {scenario === 'staff-pause-expiring' && (
          <IOSNotif
            tone="info" urgent
            title="Caleb terminou a pausa de 5 min"
            body="Liberar de volta? Auto-libera em 2 min se você não responder."
            time="agora"
          />
        )}
        {/* CORTESIA · garçom recebe pra entregar */}
        {scenario === 'courtesy-waiter' && (
          <IOSNotif
            tone="success"
            title="Levar fondant pra mesa 14 · cortesia"
            body="Renata mandou. Cliente aceitou. Sai em ~5 min · sem cobrança."
            time="agora"
          />
        )}
        {/* CORTESIA · gerente recebe confirmação que cliente aceitou */}
        {scenario === 'courtesy-manager' && (
          <IOSNotif
            tone="success"
            title="Cliente aceitou a cortesia"
            body='Mesa 14: "Muito obrigado, vocês são incríveis!" Olivia foi avisada.'
            time="agora"
          />
        )}
        {/* MANAGER MESSAGE · garçom recebe mensagem direta da gerente · V9 ·
            V10: tap leva pra ScreenStaffMessageThread (deep-link via
            senderId), não mais pra ScreenStaffMessageDetail isolado. */}
        {scenario === 'manager-message-waiter' && (
          <IOSNotif
            tone="info"
            title="Renata mandou uma mensagem"
            body="Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o Henrique."
            time="agora"
          />
        )}
      </div>

      {/* iOS lockscreen footer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 100, display: 'flex', justifyContent: 'space-between',
        padding: '0 30px', alignItems: 'flex-end', paddingBottom: 40,
      }}>
        <div style={{
          width: 50, height: 50, borderRadius: 25,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a3 3 0 013 3v6a3 3 0 11-6 0V5a3 3 0 013-3zm6 9a6 6 0 11-12 0H4a8 8 0 007 7.94V22h2v-3.06A8 8 0 0020 11h-2z"/>
          </svg>
        </div>
        <div style={{
          width: 50, height: 50, borderRadius: 25,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="9" width="16" height="11" rx="2"/>
            <circle cx="12" cy="14.5" r="1.5"/>
            <path d="M8 9V6a4 4 0 018 0v3"/>
          </svg>
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 139, height: 5, borderRadius: 100, background: 'rgba(255,255,255,0.7)',
      }} />
    </LockBg>
  );
};

// ─────────────────────────────────────────────────────────────
// ANDROID LOCKSCREEN
// ─────────────────────────────────────────────────────────────
const AndroidLockscreen = ({ scenario = 'multiple' }) => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%',
      background: 'linear-gradient(170deg, #2c2436 0%, #1a1620 60%, #0e0a14 100%)',
      color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 40, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px',
        fontFamily: 'Roboto, system-ui', fontSize: 14 }}>
        <span>21:34</span>
        <span style={{ opacity: 0.7 }}>•••</span>
      </div>
      <AndroidLockClock />
      {/* lock icon */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8">
          <rect x="5" y="11" width="14" height="10" rx="2"/>
          <path d="M8 11V7a4 4 0 018 0v4"/>
        </svg>
      </div>

      <div style={{ flex: 1 }} />

      {/* notifications */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 80 }}>
        {scenario === 'multiple' && (
          <>
            <AndroidNotif
              tone="danger" urgent expanded
              title="CHAMADO"
              body="Mesa 18 chamou. Cliente acionou o botão de chamar garçom."
              time="agora"
              actions={[
                { label: 'Aceitar', primary: true },
                { label: 'Ver mesa' },
              ]}
            />
            <AndroidNotif
              tone="success"
              title="PRONTO · COZINHA"
              body="Mesa 12 · Risoto de camarão, Filé ao vinho"
              time="1 min"
            />
            <AndroidNotif
              tone="success"
              title="PRONTO · BAR"
              body="Mesa 7 · 4× Chopp Pilsen, Água com gás"
              time="1 min"
            />
            <AndroidNotif
              tone="info"
              title="CONTA"
              body="Mesa 3 pediu a conta · R$ 612,40"
              time="2 min"
            />
          </>
        )}
        {scenario === 'urgent' && (
          <AndroidNotif
            tone="danger" urgent expanded
            title="ATRASO · 12 MIN"
            body="Mesa 21 · Aperol Spritz parado na fila do bar. Verifique com o cliente."
            time="12 min"
            actions={[
              { label: 'Resolver', primary: true },
              { label: 'Adiar 5 min' },
            ]}
          />
        )}
        {scenario === 'single' && (
          <AndroidNotif
            tone="success" expanded
            title="PRONTO · COZINHA"
            body="Mesa 12 · Risoto de camarão, Filé ao vinho. Deslize para ver."
            time="agora"
            actions={[
              { label: 'Vou servir', primary: true },
              { label: 'Adiar' },
            ]}
          />
        )}
        {/* CASCATA · recepcionista (T+0s) */}
        {scenario === 'cascade-host' && (
          <AndroidNotif
            tone="danger" urgent expanded
            title="MESA 14 · SENTOU SEM LIBERAÇÃO"
            body="4 pessoas escanearam o QR sem você ter liberado a mesa. Libere agora ou marque como erro."
            time="agora"
            actions={[
              { label: 'Liberar agora', primary: true },
              { label: 'É erro' },
            ]}
          />
        )}
        {/* CASCATA · gerente (T+30s) */}
        {scenario === 'cascade-manager' && (
          <>
            <AndroidNotif
              tone="danger" urgent expanded
              title="RECEPÇÃO NÃO ATENDEU · MESA 14"
              body="Letícia tem 32 s sem responder. Você pode liberar pelo gerente ou ligar pra ela."
              time="agora"
              actions={[
                { label: 'Liberar pelo gerente', primary: true },
                { label: 'Ir até a mesa' },
              ]}
            />
            <AndroidNotif
              tone="info"
              title="CASCATA INICIADA"
              body="Mesa 14 · 4 pessoas · primeiro foi enviado para Letícia"
              time="32 s"
            />
          </>
        )}
        {/* CASCATA · garçom (T+60s) */}
        {scenario === 'cascade-waiter' && (
          <AndroidNotif
            tone="danger" urgent expanded
            title="MESA 14 · SUA PRAÇA · SEM GARÇOM"
            body="Cliente sentou há 1 min. Recepção e gerente não responderam. Vai liberar e atender."
            time="agora"
            actions={[
              { label: 'Vou agora', primary: true },
              { label: 'Não é minha praça' },
            ]}
          />
        )}
        {/* COZINHA REPRIORIZOU · garçom da mesa afetada */}
        {scenario === 'kitchen-reorder-waiter' && (
          <AndroidNotif
            tone="success" expanded
            title="RISOTO DA MESA 14 · SAI PRIMEIRO"
            body="Renata pediu pra puxar pra frente. Cozinha aceitou — sai em ~5 min."
            time="agora"
            actions={[
              { label: 'Vou na cozinha', primary: true },
              { label: 'Ok' },
            ]}
          />
        )}
        {/* COZINHA REPRIORIZOU · gerente recebe confirmação */}
        {scenario === 'kitchen-reorder-manager' && (
          <AndroidNotif
            tone="success" expanded
            title="COZINHA ACEITOU ALTERAÇÃO"
            body="Mesas 14 e 7 puxadas pra frente. Olivia e Caleb avisados."
            time="agora"
          />
        )}
        {/* PAUSE AUTO-RESUMIU · gerente é avisado */}
        {scenario === 'pause-auto-resumed' && (
          <AndroidNotif
            tone="info" expanded
            title="PEDIDOS RETOMADOS"
            body="A pausa de 5 min terminou · 3 pedidos novos entraram na cozinha. Fila agora em 7."
            time="agora"
          />
        )}
        {/* GARÇOM TERMINOU PAUSA · gerente confirma */}
        {scenario === 'staff-pause-expiring' && (
          <AndroidNotif
            tone="info" expanded urgent
            title="CALEB TERMINOU A PAUSA"
            body="Liberar de volta? Auto-libera em 2 min se você não responder."
            time="agora"
            actions={[
              { label: 'Liberar agora', primary: true },
              { label: 'Pausar +5 min' },
            ]}
          />
        )}
        {/* CORTESIA · garçom recebe pra entregar */}
        {scenario === 'courtesy-waiter' && (
          <AndroidNotif
            tone="success" expanded
            title="LEVAR FONDANT · MESA 14"
            body="Cortesia da casa · Renata mandou. Cliente aceitou. Sai em ~5 min, sem cobrança."
            time="agora"
            actions={[
              { label: 'Vou pegar', primary: true },
              { label: 'Estou ocupado' },
            ]}
          />
        )}
        {/* CORTESIA · gerente recebe confirmação */}
        {scenario === 'courtesy-manager' && (
          <AndroidNotif
            tone="success" expanded
            title="CLIENTE ACEITOU A CORTESIA"
            body='Mesa 14: "Muito obrigado, vocês são incríveis!" Olivia foi avisada.'
            time="agora"
          />
        )}
        {/* MANAGER MESSAGE · garçom recebe mensagem direta da gerente · V9 */}
        {scenario === 'manager-message-waiter' && (
          <AndroidNotif
            tone="info" expanded
            title="RENATA MANDOU UMA MENSAGEM"
            body="Vou te mandar reforço · 5 min. Foca nas mesas 14 e 21, o resto eu seguro com o Henrique."
            time="agora"
            actions={[
              { label: 'Abrir', primary: true },
              { label: 'Marcar como lido' },
            ]}
          />
        )}
      </div>

      {/* gesture nav */}
      <div style={{
        height: 24, display: 'flex', justifyContent: 'center', alignItems: 'center',
      }}>
        <div style={{ width: 108, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.5)' }} />
      </div>
    </div>
  );
};

Object.assign(window, {
  IOSLockscreen, AndroidLockscreen, IOSNotif, AndroidNotif,
});
