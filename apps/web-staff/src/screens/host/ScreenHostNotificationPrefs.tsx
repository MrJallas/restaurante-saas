'use client';

// Preferencias ainda nao possuem consumidor de runtime. A tela informa essa
// indisponibilidade sem oferecer toggles placebo.

import * as React from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostNotificationPrefsProps {
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
}

export const ScreenHostNotificationPrefs: React.FC<ScreenHostNotificationPrefsProps> = ({
  onBack,
  onTabChange,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      {/* TopBar · back + título */}
      <div
        style={{
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />
        <h1
          style={{
            flex: 1,
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: -0.2,
          }}
        >
          Notificações
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '20px 16px 24px' }}>
        <div
          role="status"
          style={{
            padding: 18,
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            fontSize: 13,
            color: C.ink,
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800 }}>
            {Icon.bell(20)}
            Preferências ainda indisponíveis
          </div>
          <p style={{ margin: '10px 0 0', color: C.mute, fontWeight: 500 }}>
            Este app ainda não controla push, som, vibração ou conteúdo na tela bloqueada. Esses
            comportamentos seguem as configurações do dispositivo; nada é alterado ou salvo aqui.
          </p>
        </div>
      </div>

      <HBottomNav active="me" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

export default ScreenHostNotificationPrefs;
