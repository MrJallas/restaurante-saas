'use client';

// ScreenManagerProfile — tela "Eu" do gerente (rota /manager/configuracoes).
// Match visual com ScreenHostProfile (canvas garcom-screens-host) — avatar
// grande + turno + KPIs + ações. Acessível via aba "Eu" do MBottomNav.

import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MAppHeader,
  MBottomNav,
  MAvatar,
  MSection,
} from '../../components/manager';
import { GButton } from '../../components/manager';

export interface ScreenManagerProfileProps {
  dark?: boolean;
  managerName?: string;
  managerInitials?: string;
  managerColor?: string;
  shift?: string;
  callsResolvedToday?: number;
  complaintsHandledToday?: number;
}

export function ScreenManagerProfile({
  dark,
  managerName = 'Renata Albuquerque',
  managerInitials,
  managerColor = '#0B7A8B',
  shift = '17:00 — 23:00',
  callsResolvedToday = 0,
  complaintsHandledToday = 0,
}: ScreenManagerProfileProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const initials =
    managerInitials ??
    managerName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  const handleLogout = () => {
    try {
      window.sessionStorage.clear();
      window.localStorage.removeItem('staffId');
      window.localStorage.removeItem('staffRole');
    } catch {
      /* ignore */
    }
    router.push('/');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        <MAppHeader dark={dark} title="Eu" greetingName={managerName} bellBadge={0} />

        <div style={{ padding: '24px 16px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <MAvatar name={managerName} init={initials} color={managerColor} size={88} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: C.ink }}>
              {managerName}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              Gerente
            </div>
          </div>
        </div>

        <MSection dark={dark} title="Turno de hoje">
          <div style={{ padding: '0 16px' }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${C.borderSoft}`,
                background: C.bg,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{shift}</div>
              <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 4 }}>
                Em andamento agora
              </div>
            </div>
          </div>
        </MSection>

        <MSection dark={dark} title="Resumo de hoje">
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${C.borderSoft}`, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
                Chamados resolvidos
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
                {callsResolvedToday}
              </div>
            </div>
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${C.borderSoft}`, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
                Reclamações tratadas
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
                {complaintsHandledToday}
              </div>
            </div>
          </div>
        </MSection>

        <MSection dark={dark} title="Acessos">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ProfileLink dark={dark} icon={Icon.chat(18)} label="Mensagens da equipe" onClick={() => router.push('/manager/mensagens')} />
            <ProfileLink dark={dark} icon={Icon.bell(18)} label="Notificações" onClick={() => router.push('/manager/operacoes')} />
            <ProfileLink dark={dark} icon={Icon.user(18)} label="Equipe em turno" onClick={() => router.push('/manager/equipe')} />
          </div>
        </MSection>

        <div style={{ padding: '24px 16px 0' }}>
          <GButton kind="ghost" full dark={dark} onClick={handleLogout}>
            Sair
          </GButton>
        </div>
      </div>

      <MBottomNav active="me" dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}

function ProfileLink({
  icon,
  label,
  onClick,
  dark,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: '14px 14px',
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ color: C.ink, display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{label}</span>
      <span style={{ marginLeft: 'auto', color: C.faint }}>{Icon.arrow(16)}</span>
    </button>
  );
}

export default ScreenManagerProfile;
