'use client';

// ScreenHostNotificationPrefs — preferências de notificação do host.
// 3 grupos canon: PUSH · SOM · LOCK SCREEN. Cada toggle é local
// (localStorage) — backend chega no round 19 (POST /users/me/preferences).

import * as React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { useStaffTheme } from '../../lib/theme';

const STORAGE_PREFIX = 'host:notifPrefs:';

interface ToggleRow {
  id: string;
  label: string;
  sub: string;
  defaultOn: boolean;
}

interface Section {
  title: string;
  rows: ToggleRow[];
}

const SECTIONS: Section[] = [
  {
    title: 'Push',
    rows: [
      { id: 'push.mesa_liberada', label: 'Mesa liberada', sub: 'Um garçom liberou uma mesa', defaultOn: true },
      { id: 'push.espera_longa', label: 'Espera longa', sub: 'Cliente na lista de espera há mais de 30 min', defaultOn: true },
      { id: 'push.reserva_proxima', label: 'Reserva próxima', sub: '15 min antes da hora marcada', defaultOn: true },
      { id: 'push.chegada_tardia', label: 'Chegada tardia', sub: 'Pedido de cliente pra entrar em mesa ocupada', defaultOn: true },
    ],
  },
  {
    title: 'Som',
    rows: [
      { id: 'sound.alerts', label: 'Tocar som em alertas', sub: 'Som curto em chegadas/liberações', defaultOn: true },
      { id: 'sound.long_wait', label: 'Som de espera longa', sub: 'Toque insistente quando espera passa 30 min', defaultOn: false },
    ],
  },
  {
    title: 'Lock screen',
    rows: [
      { id: 'lock.preview', label: 'Mostrar conteúdo na tela bloqueada', sub: 'Nome e mesa aparecem mesmo com o celular travado', defaultOn: false },
      { id: 'lock.haptic', label: 'Vibração forte', sub: 'Padrão de vibração mais perceptível em ambiente barulhento', defaultOn: true },
    ],
  },
];

interface ScreenHostNotificationPrefsProps {
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
}

export const ScreenHostNotificationPrefs: React.FC<ScreenHostNotificationPrefsProps> = ({ onBack, onTabChange }) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  // Hidrata defaults + valores salvos.
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      for (const row of section.rows) {
        next[row.id] = row.defaultOn;
        try {
          const raw = window.localStorage.getItem(STORAGE_PREFIX + row.id);
          if (raw === '1') next[row.id] = true;
          else if (raw === '0') next[row.id] = false;
        } catch {
          /* swallow */
        }
      }
    }
    setPrefs(next);
  }, []);

  const toggle = useCallback((id: string) => {
    setPrefs((prev) => {
      const nextValue = !prev[id];
      try {
        window.localStorage.setItem(STORAGE_PREFIX + id, nextValue ? '1' : '0');
      } catch {
        /* swallow */
      }
      return { ...prev, [id]: nextValue };
    });
  }, []);

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
          Notificações
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 24 }}>
        <div
          style={{
            padding: '14px 16px 0',
            fontSize: 12,
            color: C.mute,
            fontWeight: 500,
            lineHeight: 1.5,
          }}
        >
          Configurações ficam neste dispositivo. Sincronização com sua conta
          chega no round 19.
        </div>

        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginTop: 18 }}>
            <div
              style={{
                padding: '0 16px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              {section.title}
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.rows.map((row) => (
                <ToggleRowItem
                  key={row.id}
                  dark={dark}
                  label={row.label}
                  sub={row.sub}
                  checked={!!prefs[row.id]}
                  onChange={() => toggle(row.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* TODO(round19): persistir via POST /users/me/preferences quando o
            endpoint existir. Hoje cada toggle só grava localStorage. */}
      </div>

      <HBottomNav active="me" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

// ─── ToggleRowItem — row com label/sub à esquerda + toggle pill à direita.
function ToggleRowItem({
  label,
  sub,
  checked,
  onChange,
  dark,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
          {label}
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>
          {sub}
        </div>
      </div>
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-label={label}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            margin: 0,
            cursor: 'pointer',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 26,
            borderRadius: 999,
            background: checked ? C.ink : C.borderSoft,
            transition: 'background 120ms ease',
            display: 'inline-block',
            position: 'relative',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: checked ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 140ms ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
            }}
          />
        </span>
      </span>
    </label>
  );
}

export default ScreenHostNotificationPrefs;
