'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '../../lib/api';
import {
  deleteThread,
  listMessages,
  markRead,
  sendCustomerMessage,
} from '../../lib/api/staff-messages';
import { useSession } from '../../hooks/useSession';
import { useRequireCustomerId } from '../../hooks/useRequireCustomerId';
import { AppShell } from '../../components/layout/AppShell';
import { PillButton } from '../../components/ui/PillButton';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Bubble } from '../../components/ui/Bubble';
import { StaffBubble } from '../../components/ui/StaffBubble';
import type {
  StaffMessageHistoryMessageDto,
  StaffMessageHistoryRoleLabel,
} from '@restaurant/shared-types';

interface ScreenCustomerStaffThreadProps {
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleLabelDisplay(label: StaffMessageHistoryRoleLabel | null): string {
  switch (label) {
    case 'gerente':
      return 'Gerente';
    case 'garçom':
      return 'Garçom';
    case 'host':
      return 'Host';
    case 'cozinha':
      return 'Cozinha';
    default:
      return 'Equipe';
  }
}

/**
 * Detail view for a single staff thread.
 *
 * Bubble visual mirrors the inline /assistente render path on purpose: the
 * staff side uses `<StaffBubble>` (V20 canon — locked component) and the
 * customer's own replies use the generic `<Bubble role="user">` (ink solid,
 * right-aligned). The screen also exposes a thin composer so the customer
 * can reply directly to the staff — the BE persists in Mongo and emits WS
 * (`staff_messages.customer_replied`) for a future staff inbox to pick up.
 *
 * Opening the thread marks every staff-authored unread message as read
 * (POST /threads/:id/read) once on mount.
 */
export function ScreenCustomerStaffThread({
  slug,
  threadId,
}: ScreenCustomerStaffThreadProps) {
  const session = useSession();
  const router = useRouter();
  const ready = useRequireCustomerId(slug);
  const [messages, setMessages] = useState<StaffMessageHistoryMessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingThread, setMissingThread] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listMessages(slug, threadId);
      setMessages(list);
    } catch (err) {
      if (err instanceof ApiRequestError && err.statusCode === 404) {
        setMissingThread(true);
        setMessages([]);
        return;
      }
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Não consegui carregar essa conversa agora.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [slug, threadId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
      // Best-effort mark-as-read; ignora erro pra não bloquear a UI.
      try {
        await markRead(slug, threadId);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, slug, threadId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteThread(slug, threadId);
      router.replace(`/${slug}/staff-messages`);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Não consegui apagar essa conversa agora.';
      setError(message);
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = composerText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendCustomerMessage(slug, threadId, trimmed);
      // Optimistic append using the BE-confirmed messageId+createdAt.
      setMessages((prev) => [
        ...prev,
        {
          messageId: res.messageId,
          fromRole: 'customer',
          fromName: null,
          fromRoleLabel: null,
          content: trimmed,
          createdAt: res.createdAt,
          readAt: null,
        },
      ]);
      setComposerText('');
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Não consegui enviar agora · tente em alguns segundos.';
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const headerDate = useMemo(
    () =>
      messages.length > 0
        ? formatThreadHeaderDate(messages[0].createdAt)
        : '',
    [messages],
  );

  if (!ready) return null;

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      onBack={() => router.push(`/${slug}/staff-messages`)}
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-mute">
          {headerDate}
        </div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
            Mensagens com a equipe
          </h1>
          {!missingThread && (
            <button
              type="button"
              aria-label="Apagar essa conversa"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-full border border-border-soft bg-bg px-3 py-1.5 text-[12px] font-medium text-mute active:bg-surface"
            >
              Apagar
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center text-[13px] text-mute">Carregando…</div>
        )}

        {!loading && missingThread && (
          <div className="rounded-[14px] border border-border-soft bg-surface px-4 py-10 text-center">
            <div className="mb-2 text-[15px] font-medium text-ink">
              Essa conversa não está mais disponível
            </div>
            <div className="mb-5 text-[13px] leading-[1.5] text-mute">
              Ela pode ter sido apagada ou removida automaticamente depois de
              30 dias.
            </div>
            <PillButton
              variant="filled"
              fullWidth
              onClick={() => router.push(`/${slug}/staff-messages`)}
            >
              Voltar pras mensagens
            </PillButton>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          {!missingThread && messages.map((m) => (
            <StaffThreadMessage key={m.messageId} msg={m} />
          ))}
        </div>

        {/* Composer pra resposta do customer pra equipe. Persiste no Mongo
            e emite WS pra inbox futura do staff. */}
        {!missingThread && (
        <form onSubmit={handleSubmit} className="mt-6 flex items-center gap-2">
          <input
            type="text"
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            placeholder="Escreva uma resposta…"
            maxLength={2000}
            disabled={sending}
            className="flex-1 rounded-full border border-border-soft bg-bg px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={!composerText.trim() || sending}
            className="rounded-full border border-ink bg-ink px-5 py-3 text-[13px] font-semibold text-bg disabled:opacity-40"
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
        )}
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

function StaffThreadMessage({ msg }: { msg: StaffMessageHistoryMessageDto }) {
  if (msg.fromRole === 'customer') {
    return <Bubble role="user">{msg.content}</Bubble>;
  }
  // staff — reuse the same StaffBubble used by the inline /assistente render.
  const name = msg.fromName?.split(' ')[0] || 'Equipe';
  const initial = (name[0] ?? 'E').toUpperCase();
  return (
    <StaffBubble
      name={name}
      initial={initial}
      roleLabel={roleLabelDisplay(msg.fromRoleLabel)}
      relativeTime={formatTime(msg.createdAt)}
    >
      {msg.content}
    </StaffBubble>
  );
}
