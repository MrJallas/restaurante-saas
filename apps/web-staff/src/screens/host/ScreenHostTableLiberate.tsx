'use client';

// Liberar mesa — fluxo da recepcionista pra reabrir uma mesa após o
// cliente sair. Match com docs/design-canvas/handoff/garcom/garcom-screens-host.jsx ::
// ScreenHostTableLiberate.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import { liberateTable, listHostTables, listReservations, listWaitlist } from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostTableLiberateProps {
  tenantSlug: string;
  tableNumber: number;
  capacity?: number;
  sector?: string;
  partySize?: number;
  reservationId?: string;
  waitlistId?: string;
  onBack?: () => void;
  onDone?: () => void;
}

export const ScreenHostTableLiberate: React.FC<ScreenHostTableLiberateProps> = ({
  tenantSlug,
  tableNumber,
  capacity,
  sector,
  partySize: initialParty,
  reservationId,
  waitlistId,
  onBack,
  onDone,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const linkedSource = Boolean(reservationId || waitlistId);
  const [resolvedCapacity, setResolvedCapacity] = useState<number | null>(capacity ?? null);
  const [resolvedSector, setResolvedSector] = useState(sector ?? 'Salão');
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(initialParty ?? 1);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadContext() {
      setContextLoading(true);
      setContextError(null);
      try {
        const tables = await listHostTables(tenantSlug);
        const table = tables.find((row) => row.number === tableNumber);
        if (!table) throw new Error('Mesa não encontrada.');

        let sourceParty = initialParty ?? table.capacity;
        let nextSourceLabel: string | null = null;
        if (reservationId) {
          const reservations = await listReservations(tenantSlug);
          const reservation = reservations.find((row) => row.id === reservationId);
          if (!reservation) throw new Error('Reserva não está mais disponível.');
          sourceParty = reservation.party;
          nextSourceLabel = `Reserva · ${reservation.name}`;
        } else if (waitlistId) {
          const waitlist = await listWaitlist(tenantSlug);
          const entry = waitlist.find((row) => row.id === waitlistId);
          if (!entry) throw new Error('Pessoa não está mais aguardando na fila.');
          sourceParty = entry.party;
          nextSourceLabel = `Fila · ${entry.name}`;
        }

        if (!alive) return;
        setResolvedCapacity(table.capacity);
        setResolvedSector(table.sector);
        setPartySize(sourceParty);
        setSourceLabel(nextSourceLabel);
      } catch (loadError) {
        if (alive) {
          setContextError(
            loadError instanceof Error ? loadError.message : 'Não foi possível carregar a mesa.',
          );
        }
      } finally {
        if (alive) setContextLoading(false);
      }
    }
    void loadContext();
    return () => {
      alive = false;
    };
  }, [initialParty, reservationId, tableNumber, tenantSlug, waitlistId]);

  async function liberate() {
    if (contextLoading || contextError || resolvedCapacity == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await liberateTable(tenantSlug, tableNumber, {
        partySize,
        reservationId,
        waitlistId,
      });
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
          {contextLoading
            ? 'Carregando mesa…'
            : `${resolvedSector} · ${resolvedCapacity ?? '—'} ${resolvedCapacity === 1 ? 'lugar' : 'lugares'}`}
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
          {sourceLabel ? `Liberar para ${sourceLabel}?` : 'Liberar pra novo grupo?'}
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
              justifyContent: linkedSource ? 'center' : 'space-between',
              border: `1.5px solid ${C.ink}`,
              borderRadius: 14,
              padding: '6px 8px',
              background: C.bg,
              minHeight: 58,
            }}
          >
            {!linkedSource && (
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
            )}
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
            {!linkedSource && (
              <button
                type="button"
                aria-label="Aumentar"
                onClick={() => setPartySize((n) => Math.min((resolvedCapacity ?? 1) * 2, n + 1))}
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
            )}
          </div>
          {linkedSource && sourceLabel && (
            <div style={{ marginTop: 7, color: C.faint, fontSize: 11, textAlign: 'center' }}>
              Tamanho confirmado pela origem; altere a reserva/fila para corrigir.
            </div>
          )}
        </div>

        {(contextError || error) && (
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
            {contextError ?? error}
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
        <GButton
          kind="primary"
          full
          dark={dark}
          onClick={liberate}
          disabled={submitting || contextLoading || !!contextError}
        >
          {submitting ? 'Liberando...' : 'Liberar mesa'}
        </GButton>
      </div>
    </div>
  );
};

export default ScreenHostTableLiberate;
