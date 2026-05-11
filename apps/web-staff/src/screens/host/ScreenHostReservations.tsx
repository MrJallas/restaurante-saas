'use client';

// ScreenHostReservations — lista de reservas do dia + criar nova.
// Match com docs/design-canvas/handoff/garcom/garcom-screens-host.jsx ::
// ScreenHostReservations.

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import {
  createReservation, listReservations,
  type ReservationEntry,
} from '../../lib/api/host';

interface ScreenHostReservationsProps {
  tenantSlug: string;
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
}

const STATUS_FILTERS = ['all', 'awaited', 'arrived'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export const ScreenHostReservations: React.FC<ScreenHostReservationsProps> = ({
  tenantSlug, onBack, onTabChange,
}) => {
  const dark = false;
  const C = useG(dark);
  const [list, setList] = useState<ReservationEntry[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [party, setParty] = useState(2);
  const [when, setWhen] = useState('20:00');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    listReservations(tenantSlug)
      .then((data) => {
        if (alive) setList(data);
      })
      .catch(() => {
        if (alive) setList([]);
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug]);

  const visible = list.filter((r) => filter === 'all' || r.status === filter);

  async function add() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const r = await createReservation(tenantSlug, {
        name: name.trim(), party, when,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      setList((prev) => [...prev, r].sort((a, b) => a.when.localeCompare(b.when)));
      setShowAdd(false);
      setName('');
      setPhone('');
      setNote('');
      setParty(2);
      setWhen('20:00');
    } catch {
      /* noop */
    } finally {
      setSubmitting(false);
    }
  }

  const counts = list.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      style={{
        width: '100%', height: '100vh', background: C.surface, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title="Reservas"
        sub={`${counts.awaited ?? 0} AGUARDADAS · ${counts.arrived ?? 0} CHEGARAM`}
        right={<GIconBtn dark={dark} icon={Icon.plus(20)} onClick={() => setShowAdd(true)} ariaLabel="Adicionar" />}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 80px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {STATUS_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '7px 12px', borderRadius: 100,
                  fontSize: 12, fontWeight: 700,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.ink : C.bg,
                  color: active ? C.bg : C.ink,
                }}
              >
                {f === 'all' ? 'Todas' : f === 'awaited' ? 'Aguardadas' : 'Chegaram'}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: '32px 16px', color: C.mute, fontSize: 14, textAlign: 'center' }}>
            Sem reservas para esse filtro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 14,
                  background: C.bg, border: `1.5px solid ${C.borderSoft}`,
                }}
              >
                <div
                  style={{
                    width: 50, height: 50, borderRadius: 12,
                    background: C.surface, color: C.ink,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 8, fontWeight: 800, letterSpacing: 0.5,
                      textTransform: 'uppercase', color: C.mute,
                    }}
                  >
                    {r.status === 'arrived' ? 'OK' : 'EM ESPERA'}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>
                    {r.when}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                    {r.party} pessoa(s){r.table != null ? ` · mesa ${r.table}` : ''}
                  </div>
                  {r.note && (
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2, fontStyle: 'italic' }}>
                      {r.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <DragSheet onClose={() => setShowAdd(false)} C={C}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Nova reserva</div>
            <input
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                fontFamily: G_FONT, fontSize: 14, padding: '12px 14px',
                borderRadius: 12, border: `1.5px solid ${C.borderSoft}`, outline: 'none',
              }}
            />
            <input
              placeholder="Horário (HH:MM)"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={{
                fontFamily: G_FONT, fontSize: 14, padding: '12px 14px',
                borderRadius: 12, border: `1.5px solid ${C.borderSoft}`, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setParty((p) => Math.max(1, p - 1))}
                style={{
                  all: 'unset', cursor: 'pointer',
                  width: 44, height: 44, borderRadius: 10,
                  background: C.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {Icon.minus(20)}
              </button>
              <div
                style={{
                  flex: 1, fontSize: 22, fontWeight: 800, textAlign: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${C.borderSoft}`, borderRadius: 12,
                }}
              >
                {party} pessoa(s)
              </div>
              <button
                type="button"
                onClick={() => setParty((p) => p + 1)}
                style={{
                  all: 'unset', cursor: 'pointer',
                  width: 44, height: 44, borderRadius: 10,
                  background: C.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                fontFamily: G_FONT, fontSize: 14, padding: '12px 14px',
                borderRadius: 12, border: `1.5px solid ${C.borderSoft}`, outline: 'none',
              }}
            />
            <input
              placeholder="Observação (opcional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{
                fontFamily: G_FONT, fontSize: 14, padding: '12px 14px',
                borderRadius: 12, border: `1.5px solid ${C.borderSoft}`, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <GButton kind="secondary" dark={dark} onClick={() => setShowAdd(false)}>
                Cancelar
              </GButton>
              <div style={{ flex: 1 }}>
                <GButton kind="primary" full dark={dark} onClick={add} disabled={!name.trim() || submitting}>
                  {submitting ? 'Salvando...' : 'Salvar reserva'}
                </GButton>
              </div>
            </div>
        </DragSheet>
      )}

      <HBottomNav active="reserva" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

// Round 18 (Onda 2A): bottom-sheet com drag-to-dismiss reutilizavel.
// Mesma impl do HostWaitlist — extrair pra primitive em Onda 3.
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

export default ScreenHostReservations;
