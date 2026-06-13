'use client';

// ScreenHostTableSwap — mover a sessão de uma mesa pra outra.
// Match com docs/design-canvas/handoff/garcom/garcom-screens-host.jsx ::
// ScreenHostTableSwap. Lista mesas livres compatíveis com a capacidade.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import { listHostTables, swapTable, type HostTableEntry } from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostTableSwapProps {
  tenantSlug: string;
  fromTable?: number;
  onBack?: () => void;
  onDone?: () => void;
}

export const ScreenHostTableSwap: React.FC<ScreenHostTableSwapProps> = ({
  tenantSlug,
  fromTable,
  onBack,
  onDone,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [tables, setTables] = useState<HostTableEntry[]>([]);
  const [from, setFrom] = useState<number | null>(fromTable ?? null);
  const [to, setTo] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listHostTables(tenantSlug)
      .then((t) => {
        if (alive) setTables(t);
      })
      .catch(() => {
        if (alive) setTables([]);
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug]);

  const occupied = tables.filter((t) => t.status === 'ocupada' || t.status === 'liberada');
  const fromTableEntry = tables.find((t) => t.number === from);
  const targetCandidates = tables.filter(
    (t) => t.status === 'livre' && (!fromTableEntry || t.capacity >= (fromTableEntry.seats ?? 0)),
  );

  async function submit() {
    if (!from || !to) {
      setError('Escolha as duas mesas');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await swapTable(tenantSlug, { fromTable: from, toTable: to });
      onDone?.();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Erro ao trocar mesa');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
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
        title="Trocar mesa"
      />

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '14px 16px' }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: C.mute,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          De qual mesa
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {occupied.map((t) => {
            const active = t.number === from;
            return (
              <button
                key={t.number}
                type="button"
                onClick={() => setFrom(t.number)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '8px 14px',
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: 600,
                  background: active ? C.ink : 'transparent',
                  color: active ? C.bg : C.ink,
                  border: `1.5px solid ${active ? C.ink : C.borderSoft}`,
                }}
              >
                Mesa {t.number} · {t.seats ?? 0} pessoa(s)
              </button>
            );
          })}
        </div>

        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: C.mute,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Pra qual mesa livre
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {targetCandidates.length === 0 ? (
            <div style={{ padding: '12px 14px', color: C.mute, fontSize: 13 }}>
              Sem mesa livre com capacidade suficiente.
            </div>
          ) : (
            targetCandidates.map((t) => {
              const active = t.number === to;
              return (
                <button
                  key={t.number}
                  type="button"
                  onClick={() => setTo(t.number)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: active ? '#fafafa' : 'transparent',
                    border: `1.5px solid ${active ? C.ink : C.borderSoft}`,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: active ? C.ink : C.surface,
                      color: active ? C.bg : C.ink,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{t.number}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Mesa {t.number}</div>
                    <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                      {t.sector} · {t.capacity} lugares
                    </div>
                  </div>
                  <span style={{ color: C.mute }}>{Icon.arrow(14)}</span>
                </button>
              );
            })
          )}
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
          flexShrink: 0,
        }}
      >
        <GButton
          kind="primary"
          full
          dark={dark}
          onClick={submit}
          disabled={!from || !to || submitting}
        >
          {submitting ? 'Trocando...' : 'Confirmar troca'}
        </GButton>
      </div>
    </div>
  );
};

export default ScreenHostTableSwap;
