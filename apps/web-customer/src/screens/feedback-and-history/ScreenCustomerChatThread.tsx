'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '../../lib/api';
import { listMessages, deleteThread } from '../../lib/api/chat-history';
import { useSession } from '../../hooks/useSession';
import { useRequireCustomerId } from '../../hooks/useRequireCustomerId';
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

const WEEKDAYS_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const MONTHS_PT = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
];

/**
 * Round 22 §C — eyebrow canon V20 pra separar grupos por dia
 * ("QUI 14 MAI" ou "QUI 14 MAI 2025" quando ano não é o atual). Usado
 * acima do 1º bubble de cada day group em `ScreenCustomerChatThread`.
 *
 * Fallback "" pra ISO inválido — caller renderiza grupo sem eyebrow em
 * vez de "Invalid Date".
 */
function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = WEEKDAYS_PT[d.getDay()];
  const date = String(d.getDate()).padStart(2, '0');
  const month = MONTHS_PT[d.getMonth()];
  const currentYear = new Date().getFullYear();
  return d.getFullYear() === currentYear
    ? `${weekday} ${date} ${month}`
    : `${weekday} ${date} ${month} ${d.getFullYear()}`;
}

interface DayGroup {
  day: string;
  label: string;
  items: ChatMessageDto[];
}

/**
 * Round 22 §C — agrupa mensagens por dia (YYYY-MM-DD local) preservando
 * ordem cronológica (input já vem sorted por createdAt ASC do backend).
 * Cada grupo carrega seu label canon ("QUI 14 MAI") pronto pro eyebrow.
 */
function groupMessagesByDay(messages: ChatMessageDto[]): DayGroup[] {
  const groups = new Map<string, ChatMessageDto[]>();
  for (const m of messages) {
    const d = new Date(m.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const arr = groups.get(day) ?? [];
    arr.push(m);
    groups.set(day, arr);
  }
  return Array.from(groups.entries()).map(([day, items]) => ({
    day,
    label: formatDayLabel(items[0].createdAt),
    items,
  }));
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
  // P0: delete depende de customerId; o thread visualizado tambem so faz
  // sentido com customer identificado.
  const ready = useRequireCustomerId(slug);
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

  const dayGroups = useMemo(() => groupMessagesByDay(messages), [messages]);

  if (!ready) return null;

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      onBack={() => router.push(`/${slug}/chat-history`)}
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <div className="mb-4 flex items-center justify-between">
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

        {error && (
          <div className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center text-[13px] text-mute">Carregando…</div>
        )}

        {/* Round 22 §C — grouping canônico V20: cada dia ganha um eyebrow
            mono uppercase ("QUI 14 MAI") logo acima do 1º bubble. Bubbles
            mantêm gap-3.5 entre eles, e o gap entre grupos vira gap-5
            (espaço visual extra que sinaliza "outra data"). */}
        <div className="flex flex-col gap-5">
          {dayGroups.map((group) => (
            <div key={group.day} className="flex flex-col gap-3.5">
              {group.label && (
                <div className="self-center mt-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-faint">
                  {group.label}
                </div>
              )}
              {group.items.map((m) => (
                <ChatHistoryMessage key={m.messageId} msg={m} />
              ))}
            </div>
          ))}
        </div>

        {!loading && messages.length > 0 && (
          <div className="mt-8 flex flex-col gap-1.5">
            <PillButton
              variant="filled"
              fullWidth
              onClick={() => router.push(`/${slug}/assistente?threadId=${encodeURIComponent(threadId)}`)}
            >
              Continuar nessa conversa
            </PillButton>
            <p className="px-2 pt-1 text-center text-[10px] font-semibold uppercase leading-[1.5] tracking-[1.2px] text-faint">
              Retomamos daqui · novas mensagens entram no mesmo histórico
            </p>
          </div>
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

type ToolCategory =
  | 'menu'
  | 'order'
  | 'session'
  | 'info'
  | 'staff'
  | 'payment'
  | 'destructive'
  | 'lgpd';

/**
 * Round 22 §C — espelha o categorizer de `/assistente/page.tsx` pra
 * pintar o `ToolCallIndicator` com a cor certa no histórico. Default
 * 'info' (cinza) pra nomes não-canônicos. Mantém os 2 lugares em sync.
 */
function categorizeToolName(name: string): ToolCategory {
  if (name === 'view_menu' || name === 'search_dish' || name === 'check_allergens' || name === 'compare_dishes') return 'menu';
  if (name === 'add_to_order' || name === 'view_order' || name === 'place_order') return 'order';
  if (name === 'call_waiter' || name === 'send_complaint' || name === 'send_message_to_manager') return 'staff';
  if (name === 'request_bill' || name === 'split_bill' || name === 'pay_individual' || name === 'pay_full' || name === 'open_payment_screen') return 'payment';
  if (name === 'lgpd_data_request' || name === 'lgpd_notice') return 'lgpd';
  if (name === 'delete_chat' || name === 'delete_all_chats') return 'destructive';
  if (name === 'request_table_merge' || name === 'late_arrival') return 'session';
  return 'info';
}

function formatBubbleTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
        when={formatBubbleTime(msg.createdAt)}
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
  // assistant — bubble + tool indicators (categorizadas) + chips (decay
  // visual com opacity, sinaliza que são histórico não-clicável).
  return (
    <div className="flex flex-col items-start gap-2">
      <Bubble role="ai">{msg.content}</Bubble>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="ml-2 flex flex-wrap gap-2">
          {msg.toolCalls.map((tc: ChatToolCall, i) => (
            <ToolCallIndicator
              key={`${tc.name}-${i}`}
              name={tc.name}
              category={categorizeToolName(tc.name)}
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
