'use client';

// Liberar mesa — fluxo da recepcionista pra reabrir uma mesa após o
// cliente sair. Match com docs/design-canvas/handoff/garcom/garcom-screens-host.jsx ::
// ScreenHostTableLiberate.

import * as React from 'react';
import { useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import { liberateTable } from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostTableLiberateProps {
  tenantSlug: string;
  tableNumber: number;
  capacity?: number;
  sector?: string;
  partySize?: number;
  onBack?: () => void;
  onDone?: () => void;
}

export const ScreenHostTableLiberate: React.FC<ScreenHostTableLiberateProps> = ({
  tenantSlug,
  tableNumber,
  capacity = 4,
  sector = 'Salão',
  partySize: initialParty = capacity,
  onBack,
  onDone,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [partySize, setPartySize] = useState(initialParty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function liberate() {
    setSubmitting(true);
    setError(null);
    try {
      await liberateTable(tenantSlug, tableNumber, { partySize });
      onDone?.();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Erro ao liberar mesa');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title={`Liberar mesa ${tableNumber}`}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 18,
            background: C.surface,
            border: `2px solid ${C.ink}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>{tableNumber}</span>
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: C.faint,
            fontWeight: 700,
          }}
        >
          {sector} · {capacity} {capacity === 1 ? 'lugar' : 'lugares'}
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: 22,
            fontWeight: 800,
            marginTop: 14,
            letterSpacing: -0.5,
          }}
        >
          Liberar pra novo grupo?
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: C.mute,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          A mesa volta pra status <b>liberada</b>. O cliente pode escanear o QR e abrir comanda.
        </div>

        {/* Stepper · número de pessoas */}
        <div style={{ paddingTop: 24 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: C.faint,
              marginBottom: 8,
            }}
          >
            QUANTAS PESSOAS?
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: `1.5px solid ${C.ink}`,
              borderRadius: 14,
              padding: '6px 8px',
              background: C.bg,
            }}
          >
            <button
              type="button"
              aria-label="Diminuir"
              onClick={() => setPartySize((n) => Math.max(1, n - 1))}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.surface,
                color: C.ink,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.minus(20)}
            </button>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: C.ink,
                letterSpacing: -1,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {partySize}
            </div>
            <button
              type="button"
              aria-label="Aumentar"
              onClick={() => setPartySize((n) => Math.min(capacity * 2, n + 1))}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.surface,
                color: C.ink,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.plus(20)}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: C.dangerBg,
              color: C.danger,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          borderTop: `1px solid ${C.borderFaint}`,
          background: C.bg,
        }}
      >
        <GButton kind="primary" full dark={dark} onClick={liberate} disabled={submitting}>
          {submitting ? 'Liberando...' : 'Liberar mesa'}
        </GButton>
      </div>
    </div>
  );
};

export default ScreenHostTableLiberate;
