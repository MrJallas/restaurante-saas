// ============================================================
// GARÇOM — APP PRINCIPAL (Design Canvas com todas as telas)
// ============================================================

// Wrapper visual que monta uma tela dentro de iOS ou Android frame.
// IMPORTANTE: NÃO podemos envolver <DCArtboard> em outro componente —
// o DCSection só reconhece filhos cujo `child.type === DCArtboard`.
function PhoneFrame({ os, dark, children }) {
  if (os === 'ios') {
    return (
      <IOSDevice dark={dark} width={390} height={844}>
        {children}
      </IOSDevice>
    );
  }
  return (
    <AndroidDevice dark={dark} width={390} height={844}>
      {children}
    </AndroidDevice>
  );
}

// Conteúdo padrão de cada artboard: padding + frame
// O .gphone aplica box-sizing:border-box em todo descendente, pra
// que telas com width:100%+padding não estourem a largura do device.
const FrameSlot = ({ os, dark, children }) => (
  <div
    className="gphone"
    style={{
      padding: 12,
      boxSizing: 'border-box',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0eee9',
    }}
  >
    <PhoneFrame os={os} dark={dark}>
      {children}
    </PhoneFrame>
  </div>
);

// inject once
if (typeof document !== 'undefined' && !document.getElementById('gphone-css')) {
  const s = document.createElement('style');
  s.id = 'gphone-css';
  s.textContent = `.gphone, .gphone *, .gphone *::before, .gphone *::after { box-sizing: border-box; }`;
  document.head.appendChild(s);
}

const AB_W = 414; // largura do artboard (cabe IOS 390 + padding)
const AB_H = 868; // altura  do artboard (cabe IOS 844 + padding)

