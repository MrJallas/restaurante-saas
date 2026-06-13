'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import {
  listHostTables,
  listWaitlist,
  removeFromWaitlist,
  type HostTableEntry,
  type WaitlistEntry,
} from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostWaitlistDetailProps {
  tenantSlug: string;
  entryId: string;
  onBack?: () => void;
  onLiberate?: (tableNumber: number) => void;
  onResolved?: () => void;
  onTabChange?: (tab: string) => void;
}

export const ScreenHostWaitlistDetail: React.FC<ScreenHostWaitlistDetailProps> = ({
  tenantSlug,
  entryId,
  onBack,
  onLiberate,
  onResolved,
  onTabChange,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [entry, setEntry] = useState<WaitlistEntry | null>(null);
  const [tables, setTables] = useState<HostTableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [waitlist, tableRows] = await Promise.all([
          listWaitlist(tenantSlug),
          listHostTables(tenantSlug).catch(() => []),
        ]);
        if (!alive) return;
        setEntry(waitlist.find((item) => item.id === entryId) ?? null);
        setTables(tableRows);
      } catch {
        if (alive) setEntry(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [tenantSlug, entryId]);

  const suggestions = useMemo(() => {
    if (!entry) return [];
    return tables
      .filter((table) => table.status === 'livre' && table.capacity >= entry.party)
      .sort((a, b) => a.capacity - b.capacity || a.number - b.number)
      .slice(0, 4);
  }, [entry, tables]);

  async function markLeft() {
    setSubmitting(true);
    setError(null);
    try {
      await removeFromWaitlist(tenantSlug, entryId, 'left');
      onResolved?.();
    } catch {
      setError('Não foi possível remover da lista agora.');
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
        title="Atender espera"
        sub={
          entry
            ? `${entry.party} ${entry.party === 1 ? 'pessoa' : 'pessoas'} · ${entry.wait_minutes} min`
            : ''
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 88px' }}>
        {loading ? (
          <div style={{ padding: 28, color: C.faint, fontSize: 12, textAlign: 'center' }}>
            Carregando...
          </div>
        ) : !entry ? (
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
            Essa pessoa não está mais aguardando.
          </div>
        ) : (
          <>
            <section style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  color: C.faint,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                Pessoa na fila
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
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 14,
                    background: C.ink,
                    color: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {entry.party}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{entry.name}</div>
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 3 }}>
                    Chegou há {entry.wait_minutes} min{entry.phone ? ` · ${entry.phone}` : ''}
                  </div>
                  {entry.note && (
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
                      {entry.note}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section>
              <div
                style={{
                  fontSize: 11,
                  color: C.faint,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                Mesas compatíveis
              </div>
              {suggestions.length === 0 ? (
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
                  Nenhuma mesa livre comporta esse grupo agora.
                </div>
              ) : (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suggestions.map((table, idx) => (
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
                        background: idx === 0 ? '#E9F4ED' : C.bg,
                        border: `1.5px solid ${idx === 0 ? '#1E8C5A' : C.borderSoft}`,
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
                          background: idx === 0 ? '#1E8C5A' : C.surface,
                          color: idx === 0 ? '#fff' : C.ink,
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
                      <span style={{ color: idx === 0 ? '#1E8C5A' : C.faint }}>
                        {Icon.arrow(16)}
                      </span>
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

      {entry && (
        <div
          style={{
            padding: '12px 16px 18px',
            borderTop: `1px solid ${C.borderFaint}`,
            background: C.bg,
            display: 'flex',
            gap: 10,
          }}
        >
          <GButton kind="secondary" dark={dark} onClick={markLeft} disabled={submitting}>
            Saiu da fila
          </GButton>
          <div style={{ flex: 1 }}>
            <GButton
              kind="success"
              full
              dark={dark}
              onClick={() => suggestions[0] && onLiberate?.(suggestions[0].number)}
              disabled={suggestions.length === 0 || submitting}
            >
              {suggestions[0] ? `Sentar na mesa ${suggestions[0].number}` : 'Sem mesa compatível'}
            </GButton>
          </div>
        </div>
      )}

      <HBottomNav active="waitlist" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

export default ScreenHostWaitlistDetail;
