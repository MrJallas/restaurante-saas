'use client';

// Thread chat-style — bubbles agrupados por sender.
// Banner sticky de zone-pause aparece SÓ pro garçom + SÓ se a pausa
// está ativa agora (garcom-screens-b.jsx :: ScreenStaffMessageThread).

import * as React from 'react';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { getThread, sendStaffMessage, listMyZonePauses } from '../../lib/api/waiter';
import { useWaiterEvents } from '../../hooks/useWaiterEvents';
import { useHostEvents } from '../../hooks/useHostEvents';
import type {
  StaffMessageDto,
  StaffMessageThreadDto,
  WsEvent,
  ZonePauseDto,
} from '@restaurant/shared-types';

interface ScreenStaffMessageThreadProps {
  tenantSlug: string;
  threadId: string;
  role?: 'waiter' | 'host' | 'cook';
  myUserId: string;
  onBack?: () => void;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function fmtTimeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return '00:00';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function getStaffEventThreadId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { threadId?: unknown; message?: { threadId?: unknown } };
  if (typeof p.threadId === 'string') return p.threadId;
  if (typeof p.message?.threadId === 'string') return p.message.threadId;
  return null;
}

function hasShiftEndRequest(content: string): boolean {
  return /SHIFT_END_REQUEST:[0-9a-f-]{36}/i.test(content);
}

function cleanSystemToken(content: string): string {
  return content.replace(/\n?SHIFT_END_REQUEST:[0-9a-f-]{36}/i, '').trim();
}

function messageContent(message: StaffMessageDto): string {
  return message.content ?? (message as unknown as { body?: string }).body ?? '';
}

