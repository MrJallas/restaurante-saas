'use client';

// ScreenHostWaitlist — fila de espera com party + tempo de espera.
// Match com docs/design/canvas/handoff/garcom/garcom-screens-host.jsx ::
// ScreenHostWaitlist.

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { OperationalErrorBanner } from '../../components/OperationalErrorBanner';
import { addToWaitlist, listWaitlist, type WaitlistEntry } from '../../lib/api/host';
import { operationalErrorCopy } from '../../lib/operational-error';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostWaitlistProps {
  tenantSlug: string;
  onBack?: () => void;
  onOpenEntry?: (id: string) => void;
  onTabChange?: (tab: string) => void;
}

const PARTY_FILTERS = ['all', '1-2', '3-4', '5+'] as const;
type PartyFilter = (typeof PARTY_FILTERS)[number];

function partyMatchesFilter(party: number, filter: PartyFilter): boolean {
  if (filter === 'all') return true;
  if (filter === '1-2') return party <= 2;
  if (filter === '3-4') return party >= 3 && party <= 4;
  return party >= 5;
}

export const ScreenHostWaitlist: React.FC<ScreenHostWaitlistProps> = ({
  tenantSlug,
  onBack,
  onOpenEntry,
  onTabChange,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [list, setList] = useState<WaitlistEntry[]>([]);
  const [filter, setFilter] = useState<PartyFilter>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [party, setParty] = useState(2);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await listWaitlist(tenantSlug);
        if (alive) {
          setList(data);
          setHasLoaded(true);
          setLoadError(null);
        }
      } catch (error) {
        if (alive) setLoadError(operationalErrorCopy(error, 'a lista de espera'));
      }
    }
    load();
    const tid = setInterval(load, 12_000);
    return () => {
      alive = false;
      clearInterval(tid);
    };
  }, [retryKey, tenantSlug]);

  const visible = list.filter((entry) => partyMatchesFilter(entry.party, filter));

  async function add() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const entry = await addToWaitlist(tenantSlug, {
        name: name.trim(),
        party,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      setList((prev) => [...prev, entry]);
      setShowAdd(false);
      setName('');
      setPhone('');
      setNote('');
      setParty(2);
      setLoadError(null);
    } catch (error) {
      setLoadError(operationalErrorCopy(error, 'a lista de espera'));
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
        title="Lista de espera"
        sub={`${list.length} ESPERANDO`}
        right={
          <GIconBtn
            dark={dark}
            icon={Icon.plus(20)}
            onClick={() => setShowAdd(true)}
            ariaLabel="Adicionar"
          />
        }
      />

      {loadError && (
        <OperationalErrorBanner
          message={loadError}
          onRetry={() => setRetryKey((key) => key + 1)}
          dark={dark}
          hasStaleData={list.length > 0}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 80px' }}>
        <div
          data-hide-scrollbar
          style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}
        >
          {PARTY_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '7px 12px',
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 700,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.ink : C.bg,
                  color: active ? C.bg : C.ink,
                  whiteSpace: 'nowrap',
                }}
              >
                {f === 'all' ? 'Todas' : f === '1-2' ? '1–2' : f === '3-4' ? '3–4' : '5+'}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: '32px 16px', color: C.mute, fontSize: 14, textAlign: 'center' }}>
            {!hasLoaded && !loadError
              ? 'Carregando fila…'
              : loadError
                ? 'Não foi possível confirmar a fila agora.'
                : 'Sem ninguém esperando.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onOpenEntry?.(entry.id)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: C.bg,
                  border: `1.5px solid ${C.borderSoft}`,
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 12,
                    background: C.ink,
                    color: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 22, fontWeight: 800 }}>{entry.party}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{entry.name}</div>
                  {entry.note && (
                    <div style={{ fontSize: 12, color: C.mute, marginTop: 2, fontStyle: 'italic' }}>
                      {entry.note}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.warn,
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {entry.wait_minutes} min
                </div>
                <span style={{ color: C.faint, flexShrink: 0 }}>{Icon.arrow(15)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <DragSheet onClose={() => setShowAdd(false)} C={C}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Adicionar à fila</div>
          <input
            placeholder="Nome ou referência"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              fontFamily: G_FONT,
              fontSize: 14,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setParty((p) => Math.max(1, p - 1))}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.surface,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.minus(20)}
            </button>
            <div
              style={{
                flex: 1,
                fontSize: 28,
                fontWeight: 800,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1.5px solid ${C.borderSoft}`,
                borderRadius: 12,
              }}
            >
              {party}
            </div>
            <button
              type="button"
              onClick={() => setParty((p) => p + 1)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.surface,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.plus(20)}
            </button>
          </div>
          <input
            placeholder="Telefone (opcional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              fontFamily: G_FONT,
              fontSize: 14,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              outline: 'none',
            }}
          />
          <input
            placeholder="Observação (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              fontFamily: G_FONT,
              fontSize: 14,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <GButton kind="secondary" dark={dark} onClick={() => setShowAdd(false)}>
              Cancelar
            </GButton>
            <div style={{ flex: 1 }}>
              <GButton
                kind="primary"
                full
                dark={dark}
                onClick={add}
                disabled={!name.trim() || submitting}
              >
                {submitting ? 'Adicionando...' : 'Adicionar à fila'}
              </GButton>
            </div>
          </div>
        </DragSheet>
      )}

      <HBottomNav active="waitlist" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

// Round 18 (Onda 2A): bottom-sheet com drag-to-dismiss reutilizavel.
// Antes esse sheet usava 2 divs aninhados sem pointer handlers — o
// pill 38x4 era afordancia falsa.
function DragSheet({
  onClose,
  C,
  children,
}: {
  onClose: () => void;
  C: { bg: string; borderSoft: string };
  children: React.ReactNode;
}) {
  const dragStartY = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    setDy(Math.max(0, e.clientY - dragStartY.current));
  };
  const onUp = () => {
    if (dragStartY.current == null) return;
    const total = dy;
    dragStartY.current = null;
    if (total > 120) onClose();
    else setDy(0);
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: '0 22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          transform: `translateY(${dy}px)`,
          transition: dy === 0 ? 'transform 180ms cubic-bezier(.2,.8,.2,1)' : 'none',
          touchAction: 'pan-y',
        }}
      >
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '12px 0 4px',
            cursor: 'grab',
            touchAction: 'none',
          }}
          aria-label="Arraste para fechar"
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: '#dcdcdc',
            }}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

export default ScreenHostWaitlist;
