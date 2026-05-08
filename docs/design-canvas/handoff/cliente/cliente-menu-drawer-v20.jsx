// ============================================================
// V20 · MenuDrawer · canvas atualizado pra cobrir 3 evoluções de prod
// que não existiam quando o drawer foi desenhado pela última vez
// (snapshot screens.jsx:1697 · pré-V13). Source of truth =
// `apps/web-customer/src/components/ui/MenuDrawer.tsx`.
//
// # V20 · diff vs V19 · cliente-menu-drawer-v20.jsx
//   · NOVO arquivo (sem precedente direto · drawer não foi reaberto V13-V19)
//   · 2 variantes do drawer (com/sem CTA "Voltar ao assistente")
//   · "Sair da mesa" virou ação destrutiva destacada (não MenuItem comum)
//   · Anotação "Ajuda" (visualmente igual · behavior conversacional)
//   · Host indicator "Você · host" abaixo do nome (NOVO V20 · sugestão ·
//     não em prod ainda)
//
// EXPORT: window.CLIENTE_MENU_DRAWER_V20_SECTIONS · 1 DCSection · 2 frames
//         (com hint render-only · DesignCanvas resolve no canvas)
//
// LINGUAGEM:
//   - drawer ancorado direita 300×100% · borderLeft 1.5px ink
//   - header com nome + tableLabel + StatusPill
//   - CTA "Voltar ao assistente" full-width filled ink (variante A)
//   - nav primária (Cardápio, Pedido, Pedido da mesa, Assistente IA,
//     Chamar garçom, Pagar conta) · 6 itens
//   - divider hairline
//   - nav secundária (Trocar perfil, Ajuda, Sair da mesa)
//   - Sair da mesa = button vermelho · sem chevron · destaque visual
//   - footer · session start + versão
// ============================================================

