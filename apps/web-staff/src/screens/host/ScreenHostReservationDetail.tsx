'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import {
  listHostTables,
  listReservations,
  updateReservation,
  type HostTableEntry,
  type ReservationEntry,
} from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostReservationDetailProps {
  tenantSlug: string;
  reservationId: string;
  onBack?: () => void;
  onLiberate?: (tableNumber: number) => void;
  onTabChange?: (tab: string) => void;
}

export const ScreenHostReservationDetail: React.FC<ScreenHostReservationDetailProps> = ({
  tenantSlug,
  reservationId,
  onBack,
  onLiberate,
  onTabChange,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [reservation, setReservation] = useState<ReservationEntry | null>(null);
  const [tables, setTables] = useState<HostTableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [reservations, tableRows] = await Promise.all([
          listReservations(tenantSlug),
          listHostTables(tenantSlug).catch(() => []),
        ]);
        if (!alive) return;
        setReservation(reservations.find((item) => item.id === reservationId) ?? null);
        setTables(tableRows);
      } catch {
        if (alive) setReservation(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [tenantSlug, reservationId]);

  const suggestions = useMemo(() => {
    if (!reservation) return [];
    return tables
      .filter((table) => table.status === 'livre' && table.capacity >= reservation.party)
      .sort((a, b) => a.capacity - b.capacity || a.number - b.number)
      .slice(0, 4);
  }, [reservation, tables]);

  async function setStatus(status: 'arrived' | 'cancelled' | 'no_show') {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateReservation(tenantSlug, reservationId, { status });
      setReservation(updated);
    } catch {
      setError('Não foi possível atualizar a reserva agora.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: C.surface,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title="Detalhe da reserva"
        sub={reservation ? `${reservation.when} · ${reservation.party} pessoa(s)` : ''}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 88px' }}>
        {loading ? (
          <div style={{ padding: 28, color: C.faint, fontSize: 12, textAlign: 'center' }}>
            Carregando...
          </div>
        ) : !reservation ? (
          <div
            style={{
              padding: '32px 18px',
              borderRadius: 14,
              border: `1.5px dashed ${C.borderSoft}`,
              background: C.bg,
              color: C.mute,
              fontSize: 13,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            Reserva não encontrada.
          </div>
        ) : (
          <>
            <section style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: 'uppercase' }}>
                Reserva
              </div>
              <div
                style={{
                  marginTop: 8,
                  padding: 14,
                  borderRadius: 14,
                  background: C.bg,
                  border: `1.5px solid ${C.borderSoft}`,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 62,
                    padding: '10px 0',
                    borderRadius: 12,
                    background: C.surface,
                    border: `1px solid ${C.borderSoft}`,
                    color: C.ink,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {reservation.when}
                  </div>
                  <div style={{ fontSize: 9, color: C.faint, fontWeight: 800, textTransform: 'uppercase' }}>
                    hoje
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{reservation.name}</div>
                    <StatusBadge status={reservation.status} dark={dark} />
                  </div>
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>
                    {reservation.party} pessoa(s)
                    {reservation.table != null ? ` · mesa ${reservation.table}` : ''}
                    {reservation.phone ? ` · ${reservation.phone}` : ''}
                  </div>
                  {reservation.note && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '7px 9px',
                        borderRadius: 8,
                        background: C.surface,
                        color: C.mute,
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      {reservation.note}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: 'uppercase' }}>
                Mesa para liberar
              </div>
              {reservation.table != null ? (
                <button
                  type="button"
                  onClick={() => onLiberate?.(reservation.table as number)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    marginTop: 8,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#E9F4ED',
                    border: '1.5px solid #1E8C5A',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: '#1E8C5A',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {reservation.table}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: C.ink, fontWeight: 800 }}>
                      Mesa atribuída
                    </div>
                    <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                      Liberar para {reservation.name}
                    </div>
                  </div>
                  <span style={{ color: '#1E8C5A' }}>{Icon.arrow(16)}</span>
                </button>
              ) : suggestions.length === 0 ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: '18px 14px',
                    borderRadius: 12,
                    border: `1.5px dashed ${C.borderSoft}`,
                    background: C.bg,
                    color: C.mute,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Nenhuma mesa livre comporta essa reserva agora.
                </div>
              ) : (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suggestions.map((table) => (
                    <button
                      key={table.number}
                      type="button"
                      onClick={() => onLiberate?.(table.number)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        padding: '12px 14px',
                        borderRadius: 12,
                        background: C.bg,
                        border: `1.5px solid ${C.borderSoft}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: C.surface,
                          color: C.ink,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {table.number}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: C.ink, fontWeight: 800 }}>
                          Mesa {table.number}
                        </div>
                        <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                          {table.sector} · {table.capacity} lugares
                        </div>
                      </div>
                      <span style={{ color: C.faint }}>{Icon.arrow(16)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: C.dangerBg,
                  color: C.danger,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {reservation && (
        <div
          style={{
            padding: '12px 16px 18px',
            borderTop: `1px solid ${C.borderFaint}`,
            background: C.bg,
            display: 'flex',
            gap: 10,
          }}
        >
          {reservation.status === 'awaited' ? (
            <>
              <GButton kind="secondary" dark={dark} onClick={() => setStatus('cancelled')} disabled={submitting}>
                Cancelar
              </GButton>
              <div style={{ flex: 1 }}>
                <GButton kind="success" full dark={dark} onClick={() => setStatus('arrived')} disabled={submitting}>
                  Marcar chegada
                </GButton>
              </div>
            </>
          ) : (
            <GButton
              kind="success"
              full
              dark={dark}
              onClick={() => {
                const table = reservation.table ?? suggestions[0]?.number;
                if (table) onLiberate?.(table);
              }}
              disabled={submitting || (reservation.table == null && suggestions.length === 0)}
            >
              Liberar mesa
            </GButton>
          )}
        </div>
      )}

      <HBottomNav active="reserva" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

function StatusBadge({ status, dark }: { status: ReservationEntry['status']; dark: boolean }) {
  const C = useG(dark);
  const map: Record<ReservationEntry['status'], { label: string; bg: string; fg: string; bd: string }> = {
    awaited: { label: 'Aguardada', bg: '#FFF7E8', fg: '#7A4D10', bd: '#F0DCB6' },
    arrived: { label: 'Chegou', bg: '#E9F4ED', fg: '#1E8C5A', bd: '#C9E2D2' },
    cancelled: { label: 'Cancelada', bg: C.surface, fg: C.faint, bd: C.borderSoft },
    no_show: { label: 'Não veio', bg: C.surface, fg: C.faint, bd: C.borderSoft },
  };
  const item = map[status];
  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: 100,
        background: item.bg,
        color: item.fg,
        border: `1px solid ${item.bd}`,
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
      }}
    >
      {item.label}
    </span>
  );
}

export default ScreenHostReservationDetail;