// ============================================================
// ROLE HEADER — banner grande que abre cada grupo de role.
// Renderiza um <div> em vez de <DCArtboard> pra ocupar largura
// total e separar visualmente os roles no canvas.
// ============================================================
const RoleHeader = ({ id, role, color, icon, screens, navLabels, intro }) => (
  <div
    id={id}
    style={{
      margin: '64px 0 24px',
      padding: '32px 36px',
      background: color.bg,
      border: `2px solid ${color.border}`,
      borderRadius: 16,
      color: color.fg,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 14,
          background: color.iconBg,
          color: color.iconFg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1.4,
            opacity: 0.7,
            textTransform: 'uppercase',
          }}
        >
          {role.kicker}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 2, lineHeight: 1.1 }}>
          {role.title}
        </div>
        <div style={{ fontSize: 15, marginTop: 4, opacity: 0.85 }}>
          {screens.length} {screens.length === 1 ? 'tela' : 'telas'} · {role.platform}
        </div>
      </div>
    </div>
    <div style={{ fontSize: 15, lineHeight: 1.55, marginBottom: 20, opacity: 0.92 }}>{intro}</div>
    {navLabels && (
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            opacity: 0.65,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Bottom nav · do app
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {navLabels.map((tab, i) => (
            <div
              key={i}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                background: color.iconBg,
                color: color.iconFg,
                borderRadius: 8,
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>
    )}
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1,
          opacity: 0.65,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Telas neste grupo (em ordem de leitura)
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {screens.map((s, i) => (
          <span
            key={i}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              background: 'rgba(255,255,255,0.6)',
              color: color.fg,
              border: `1px solid ${color.border}`,
              borderRadius: 99,
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  </div>
);

// Cores por role
const ROLE_COLORS = {
  garcom: { bg: '#fff7e8', border: '#f0c890', fg: '#3d2400', iconBg: '#3d2400', iconFg: '#fff7e8' },
  host: { bg: '#eef4ff', border: '#a8c0ec', fg: '#101e3a', iconBg: '#101e3a', iconFg: '#eef4ff' },
  manager: {
    bg: '#0f1216',
    border: '#3a4250',
    fg: '#e8eef5',
    iconBg: '#e8eef5',
    iconFg: '#0f1216',
  },
  cross: { bg: '#f4f1ec', border: '#bfb5a3', fg: '#1c1812', iconBg: '#1c1812', iconFg: '#f4f1ec' },
};
const App = () => {
  const tweaks = useTweaks(
    /*EDITMODE-BEGIN*/ {
      theme: 'claro',
    } /*EDITMODE-END*/,
  );
  const dark = tweaks.theme === 'escuro';

  return (
    <DesignCanvas>
      {/* ===== INTRO GERAL DO CANVAS ===== */}
      <DCSection
        id="intro"
        title="Software do restaurante · canvas completo de UI"
        subtitle="Este canvas mostra TODAS as telas dos 3 apps nativos (garçom · recepcionista · gerente) e as telas web do cliente (cortesia recebida). Ordem de leitura: 1) GARÇOM (login → home → mesa → pedido → turno) · 2) RECEPCIONISTA (mesas → espera → reservas do dia, vindas prontas do bot WhatsApp) · 3) GERENTE (Painel → Operação → Equipe → Financeiro → Eu + ferramentas rápidas + sheet Contactar cliente sobre Operação) · 4) CROSS-CUTTING (notificações cascata, menus 3-pontinhos, lock screens). Cada role tem sua bottom nav documentada no header da seção."
      />

      {/* ===== ★ V11 · 2026-05 · MENSAGENS SOBE PRO 2º BLOCO NOS 3 ROLES ★ ===== */}
      <DCSection
        id="v11-mensagens-discoverable"
        title="★ V11 · 2026-05 · Mensagens · subiu pro 2º bloco em todos os 3 roles ★"
        subtitle={`V10 implementou a ActionRow "Mensagens" no Eu/Perfil dos 3 roles, mas ENTERROU dentro do bloco OPERAÇÃO — o badge de não-lidas ficava abaixo da dobra no abrir da tela e o usuário só descobria com scroll.\n\nV11 promove "Mensagens" pra bloco PRÓPRIO (eyebrow "MENSAGENS", uma linha só) imediatamente após o hero, antes de qualquer outra seção. Critério: mensagem é interruptiva (notif staff↔staff que pede ação), enquanto OPERAÇÃO/CONTA/PREFERÊNCIAS são leitura passiva. Badge agora está visível no momento exato da abertura.\n\nMudanças por role:\n  • Gerente (ScreenManagerSettings) · Hero → Mensagens → KPI vendas no turno → Operação (sem Mensagens) → Conta → Estabelecimento → Sair\n  • Garçom (ScreenProfile) · Hero → Mensagens → Notificações → Preferências → Sessão. O bloco "Operação" SUMIU porque só tinha esse item.\n  • Recepcionista (ScreenHostProfile) · Hero → Mensagens → KPI mesas liberadas → Operação (só Histórico de turnos agora) → Conta → Sair\n\nDecisão de ordering no gerente e na recepcionista: Mensagens é PRIMEIRO porque é interruptivo · KPI passivo desce uma posição. Comparar lado a lado com os artboards mgr-settings-ios / waiter-profile-ios / host-me-ios mais abaixo no canvas (que já refletem essa nova ordem).`}
      >
        <DCArtboard
          id="v11-mgr-eu-ios"
          label="★ V11 ★ Gerente · Eu · Mensagens em 2º bloco · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerSettings dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="v11-waiter-eu-ios"
          label="★ V11 ★ Garçom · Perfil · Mensagens em 2º bloco · OPERAÇÃO some · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenProfile dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="v11-host-eu-ios"
          label="★ V11 ★ Recepcionista · Eu · Mensagens em 2º bloco · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostProfile dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="v11-mgr-eu-and"
          label="★ V11 ★ Gerente · Eu · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerSettings dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ╔══════════════════════════════════════════════════════════
           ║  ROLE 1 · GARÇOM (app nativo iOS + Android)
           ╚══════════════════════════════════════════════════════════ */}
      <RoleHeader
        id="role-garcom"
        color={ROLE_COLORS.garcom}
        icon="🧊"
        role={{
          kicker: 'Role · garçom · staff de salão',
          title: 'App do garçom',
          platform: 'iOS + Android nativos',
        }}
        navLabels={['🏠 Mesas', '🛎️ Chamados', '⃞ Novo (chooser)', '⏱ Turno', '👤 Eu']}
        intro={`Aplicativo que o garçom usa em campo: receber chamados das mesas que atende, escanear o QR fixo gravado nelas pra começar atendimento, lançar pedidos rápidos, confirmar entrega de bandejas prontas e acompanhar seu turno (faturamento próprio + gorjetas). Login com CPF + senha e biometria após o primeiro acesso. Notificações push em lock screen são o primeiro contato com qualquer evento — chamado de mesa, pronto cozinha, atraso.\n\nA aba Novo (3ª da bottom nav · ícone viewfinder QR) é a entrada PRINCIPAL pra qualquer interação com mesa. V4 (2026-05): tap abre ScreenWaiterNewEntry em modal fullscreen — um chooser de 2 caminhos: escanear o QR (primário ink filled) ou pegar a mesa pelo número (secundário outline). Antes ia direto pro scanner, mas isso forçava câmera mesmo quando a mesa já era atendida pelo garçom. O scanner continua existindo · acessível via 1ª opção do chooser ou via FAB opcional da Home. "Inserir manualmente" no scanner foi reduzido a text link discreto no rodapé (fallback raro · QR ilegível).`}
        screens={[
          'Lock screen · push',
          'Login · CPF + senha',
          'Esqueci minha senha (3 passos)',
          'Home / Minhas mesas (Grade · variação única + FAB opcional)',
          'Detalhe da mesa',
          'Detalhe do chamado',
          'Nova interação · chooser (modal fullscreen aberto pela aba Novo) ★ V4 ★',
          'Escanear QR (modal · 1ª opção do chooser)',
          'Escolher mesa (2ª opção do chooser · número direto)',
          'Confirmar entrega',
          'Tirar pedido (3 abordagens)',
          'Turno + Perfil',
        ]}
      />

      {/* ===== NOTIFICAÇÕES PUSH (LOCK SCREEN) ===== */}
      <DCSection
        id="push"
        title="Notificações push (lock screen)"
        subtitle="É o primeiro contato do garçom com qualquer evento do salão. Tipos: chamado de mesa, pronto cozinha, pronto bar, atraso, conta. Variações: pilha completa, único, urgente isolado."
      >
        <DCArtboard
          id="push-ios-stack"
          label="iOS · pilha de notificações"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="multiple" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="push-and-stack"
          label="Android · pilha · ações inline"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="multiple" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="push-ios-urgent"
          label="iOS · atraso (alerta crítico)"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="urgent" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="push-and-urgent"
          label="Android · atraso · ações expandidas"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="urgent" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="push-ios-single"
          label="iOS · pronto · banner único"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="single" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="push-and-single"
          label="Android · pronto · expandido"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="single" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== LOGIN — CPF + senha ===== */}
      <DCSection
        id="login"
        title="Login · CPF + senha"
        subtitle="Garçom faz login com CPF e senha. Primeiro acesso usa senha provisória do gerente. Suporta biometria (Face ID / impressão digital) após o primeiro login. Estado de erro mostra mensagem inline e contador de tentativas."
      >
        <DCArtboard id="login-ios" label="iOS · login normal" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenLogin dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="login-and" label="Android · login normal" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenLogin dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="login-ios-first" label="iOS · primeiro acesso" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenLogin dark={dark} firstTime />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="login-and-error"
          label="Android · senha incorreta"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenLogin dark={dark} error />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== RECUPERAÇÃO DE SENHA ===== */}
      <DCSection
        id="forgot"
        title="Recuperação de senha"
        subtitle="Fluxo de 3 passos: (1) escolher canal de recuperação a partir dos contatos cadastrados — SMS, e-mail ou WhatsApp; (2) digitar código de 6 dígitos com expiração de 10 min; (3) definir nova senha com indicador de força e checklist de requisitos."
      >
        <DCArtboard
          id="forgot-ios-choose"
          label="iOS · 1. escolher canal"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenForgotPassword dark={dark} step="choose" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="forgot-and-choose"
          label="Android · 1. escolher canal"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenForgotPassword dark={dark} step="choose" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="forgot-ios-code"
          label="iOS · 2. código de 6 dígitos"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenForgotPassword dark={dark} step="code" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="forgot-and-code"
          label="Android · 2. código de 6 dígitos"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenForgotPassword dark={dark} step="code" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="newpwd-ios" label="iOS · 3. nova senha" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenSetNewPassword dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="newpwd-and" label="Android · 3. nova senha" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenSetNewPassword dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== HOME — VARIAÇÃO ÚNICA (grade) ===== */}
      <DCSection
        id="home"
        title="Home · Minhas mesas"
        subtitle={`Tela inicial do garçom no turno · variação única (Grade). Lista por prioridade e Mapa do salão saíram no V3 — não pagaram a complexidade do toggle. Cards 2 colunas: nº da mesa (grande), status, tempo aberta, valor parcial; banner superior com chamados ativos.\n\nA aba "Novo" da bottom nav abre ScreenWaiterNewEntry — chooser de 2 caminhos (V4) — fullscreen sobre a Home (modal · não substitui a aba). De lá o garçom escolhe escanear o QR ou pegar a mesa pelo número direto. A última variação na seção mostra um FAB alternativo (atalho secundário) — abre o mesmo chooser.`}
      >
        <DCArtboard id="home-grid-ios" label="Grade · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenHomeGrid dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="home-grid-and" label="Grade · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenHomeGrid dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="home-grid-fab-ios"
          label="Variação · com FAB · abre chooser (V4) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHomeGrid dark={dark} fab />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="home-grid-fab-and"
          label="Variação · com FAB · abre chooser (V4) · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHomeGrid dark={dark} fab />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== DETALHE DA MESA ===== */}
      <DCSection
        id="mesa"
        title="Detalhe da mesa"
        subtitle="Total da conta com pagamentos parciais via app + histórico unificado de pedidos, chamados e pagamentos."
      >
        <DCArtboard id="mesa-ios" label="iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenTableDetail dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mesa-and" label="Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenTableDetail dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== DETALHE DO CHAMADO ===== */}
      <DCSection
        id="chamado"
        title="Detalhe do chamado"
        subtitle="Tela única que se adapta ao tipo: cliente chamou, pediu a conta, pronto na cozinha. Cor da hero comunica a tonalidade."
      >
        <DCArtboard id="call-ios-conta" label="iOS · pediu a conta" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenCallDetail dark={dark} type="pediu-conta" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="call-and-chamou"
          label="Android · cliente chamou"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenCallDetail dark={dark} type="chamou-garcom" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="call-ios-pronto" label="iOS · pronto cozinha" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenCallDetail dark={dark} type="pronto-cozinha" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== NOVA INTERAÇÃO / ESCANEAR / ESCOLHER MESA / CONFIRMAR ENTREGA ===== */}
      <DCSection
        id="garcom-flow"
        title="Garçom · nova interação, escanear, escolher mesa e confirmar entrega"
        subtitle={`4 telas que abrem o ciclo do garçom em uma mesa. V4 (2026-05): a aba "Novo" não vai mais direto pro scanner — abre ScreenWaiterNewEntry, um chooser de 2 caminhos.\n\n(1) NOVA INTERAÇÃO · chooser ★ NOVO V4 ★ — modal fullscreen aberto pela aba "Novo" do GBottomNav. 2 cards-botão grandes: "Escanear QR da mesa" (primário ink filled · Icon.qr 40px) e "Pegar mesa pelo número" (secundário outline · keypad 40px). Footer discreto sublinhado mono caps tiny: "QR ilegível? Contactar gerente". Antes a aba ia direto pro scanner — mas pra mesas que o garçom JÁ atende, escanear é desnecessário. Esse chooser custa 1s de cognição e elimina ~30% das vezes que o garçom abria scanner pra usar "Inserir manualmente".\n\n(2) ESCANEAR · primeira opção do chooser. Câmera fullscreen com viewfinder de canto a canto. V4: "Inserir manualmente" do rodapé virou TEXT LINK discreto sublinhado (não mais pill full-width) — quem chegou aqui já fez a escolha de escanear; esse fallback é só pra emergência (QR ilegível, câmera com problema).\n\n(3) ESCOLHER MESA · segunda opção do chooser, agora também acessível direto sem passar pelo scanner. Mesas que o garçom JÁ atende em destaque + livres logo abaixo.\n\n(4) CONFIRMAR ENTREGA · após retirar bandeja pronta da cozinha, garçom usa esta tela na mesa pra validar com o cliente que tudo veio certo, e só então marca como 'servido' no KDS.`}
      >
        {/* ─── V4 · NOVA INTERAÇÃO (chooser) · entrada da aba Novo ─── */}
        <DCArtboard
          id="entry-chooser-ios"
          label="V4 · Nova interação · chooser · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenWaiterNewEntry dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="entry-chooser-and"
          label="V4 · Nova interação · chooser · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenWaiterNewEntry dark={dark} />
          </FrameSlot>
        </DCArtboard>
        {/* ─── Scanner · 1ª opção do chooser · "Inserir manualmente" reduzido ─── */}
        <DCArtboard
          id="scan-ios"
          label="Escanear QR · 1ª opção do chooser · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenWaiterScanQr dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="scan-and"
          label="Escanear QR · 1ª opção do chooser · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenWaiterScanQr dark={dark} />
          </FrameSlot>
        </DCArtboard>
        {/* ─── Picker · 2ª opção do chooser ─── */}
        <DCArtboard
          id="picker-ios"
          label="Escolher mesa · 2ª opção do chooser · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenWaiterTablePicker dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="picker-and"
          label="Escolher mesa · 2ª opção do chooser · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenWaiterTablePicker dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="deliver-ios" label="Confirmar entrega · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenWaiterDeliveryConfirm dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="deliver-and" label="Confirmar entrega · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenWaiterDeliveryConfirm dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== PEDIDO MANUAL — 3 VARIAÇÕES ===== */}
      <DCSection
        id="pedido"
        title="Tirar pedido manual — 3 abordagens"
        subtitle="A: chips rápidos por categoria (velocidade). B: busca + autocomplete (POS). C: detalhe do item com modificadores."
      >
        <DCArtboard id="ord-quick-ios" label="A · Chips · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenOrderQuick dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="ord-quick-and" label="A · Chips · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenOrderQuick dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="ord-quick-full-ios"
          label="A · Comanda em tela cheia · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenOrderQuick dark={dark} initialSnap="full" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="ord-quick-full-and"
          label="A · Comanda em tela cheia · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenOrderQuick dark={dark} initialSnap="full" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="ord-search-ios" label="B · Busca · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenOrderSearch dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="ord-search-and" label="B · Busca · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenOrderSearch dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="ord-item-ios" label="C · Item detalhado · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenOrderItem dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="ord-item-and"
          label="C · Item detalhado · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenOrderItem dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== TURNO E PERFIL ===== */}
      <DCSection
        id="extras"
        title="Turno e perfil"
        subtitle="Histórico do turno com faturamento próprio, e tela de perfil para configurações pessoais (som, vibração, tema)."
      >
        <DCArtboard id="shift-ios" label="Turno · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenShift dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="shift-and" label="Turno · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenShift dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="profile-ios" label="Perfil · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenProfile dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="profile-and" label="Perfil · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenProfile dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ╔══════════════════════════════════════════════════════════
           ║  ROLE 2 · GERENTE (app nativo iOS + Android)
           ╚══════════════════════════════════════════════════════════ */}
      <RoleHeader
        id="role-manager"
        color={ROLE_COLORS.manager}
        icon="🏢"
        role={{
          kicker: 'Role · gerente / dono · admin do estabelecimento',
          title: 'App do gerente',
          platform: 'iOS + Android nativos',
        }}
        navLabels={['📊 Painel', '🔥 Operação', '👤 Equipe', '💰 Financeiro', '⚙ Eu']}
        intro="Mesma UI de entrada do garçom (login com CPF + senha) — quando o backend devolve role:'manager', o app troca pra esse painel. Bottom nav · 5 abas: Painel · Operação · Equipe · Financeiro · Eu. Refatoração 2026-05: 'Salão' e 'Gargalos' foram fundidos em 'Operação' (sub-tabs Alertas · Mapa · Funil + barra 'Agir agora' fixa com 2 ferramentas-chave: Cozinha · Pausa). Cortesia saiu da barra de ferramentas — vira ação contextual via MoreSheet de alerta ou via sheet 'Contactar cliente'. 'Eu' virou 5ª aba normal — não é mais sub-tela acessada pelo nome no header. Cards de alerta na Operação têm 2 ações inline e a default secundária agora é 'Contactar cliente' (abre o sheet vaul-style com sugestões da AI). Pausa de garçom + Watcher de QR codes saíram do app (decisão de produto · ver prototypes/seguranca-qr/ pra futura repactuação). KPIs frios moram no Financeiro · Painel é operação ativa.\n\nV4 (2026-05) — PADRÃO 'EM CURSO' + POST-MORTEM LEVE: Painel reorganizado em 6 blocos pra introduzir uma nova seção 'Em curso' onde vivem operações async aguardando resposta (pausa rodando, reorder cozinha aguardando aceite, mensagem ao cliente aguardando leitura, cortesia aguardando aceite). Cada operação vira um MInProgressCard persistente até resolver — tap abre tela cheia preservando estado, ações rápidas inline (+5 min · Despausar · Cancelar · Reenviar) sem entrar. Quando uma operação resolve, o card vira 'resolved-summary' por 30s antes de sumir, com KPIs antes/depois compactos. Tap leva pro MOpSummary fullscreen (template reusável) — hoje implementado pra pausa em ScreenManagerOrdersPauseSummary com timeline real, KPIs e sugestão IA de próximo passo. Cortesia também saiu da barra de Ferramentas rápidas do Painel (era 3 cards · agora 2: Cozinha · Pausa) — Cortesia migra pro menu da mesa no Prompt 5."
        screens={[
          'Painel (1ª aba) ★ V4 · 6 blocos · Em curso ★',
          'Operação · 3 sub-tabs (Alertas/Mapa/Funil) (2ª aba)',
          'Equipe (3ª aba) ★ V9 · variante A canônica ★',
          'KPI detail screens · 7 KPIs (Equipe + Operação) ★ V9 ★',
          'Form cadastrar/editar funcionário (sub · vem de Equipe)',
          'Editor de turnos (sub · vem de Equipe) ★ V8 ★',
          'Financeiro (4ª aba)',
          'Eu (5ª aba)',
          'Desempenho individual (sub · vem de Equipe)',
          'Timeline da mesa lenta (sub · vem de Operação · Mapa)',
          'Ferramenta · Alterar ordem da cozinha',
          'Ferramenta · Cortesia para a mesa (contextual · não atalho)',
          'Ferramenta · Pausar pedidos (modo silencioso)',
          'Resumo pós-pausa · post-mortem leve ★ V4 ★',
          'Sheet · Contactar cliente (sobre Operação · 4 estados)',
          'Sheet · Mensagem direta pra staff (★ V9 ★)',
          'Alertas · lista completa (sub · vem de Operação)',
        ]}
      />

      {/* ===== PAINEL DO GERENTE (1ª ABA · V4) ===== */}
      <DCSection
        id="mgr-home"
        title="Gerente · Painel (1ª aba · tela inicial após login) ★ V4 ★"
        subtitle={`Primeira tela do gerente — orientada a comando, não a relatório. V4 (2026-05) reorganiza em 6 blocos pra introduzir o padrão "Em curso":\n\n(1) HERO · saudação 'Boa noite, Renata Albuquerque' + AO VIVO · TURNO DA NOITE · 19:42 + sino com badge.\n\n(2) FERRAMENTAS RÁPIDAS · 2 CARDS (era 3) · Cozinha · Pausa. Mesmo formato da MQuickActionsBar usada na Operação V3 (~56px stacked, sub mantida). Cortesia saiu do Painel (vai pro menu da mesa no Prompt 5). Quando há pausa ativa, o card Pausa ganha indicador discreto: bolinha mostarda pulsando no canto sup direito + sub muda de "Pedidos novos" pra "04:23 restantes" em mono.\n\n(3) EM CURSO ★ NOVO ★ · operações async aguardando resposta (pausa rodando, reorder cozinha aguardando aceite, contactar cliente aguardando leitura, cortesia aguardando aceite). Card persistente com border-left tematica (mostarda = pausa-active · azul = waiting · verde = resolved). Tap no corpo abre tela cheia preservando estado. Ações rápidas inline (+5 min · Despausar · Cancelar · Reenviar · etc) sem entrar. Seção INTEIRA OCULTA quando 0 operações.\n\n(4) HOJE NO TURNO · alertas compactos (3 mostrados, era 5+) no mesmo formato da Operação V3 (~108px com 2 ações inline + X dispense). 'Ver todos →' pra lista completa.\n\n(5) EQUIPE EM TURNO · top 4 + warning de sobrecarga · 'Ver mais →' pra aba Equipe.\n\n(6) PRÓXIMAS RESERVAS · 3 cards horizontais com horário grande, party, mesa, tag tinted (aniversário, varanda). 'Agenda completa →' pra reservas.\n\nKPIs frios (receita, ticket) moram no Financeiro — Painel é operação ativa.`}
      >
        <DCArtboard
          id="mgr-home-empty-ios"
          label="Painel · 0 operações em curso (seção oculta) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerHomeA dark={dark} inProgress={[]} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-home-1op-ios"
          label="Painel · 1 operação · pausa ativa · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerHomeA dark={dark} inProgress={[M_INPROGRESS.pauseActive]} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-home-3op-ios"
          label="Painel · 3 operações · pausa + reorder + contact-client · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerHomeA
              dark={dark}
              inProgress={[
                M_INPROGRESS.pauseActive,
                M_INPROGRESS.reorderWaiting,
                M_INPROGRESS.contactWaiting,
              ]}
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-home-summary-ios"
          label="Painel · pausa terminou · resumo pós-pausa apareceu · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerHomeA dark={dark} inProgress={[M_INPROGRESS.pauseSummary]} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-home-3op-and"
          label="Painel · 3 operações · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerHomeA
              dark={dark}
              inProgress={[
                M_INPROGRESS.pauseActive,
                M_INPROGRESS.reorderWaiting,
                M_INPROGRESS.contactWaiting,
              ]}
            />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== EQUIPE (3ª ABA · ★ V9 · 2026-05 · variante A canônica · únicas ★) ===== */}
      <DCSection
        id="mgr-staff"
        title="Gerente · Equipe (3ª aba · ★ V9 · variante A canônica ★)"
        subtitle={`Tela top-level que funde 3 telas que existiam separadas (StaffList simples · ShiftBoard com KPIs/sugestão IA/ações inline · ShiftSchedule com timeline 12-24h).\n\n★ V7 — texto enxugado no topo + sinalização de saúde no CARGA MÉDIA ★\n• 3 KPIs viraram COMPACT (~88-96px de altura) com '?' tooltip · descrição longa saiu do tile.\n• CARGA MÉDIA agora tem semântica clara — sub mono caps colorido (FOLGADO verde · DENTRO DA META cinza · ACIMA DA META · REALOCAR brick). Valor muda de cor (brick) quando acima da meta. Gerente sem fundo técnico bate o olho e entende.\n\n★ V9 (2026-05) — variante A vencedora · B/C apagadas ★\nDecisão de produto: 3 KPIs compact + saúde no CARGA MÉDIA é o caminho. As variantes B (pílula única) e C (sentença conversacional) saíram do componente e do canvas. Prop \`variant\` removida de \`ScreenManagerStaff\`.\n\nESTRUTURA · 8 blocos:\n(1) HERO · saudação + AO VIVO.\n(2) 3 KPIs COMPACT com tooltips e saúde do CARGA MÉDIA. \`?\` é tap-target real (V8 · abre StatDetail).\n(3) BANNER de sugestão IA · "Caleb está com 7 mesas..." + CTA "Aplicar sugestão" filled ink. Personalidade preservada — ouro da tela.\n(4) BUSCA + 2 ROWS de chips.\n(5) LISTA UNIFICADA · cards com avatar + status pill + métricas inline + ações pills contextuais.\n(6) TURNOS DE HOJE · 3 linhas compactas com expand inline.\n(7) PRÓXIMOS EVENTOS · 3 linhas time-pill mono.\n(8) CTA fixa "+ Adicionar funcionário".`}
      >
        <DCArtboard
          id="mgr-staff-default-ios"
          label="Default · banner IA visível · KPIs compact · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaff dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-staff-no-banner-ios"
          label="Banner IA oculto · estado mais comum · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaff dark={dark} bannerHidden />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-staff-shift-expanded-ios"
          label="Turno NOITE expandido inline · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaff dark={dark} bannerHidden expandedShift="noite" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-staff-empty-search-ios"
          label="Empty state da busca · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaff dark={dark} bannerHidden searchEmptyState />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-staff-default-and"
          label="Default · paridade Android (variante A)"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerStaff dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-staff-new-ios" label="Cadastrar · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaffForm dark={dark} mode="create" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-staff-new-and" label="Cadastrar · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerStaffForm dark={dark} mode="create" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-staff-edit-ios" label="Editar · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaffForm dark={dark} mode="edit" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== EDITAR TURNOS · tela funcional (★ V8 · 2026-05 ★) ===== */}
      <DCSection
        id="mgr-shift-editor"
        title="Gerente · Editar turnos (★ V8 · substitui placeholder ★)"
        subtitle={`Tela funcional acessada por "Editar turnos →" da seção "Turnos de hoje" da Equipe. Substitui o placeholder V6/V7.\n\nESTRUTURA:\n• Topbar back + título + CTA "+ Novo turno" pill outline mini no canto direito.\n• 3 cards expandíveis (Manhã · Tarde · Noite) — turno NOITE (atual) abre por default.\n• Header colapsado · eyebrow mono caps "MANHÃ · 06H–12H" + sub "4 funcionários · 2 garçons · 1 cozinha · 1 caixa".\n• Header expandido · lista de membros (avatar + nome + função em mono caps tiny + 3-pontinhos).\n• 3-pontinhos abre MoreSheet · 3 ações: "Mover para outro turno" · "Autorizar hora extra" · "Remover do turno" (destrutiva).\n• Linha final do card · "+ Adicionar funcionário a este turno" link mute.\n• Footer fixo · "Duplicar pra próxima semana" outline + "Salvar alterações" filled (só visível quando há mudanças pendentes).\n• Auto-save indicator · banner mostarda discreto no topo quando dirty=true.\n\nCOMPORTAMENTO:\n• Mudanças incrementais auto-salvam em background. Botão "Salvar" é commit explícito.\n• Ações destrutivas (Remover) precisam de confirmação modal.\n• Mover funcionário entre turnos atualiza imediatamente os 2 turnos afetados.\n• Histórico vai pra session_audit_logs como entries shift_changed.\n\n4 MODAIS (frames específicos):\n  • move      · bottom-sheet com radios dos outros 2 turnos\n  • overtime  · bottom-sheet com chips 30 min / 1 h / 2 h / personalizado\n  • remove    · confirm destrutivo vermelho\n  • add       · bottom-sheet com lista de funcionários disponíveis (também aciona "+ Novo turno")`}
      >
        <DCArtboard
          id="mgr-shift-editor-default-ios"
          label="Default · NOITE expandido · MANHÃ e TARDE colapsados · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerShiftEditor dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-shift-editor-all-ios"
          label="Todos os 3 turnos expandidos · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerShiftEditor dark={dark} defaultExpanded="all" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-shift-editor-more-ios"
          label="MoreSheet do funcionário · 3 ações · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerShiftEditor dark={dark} modal="more" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-shift-editor-modal-move-ios"
          label="Modal · Mover para outro turno · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerShiftEditor dark={dark} modal="move" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-shift-editor-modal-overtime-ios"
          label="Modal · Autorizar hora extra · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerShiftEditor dark={dark} modal="overtime" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-shift-editor-empty-ios"
          label="Empty state · turno NOITE sem funcionários · auto-save indicator visível · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerShiftEditor dark={dark} emptyShift="noite" hasChanges />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-shift-editor-default-and"
          label="Default · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerShiftEditor dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== KPI DETAIL SCREENS · 7 KPIs (Equipe + Operação) ★ V8+V9 · 2026-05 ★ ===== */}
      <DCSection
        id="mgr-stat-detail"
        title="Gerente · KPI detail screens (★ V8+V9 · 7 variantes · Equipe + Operação ★)"
        subtitle={
          `★ V9 — extends de 3 → 7 variantes ★\nOs ` +
          '`?`' +
          ` dos KPIs da Equipe (3 · V8) E da Operação (4 · V9 · Alertas tab + Mapa tab) viraram tap-targets reais. Tap curto abre tela de detalhe granular + ações pra agir direto. Long-press / hover continua mostrando o tooltip via title=.\n\nTEMPLATE comum (ScreenManagerStatDetail):\n• Topbar back · preserva sub-tab origem (Equipe vs Operação).\n• HERO · valor grande (Inter 36/800), sub colorido com semântica de saúde, 1 linha de contexto, eyebrow mono caps com timestamp.\n• BLOCO "Quem/Onde/O que" · varia por KPI.\n• BLOCO "O que fazer agora" · ações contextuais (pills filled/outline · ícone + label).\n• BLOCO "Como esse número é calculado" · fórmula curta num card surface.\n\n7 VARIANTES (prop kpiKind):\n  EQUIPE (★ V8 ★)\n  • em-campo     · "Quem está em turno" — lista quem deveria estar mas não está. Ações: Avisar · Folga retroativa · Substituir.\n  • sobrecarga   · "Quem está sobrecarregado" — lista expandable + banner IA. Ações: Aplicar sugestão · Realocar · Mensagem direta (abre MContactStaffSheet) · ★ V9 ★ "Pausar mesas do Caleb por 5 min" (copy reescrito · texto sem jargão de "praça") com sub explicando "Só as mesas que ele atende".\n  • carga-media  · "Quanto cada garçom atende" — distribuição + histórico mono. Ações condicionais (above-target only).\n\n  OPERAÇÃO (★ V9 ★)\n  • criticos     · 2 alertas críticos · cada card com 2 ações inline · macro "Resolver todos em sequência" (filled brick) + push genérico.\n  • atencao      · 2 alertas a 80% da meta · ações leves (Adiantar todos). Estado vazio "ATÉ AGORA NADA EM ATENÇÃO" se 0.\n  • mesas-ativas · 13/16 mesas agrupadas por seção do salão (Salão · Varanda) · tap → Menu da Mesa · "Ver no Mapa →".\n  • em-alerta    · 4 mesas (2 críticas brick · 2 lentas mostarda) · tap → Menu da Mesa · ações Realocar críticas + Mensagem direta multi-target.`
        }
      >
        {/* ─── EQUIPE · V8 ─── */}
        <DCArtboard
          id="mgr-stat-em-campo-ios"
          label="EQUIPE · EM CAMPO · 5/6 com 1 ausente · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="em-campo" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-sobrecarga-ios"
          label="EQUIPE · SOBRECARGA · 1 sobrecarregado · ★ V9 copy nova `Pausar mesas do Caleb` ★ · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="sobrecarga" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-sobrecarga-pause-confirm-ios"
          label="EQUIPE · SOBRECARGA · ★ V9 ★ modal vaul · confirmação Pausar mesas do Caleb · chip-row 5/10/15/30 · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="sobrecarga" pauseConfirm />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-carga-within-ios"
          label="EQUIPE · CARGA MÉDIA · dentro da meta · bloco 'o que fazer' OCULTO · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="carga-media" state="within-target" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-carga-above-ios"
          label="EQUIPE · CARGA MÉDIA · acima da meta · 3 ações VISÍVEIS · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="carga-media" state="above-target" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-sobrecarga-and"
          label="EQUIPE · SOBRECARGA · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="sobrecarga" />
          </FrameSlot>
        </DCArtboard>

        {/* ─── OPERAÇÃO · ★ V9 · NOVO ★ ─── */}
        <DCArtboard
          id="mgr-stat-criticos-ios"
          label="★ V9 ★ OPERAÇÃO · CRÍTICOS · 2 alertas pra resolver agora · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="criticos" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-atencao-ios"
          label="★ V9 ★ OPERAÇÃO · ATENÇÃO · 2 alertas próx 10 min · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="atencao" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-atencao-empty-ios"
          label="★ V9 ★ OPERAÇÃO · ATENÇÃO · estado vazio · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="atencao" state="empty" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-mesas-ativas-ios"
          label="★ V9 ★ OPERAÇÃO · MESAS ATIVAS · 13/16 agrupadas por seção · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="mesas-ativas" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-em-alerta-ios"
          label="★ V9 ★ OPERAÇÃO · EM ALERTA · 4 mesas (2 críticas + 2 lentas) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="em-alerta" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-stat-em-alerta-and"
          label="★ V9 ★ OPERAÇÃO · EM ALERTA · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerStatDetail dark={dark} kpiKind="em-alerta" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== DASHBOARD INDIVIDUAL (sub · vem de Equipe) ===== */}
      <DCSection
        id="mgr-perf"
        title="Gerente · Desempenho individual (sub-tela)"
        subtitle="Performance de 1 funcionário · aberta tocando uma linha em Equipe ou no card 'Equipe em turno' do Painel. Hero com avatar 56px + nome + role + flag tinted da situação atual ('Em chamado · mesa 14') + estrelas + nº avaliações. Janela de tempo (hoje/7d/30d). 4 KPIs com HELP TEXT (vendas no turno, mesas atendidas, tempo de resposta, chamados escalados — com texto explicando 'vezes que outro garçom precisou cobrir por ela'). Gráfico de 7 dias. Comparativo com média da equipe (cores verde/vermelho). Bottom nav: aba Equipe ativa."
      >
        <DCArtboard id="mgr-perf-ios" label="Dashboard · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaffDetail dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-perf-and" label="Dashboard · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerStaffDetail dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== OPERAÇÃO (2ª ABA · funde Salão + Gargalos) ===== */}
      <DCSection
        id="mgr-ops"
        title="Gerente · Operação (2ª aba · funde Salão + Gargalos)"
        subtitle={`Tela top-level — segue a linguagem do Painel: header 'Boa noite, Renata Albuquerque' + AO VIVO. 3 sub-tabs numa tela só: (1) ALERTAS · default — eventos detectados em tempo real, cada um com 2 AÇÕES INLINE (resolver / avisar) + X dispense no canto; KPIs no topo (Críticos · Atenção) com help-as-tooltip; (2) MAPA — grid 4×N de TODAS as mesas com waiter responsável + tempo aberto + valor consumido, cores em texto plano (verde OK / amarelo lenta / vermelho crítica), toque numa mesa abre o menu da mesa (★ V5 ★ — não mais Timeline direto · Timeline virou uma das ações dentro do menu); (3) FUNIL — tempo médio em cada etapa do pedido (lançado → confirmado → preparo → pronto → entregue), barras vermelhas onde excede meta, sugestão 'O que fazer agora' em 3 passos no rodapé. Barra 'AGIR AGORA' fixa entre o conteúdo e a bottom nav: 2 cards-botão (Cozinha · Pausa) compactados pra ~56px — gerente sempre tem as ferramentas a um toque sem voltar pro Painel.\n\nLimpeza V5 (2026-05): comparativos de densidade ANTES (V2) / DEPOIS (V3) / VARIAÇÃO inline removidos junto com o componente OpsAlertsV2Ref. Painel V4 + MQuickActionsBar V3-bis consolidaram essas decisões — os comparativos viraram ruído. Os frames remanescentes (Alertas, Mapa, Funil) são a versão canônica.`}
      >
        {/* ─── Alertas · canônica (V3-bis) ─── */}
        <DCArtboard id="mgr-ops-alerts-ios" label="Alertas · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerOps dark={dark} tab="alerts" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-ops-alerts-and" label="Alertas · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerOps dark={dark} tab="alerts" />
          </FrameSlot>
        </DCArtboard>

        {/* ─── Mapa · V3-bis · KPIs compact (help vira tooltip ?) ─── */}
        <DCArtboard
          id="mgr-ops-map-ios"
          label="Mapa · iOS · toque abre menu da mesa (V5)"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerOps dark={dark} tab="map" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-ops-map-and" label="Mapa · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerOps dark={dark} tab="map" />
          </FrameSlot>
        </DCArtboard>

        {/* ─── Funil ─── */}
        <DCArtboard id="mgr-ops-funnel-ios" label="Funil · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerOps dark={dark} tab="funnel" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-ops-funnel-and" label="Funil · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerOps dark={dark} tab="funnel" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== MENU DA MESA · role-aware (★ V5 ★) ===== */}
      <DCSection
        id="mgr-table-menu"
        title="Gerente · Menu da mesa (★ V5 · entrada principal pra qualquer mesa específica ★)"
        subtitle={`Tela cheia que abre quando o gerente toca em qualquer mesa específica — substitui o tap default pra Timeline. Entradas: (1) Operação · Mapa · tap em qualquer mesa da grid; (2) Equipe · "Ver mesas" do card do garçom · tap numa mesa; (3) Painel · alerta que referencia mesa · tap em "Mesa N".\n\nSEÇÃO 1 · ESTA MESA · 3 atributos editáveis num bloco off-white quente: (a) PESSOAS NA MESA — stepper +/- · "−" desabilita em 1 · "+" sempre habilitado mesmo excedendo capacidade. Caso de uso real: mesa de 4 lugares vira mesa de 6 quando juntam cadeiras. Excedeu → modal vaul "Mais pessoas que a capacidade da mesa" com confirmação. Após confirmar, sub muda pra "MESA COMPORTA 4 · +1 EXCEDENTE" em mostarda. (b) OBSERVAÇÃO — texto livre persistido na sessão (não migra entre sessões). Tap no lápis abre modal vaul com textarea. (c) CLIENTE — nome / telefone. Mesma vaul, input single-line. Não vira contato no DB salvo confirmação explícita do cliente.\n\nSEÇÃO 2 · AÇÕES · 6 linhas clicáveis: Mandar cortesia (entrada principal pra Compose · vai com mesa pré-preenchida) · Contactar cliente (abre MContactClientSheet com contexto) · Ver timeline da mesa (a Timeline antes era a tela default · agora é uma das ações daqui) · Imprimir conta · Transferir mesa (reusa ScreenHostTableSwap em variante manager) · Fechar mesa (destrutiva · só com conta paga · vermelho). MoreSheet do 3-pontinhos cobre ações secundárias: reportar problema, marcar VIP, ver auditoria.\n\nVariante HOST (recepcionista) tem subset focado em ESTADO DA MESA: Trocar mesa · Avisar gerente · Cancelar liberação. Linha 1 (party size) continua editável pelo host — caso comum: família chegou em 5 mas a reserva era pra 4.`}
      >
        <DCArtboard
          id="mgr-tablemenu-ios"
          label="Default · 4/4 pessoas · obs + cliente preenchidos · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tablemenu-exceeded-ios"
          label="5 pessoas · +1 EXCEDENTE em mostarda · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" state="exceeded" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tablemenu-modal-capacity-ios"
          label="Modal · Mais pessoas que a capacidade · vaul · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" partyOverride={5} modal="capacity" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tablemenu-modal-obs-ios"
          label="Modal · Editar observação · vaul textarea · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" modal="observation" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tablemenu-modal-client-ios"
          label="Modal · Editar cliente · vaul input · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" modal="client" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tablemenu-more-ios"
          label="MoreSheet · ações secundárias (3 pontinhos) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" modal="more" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tablemenu-close-ios"
          label="Modal · Fechar mesa (destrutiva) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" modal="closeConfirm" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tablemenu-and"
          label="Default · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== TIMELINE DA MESA LENTA (★ agora sub do TableMenu ★) ===== */}
      <DCSection
        id="mgr-table-timeline"
        title="Gerente · Timeline da mesa lenta (sub-tela · ação do menu da mesa)"
        subtitle={`Aberta a partir do Menu da Mesa · ação "Ver timeline da mesa" (★ V5 · antes era tela default ao tocar uma mesa lenta · agora é uma das ações dentro do menu ★). Mostra: HERO vermelho com tempo parado (28′ Crítica) + ações sugeridas em 3 passos diretos (Verifique cozinha · Avise garçom · Fale com cliente) + timeline real das etapas do pedido (timestamps de order_status_history) com dot colorido por status (verde feito · âmbar lento · vermelho aberto · pontilhado pendente) + chamados de garçom abertos vs resolvidos. Bottom nav: aba Operação ativa.`}
      >
        <DCArtboard
          id="mgr-tabletime-ios"
          label="Timeline da mesa · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableTimeline dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-tabletime-and"
          label="Timeline da mesa · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerTableTimeline dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== FINANCEIRO (4ª ABA) ===== */}
      <DCSection
        id="mgr-finance"
        title="Gerente · Financeiro (4ª aba)"
        subtitle="Tela top-level — segue a linguagem do Painel: header 'Boa noite, Renata Albuquerque' + AO VIVO. Hero com receita bruta R$ 8.420 + tendência (↑ +12% vs ontem). Mini-chart por hora (preto sólido, sem cores extras). 4 KPIs com HELP TEXT em linguagem comum (gerente não-técnico): Mesas fechadas · Ticket médio · Pago pelo app · Gorjeta — cada um com 1 linha explicativa. Top 3 CATEGORIAS com barras (não top 5 itens — leitura mais rápida pelo % do total). Métodos de pagamento com 2 barras grossas visuais (App 68% verde / Maquininha 32% preto). Ranking 3 melhores garçons do dia com medalha 🥇🥈🥉 + barra colorida + ticket médio. SEM botão de exportar (decisão: gerente exporta no admin web)."
      >
        <DCArtboard id="mgr-fin-ios" label="Financeiro · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerFinance dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="mgr-fin-and" label="Financeiro · Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerFinance dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== EU (5ª ABA · refatoração 2026-05) ===== */}
      <DCSection
        id="mgr-settings"
        title="Gerente · Eu (5ª aba · perfil + turno + conta + estabelecimento + sair)"
        subtitle="REFATORAÇÃO 2026-05: 'Eu' virou ABA NORMAL na bottom nav (era sub-tela acessada pelo nome no header). Dividida em 6 blocos: (1) HERO com avatar 76px + nome + role+turno + bolinha verde 'em turno desde 17:02'; (2) KPI rápido 'Vendas no SEU turno · R$ 12.847' (só o turno do gerente, não dia inteiro) — com help explicando que o Financeiro mostra o dia; (3) OPERAÇÃO — 'Encerrar turno' (CTA dourada · ação destrutiva) · Histórico de turnos · Equipe e escala · Cortesias ★ V5 ★ (histórico + criar manualmente); (4) CONTA — Notificações · Segurança e senha · Aparência (light/dark/auto); (5) ESTABELECIMENTO (só donos) — Configuração de mesas · Horários · Cardápio · Plano e cobrança; (6) SAIR (vermelho · destrutivo) com versão do app no rodapé. A tela owner mostra o grupo Estabelecimento, a tela manager esconde."
      >
        <DCArtboard id="mgr-settings-mgr-ios" label="Eu (gerente) · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerSettings dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-settings-mgr-and"
          label="Eu (gerente) · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerSettings dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-settings-owner-ios"
          label="Eu (dona · com Estabelecimento) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerSettings dark={dark} role="owner" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== CORTESIAS · histórico + criar manualmente (★ V7 ★ texto Nova enxugado) ===== */}
      <DCSection
        id="mgr-courtesies"
        title="Gerente · Cortesias (★ V7 · Nova enxugada ★)"
        subtitle={`Acessada por Eu > OPERAÇÃO > "Cortesias". Tab segmentada: HISTÓRICO (default) — lista cronológica das cortesias enviadas (mesa · tipo · status pill · gerente · timestamp · tempo de resposta). 3 mini-tiles no topo: Hoje · Aceitas · Pendentes.\n\nNOVA CORTESIA — ★ V7 · texto enxugado ★ · só title 'Nova cortesia' + sub 'Escolha uma mesa e mande um mimo.' + CTA 'Abrir compositor' fixa no rodapé. Removidos: eyebrow 'NOVA CORTESIA · COLD PATH' (jargão de design) · hero verde defensivo · bloco 'COMO ACHAR MAIS RÁPIDO' (3 caminhos numa página onde o gerente já fez a escolha · só atrapalhava). A aba Histórico continua sendo a tela importante; Nova é só um trampolim pro compositor.`}
      >
        <DCArtboard
          id="mgr-courtesies-history-ios"
          label="Histórico · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerCourtesies dark={dark} tab="history" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-courtesies-history-and"
          label="Histórico · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerCourtesies dark={dark} tab="history" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-courtesies-new-ios"
          label="Nova cortesia · ★ V7 enxugada ★ · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerCourtesies dark={dark} tab="new" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== ALTERAR ORDEM DE PREPARO (substitui "Ligar p/ cozinha") ===== */}
      <DCSection
        id="mgr-kitchen-reorder"
        title="Gerente · Ferramenta · Alterar ordem de preparo (gerente → cozinha)"
        subtitle={`Substitui o "Ligar p/ cozinha". Gerente abre essa tela de 4 entradas: (1) Painel · Ferramentas rápidas · "Alterar ordem da cozinha" — atalho principal; (2) tap numa mesa lenta no Bottlenecks; (3) Timeline da mesa; (4) Alertas. Seleciona quais pedidos da fila devem ser puxados pra frente, escreve um motivo opcional, e envia. A cozinha (no canvas separado tv-cozinha-bar.html) recebe a notificação com Aceitar / Recusar — se aceita, repriorize a fila e dispara push pros garçons das mesas afetadas. Se recusa, mostra motivo. Estados aqui: SELECT (escolhendo) → SENT (aguardando cozinha responder ~30s) → ACCEPTED (cozinha aceitou, mostra quem foi avisado).`}
      >
        <DCArtboard
          id="mgr-reorder-select-ios"
          label="1. Selecionar pedidos · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerKitchenReorder dark={dark} state="select" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-reorder-select-and"
          label="1. Selecionar pedidos · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerKitchenReorder dark={dark} state="select" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-reorder-sent-ios"
          label="2. Aguardando cozinha · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerKitchenReorder dark={dark} state="sent" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-reorder-accepted-ios"
          label="3. Cozinha aceitou · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerKitchenReorder dark={dark} state="accepted" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-reorder-push-waiter-ios"
          label="Push pro garçom afetado · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="kitchen-reorder-waiter" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-reorder-push-waiter-and"
          label="Push pro garçom afetado · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="kitchen-reorder-waiter" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-reorder-push-mgr-ios"
          label="Push de confirmação · gerente · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="kitchen-reorder-manager" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== COMPENSAR CLIENTE · cortesia da casa (atualizado V5) ===== */}
      <DCSection
        id="mgr-compensate"
        title="Gerente · Ferramenta · Cortesia (gerente → web do cliente)"
        subtitle={`Compõe (mesa + tipo: sobremesa/drink/couvert/desconto/mensagem + item + mensagem opcional) e envia. O cliente vê NA HORA, dentro do app web que ele já está usando (apps/web-customer · QR da mesa) — modal celebrativo. Quando aceita, dispara push pro garçom da praça com botão "Vou pegar" + cria order tipo 'courtesy', preço 0, prioridade alta na cozinha. Conector backend: WebSocket events 'courtesy.received' (manager → customer browser) e 'courtesy.accepted' (customer → manager + waiter).\n\n★ V5 ★ — Migração final da Cortesia. Entradas oficiais:\n  (1) ScreenManagerTableMenu · Seção Ações · "Mandar cortesia" — entrada PRINCIPAL · vai com prop preselectedTable, mostrando a mesa de origem com ring verde e badge "DO MENU";\n  (2) MContactClientSheet · chip "Quer uma cortesia pela espera?" — sub-menu;\n  (3) Eu > Cortesias > Nova cortesia — cold path · gerente escolhe a mesa do zero.\n\nNÃO mora mais em: Painel · Ferramentas rápidas (saiu V4) · MQuickActionsBar da Operação (saiu V3) · MoreSheet de cards de alerta (V4 · ação default agora é "Contactar cliente").\n\nA VISTA DO CLIENTE da cortesia mora em handoff/cliente/cliente-screens.jsx (CourtesyArrival + CourtesyConfirmed) — single source of truth.`}
      >
        {/* Manager-side · select state */}
        <DCArtboard
          id="mgr-compensate-prefilled-ios"
          label="★ V5 ★ Vinda do menu da mesa · mesa 14 com badge DO MENU · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerCompensateClient dark={dark} state="select" preselectedTable={14} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-compensate-select-ios"
          label="Cold path · gerente escolhe a mesa · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerCompensateClient dark={dark} state="select" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-compensate-select-and"
          label="Cold path · gerente escolhe a mesa · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerCompensateClient dark={dark} state="select" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-compensate-sent-ios"
          label="2. Aguardando cliente · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerCompensateClient dark={dark} state="sent" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-compensate-accepted-ios"
          label="3. Cliente aceitou · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerCompensateClient dark={dark} state="accepted" />
          </FrameSlot>
        </DCArtboard>
        {/* Vista do cliente: ver handoff/cliente/cliente-screens.jsx · CourtesyArrival/CourtesyConfirmed */}
        {/* Push notifications */}
        <DCArtboard
          id="mgr-compensate-push-waiter-ios"
          label="Push pro garçom da mesa · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="courtesy-waiter" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-compensate-push-waiter-and"
          label="Push pro garçom da mesa · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="courtesy-waiter" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-compensate-push-mgr-ios"
          label="Push de confirmação · gerente · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="courtesy-manager" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== PAUSAR PEDIDOS NOVOS · MODO SILENCIOSO ===== */}
      <DCSection
        id="mgr-orders-pause"
        title="Gerente · Ferramenta · Pausar pedidos novos (modo silencioso)"
        subtitle={`Aberta pelo Painel · Ferramentas rápidas · "Pausar pedidos novos". Cozinha sobrecarregou — gerente decide pausar a entrada de pedidos novos por alguns minutos. Crítico: o CLIENTE NÃO VÊ a pausa. Pra ele, o cardápio continua aberto, ele faz o pedido normalmente — o que muda é o ETA, que aumenta silenciosamente somando o tempo da pausa. Pedidos feitos durante a pausa ficam em fila e entram na cozinha quando ela acaba. Sistema retoma sozinho no fim do timer e dispara push pro gerente. Estados: CONFIRM (escolhendo duração 5/10/15/30 min) → ACTIVE (rodando com countdown grande, stats em tempo real, opção de despausar antes ou estender +5 min). Push de retomada automática completa o ciclo.`}
      >
        <DCArtboard
          id="mgr-pause-confirm-ios"
          label="1. Confirmar duração · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerOrdersPause dark={dark} state="confirm" duration={5} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-pause-confirm-and"
          label="1. Confirmar duração · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerOrdersPause dark={dark} state="confirm" duration={5} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-pause-active-ios"
          label="2. Pause ativo · countdown · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerOrdersPause dark={dark} state="active" duration={5} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-pause-active-and"
          label="2. Pause ativo · countdown · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerOrdersPause dark={dark} state="active" duration={5} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-pause-resumed-ios"
          label="3. Push de retomada automática · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="pause-auto-resumed" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-pause-resumed-and"
          label="3. Push de retomada automática · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="pause-auto-resumed" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== RESUMO PÓS-PAUSA · POST-MORTEM LEVE (V4) ===== */}
      <DCSection
        id="mgr-pause-summary"
        title="Gerente · Resumo pós-pausa ★ V4 ★"
        subtitle={`Padrão NOVO de "post-mortem leve". Quando uma pausa termina (auto via timer ou manual via "Despausar agora"), o software mostra O QUE MELHOROU — duração, KPIs antes/depois (fila/saída/pedidos que entraram), timeline real dos eventos durante a pausa, e sugestão de próximo passo se IA detectar saída ainda alta.\n\nAcesso: (1) tap em "Ver detalhes" no card resolved-summary da seção "Em curso" do Painel; (2) push de retomada automática (lock screen · "ver resumo").\n\nO componente subjacente é MOpSummary — TEMPLATE REUSÁVEL pra qualquer operação async com começo/fim. Hoje implementado pra pausa; mapeado pra reusar em rounds futuros: kitchen-reorder ("Cozinha aceitou em 23s · 2 pedidos puxados pra frente"), contact-client ("Cliente leu em 1m12s"), courtesy ("Cliente aceitou em 32s · garçom Olivia avisada"). Cada uma com seu próprio template de KPI/timeline.`}
      >
        <DCArtboard
          id="mgr-pause-summary-ios"
          label="Resumo da pausa · KPIs antes/depois + timeline · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerOrdersPauseSummary dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-pause-summary-and"
          label="Resumo da pausa · KPIs antes/depois + timeline · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerOrdersPauseSummary dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== CONTACTAR CLIENTE · sheet sobre Operação ===== */}
      <DCSection
        id="mgr-contact-client"
        title="Gerente · Sheet · Contactar cliente"
        subtitle={`Substitui a antiga ação "Cortesia mesa" como ação default dos cards de alerta da Operação. Bottom-sheet vaul-style sobreposto à Operação atual — sem mudança de rota, com drag handle, backdrop 32% preto e swipe-down dispense. Sugestões inteligentes vêm do AI service (POST /smart-suggestions, mesma guardrail de 3 camadas do /classify, com pool determinístico primeiro · LLM só em contexto atípico). 4º chip "Quer uma cortesia pela espera?" é a única entrada legítima de cortesia a partir desse fluxo — abre Compensate. Mensagem ao enviar persiste em assistant_messages com from_role='staff' + push WebSocket pro app do cliente, onde aparece como bubble com badge "RENATA · GERENTE" (sec 4.5 do brief).`}
      >
        <DCArtboard
          id="mgr-contact-idle-ios"
          label="A · Idle · sugestões · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <MContactClientSheet dark={dark} state="idle" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-contact-selected-ios"
          label="B · Chip selecionado · pré-envio · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <MContactClientSheet dark={dark} state="selected" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-contact-sent-ios"
          label="C · Enviado · aguardando leitura · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <MContactClientSheet dark={dark} state="sent" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-contact-idle-and"
          label="D · Idle · sugestões · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <MContactClientSheet dark={dark} state="idle" andro />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== SHEET · MENSAGEM DIRETA PRA STAFF (★ V9 · 2026-05 ★) ===== */}
      <DCSection
        id="mgr-contact-staff"
        title="Gerente · Sheet · Mensagem direta pra staff (★ V9 · 2026-05 ★)"
        subtitle={`Bottom-sheet vaul-style espelho do MContactClientSheet, mas pra MENSAGEM DIRETA gerente → outro funcionário. Triggers: SOBRECARGA detail · cards da Equipe · ScreenManagerStaffDetail.\n\n2 estados · idle (4 sugestões staff-context "Como tá indo?" / "Vou te mandar reforço · 5 min" / "Pause os pedidos novos das suas mesas por 5 min" link pro zone-pause / "Foca nas mesas X e Y" + textarea + CTA disabled) · sent (preview ManagerBubble + status pulse "Aguardando leitura..." mostarda que vira "Lido às 19:43" verde quando chega manager.message.read via WS).\n\nROUND-TRIP COMPLETO (★ V10 · agora dentro de uma thread, não mais isolado ★):\n  1. Gerente envia daqui · POST /staff/messages com to_role='staff' + to_staff_id\n  2. Backend insere em assistant_messages com thread_id determinístico (par de staff_ids) + dispara push pro device do garçom\n  3. Garçom recebe push manager-message (lockscreen iOS/Android · som discreto · silenciado durante zone-pause)\n  4. Item manager-message aparece na aba Chamados do garçom · ink em fundo branco · ícone chat balloon\n  5. ★ V10 · Tap (push OU item Chamados) abre ScreenStaffMessageThread direto (não mais ScreenStaffMessageDetail isolado · deprecated)\n  6. Read receipt POST /staff/messages/:id/read → manager.message.read via WS volta pro sent-state aqui · pill vira verde "Lido às 19:43"\n\nBackend: ver server-notes.md seção 5.7 + 5.7-bis · estende assistant_messages com to_role + to_staff_id + read_at + delivered_at + thread_id.`}
      >
        {/* Lado do gerente · sheet */}
        <DCArtboard
          id="mgr-contact-staff-idle-ios"
          label="Manager · idle · sugestões staff-context · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <MContactStaffSheet dark={dark} state="idle" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-contact-staff-sent-ios"
          label="Manager · sent · 'Aguardando leitura…' pulse · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <MContactStaffSheet dark={dark} state="sent" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="mgr-contact-staff-idle-and"
          label="Manager · idle · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <MContactStaffSheet dark={dark} state="idle" andro />
          </FrameSlot>
        </DCArtboard>

        {/* Lado do garçom · push */}
        <DCArtboard
          id="staff-msg-push-ios"
          label="Garçom · push lockscreen manager-message · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="manager-message-waiter" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-push-and"
          label="Garçom · push lockscreen manager-message · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="manager-message-waiter" />
          </FrameSlot>
        </DCArtboard>

        {/* Lado do garçom · aba Chamados com item manager-message */}
        <DCArtboard
          id="staff-msg-calls-tab-ios"
          label="Garçom · aba Chamados com item manager-message · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenWaiterCalls dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== MENSAGENS · CAIXA COMPLETA · 3 ROLES (★ V10 · 2026-05 ★) ===== */}
      <DCSection
        id="staff-messages"
        title="Mensagens · caixa completa entre funcionários (★ V10 · 2026-05 ★)"
        subtitle={`V9 fechou o round-trip de mensagem unitária (manager → waiter · push · Chamados · detail). V10 consolida: a mensagem isolada vira THREAD, e o garçom (e qualquer dos 3 roles) ganha uma Caixa de mensagens acessível pelo Eu — ActionRow "Mensagens" no bloco OPERAÇÃO de cada role.\n\nDuas telas novas, comportamento idêntico pros 3 roles, só muda o conteúdo:\n  • ScreenStaffMessages · lista de threads agrupada por interlocutor · busca expandível · 4 filtros chip (Todas · Não-lidas · Equipe · Arquivadas) · long-press abre MoreSheet · empty state quando zero threads.\n  • ScreenStaffMessageThread · chat completo com bubbles, eyebrow + role do emissor, agrupamento de sequências (avatar+eyebrow só na 1ª da run · timestamp só na última), date separators mono caps, sticky banner de zone-pause ativa só pro garçom quando aplica, composer textarea com contador 0/240 + botão circular ink filled, read receipts (bubble do usuário muda de ENVIADA → LIDA via WS event message.read · sem rebobinar > 24h por privacidade), MoreSheet (pesquisar/silenciar/arquivar/reportar).\n\nO ScreenStaffMessageDetail do V9 fica DEPRECATED — mensagens da gerente continuam chegando como push, mas o tap (push lockscreen OU item Chamados) leva direto pra ScreenStaffMessageThread (deep-link via senderId).\n\nVariante chip-action: quando o gerente escolhe o chip "Pause os pedidos novos das suas mesas por 5 min" do MContactStaffSheet, o backend gera uma bubble especial dentro da thread com card ZONE-PAUSE (mostarda · CTA "Ver pausa →" pra abrir ScreenManagerOrdersPause em modo zone). Essa é a primeira instância de "ato de operação dentro do chat" — vamos reusar pra Prompt 8 (cascade QR ilegível · recepção dispara um shortcut pro garçom).\n\nBackend: ver server-notes.md seção 5.7-bis · novos campos thread_id (uuid · determinístico por par de staff_ids) + endpoints /staff/messages/threads + WS events message.received (estendido) · message.read (novo).`}
      >
        {/* ── LISTA · 5 frames ─────────────────────────────────── */}
        <DCArtboard
          id="staff-msg-list-waiter-ios"
          label="Lista · garçom · 3 threads · 1 não-lida · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessages dark={dark} role="waiter" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-list-mgr-ios"
          label="Lista · gerente · 5 threads · 3 não-lidas · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessages dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-list-search-ios"
          label="Lista · busca expandida · 1 resultado · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessages dark={dark} role="manager" state="search" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-list-empty-ios"
          label="Lista · empty state (zero threads) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessages dark={dark} role="host" state="empty" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-list-more-ios"
          label="Lista · long-press · MoreSheet (Arquivar · Não-lida · Bloquear) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessages dark={dark} role="manager" state="more" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-list-and"
          label="Lista · garçom · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenStaffMessages dark={dark} role="waiter" />
          </FrameSlot>
        </DCArtboard>

        {/* ── THREAD · 5 frames ─────────────────────────────────── */}
        <DCArtboard
          id="staff-msg-thread-pause-ios"
          label="Thread · 8 mensagens · 2 dias · sticky banner zone-pause ATIVA · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessageThread
              dark={dark}
              role="waiter"
              threadId="tw-renata"
              state="pause-active"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-thread-normal-ios"
          label="Thread · conversa normal sem zone-pause · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessageThread dark={dark} role="waiter" threadId="tw-renata" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-thread-chip-ios"
          label="Thread · chip de ação rápida acionado (pause shortcut · ver V9) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessageThread
              dark={dark}
              role="waiter"
              threadId="tw-renata"
              state="chip-action"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-thread-more-ios"
          label="Thread · MoreSheet (silenciar · arquivar · reportar) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenStaffMessageThread dark={dark} role="waiter" threadId="tw-renata" state="more" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="staff-msg-thread-and"
          label="Thread · paridade Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenStaffMessageThread dark={dark} role="waiter" threadId="tw-renata" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ╔══════════════════════════════════════════════════════════
           ║  ROLE 3 · RECEPCIONISTA (app nativo iOS + Android)
           ╚══════════════════════════════════════════════════════════ */}
      <RoleHeader
        id="role-host"
        color={ROLE_COLORS.host}
        icon="🚪"
        role={{
          kicker: 'Role · recepcionista · porta de entrada',
          title: 'App da recepcionista',
          platform: 'iOS + Android nativos',
        }}
        navLabels={['🪑 Mesas', '⏳ Espera', '📅 Reservas', '🔔 Avisos', '👤 Eu']}
        intro="Mesma UI de entrada do gerente (login com CPF + senha). Quando o backend devolve role:'host', o app troca pra esse painel. Recepcionista é a porta de entrada do restaurante — controla quais mesas estão liberadas pra clientes escanearem o QR. Bottom nav: Mesas (Pra liberar default + Mapa em chips de estado), Espera (lista de espera com nome/telefone/CPF + sugestão proativa quando próxima mesa cabe o grupo), Reservas (do dia + cadastro manual), Avisos (cascata de alertas — cliente sem liberação, fila grande, reserva chegando), Eu. Reservas chegam pelo bot do WhatsApp já completas (nome/telefone/CPF/data/hora obrigatórios + observação opcional) — recepcionista NÃO revisa draft, só vê a reserva pronta na lista. Liberar reserva é inteligente: lê tamanho do grupo + mesa pré-atribuída → mostra verde se cabe, vermelho se não cabe + 3 alternativas. Trocar família de mesa rastreia a transferência atômica no backend incluindo pedidos abertos e garçom responsável."
        screens={[
          'Home · Pra liberar (default)',
          'Home · Mapa (chips por estado e setor)',
          'Liberar mesa walkin · sucesso',
          'Liberar reserva · auto-assign (cabe / não cabe)',
          'Trocar família de mesa (3 estados)',
          'Lista de espera + Cadastrar',
          'Reservas do dia + Cadastro manual',
          'Eu · 5ª aba (★ V10 ★)',
        ]}
      />

      {/* ===== RECEPCIONISTA · APP ===== */}
      <DCSection
        id="host-app"
        title="Recepcionista · novo papel (role: 'host')"
        subtitle="Mesma UI de entrada do gerente (login com CPF + senha). Quando o backend devolve role:'host', o app troca para o painel da recepcionista. Bottom nav com 5 abas: Mesas · Espera · Reservas · Avisos · Eu. A home tem 2 visões: Pra liberar (foco em ação · default) mostra só as mesas livres agrupadas por capacidade com botão Liberar inline + alerta no topo se cliente sentou sem liberação · Mapa refeito para usuário não-técnico: cards 3-col grandes com status em texto plano (sem precisar decifrar legenda), filtro por estado em chips no topo (Atenção / Aguardando QR / Em uso / Livres) com contagem visível, filtro por setor em pills menores, e CTA vermelho 'TOQUE PRA RESOLVER' nos cards em alerta. QR fica ativo até a conta fechar (sem expiração)."
      >
        <DCArtboard
          id="host-home-liberar-ios"
          label="Pra liberar (default) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostHome dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-liberar-and"
          label="Pra liberar (default) · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostHome dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-mapa-ios"
          label="Mapa · todas as seções · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostHome dark={dark} view="mapa" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-mapa-and"
          label="Mapa · todas as seções · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostHome dark={dark} view="mapa" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-mapa-alerta"
          label="Mapa · filtro Atenção · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostHome dark={dark} view="mapa" state="alerta" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-mapa-aguard"
          label="Mapa · filtro Aguardando QR · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostHome dark={dark} view="mapa" state="liberada" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-mapa-livres"
          label="Mapa · filtro Livres · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostHome dark={dark} view="mapa" state="livre" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-mapa-salao"
          label="Mapa · só Salão · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostHome dark={dark} view="mapa" sector="Salão" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-home-mapa-varanda"
          label="Mapa · só Varanda · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostHome dark={dark} view="mapa" sector="Varanda" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-liberate-ios"
          label="Liberar mesa walkin · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostTableLiberate dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-liberate-and"
          label="Liberar mesa walkin · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostTableLiberate dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-success-ios"
          label="Sucesso · QR ativo · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostTableLiberada dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-success-and"
          label="Sucesso · QR ativo · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostTableLiberada dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== LIBERAR INTELIGENTE · DA RESERVA ===== */}
      <DCSection
        id="host-liberate-smart"
        title="Recepcionista · liberar reserva (auto-assign de mesa)"
        subtitle="Quando recepcionista toca 'Liberar mesa N' a partir de uma reserva (ou o cliente chega na porta com nome de reserva), o software já lê o tamanho do grupo e a mesa pré-atribuída. CASO 1 (cabe) — mostra a mesa em verde com 'Cabe os 6 convidados', CTA grande direto. CASO 2 (não cabe) — mostra mesa em vermelho com 'Não cabe os 6 convidados (cap 4)' e oferece 3 alternativas (livres com cap >= party, mesmo setor primeiro, capacidade mais próxima depois pra não desperdiçar mesa de 8 com grupo de 2). Recepcionista pode trocar manualmente caso a família peça outra mesa. Lógica de seleção é determinística — ver findFitTable() no README."
      >
        <DCArtboard
          id="host-liberate-fit-ios"
          label="Reserva · mesa cabe · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostTableLiberate
              dark={dark}
              mode="reservation"
              reservation={{
                name: 'Família Carvalho',
                party: 6,
                table: 9,
                when: '19:30',
                phone: '(11) 9 7700-1122',
                note: 'Comemoração · 80 anos do avô',
              }}
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-liberate-fit-and"
          label="Reserva · mesa cabe · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostTableLiberate
              dark={dark}
              mode="reservation"
              reservation={{
                name: 'Família Carvalho',
                party: 6,
                table: 9,
                when: '19:30',
                phone: '(11) 9 7700-1122',
                note: 'Comemoração · 80 anos do avô',
              }}
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-liberate-nofit-ios"
          label="Reserva · mesa NÃO cabe · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostTableLiberate
              dark={dark}
              mode="reservation-no-fit"
              reservation={{
                name: 'Família Tanaka',
                party: 5,
                table: 7,
                when: '21:00',
                phone: '(11) 9 8112-4577',
                note: '2 crianças · pediu cadeirinha',
              }}
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-liberate-nofit-and"
          label="Reserva · mesa NÃO cabe · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostTableLiberate
              dark={dark}
              mode="reservation-no-fit"
              reservation={{
                name: 'Família Tanaka',
                party: 5,
                table: 7,
                when: '21:00',
                phone: '(11) 9 8112-4577',
                note: '2 crianças · pediu cadeirinha',
              }}
            />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== MENU DA MESA · variante HOST (★ V5 ★) ===== */}
      <DCSection
        id="host-table-menu"
        title="Recepcionista · Menu da mesa (★ V5 · variante host ★)"
        subtitle={`Mesma tela do gerente (ScreenManagerTableMenu) mas com role='host' — abre quando a recepcionista toca em qualquer mesa ocupada/liberada/em alerta no Mapa de Mesas. Reusa hero + atributos editáveis (PESSOAS · OBSERVAÇÃO · CLIENTE) com a mesma lógica de stepper +/- e modal vaul de capacidade excedida — caso de uso comum da recepcionista: família chegou em 5 mas a reserva era pra 4.\n\nAções são SUBSET focado em ESTADO DA MESA (não financeiro nem operacional fino):\n  • Trocar pra outra mesa — reusa ScreenHostTableSwap, mesma tela do gerente\n  • Avisar gerente — pede ajuda com a mesa\n  • Cancelar liberação (mostarda) — volta a mesa pra livre · só se cliente não chegou\n\nA recepcionista NÃO vê: Mandar cortesia · Imprimir conta · Fechar mesa · Ver timeline · Transferir (só Trocar) — essas são do gerente/garçom. Linha 1 (party size) continua editável pelo host, com a mesma confirmação de capacidade excedida.`}
      >
        <DCArtboard
          id="host-tablemenu-ios"
          label="Menu da mesa · variante HOST · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="host" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-tablemenu-exceeded-ios"
          label="Host · 5 pessoas (excedeu) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="host" state="exceeded" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-tablemenu-and"
          label="Menu da mesa · variante HOST · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenManagerTableMenu dark={dark} role="host" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== TROCAR MESA · MOVER FAMÍLIA ===== */}
      <DCSection
        id="host-swap"
        title="Recepcionista · trocar família de mesa"
        subtitle="Caso de uso: cliente sentou na mesa 9 mas pediu pra trocar (não gostou da posição, quer varanda). Recepcionista abre da Timeline da mesa ocupada (ou via Menu da Mesa V5 · ação 'Trocar pra outra mesa'), sistema sugere mesas livres que cabem no party (mesmo setor primeiro pra manter o garçom). Confirmação mostra checklist explícito do que vai acontecer: pedidos abertos migram, QR continua ativo, garçom troca se mudou de zona. Sucesso mostra diagrama visual da troca (mesa A vazia → mesa B ocupada) + 3 efeitos colaterais explicados. Backend faz transferência atômica em transaction — ver POST /host/tables/:id/swap no README."
      >
        <DCArtboard
          id="host-swap-select-ios"
          label="1. Escolher destino · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostTableSwap
              dark={dark}
              state="select"
              fromTable={9}
              party={6}
              customerName="Família Carvalho"
              reason="Pediu mesa na varanda"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-swap-select-and"
          label="1. Escolher destino · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostTableSwap
              dark={dark}
              state="select"
              fromTable={9}
              party={6}
              customerName="Família Carvalho"
              reason="Pediu mesa na varanda"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-swap-confirm-ios"
          label="2. Confirmar troca · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostTableSwap
              dark={dark}
              state="confirm"
              fromTable={9}
              toTable={20}
              party={6}
              customerName="Família Carvalho"
              reason="Pediu mesa na varanda"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-swap-confirm-and"
          label="2. Confirmar troca · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostTableSwap
              dark={dark}
              state="confirm"
              fromTable={9}
              toTable={20}
              party={6}
              customerName="Família Carvalho"
              reason="Pediu mesa na varanda"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-swap-success-ios"
          label="3. Mesa movida · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostTableSwap
              dark={dark}
              state="success"
              fromTable={9}
              toTable={20}
              party={6}
              customerName="Família Carvalho"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-swap-success-and"
          label="3. Mesa movida · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostTableSwap
              dark={dark}
              state="success"
              fromTable={9}
              toTable={20}
              party={6}
              customerName="Família Carvalho"
            />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== RECEPCIONISTA · LISTA DE ESPERA ===== */}
      <DCSection
        id="host-waitlist"
        title="Recepcionista · lista de espera"
        subtitle="Aba 'Espera' da bottom nav. Captura nome + telefone (obrigatórios) + CPF (opcional, só pra fidelidade) + observação. Cabeçalho mostra contagem total e maior tempo de espera. Sugestão proativa em verde: 'Próxima mesa livre · 4 pessoas · Mesa 7'. Filtros por tamanho do grupo (1 / 2 / 3-4 / 5+). Cada linha tem ação 'Sentar agora' + ligar. Tempos coloridos: verde até 10 min · amarelo 10-20 · vermelho 20+."
      >
        <DCArtboard id="host-waitlist-ios" label="Lista de espera · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostWaitlist dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-waitlist-and"
          label="Lista de espera · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostWaitlist dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-waitlist-3-4"
          label="Filtro: grupos de 3-4 · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostWaitlist dark={dark} partyFilter="3-4" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-waitlist-add-ios"
          label="Adicionar à fila · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostWaitlistAdd dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-waitlist-add-and"
          label="Adicionar à fila · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostWaitlistAdd dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== RECEPCIONISTA · RESERVAS ===== */}
      <DCSection
        id="host-reservations"
        title="Recepcionista · reservas do dia"
        subtitle="Aba 'Reservas' da bottom nav. A maioria das reservas chega pelo bot do WhatsApp do restaurante (mesmo número público que aparece no site) — o bot conduz a conversa, extrai nome / pessoas / horário / observação e cria um draft que a recepcionista aprova com 1 toque. Quando a reserva vem por OUTRO canal (ligação direta, cliente presencial pedindo pra reservar pra outra data, WhatsApp pessoal da gerência), a recepcionista cadastra manualmente pelo botão + no canto superior — abre o form de Nova reserva, que respeita a mesma lógica de slots disponíveis do bot. Ela vê quem está esperada, quem já chegou, e marca a chegada — backend auto-libera o QR da mesa atribuída. Filtro: Todas / Esperadas / Chegaram."
      >
        <DCArtboard
          id="host-reservations-ios"
          label="Reservas · todas · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostReservations dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-reservations-and"
          label="Reservas · todas · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostReservations dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-reservations-arrived"
          label="Reservas · só chegaram · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostReservations dark={dark} statusFilter="arrived" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-reservations-awaited"
          label="Reservas · só esperadas · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostReservations dark={dark} statusFilter="awaited" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-reserve-add-today-ios"
          label="Cadastro manual · Hoje · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostReservationAdd
              dark={dark}
              day="today"
              partySize={4}
              selectedSlot="20:30"
              origin="phone"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-reserve-add-today-and"
          label="Cadastro manual · Hoje · Android"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostReservationAdd
              dark={dark}
              day="today"
              partySize={4}
              selectedSlot="20:30"
              origin="phone"
            />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-reserve-add-tomorrow-ios"
          label="Cadastro manual · Amanhã · grupo 6 · presencial · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostReservationAdd
              dark={dark}
              day="tomorrow"
              partySize={6}
              selectedSlot="20:00"
              origin="walkin"
            />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== RECEPCIONISTA · EU (★ V10 · 5ª aba ★) ===== */}
      <DCSection
        id="host-me"
        title="Recepcionista · Eu (★ V10 · 5ª aba do HBottomNav ★)"
        subtitle={`5ª aba "Eu" do HBottomNav · paridade visual com o Eu do gerente (ScreenManagerSettings) e o Profile do garçom. Conteúdo reduzido porque recepção tem poucas alavancas próprias: não encerra turno do salão, não vê financeiro, não cria cortesia.\n\nEstrutura · Hero (avatar + nome + cargo + indicador "em turno") · KPI rápido do turno (mesas liberadas · espera média · breakdown reservas/walkins) · OPERAÇÃO (Mensagens · ★ V10 · entrada nova ★ + Histórico de turnos) · CONTA (Notificações · Segurança · Aparência) · Sair.\n\nA entrada "Mensagens" é a porta pra ScreenStaffMessages — recepção entra aqui pra falar com gerente / garçom da praça. Sem badge porque a host não tem mensagem não-lida no estado padrão (vide STAFF_THREADS.host na mock data).`}
      >
        <DCArtboard id="host-me-ios" label="Eu · default · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostProfile dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="host-me-and" label="Eu · paridade Android" width={AB_W} height={AB_H}>
          <FrameSlot os="android" dark={dark}>
            <ScreenHostProfile dark={dark} />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ╔══════════════════════════════════════════════════════════
           ║  CROSS-CUTTING · telas que envolvem MAIS DE UM role
           ╚══════════════════════════════════════════════════════════ */}
      <RoleHeader
        id="role-cross"
        color={ROLE_COLORS.cross}
        icon="🔀"
        role={{
          kicker: 'Cross-role · telas que envolvem 2+ papéis',
          title: 'Cross-cutting · cascatas e menus',
          platform: 'compartilhado entre apps',
        }}
        intro="Telas que NÃO pertencem a um role único — elas atravessam vários papéis no mesmo fluxo. (1) CASCATA DE NOTIFICAÇÕES: cliente senta sem liberação → sistema avisa em ordem 3 papéis com 30s entre cada (recepcionista @ T+0 → gerente @ T+30 → garçom da praça @ T+60). Quem agir primeiro encerra a cascata. Inclui as 6 lock screens de push e a tela in-app que adapta o copy ao papel. (2) MENUS DOS 3 PONTINHOS: bottom sheet padronizado que aparece em telas de detalhe (Mesa, Chamado, Desempenho do garçom, Financeiro) — cada role tem 3 ações secundárias específicas do contexto."
        screens={[
          'Cascata · 6 lock screens (3 papéis × iOS+Android)',
          'Cascata · 3 versões do detalhe in-app (host/manager/waiter)',
          'Central de Avisos da recepcionista',
          '3 pontinhos · 4 menus contextuais',
        ]}
      />

      {/* ===== CASCATA DE NOTIFICAÇÕES ===== */}
      <DCSection
        id="cascade"
        title="Cascata de notificações · cliente sentou sem liberação"
        subtitle="Caso de fallback central: cliente entra, senta e escaneia o QR sem passar pela recepcionista. O sistema tenta avisar 3 papéis em ordem, com 30 s entre cada etapa. Quem agir primeiro encerra a cascata e os outros recebem um banner 'Resolvido por X'. T+0 s · recepcionista · T+30 s · gerente · T+60 s · garçom da praça."
      >
        <DCArtboard
          id="cascade-host-ios"
          label="T+0 s · Recepcionista · iOS lock"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="cascade-host" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="cascade-host-and"
          label="T+0 s · Recepcionista · Android lock"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="cascade-host" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="cascade-mgr-ios"
          label="T+30 s · Gerente · iOS lock"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="cascade-manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="cascade-mgr-and"
          label="T+30 s · Gerente · Android lock"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="cascade-manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="cascade-waiter-ios"
          label="T+60 s · Garçom · iOS lock"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <IOSLockscreen scenario="cascade-waiter" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="cascade-waiter-and"
          label="T+60 s · Garçom · Android lock"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <AndroidLockscreen scenario="cascade-waiter" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== RECEPCIONISTA · IN-APP (avisos + ação) ===== */}
      <DCSection
        id="host-inapp"
        title="Cascata · dentro do app (3 papéis)"
        subtitle="Quando a pessoa toca no push, abre essa tela de detalhe. O copy se adapta ao papel: recepcionista vê 'Cliente sentou sem liberação' · gerente vê 'Recepção não atendeu' · garçom vê 'Sua mesa está sem garçom'. A timeline mostra exatamente quem foi avisado e quando, pra ninguém duvidar do que aconteceu. Inclui também a Central de Avisos com a lista completa."
      >
        <DCArtboard
          id="host-inbox-ios"
          label="Recepção · Central de Avisos · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostInbox dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-inbox-and"
          label="Recepção · Central de Avisos · And."
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="android" dark={dark}>
            <ScreenHostInbox dark={dark} />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-alert-host-ios"
          label="Detalhe · Recepcionista · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostAlertDetail dark={dark} role="host" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-alert-mgr-ios"
          label="Detalhe · Gerente · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostAlertDetail dark={dark} role="manager" />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="host-alert-waiter-ios"
          label="Detalhe · Garçom · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenHostAlertDetail dark={dark} role="waiter" />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== MENUS DOS 3 PONTINHOS ===== */}
      <DCSection
        id="more-sheets"
        title="Menus dos 3 pontinhos · ações secundárias"
        subtitle="O que abre ao tocar no ícone ⋯ no canto superior direito de cada tela. Padrão bottom sheet (sobe de baixo, com backdrop escuro e botão Cancelar). Cada menu carrega só o que cabe naquele contexto — 3 ações."
      >
        <DCArtboard id="more-mesa-ios" label="Mesa 12 (garçom) · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenTableDetail dark={dark} showMenu />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="more-call-ios" label="Chamado (garçom) · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenCallDetail dark={dark} type="chamou-garcom" showMenu />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard
          id="more-staff-ios"
          label="Desempenho do garçom (gerente) · iOS"
          width={AB_W}
          height={AB_H}
        >
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerStaffDetail dark={dark} showMenu />
          </FrameSlot>
        </DCArtboard>
        <DCArtboard id="more-fin-ios" label="Financeiro (gerente) · iOS" width={AB_W} height={AB_H}>
          <FrameSlot os="ios" dark={dark}>
            <ScreenManagerFinance dark={dark} showMenu />
          </FrameSlot>
        </DCArtboard>
      </DCSection>

      {/* ===== TWEAKS PANEL ===== */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Tema do app">
          <TweakRadio
            value={tweaks.theme}
            onChange={(v) => tweaks.setTweak('theme', v)}
            options={[
              { value: 'claro', label: 'Claro' },
              { value: 'escuro', label: 'Escuro' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </DesignCanvas>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