// helper builder · mesmo shape do fL/fM
const fD = ({ label, screen, note }) => {
  const noteLines = (note || '').length;
  const captionH = note ? 24 + Math.ceil(noteLines / 56) * 18 + 28 : 0;
  return (
    <DCArtboard key={'v20-drawer-' + label} id={'v20-drawer-' + label}
      label={`${label} · iOS`}
      width={414} height={844 + captionH + 24}
      style={{ background: '#f0eee9', borderRadius: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px', gap: 18 }}>
        {screen}
        {note && (
          <div style={{
            marginTop: 14, maxWidth: 420, fontSize: 12, color: C.mute, lineHeight: 1.5,
            fontFamily: FONT, letterSpacing: -0.05,
          }}>{note}</div>
        )}
      </div>
    </DCArtboard>
  );
};

// ─────────────────────────────────────────────────────────────
// DrawerLink · row de nav primária ou secundária
// ─────────────────────────────────────────────────────────────
const DrawerLink = ({ icon, label, sub, active = false, badge, small = false }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14,
    padding: small ? '10px 22px' : '14px 22px',
    borderLeft: `3px solid ${active ? C.ink : 'transparent'}`,
    background: active ? C.surface : 'transparent',
  }}>
    <div style={{
      width: small ? 28 : 34, height: small ? 28 : 34,
      borderRadius: small ? 14 : 17,
      border: `1.2px solid ${C.ink}`,
      flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, fontSize: small ? 12 : 14, color: C.ink, fontWeight: 500,
    }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: small ? 13 : 15, fontWeight: 500, color: C.ink,
        letterSpacing: -0.12,
      }}>{label}</div>
      {sub && (
        <div style={{
          marginTop: 1, fontSize: 11, color: C.mute,
          letterSpacing: -0.02,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</div>
      )}
    </div>
    {badge && (
      <span style={{
        background: C.ink, color: '#fff',
        padding: '2px 8px', borderRadius: 999,
        fontFamily: FONT, fontSize: 10, fontWeight: 600,
      }}>{badge}</span>
    )}
    {!badge && !small && (
      <span style={{ fontSize: 14, color: C.faint }}>›</span>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────
// MenuDrawerV20 · drawer completo
//   · `withAssistantCTA` controla a variante (A com CTA · B sem)
//   · `isHost` controla o sub "Você · host" (NOVO V20 · sugestão)
// ─────────────────────────────────────────────────────────────
const MenuDrawerV20 = ({ withAssistantCTA = true, isHost = true }) => (
  <IOSFrame style={{ background: 'rgba(0,0,0,0.35)' }}>
    {/* Backdrop · simulado · drawer ancorado à direita */}
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.35)',
      animation: 'cDrawerBackdrop 220ms ease-out both',
    }} />

    <aside style={{
      position: 'absolute', right: 0, top: 0, bottom: 0,
      width: 300,
      background: C.bg, color: C.ink,
      borderLeft: `1.5px solid ${C.ink}`,
      boxShadow: '-20px 0 60px rgba(0,0,0,0.25)',
      display: 'flex', flexDirection: 'column',
      animation: 'cDrawerSlide 280ms cubic-bezier(.4,0,.2,1) both',
    }}>
      {/* HEADER · pt-12 pra que botão close fique abaixo do Dynamic Island */}
      <div style={{
        padding: '48px 22px 22px',
        borderBottom: `1px solid ${C.borderSoft}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <MonoLabel size={11} color={C.mute}>Mesa 14 · Trattoria Luna</MonoLabel>
            <div style={{
              fontSize: 20, fontWeight: 600, color: C.ink,
              letterSpacing: -0.4, marginTop: 4,
            }}>Olá, Caleb</div>
            {isHost && (
              <div style={{ marginTop: 4 }}>
                <MonoLabel size={9.5} color={C.mute}>Você · host</MonoLabel>
              </div>
            )}
          </div>
          <button style={{
            width: 34, height: 34, borderRadius: 17,
            border: `1.2px solid ${C.ink}`, background: 'transparent',
            color: C.ink, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0,
          }} aria-label="Fechar menu">×</button>
        </div>

        {/* StatusPill em row · alinha MenuDrawer.tsx:144-149 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          border: `1px solid ${C.borderSoft}`, background: C.surface,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 3, background: C.success,
          }} />
          <span style={{ fontSize: 11, color: C.mute, letterSpacing: -0.02 }}>
            Sessão ativa · 3 pessoas na mesa
          </span>
        </div>

        {/* CTA "Voltar ao assistente" · só na variante A */}
        {withAssistantCTA && (
          <a style={{
            marginTop: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 12,
            border: `1.3px solid ${C.ink}`, background: C.ink, color: C.bg,
            textDecoration: 'none',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 13,
                border: `1.2px solid ${C.bg}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>✦</span>
              <span style={{
                fontSize: 13, fontWeight: 600,
                letterSpacing: -0.008 * 13,
              }}>Voltar ao assistente</span>
            </span>
            <span style={{ fontSize: 14 }}>›</span>
          </a>
        )}
      </div>

      {/* NAV PRIMÁRIA */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '14px 0',
      }}>
        <DrawerLink icon="☰" label="Cardápio" sub="Explorar pratos e bebidas" />
        <DrawerLink icon="◉" label="Meu pedido" sub="2 itens · R$ 92,00" />
        <DrawerLink icon="⊞" label="Pedido da mesa" sub="Comanda compartilhada · 7 itens" badge="3 novos" />
        <DrawerLink
          icon="✦" label="Assistente IA" sub="Sugestões e dúvidas"
          active={!withAssistantCTA}
        />
        <DrawerLink icon="◔" label="Chamar garçom" sub="Pedir atendimento" />
        <DrawerLink icon="$" label="Pagar conta" sub="Fechar a conta" />

        {/* divider hairline */}
        <div style={{
          margin: '14px 22px', height: 1, background: C.borderSoft,
        }} />

        {/* NAV SECUNDÁRIA */}
        <DrawerLink icon="↺" label="Trocar perfil" sub="Entrar com outro nome" small />
        <DrawerLink icon="?" label="Ajuda" small />

        {/* SAIR DA MESA · button danger destacado · sem chevron */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '10px 22px',
          borderLeft: `3px solid transparent`,
          color: C.danger,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            border: `1.2px solid ${C.danger}`,
            color: C.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT, fontSize: 12, fontWeight: 500,
            flexShrink: 0,
          }}>→</div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: C.danger,
            letterSpacing: -0.008 * 13,
          }}>Sair da mesa</div>
          {/* sem chevron · não é navegação */}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{
        padding: '14px 22px 28px',
        borderTop: `1px solid ${C.borderSoft}`,
        textAlign: 'center', color: C.faint,
        fontFamily: FONT, fontSize: 10, lineHeight: 1.5,
      }}>
        Sessão iniciada às 19:42<br/>
        v1.0 · Trattoria Luna
      </div>
    </aside>

    <style>{`
      @keyframes cDrawerBackdrop { from { opacity: 0; } to { opacity: 1; } }
      @keyframes cDrawerSlide {
        from { transform: translateX(40px); opacity: .6; }
        to   { transform: translateX(0);    opacity: 1;  }
      }
    `}</style>
  </IOSFrame>
);