export const ScreenStaffMessageThread: React.FC<ScreenStaffMessageThreadProps> = ({
  tenantSlug, threadId, role = 'waiter', myUserId, onBack,
}) => {
  const dark = role === 'cook';
  const C = useG(dark);
  const [thread, setThread] = useState<StaffMessageThreadDto | null>(null);
  const [messages, setMessages] = useState<StaffMessageDto[]>([]);
  const [pauses, setPauses] = useState<ZonePauseDto[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const waiterEvents = useWaiterEvents(role === 'waiter' || role === 'cook'
    ? { tenantSlug, waiterId: myUserId }
    : { tenantSlug: '' });
  const hostEvents = useHostEvents(role === 'host'
    ? { tenantSlug, hostId: myUserId }
    : { tenantSlug: '' });

  const loadThread = useCallback(async () => {
    try {
      const res = await getThread(tenantSlug, threadId, myUserId);
      setThread(res.thread);
      setMessages(res.messages);
    } catch {
      setThread(null);
      setMessages([]);
    }
  }, [tenantSlug, threadId, myUserId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!myUserId) return;
    const handler = (event: WsEvent) => {
      if (
        event.event !== 'staff_message.received'
        && event.event !== 'staff_message.read'
      ) {
        return;
      }
      if (getStaffEventThreadId(event.payload) === threadId) {
        void loadThread();
      }
    };
    const off1 = waiterEvents.on(handler);
    const off2 = hostEvents.on(handler);
    return () => {
      off1();
      off2();
    };
  }, [threadId, myUserId, loadThread, waiterEvents, hostEvents]);

  // Zone-pause banner only for waiter
  useEffect(() => {
    if (role !== 'waiter') return;
    let alive = true;
    listMyZonePauses(tenantSlug, myUserId)
      .then((p) => {
        if (alive) setPauses(p);
      })
      .catch(() => {
        if (alive) setPauses([]);
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug, role, myUserId]);

  const activePause = useMemo(
    () => pauses.find((p) => p.active && new Date(p.endsAt).getTime() > Date.now()),
    [pauses],
  );
  const hasPendingShiftEndRequest = useMemo(
    () =>
      messages.some((m) => hasShiftEndRequest(messageContent(m))) &&
      !messages.some((m) => /Encerramento (aprovado|recusado)/i.test(messageContent(m))),
    [messages],
  );
  const sentBubbleBg = dark ? '#F4F4F5' : C.ink;
  const sentBubbleInk = dark ? '#111827' : '#fff';
  const sentMetaInk = dark ? 'rgba(255, 255, 255, 0.62)' : C.faint;

  async function send() {
    const content = draft.trim();
    if (!content || !thread) return;
    setSending(true);
    try {
      const msg = await sendStaffMessage(tenantSlug, {
        recipientId: thread.threadId,
        threadId: thread.threadId,
        content,
      }, myUserId);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
    } catch {
      /* noop */
    } finally {
      setSending(false);
    }
  }

  // "isMe" depends on viewer's role. Staff (waiter or host) sees their own
  // bubbles when fromRole='staff' and staffId matches.
  function isAuthoredByMe(m: StaffMessageDto): boolean {
    return m.fromRole === 'staff' && m.staffId === myUserId;
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: G_FONT, color: C.ink,
      }}
    >
      <div
        style={{
          padding: '10px',
          borderBottom: `1px solid ${C.borderFaint}`, background: C.bg,
          display: 'flex', alignItems: 'center', gap: 10,
          position: 'sticky', top: 0, zIndex: 5,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          style={{
            all: 'unset', cursor: 'pointer',
            width: 32, height: 32, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.ink, flexShrink: 0,
          }}
        >
          {Icon.back(20)}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
            {thread?.subject ?? thread?.threadId ?? threadId}
          </div>
          <div
            style={{
              fontSize: 9, fontWeight: 800, color: C.faint, letterSpacing: 0.6,
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace', marginTop: 1,
            }}
          >
            CONVERSA
          </div>
        </div>
        <button
          type="button"
          aria-label="Mais"
          style={{
            all: 'unset', cursor: 'pointer',
            width: 36, height: 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.ink,
          }}
        >
          {Icon.more(20)}
        </button>
      </div>

      {role === 'waiter' && activePause && (
        <div
          role="alert"
          style={{
            padding: '10px 14px', background: '#FFF7E6',
            borderBottom: '1px solid #F0DCB6',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span
            style={{
              width: 8, height: 8, borderRadius: '50%', background: '#9A7212',
              animation: 'gPulse 1.4s infinite', flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5, fontWeight: 800, color: '#7A4D10',
                letterSpacing: 0.7, textTransform: 'uppercase',
                fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              }}
            >
              · PAUSA ATIVA · {fmtTimeLeft(activePause.endsAt)} RESTANTES
            </div>
            <div style={{ fontSize: 12, color: '#7A4D10', fontWeight: 600, marginTop: 1 }}>
              Suas mesas · libera sozinho ao acabar
            </div>
          </div>
        </div>
      )}

      {role === 'waiter' && hasPendingShiftEndRequest && (
        <div
          role="status"
          style={{
            padding: '11px 14px',
            background: '#FFF7E6',
            borderBottom: '1px solid #F0DCB6',
            color: '#7A4D10',
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          Gerente está analisando seu pedido. Você continua no turno até receber a resposta.
        </div>
      )}

      <div
        style={{
          flex: 1, overflow: 'auto', padding: '6px 0 14px',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {messages.map((m) => {
          const isMe = isAuthoredByMe(m);
          const visibleContent = cleanSystemToken(messageContent(m));
          if (isMe) {
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex', justifyContent: 'flex-end',
                  padding: '8px 14px 0 60px',
                }}
              >
                <div style={{ maxWidth: '78%' }}>
                  <div
                    style={{
                      background: sentBubbleBg,
                      color: sentBubbleInk,
                      padding: '10px 14px', borderRadius: 14,
                      borderBottomRightRadius: 4,
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: 0,
                      lineHeight: 1.45, whiteSpace: 'pre-wrap',
                    }}
                  >
                    {visibleContent}
                  </div>
                  <div
                    style={{
                      marginTop: 4, textAlign: 'right',
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: sentMetaInk,
                      letterSpacing: 0,
                      fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                    }}
                  >
                    {fmtTime(m.createdAt)} · {m.readAt ? 'LIDA' : 'ENVIADA'}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 60px 0 14px',
              }}
            >
              <div style={{ minWidth: 0, maxWidth: '82%' }}>
                <div
                  style={{
                    background: C.surface, color: C.ink,
                    border: `1px solid ${C.borderSoft}`,
                    padding: '10px 14px', borderRadius: 14,
                    borderBottomLeftRadius: 4,
                    fontSize: 14, fontWeight: 500, letterSpacing: 0,
                    lineHeight: 1.45, whiteSpace: 'pre-wrap',
                  }}
                >
                  {visibleContent}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div
        style={{
          padding: '10px 12px 14px', background: C.bg,
          borderTop: `1px solid ${C.borderFaint}`,
          display: 'flex', alignItems: 'flex-end', gap: 8,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 240))}
          placeholder="Mensagem..."
          rows={1}
          style={{
            flex: 1, fontFamily: G_FONT, fontSize: 14, color: C.ink,
            minHeight: 44, padding: '12px 14px',
            borderRadius: 14, border: `1px solid ${C.borderSoft}`,
            background: C.surface, outline: 'none', resize: 'none',
          }}
        />
        <button
          type="button"
          aria-label="Enviar mensagem"
          onClick={send}
          disabled={!draft.trim() || sending}
          style={{
            all: 'unset',
            cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer',
            width: 44, height: 44, borderRadius: '50%',
            background: !draft.trim() ? C.borderSoft : C.ink,
            color: !draft.trim() ? C.faint : C.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {Icon.arrow(20)}
        </button>
      </div>
    </div>
  );
};

export default ScreenStaffMessageThread;
