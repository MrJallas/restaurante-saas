'use client';

// Inbox of staff messages (manager-to-manager, manager-to-staff,
// manager-to-customer threads kept in `assistant_messages`).
// Tap a thread to see the conversation.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  Icon,
  MTopBar,
  MBottomNav,
  MPill,
  GIconBtn,
} from '../../components/manager';
import { manager, type StaffRosterEntry } from '../../lib/api/manager';
import type {
  StaffMessageThreadDto,
  StaffMessageDto,
  StaffInboundThreadDto,
  StaffMessageHistoryMessageDto,
} from '@restaurant/shared-types';
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
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [resolvedManagerId, setResolvedManagerId] = useState(managerId ?? '');
  const [threads, setThreads] = useState<StaffMessageThreadDto[]>([]);
  const [customerThreads, setCustomerThreads] = useState<StaffInboundThreadDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (managerId) {
      setResolvedManagerId(managerId);
      return;
    }
    try {
      setResolvedManagerId(window.localStorage.getItem('staffId') ?? '');
    } catch {
      setResolvedManagerId('');
    }
  }, [managerId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Round 22: dual fetch — staff↔staff threads (legacy inbox) +
      // customer→staff threads (`send_message_to_manager` tool dispatch).
      //
      // Customer→staff inbox must not depend on `managerId`: notification
      // actions route here with only `?slug=...`, and the endpoint itself is
      // staff-key protected, not manager-id protected. Legacy staff↔staff
      // still needs the viewer id for server-side filtering.
      const [staffRes, customerRes] = await Promise.allSettled([
        resolvedManagerId
          ? api.staffMessages.listThreads({ staffId: resolvedManagerId })
          : Promise.resolve([]),
        api.customerInbox.listThreads(),
      ]);
      setThreads(staffRes.status === 'fulfilled' ? staffRes.value : []);
      setCustomerThreads(
        customerRes.status === 'fulfilled' ? customerRes.value : [],
      );
    } finally {
      setLoading(false);
    }
  }, [api, resolvedManagerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh on incoming messages and on read-receipts so the unread-count
  // badge stays in sync when another device marks a thread as read.
  // Round 22: `staff_messages.customer_replied` é o evento emitido pelo
  // appendOutbound quando o customer manda via `send_message_to_manager`.
  useManagerEvents(tenantSlug, (e) => {
    if (
      e.event === 'staff_message.received' ||
      e.event === 'staff_message.read' ||
      e.event === 'staff_messages.customer_replied'
    ) {
      refresh();
    }
  }, { enabled: !!resolvedManagerId, staffId: resolvedManagerId });

  const totalUnread =
    threads.reduce((s, t) => s + t.unreadCount, 0) +
    customerThreads.reduce((s, t) => s + t.unreadCount, 0);

  return (
    <div
      style={{
        height: '100vh',
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
        right={
          <GIconBtn
            dark={dark}
            icon={Icon.plus(20)}
            onClick={() =>
              router.push(
                `/manager/mensagens/nova?slug=${tenantSlug}${
                  resolvedManagerId ? `&staffId=${encodeURIComponent(resolvedManagerId)}` : ''
                }`,
              )
            }
            ariaLabel="Nova conversa"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {totalUnread > 0 && (
          <div style={{ padding: '12px 16px 0' }}>
            <MPill tone="info" dark={dark}>
              {totalUnread} não lidas
            </MPill>
          </div>
        )}

        {/* Customer→manager threads (round 22) — render acima do bloco
           staff↔staff. Categoria visualmente distinta via badge "CLIENTE"
           pra não confundir o operacional do manager. */}
        {!loading && customerThreads.length > 0 && (
          <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                fontFamily: MONO_FONT,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: C.faint,
                padding: '4px 4px 2px',
              }}
            >
              Mensagens de clientes
            </div>
            {customerThreads.map((t) => (
              <button
                key={t.threadId}
                onClick={() =>
                  router.push(
                    `/manager/mensagens/cliente/${encodeURIComponent(t.threadId)}?slug=${tenantSlug}`,
                  )
                }
                aria-label={`Mensagem de cliente · ${t.unreadCount} não lidas`}
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
                    Cliente · Mesa {t.tableSessionId.slice(0, 6)}
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
                  {t.preview}
                </div>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                  {new Date(t.lastMessageAt).toLocaleString('pt-BR')}
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!loading && customerThreads.length > 0 && (
            <div
              style={{
                fontFamily: MONO_FONT,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: C.faint,
                padding: '4px 4px 2px',
              }}
            >
              Equipe
            </div>
          )}
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
                onClick={() =>
                  router.push(
                    `/manager/mensagens/${encodeURIComponent(t.threadId)}?slug=${tenantSlug}`,
                  )
                }
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
                    {t.subject || (t.complaintId ? 'Reclamação' : 'Mensagem')}
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

// ─── New staff conversation ──────────────────────────────────────

export interface ScreenStaffMessageComposeProps {
  dark?: boolean;
  tenantSlug: string;
  managerId?: string;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    manager: 'Gerente',
    waiter: 'Garçom',
    host: 'Recepção',
    cook: 'Cozinha',
    bartender: 'Bar',
    cashier: 'Caixa',
  };
  return labels[role] ?? role;
}

function getStaffEventThreadId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { threadId?: unknown; message?: { threadId?: unknown } };
  if (typeof p.threadId === 'string') return p.threadId;
  if (typeof p.message?.threadId === 'string') return p.message.threadId;
  return null;
}

function extractShiftEndRequestId(content: string): string | null {
  const match = content.match(/SHIFT_END_REQUEST:([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function cleanSystemToken(content: string): string {
  return content.replace(/\n?SHIFT_END_REQUEST:[0-9a-f-]{36}/i, '').trim();
}

export function ScreenStaffMessageCompose({
  dark,
  tenantSlug,
  managerId,
}: ScreenStaffMessageComposeProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [staff, setStaff] = useState<StaffRosterEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StaffRosterEntry | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [myStaffId, setMyStaffId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (managerId) {
      setMyStaffId(managerId);
      return;
    }
    try {
      setMyStaffId(window.localStorage.getItem('staffId') ?? '');
    } catch {
      setMyStaffId('');
    }
  }, [managerId]);

  useEffect(() => {
    let cancelled = false;
    api.staffRoster
      .list({ activeOnly: true })
      .then((rows) => {
        if (cancelled) return;
        setStaff(rows);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const visibleStaff = staff.filter((s) => {
    if (s.id === myStaffId) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      roleLabel(s.role).toLowerCase().includes(q)
    );
  });

  const send = async () => {
    const content = draft.trim();
    if (!selected || !content || sending) return;
    if (!myStaffId) {
      setError('Identidade do staff ausente. Entre no app como staff antes de enviar.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const msg = await api.staffMessages.send({
        recipientStaffId: selected.id,
        subject: selected.name,
        body: content,
      }, { staffId: myStaffId });
      router.replace(
        `/manager/mensagens/${encodeURIComponent(msg.threadId)}?slug=${tenantSlug}&staffId=${encodeURIComponent(myStaffId)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Nova conversa"
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.back()} ariaLabel="Voltar" />}
      />

      <div style={{ padding: '14px 16px 8px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar pessoa da equipe"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            color: C.ink,
            fontFamily: G_FONT,
            fontSize: 14,
            outline: 'none',
            padding: '12px 14px',
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '4px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {visibleStaff.length === 0 ? (
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
            Nenhuma pessoa encontrada.
          </div>
        ) : (
          visibleStaff.map((person) => {
            const active = selected?.id === person.id;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => setSelected(person)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  borderRadius: 12,
                  border: `1px solid ${active ? C.ink : C.borderSoft}`,
                  background: active ? C.bg : C.surface,
                  boxSizing: 'border-box',
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: C.ink,
                    color: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {person.name.slice(0, 2).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13.5,
                      fontWeight: 800,
                      color: C.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {person.name}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: C.mute, fontWeight: 600 }}>
                    {roleLabel(person.role)}
                  </span>
                </span>
                {active && <span style={{ color: C.ink }}>{Icon.check(18)}</span>}
              </button>
            );
          })
        )}
      </div>

      <div
        style={{
          padding: '10px 12px 14px',
          background: C.surface,
          borderTop: `1px solid ${C.borderSoft}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {error && (
          <div
            role="alert"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(220, 38, 38, 0.28)',
              background: 'rgba(254, 226, 226, 0.72)',
              color: '#991b1b',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.35,
              padding: '9px 11px',
            }}
          >
            {error}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          placeholder={
            selected ? `Mensagem para ${selected.name}` : 'Escolha alguém para começar'
          }
          disabled={!selected}
          rows={1}
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 110,
            resize: 'vertical',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            color: C.ink,
            fontFamily: G_FONT,
            fontSize: 14,
            outline: 'none',
            padding: '11px 12px',
          }}
          />
          <button
          type="button"
          onClick={send}
          disabled={!selected || !draft.trim() || sending}
          aria-label="Criar conversa"
          style={{
            all: 'unset',
            cursor: !selected || !draft.trim() || sending ? 'not-allowed' : 'pointer',
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: !selected || !draft.trim() || sending ? C.borderSoft : C.ink,
            color: !selected || !draft.trim() || sending ? C.faint : C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          >
            {Icon.arrow(20)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Thread view ────────────────────────────────────────────────

export interface ScreenStaffMessageThreadProps {
  dark?: boolean;
  tenantSlug: string;
  threadId: string;
  managerId?: string;
}

export function ScreenStaffMessageThread({
  dark,
  tenantSlug,
  threadId,
  managerId,
}: ScreenStaffMessageThreadProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [messages, setMessages] = useState<StaffMessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myStaffId, setMyStaffId] = useState(managerId ?? '');
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null);

  useEffect(() => {
    if (managerId) {
      setMyStaffId(managerId);
      return;
    }
    try {
      setMyStaffId(window.localStorage.getItem('staffId') ?? '');
    } catch {
      setMyStaffId('');
    }
  }, [managerId]);

  const loadMessages = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const r = await api.staffMessages.getThread(
          threadId,
          myStaffId ? { staffId: myStaffId } : undefined,
        );
        setMessages(r.messages ?? []);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [api, threadId, myStaffId],
  );

  useEffect(() => {
    void loadMessages(true);
  }, [loadMessages]);

  useManagerEvents(
    tenantSlug,
    (event) => {
      if (
        event.event !== 'staff_message.received'
        && event.event !== 'staff_message.read'
      ) {
        return;
      }
      if (getStaffEventThreadId(event.payload) === threadId) {
        void loadMessages(false);
      }
    },
    { enabled: !!myStaffId, staffId: myStaffId },
  );

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    try {
      const msg = await api.staffMessages.send({
        threadId,
        body: content,
      }, myStaffId ? { staffId: myStaffId } : undefined);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  const decideShiftEnd = async (
    requestId: string,
    decision: 'approved' | 'rejected',
  ) => {
    if (pendingDecisionId) return;
    setPendingDecisionId(requestId);
    setError('');
    try {
      await api.shifts.decideShiftEnd(requestId, { decision });
      await loadMessages(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível responder ao pedido.');
    } finally {
      setPendingDecisionId(null);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
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
            const isMine = m.fromRole === 'staff' && !!myStaffId && m.staffId === myStaffId;
            const content = m.content ?? (m as unknown as { body?: string }).body ?? '';
            const shiftEndRequestId = extractShiftEndRequestId(content);
            const visibleContent = cleanSystemToken(content);
            const createdAt =
              m.createdAt ?? (m as unknown as { sentAt?: string }).sentAt ?? new Date().toISOString();
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isMine ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: isMine ? C.ink : C.bg,
                  color: isMine ? C.bg : C.ink,
                  border: isMine ? 'none' : `1px solid ${C.borderSoft}`,
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
                  {m.staffName ?? (m.fromRole === 'staff' ? 'Staff' : 'Cliente')} · {new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div>{visibleContent}</div>
                {shiftEndRequestId && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => decideShiftEnd(shiftEndRequestId, 'approved')}
                      disabled={pendingDecisionId === shiftEndRequestId}
                      style={{
                        border: 'none',
                        borderRadius: 8,
                        background: isMine ? C.bg : C.ink,
                        color: isMine ? C.ink : C.bg,
                        padding: '7px 10px',
                        fontFamily: G_FONT,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: pendingDecisionId ? 'wait' : 'pointer',
                      }}
                    >
                      Aceitar
                    </button>
                    <button
                      type="button"
                      onClick={() => decideShiftEnd(shiftEndRequestId, 'rejected')}
                      disabled={pendingDecisionId === shiftEndRequestId}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${isMine ? C.bg : C.borderSoft}`,
                        background: 'transparent',
                        color: isMine ? C.bg : C.ink,
                        padding: '7px 10px',
                        fontFamily: G_FONT,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: pendingDecisionId ? 'wait' : 'pointer',
                      }}
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div
        style={{
          padding: '10px 12px 14px',
          background: C.surface,
          borderTop: `1px solid ${C.borderSoft}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {error && (
          <div
            role="alert"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(220, 38, 38, 0.28)',
              background: 'rgba(254, 226, 226, 0.72)',
              color: '#991b1b',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.35,
              padding: '9px 11px',
            }}
          >
            {error}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          placeholder="Responder..."
          rows={1}
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 110,
            resize: 'vertical',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            color: C.ink,
            fontFamily: G_FONT,
            fontSize: 14,
            outline: 'none',
            padding: '11px 12px',
          }}
          />
          <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          aria-label="Enviar resposta"
          style={{
            all: 'unset',
            cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer',
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: !draft.trim() || sending ? C.borderSoft : C.ink,
            color: !draft.trim() || sending ? C.faint : C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          >
            {Icon.arrow(20)}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ScreenCustomerStaffMessageThreadProps {
  dark?: boolean;
  tenantSlug: string;
  threadId: string;
}

export function ScreenCustomerStaffMessageThread({
  dark,
  tenantSlug,
  threadId,
}: ScreenCustomerStaffMessageThreadProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [messages, setMessages] = useState<StaffMessageHistoryMessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.customerInbox
      .getThread(threadId)
      .then((rows) => {
        if (cancelled) return;
        setMessages(rows ?? []);
        return api.customerInbox.markRead(threadId).catch(() => undefined);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [threadId, api]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    try {
      const msg = await api.customerInbox.sendReply(threadId, { content });
      setMessages((prev) => [...prev, msg]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a resposta.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Mensagem do cliente"
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
                key={m.messageId}
                style={{
                  alignSelf: isStaff ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
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
                  {isStaff ? m.fromName ?? 'Staff' : 'Cliente'} · {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div>{m.content}</div>
              </div>
            );
          })
        )}
      </div>
      <div
        style={{
          padding: '10px 12px 14px',
          background: C.surface,
          borderTop: `1px solid ${C.borderSoft}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {error && (
          <div
            role="alert"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(220, 38, 38, 0.28)',
              background: 'rgba(254, 226, 226, 0.72)',
              color: '#991b1b',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.35,
              padding: '9px 11px',
            }}
          >
            {error}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          placeholder="Responder ao cliente..."
          rows={1}
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 110,
            resize: 'vertical',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            color: C.ink,
            fontFamily: G_FONT,
            fontSize: 14,
            outline: 'none',
            padding: '11px 12px',
          }}
          />
          <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          aria-label="Enviar resposta"
          style={{
            all: 'unset',
            cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer',
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: !draft.trim() || sending ? C.borderSoft : C.ink,
            color: !draft.trim() || sending ? C.faint : C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          >
            {Icon.arrow(20)}
          </button>
        </div>
      </div>
    </div>
  );
}
