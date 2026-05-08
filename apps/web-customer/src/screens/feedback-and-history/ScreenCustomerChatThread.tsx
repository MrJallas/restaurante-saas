'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '../../lib/api';
import { listMessages, deleteThread } from '../../lib/api/chat-history';
import { useSession } from '../../hooks/useSession';
import { AppShell } from '../../components/layout/AppShell';
import { PillButton } from '../../components/ui/PillButton';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Bubble } from '../../components/ui/Bubble';
import { ManagerBubble } from '../../components/ui/ManagerBubble';
import { ToolCallIndicator } from '../../components/ui/ToolCallIndicator';
import type { ChatMessageDto, ChatToolCall } from '@restaurant/shared-types';

interface ScreenCustomerChatThreadProps {
  slug: string;
  threadId: string;
}

function formatThreadHeaderDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${yy}`;
}

/**
 * Read-only chat thread view · per `chat-history-lgpd.md`.
 *
 * Renders the historical thread (user, assistant, manager, system roles).
 * Composer is intentionally absent — the thread CANNOT be continued; that's
 * a hard product decision in the spec ("ESTE CHAT É SOMENTE LEITURA").
 *
 * Tool calls render as a collapsed `ToolCallIndicator` so the user sees the
 * audit trail without overwhelming the conversation flow.
 */
export function ScreenCustomerChatThread({
  slug,
  threadId,
}: ScreenCustomerChatThreadProps) {
  const session = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await listMessages(slug, threadId);
        if (!cancelled) setMessages(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.statusCode === 410) {
          // Per spec: auto-deletion mid-view returns 410, FE redirects.
          router.replace(`/${slug}/chat-history`);
          return;
        }
        const message =
          err instanceof ApiRequestError
            ? err.message
            : 'Não consegui carregar essa conversa agora.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, threadId, router]);

  const handleDelete = async () => {
    if (!session.customerId) return;
    setDeleting(true);
    try {
      await deleteThread(slug, threadId, session.customerId);
      router.replace(`/${slug}/chat-history`);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Não consegui apagar essa conversa agora.';
      setError(message);
      setDeleting(false);
    }
  };

  const headerDate = messages.length > 0
    ? formatThreadHeaderDate(messages[0].createdAt)
    : '';

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      onBack={() => router.push(`/${slug}/chat-history`)}
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-mute">
          {headerDate}
        </div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
            Conversa antiga
          </h1>
          <button
            type="button"
            aria-label="Apagar este chat"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full border border-border-soft bg-bg px-3 py-1.5 text-[12px] font-medium text-mute active:bg-surface"
          >
            Apagar
          </button>
        </div>
        <div className="mb-4 self-start rounded-full bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-mute">
          Este chat é somente leitura · não pode ser continuado
        </div>

        {error && (
          <div className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center text-[13px] text-mute">Carregando…</div>
        )}

        <div className="flex flex-col gap-3.5">
          {messages.map((m) => (
            <ChatHistoryMessage key={m.messageId} msg={m} />
          ))}
        </div>
      </div>

      <BottomSheet
        open={confirmingDelete}
        onClose={() => (deleting ? null : setConfirmingDelete(false))}
        ariaLabel="Confirmar exclusão"
      >
        <h2 className="mb-2 text-[18px] font-semibold tracking-[-0.02em] text-ink">
          Apagar essa conversa?
        </h2>
        <p className="mb-6 text-[14px] leading-[1.5] text-mute">
          Vai sumir {messages.length}{' '}
          {messages.length === 1 ? 'mensagem' : 'mensagens'} · não tem volta.
        </p>
        <div className="flex flex-col gap-2.5">
          <PillButton
            variant="filled"
            fullWidth
            onClick={handleDelete}
            disabled={deleting}
            className="!bg-danger !border-danger"
          >
            {deleting ? 'Apagando…' : 'Apagar'}
          </PillButton>
          <PillButton
            variant="outline"
            fullWidth
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
          >
            Cancelar
          </PillButton>
        </div>
      </BottomSheet>
    </AppShell>
  );
}

function ChatHistoryMessage({ msg }: { msg: ChatMessageDto }) {
  if (msg.role === 'user') {
    return <Bubble role="user">{msg.content}</Bubble>;
  }
  if (msg.role === 'manager') {
    return (
      <ManagerBubble
        name="Renata"
        role="Gerente"
        when={new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      >
        {msg.content}
      </ManagerBubble>
    );
  }
  if (msg.role === 'system') {
    return (
      <div className="self-center rounded-full bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-faint">
        {msg.content}
      </div>
    );
  }
  // assistant
  return (
    <div className="flex flex-col gap-2">
      <Bubble role="ai">{msg.content}</Bubble>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="ml-2 flex flex-wrap gap-2">
          {msg.toolCalls.map((tc: ChatToolCall, i) => (
            <ToolCallIndicator
              key={`${tc.name}-${i}`}
              name={tc.name}
              category="info"
            />
          ))}
        </div>
      )}
      {msg.suggestionChips && msg.suggestionChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 opacity-50">
          {msg.suggestionChips.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="inline-flex items-center rounded-full border border-border-soft bg-bg px-3 py-1.5 text-[12px] text-mute"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
