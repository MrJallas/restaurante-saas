'use client';

// ScreenStaffMessages — caixa de mensagens role-aware. Lista threads do
// usuário (filtragem server-side por viewer). Match com docs/design-canvas/
// handoff/garcom/garcom-screens-b.jsx :: ScreenStaffMessages.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { listMyThreads } from '../../lib/api/waiter';
import type { StaffMessageThreadDto, WsEvent } from '@restaurant/shared-types';
import { useWaiterEvents } from '../../hooks/useWaiterEvents';
import { useHostEvents } from '../../hooks/useHostEvents';

interface ScreenStaffMessagesProps {
  tenantSlug: string;
  role?: 'waiter' | 'host' | 'cook';
  userId: string;
  onBack?: () => void;
  onOpenThread?: (threadId: string) => void;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export const ScreenStaffMessages: React.FC<ScreenStaffMessagesProps> = ({
  tenantSlug, role = 'waiter', userId, onBack, onOpenThread,
}) => {
  const dark = role === 'cook';
  const C = useG(dark);
  const [threads, setThreads] = useState<StaffMessageThreadDto[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const waiterEvents = useWaiterEvents(role === 'waiter' || role === 'cook'
    ? { tenantSlug, waiterId: userId }
    : { tenantSlug: '' });
  const hostEvents = useHostEvents(role === 'host'
    ? { tenantSlug, hostId: userId }
    : { tenantSlug: '' });

  useEffect(() => {
    let alive = true;
    if (!userId) {
      // Backend rejects ?staffId='' — bail until URL provides one.
      setThreads([]);
      return;
    }
    listMyThreads(tenantSlug, userId)
      .then((t) => {
        if (alive) setThreads(t);
      })
      .catch(() => {
        if (alive) setThreads([]);
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug, userId]);

  // Live refresh on staff_message.received + staff_message.read so the
  // unread badge follows the counterpart's read receipts (P1 #19).
  useEffect(() => {
    if (!userId) return;
    const handler = (event: WsEvent) => {
      if (
        event.event !== 'staff_message.received'
        && event.event !== 'staff_message.read'
      ) return;
      // simple strategy: refetch the list
      listMyThreads(tenantSlug, userId)
        .then(setThreads)
        .catch(() => {
          /* noop */
        });
    };
    const off1 = waiterEvents.on(handler);
    const off2 = hostEvents.on(handler);
    return () => {
      off1();
      off2();
    };
  }, [tenantSlug, userId, waiterEvents, hostEvents]);

  const visible = filter === 'unread' ? threads.filter((t) => t.unreadCount > 0) : threads;
  const unreadCount = threads.reduce((s, t) => s + (t.unreadCount > 0 ? 1 : 0), 0);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex', flexDirection: 'column',
        background: C.surface, fontFamily: G_FONT, color: C.ink, position: 'relative',
      }}
    >
      <div
        style={{
          padding: '12px 10px',
          borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surface,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          style={{
            all: 'unset', cursor: 'pointer',
            width: 36, height: 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.ink, flexShrink: 0,
          }}
        >
          {Icon.back(20)}
        </button>
        <div
          style={{
            flex: 1, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2, paddingLeft: 4,
          }}
        >
          Mensagens
        </div>
        <button
          type="button"
          aria-label="Buscar"
          style={{
            all: 'unset', cursor: 'pointer',
            width: 36, height: 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.ink, flexShrink: 0,
          }}
        >
          {Icon.search(20)}
        </button>
      </div>

      {/* Filter chips */}
      <div
        data-hide-scrollbar
        style={{
          display: 'flex', gap: 8, padding: '10px 12px 4px',
          overflowX: 'auto', flexShrink: 0,
        }}
      >
        {(
          [
            { id: 'all' as const, label: 'Todas', count: threads.length },
            { id: 'unread' as const, label: 'Não-lidas', count: unreadCount, tone: 'danger' as const },
          ]
        ).map((c) => {
          const active = c.id === filter;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              style={{
                all: 'unset', cursor: 'pointer',
                padding: '7px 12px', borderRadius: 100,
                fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                border: `1px solid ${active ? C.ink : C.borderSoft}`,
                background: active ? C.ink : C.bg,
                color: active ? C.bg : C.ink,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {c.label}
              {c.count > 0 && (
                <span
                  style={{
                    fontSize: 10, fontWeight: 800,
                    padding: '1px 6px', borderRadius: 100,
                    background: active ? C.bg : C.borderSoft,
                    color: active ? C.ink : C.faint,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {c.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 32px', textAlign: 'center', gap: 14,
          }}
        >
          <div
            style={{
              width: 76, height: 76, borderRadius: 20,
              background: C.bg, border: `1px solid ${C.borderSoft}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.faint,
            }}
          >
            {Icon.chat(34)}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>
            Nenhuma mensagem ainda
          </div>
          <div
            style={{
              fontSize: 14, color: C.faint, fontWeight: 500, lineHeight: 1.5, maxWidth: 280,
            }}
          >
            Quando alguém da equipe te mandar uma mensagem, aparece aqui.
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1, overflow: 'auto', padding: '8px 10px 18px',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {visible.map((t) => (
            <button
              key={t.threadId}
              type="button"
              onClick={() => onOpenThread?.(t.threadId)}
              style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: '100%', padding: '12px 10px',
                borderRadius: 14, background: 'transparent',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: C.ink, color: C.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
                }}
              >
                {(t.subject ?? 'MS').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 8,
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150,
                      }}
                    >
                      {t.subject || (t.kind === 'shift_group' ? 'Turno' : 'Mensagem')}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 9.5, fontWeight: 700, color: C.faint, letterSpacing: 0.5,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    {fmtTime(t.lastMessageAt)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 3, fontSize: 13,
                    color: t.unreadCount > 0 ? C.ink : C.mute,
                    fontWeight: t.unreadCount > 0 ? 600 : 500, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                    paddingRight: 12,
                  }}
                >
                  {t.lastMessagePreview}
                </div>
              </div>
              {t.unreadCount > 0 && (
                <span
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#C43A3A', flexShrink: 0, marginTop: 18,
                  }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScreenStaffMessages;