// ═════════════════════════════════════════════════════════════
// DCSection EXPORT
// ═════════════════════════════════════════════════════════════
window.CLIENTE_MENU_DRAWER_V20_SECTIONS = [
  {
    id: 'menu-drawer-v20',
    title: 'MenuDrawer V20 · CTA condicional + Sair destacado + host indicator',
    subtitle:
      'Drawer reaberto pra cobrir 3 evoluções de prod desde V13: ' +
      '(1) CTA "Voltar ao assistente" full-width ink no header · ' +
      'só visível quando activeHref ≠ /assistente (não polui a tela onde já estamos); ' +
      '(2) "Sair da mesa" virou button danger destacado · sem chevron · ação destrutiva ' +
      '(button NÃO Link · limpa sessionStorage + push("/")); ' +
      '(3) "Ajuda" mantém visual mas behavior virou conversa · href com ' +
      'prefill="Como funciona este app?" · cai no chat IA. ' +
      'BÔNUS V20 (sugestão · não em prod): host indicator "Você · host" mono caps ' +
      'sub-eyebrow abaixo do nome · marca quem aprova decisões sociais (late-arrival, merge). ' +
      'Source of truth = MenuDrawer.tsx em web-customer/src/components/ui.',
    frames: [
      fD({
        label: '01 variante A · drawer aberto fora de /assistente · CTA visível',
        screen: <MenuDrawerV20 withAssistantCTA={true} isHost={true} />,
        note:
          '01 · CTA condicional · só quando activeHref ≠ /assistente · ' +
          'Cliente está em /cardapio ou /pedido e abre o drawer · CTA full-width ' +
          'filled ink no header (logo abaixo da StatusPill) com ✦ em círculo bordo ' +
          'branco + label "Voltar ao assistente" + chevron ›. Pedido explícito do ' +
          'usuário · permite voltar a falar com a IA de qualquer página em 1 toque. ' +
          'Sub "Você · host" abaixo do nome marca o aprovador social.',
      }),
      fD({
        label: '02 variante B · drawer aberto a partir de /assistente · sem CTA',
        screen: <MenuDrawerV20 withAssistantCTA={false} isHost={true} />,
        note:
          '02 · sem CTA · cliente já está em /assistente · "Voltar ao assistente" ' +
          'seria ruído. Header termina na StatusPill. Item "Assistente IA" na nav ' +
          'fica com active state (border-l-3px ink + bg surface). Comportamento ' +
          'condicional alinha MenuDrawer.tsx:154 (`!activeHref?.endsWith("/assistente")`).',
      }),
      fD({
        label: '03 anotações de behavior · Ajuda + Sair',
        screen: <MenuDrawerV20 withAssistantCTA={true} isHost={true} />,
        note:
          '03 · ajuda virou conversa · href com prefill="Como funciona este app?" ' +
          '(MenuDrawer.tsx:233-239 · cai no chat IA · cliente nunca sai do flow ' +
          'conversacional). · 04 · "Sair da mesa" é ação destrutiva · button (NÃO Link) ' +
          '· cor C.danger · sem chevron à direita · onClick limpa sessionStorage e ' +
          'push("/"). Visualmente destacado pra reduzir tap acidental: borda + ' +
          'glifo arrow só em vermelho. · 05 · host indicator é sugestão V20 · ' +
          'não em prod ainda · marca quem aprova late-arrival/merge sem CTA "transferir ' +
          'host" (esse fluxo não existe). Tag [NOVO V20 · sugestão · não em prod].',
      }),
    ],
  },
];

Object.assign(window, {
  MenuDrawerV20,
  DrawerLink,
});
