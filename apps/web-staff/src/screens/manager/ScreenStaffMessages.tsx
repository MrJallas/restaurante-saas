'use client';

// Inbox of staff messages (manager-to-manager, manager-to-staff,
// manager-to-customer threads kept in `assistant_messages`).
// Tap a thread to see the conversation.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MTopBar,
  MBottomNav,
  MPill,
  GIconBtn,
} from '../../components/manager';
import { manager } from '../../lib/api/manager';
import type { StaffMessageThreadDto, StaffMessageDto } from '@restaurant/shared-types';
import { useManagerEvents } from '../../hooks/useManagerEvents';

export interface ScreenStaffMessagesProps {
  dark?: boolean;
  tenantSlug: string;
  /** P1 #18 — backend `?staffId=<uuid>` is required. Caller threads it
   * from URL/profile (see `app/manager/mensagens/page.tsx`). When absent
   * the inbox shows the empty state and skips the fetch. */
  managerId?: string;
}

export function ScreenStaffMessages({ dark, tenantSlug, managerId }: ScreenStaffMessagesProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = manager(tenantSlug);
  const [threads, setThreads] = useState<StaffMessageThreadDto[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!managerId) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api.staffMessages.listThreads({ staffId: managerId });
      setThreads(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [tenantSlug, managerId]);

  useManagerEvents(tenantSlug, (e) => {
    if (e.event === 'staff_message.received') refresh();
  });

  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Mensagens"
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.push('/manager')} ariaLabel="Voltar" />}
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {totalUnread > 0 && (
          <div style={{ padding: '12px 16px 0' }}>
            <MPill tone="info" dark={dark}>
              {totalUnread} não lidas
            </MPill>
          </div>
        )}

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 28, color: C.faint, fontSize: 13 }}>
              Carregando…
            </div>
          ) : threads.length === 0 ? (
            <div
              style={{
                padding: 28,
                borderRadius: 14,
                border: `1.5px dashed ${C.borderSoft}`,
                textAlign: 'center',
                color: C.faint,
                fontSize: 13,
              }}
            >
              Sem mensagens.
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.threadId}
                onClick={() => router.push(`/manager/mensagens/${t.threadId}`)}
                aria-label={`Conversa · ${t.unreadCount} não lidas`}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${C.borderSoft}`,
                  background: t.unreadCount > 0 ? C.bg : C.surface,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.ink,
                      letterSpacing: -0.1,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.complaintId ? 'Reclamação' : 'Mensagem'}
                  </span>
                  {t.unreadCount > 0 && (
                    <MPill tone="info" dark={dark}>
                      {t.unreadCount} novas
                    </MPill>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.mute,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {t.lastMessagePreview}
                </div>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                  {new Date(t.lastMessageAt).toLocaleString('pt-BR')}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <MBottomNav dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}

// ─── Thread view ────────────────────────────────────────────────

export interface ScreenStaffMessageThreadProps {
  dark?: boolean;
  tenantSlug: string;
  threadId: string;
}

export function ScreenStaffMessageThread({
  dark,
  tenantSlug,
  threadId,
}: ScreenStaffMessageThreadProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = manager(tenantSlug);
  const [messages, setMessages] = useState<StaffMessageDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.staffMessages
      .getThread(threadId)
      .then((r) => {
        if (cancelled) return;
        setMessages(r.messages);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [threadId, api]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Conversa"
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.back()} ariaLabel="Voltar" />}
      />
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 28, color: C.faint }}>Carregando…</div>
        ) : messages.length === 0 ? (
          <div
            style={{
              padding: 28,
              borderRadius: 14,
              border: `1.5px dashed ${C.borderSoft}`,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Sem mensagens nesta conversa.
          </div>
        ) : (
          messages.map((m) => {
            const isStaff = m.fromRole === 'staff';
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isStaff ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: isStaff ? C.ink : C.bg,
                  color: isStaff ? C.bg : C.ink,
                  border: isStaff ? 'none' : `1px solid ${C.borderSoft}`,
                  fontSize: 13.5,
                  lineHeight: 1.4,
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                    opacity: 0.7,
                  }}
                >
                  {m.staffName ?? (isStaff ? 'Staff' : 'Cliente')} · {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div>{m.content}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
