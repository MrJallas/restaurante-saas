'use client';

// ScreenHostAppearance — preferência de tema do app (claro · escuro · automático).
// Round 18 backlog cleanup: ActionRow "Aparência" em /host/profile virou
// link real pra cá. Estado persiste no dispositivo e aplica imediatamente
// nas telas da recepcionista.

import * as React from 'react';
import { useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { type StaffThemeMode, useStaffTheme } from '../../lib/theme';

interface ScreenHostAppearanceProps {
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
}

const OPTIONS: Array<{ id: StaffThemeMode; label: string; sub: string }> = [
  { id: 'light', label: 'Claro', sub: 'Tema claro o tempo todo' },
  { id: 'dark', label: 'Escuro', sub: 'Tema escuro o tempo todo' },
  { id: 'auto', label: 'Automático', sub: 'Acompanha o sistema (claro de dia · escuro de noite)' },
];

export const ScreenHostAppearance: React.FC<ScreenHostAppearanceProps> = ({ onBack, onTabChange }) => {
  const { mode, dark, setMode } = useStaffTheme();
  const C = useG(dark);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const choose = (next: StaffThemeMode) => {
    setMode(next);
    setSavedAt(Date.now());
  };

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
        <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
          Aparência
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '14px 16px 24px' }}>
        <div
          style={{
            fontSize: 12,
            color: C.mute,
            fontWeight: 500,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          Escolha como o app aparece pra você. A preferência fica salva no
          dispositivo.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OPTIONS.map((opt) => {
            const selected = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => choose(opt.id)}
                aria-pressed={selected}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '14px 14px',
                  borderRadius: 12,
                  border: `1.5px solid ${selected ? C.ink : C.borderSoft}`,
                  background: selected ? (dark ? '#24242A' : '#F4F0E8') : C.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: `2px solid ${selected ? C.ink : C.borderSoft}`,
                    background: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {selected && (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: C.ink,
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>
                    {opt.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {savedAt != null && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#E5F2EA',
              color: '#0F5A37',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            Preferência salva e aplicada neste dispositivo.
          </div>
        )}
      </div>

      <HBottomNav active="me" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

export default ScreenHostAppearance;
