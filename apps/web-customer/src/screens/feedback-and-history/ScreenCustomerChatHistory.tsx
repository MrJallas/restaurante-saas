'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '../../lib/api';
import { listThreads, deleteThread, deleteAllThreads } from '../../lib/api/chat-history';
import { useSession } from '../../hooks/useSession';
import { useRequireCustomerId } from '../../hooks/useRequireCustomerId';
import { AppShell } from '../../components/layout/AppShell';
import { PillButton } from '../../components/ui/PillButton';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { shouldShowEmptyListState } from '../../lib/async-list-state';
import type { ChatThreadDto } from '@restaurant/shared-types';

interface ScreenCustomerChatHistoryProps {
  slug: string;
}

function formatDateDayLabel(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const months = [
    'JAN',
    'FEV',
    'MAR',
    'ABR',
    'MAI',
    'JUN',
    'JUL',
    'AGO',
    'SET',
    'OUT',
    'NOV',
    'DEZ',
  ];
  return `${day} ${months[d.getMonth()]} · ${d.getFullYear()}`;
}

function formatThreadDateTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const months = [
    'JAN',
    'FEV',
    'MAR',
    'ABR',
    'MAI',
    'JUN',
    'JUL',
    'AGO',
    'SET',
    'OUT',
    'NOV',
    'DEZ',
  ];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${months[d.getMonth()]} · ${hh}:${mm}`;
}

/**
 * Chat history list · per `chat-history-lgpd.md`.
 *
 * Renders the customer's chat threads grouped by day with a delete CTA on
 * each row + a destructive "Apagar todo o histórico" footer button. The
 * delete-all path is the SAME endpoint the LGPD erasure tool calls, so the
 * behavior is uniform: NoSQL chat data is wiped, customer cadastro stays.
 *
 * Empty-state copy is verbatim from the spec — do not paraphrase.
 */
export function ScreenCustomerChatHistory({ slug }: ScreenCustomerChatHistoryProps) {
  const session = useSession();
  const router = useRouter();
  // P0 guard: rotas que dependem de customerId nao podem mais mostrar
  // estado passivo "faca login na proxima visita" — bouncamos pro
  // /identify pra dar uma CTA real ao usuario.
  const ready = useRequireCustomerId(slug);
  const [threads, setThreads] = useState<ChatThreadDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    { kind: 'one'; threadId: string; messageCount: number } | { kind: 'all' } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!session.customerId) {
        setLoading(false);
        return;
      }
      try {
        const list = await listThreads(slug);
        if (!cancelled) setThreads(list);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiRequestError ? err.message : 'Não consegui carregar o histórico agora.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, session.customerId]);

  // Group threads by day (YYYY-MM-DD) for the eyebrow labels.
  const grouped = (() => {
    const map = new Map<string, ChatThreadDto[]>();
    for (const t of threads) {
      const d = new Date(t.lastMessageAt);
      const key = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

  const handleDeleteOne = async () => {
    if (!confirming || confirming.kind !== 'one' || !session.customerId) return;
    setDeleting(true);
    try {
      await deleteThread(slug, confirming.threadId);
      setThreads((prev) => prev.filter((t) => t.threadId !== confirming.threadId));
      setConfirming(null);
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : 'Não consegui apagar essa conversa agora.';
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirming || confirming.kind !== 'all' || !session.customerId) return;
    setDeleting(true);
    try {
      await deleteAllThreads(slug);
      setThreads([]);
      setConfirming(null);
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : 'Não consegui apagar tudo agora.';
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  // Guard: o hook ja redirecionou pra /identify; nao renderiza nada
  // ate o customerId estar resolvido (evita flash do empty-state passivo).
  if (!ready) return null;

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      activeHref={`/${slug}/chat-history`}
      onBack={() => router.back()}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Conversas com IA
        </h1>
        <p className="mb-5 text-[13px] leading-[1.5] text-mute">
          Suas conversas com o assistente · 30 dias atrás até hoje.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]"
          >
            {error}
          </div>
        )}

        {shouldShowEmptyListState(loading, error, threads.length) && (
          <div className="rounded-[14px] border border-border-soft bg-surface px-4 py-10 text-center">
            <div className="mb-2 text-[15px] font-medium text-ink">
              Nenhuma conversa por aqui ainda
            </div>
            <div className="text-[13px] leading-[1.5] text-mute">
              Suas conversas com a IA aparecem aqui · ficam por 30 dias antes de sumir.
            </div>
          </div>
        )}

        {loading && <div className="text-center text-[13px] text-mute">Carregando…</div>}

        {threads.length > 0 && (
          <div className="flex flex-col gap-5">
            {grouped.map(([key, items]) => (
              <div key={key} className="flex flex-col gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-faint">
                  {formatDateDayLabel(items[0].lastMessageAt)}
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((t) => (
                    <div
                      key={t.threadId}
                      className="rounded-[14px] border border-border-soft bg-bg p-3.5 active:bg-surface"
                    >
                      <button
                        type="button"
                        className="block w-full text-left"
                        onClick={() => router.push(`/${slug}/chat-history/${t.threadId}`)}
                      >
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[1.2px] text-faint">
                          {formatThreadDateTime(t.lastMessageAt)}
                        </div>
                        <div className="line-clamp-2 text-[14px] leading-[1.4] text-ink">
                          {t.preview || 'Conversa sem prévia disponível'}
                        </div>
                        <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-mute">
                          {t.messageCount} {t.messageCount === 1 ? 'MENSAGEM' : 'MENSAGENS'}
                        </div>
                      </button>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirming({
                              kind: 'one',
                              threadId: t.threadId,
                              messageCount: t.messageCount,
                            })
                          }
                          className="text-[11px] font-medium text-mute underline-offset-2 hover:text-danger hover:underline"
                        >
                          Apagar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {threads.length > 0 && (
          <div className="mt-8 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setConfirming({ kind: 'all' })}
              className="rounded-full border-[1.3px] border-danger bg-bg px-6 py-3.5 text-[15px] font-medium text-danger active:bg-[#fbe9e7]"
            >
              Apagar todo o histórico
            </button>
            <p className="px-2 text-center text-[10px] font-semibold uppercase leading-[1.5] tracking-[1.2px] text-faint">
              Suas conversas ficam aqui por 30 dias e são apagadas automaticamente · LGPD Art. 18
            </p>
          </div>
        )}
      </div>

      <BottomSheet
        open={!!confirming}
        onClose={() => (deleting ? null : setConfirming(null))}
        ariaLabel="Confirmar exclusão"
      >
        {confirming?.kind === 'all' && (
          <>
            <h2 className="mb-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
              Apagar todo o histórico?
            </h2>
            <p className="mb-6 text-[14px] leading-[1.5] text-mute">
              Vai sumir todas as suas conversas · não tem volta.
            </p>
            <div className="flex flex-col gap-2.5">
              <PillButton
                variant="filled"
                fullWidth
                onClick={handleDeleteAll}
                disabled={deleting}
                className="!bg-danger !border-danger"
              >
                {deleting ? 'Apagando…' : 'Sim, apagar tudo'}
              </PillButton>
              <PillButton
                variant="outline"
                fullWidth
                onClick={() => setConfirming(null)}
                disabled={deleting}
              >
                Cancelar
              </PillButton>
            </div>
          </>
        )}
        {confirming?.kind === 'one' && (
          <>
            <h2 className="mb-2 text-[18px] font-semibold tracking-[-0.02em] text-ink">
              Apagar essa conversa?
            </h2>
            <p className="mb-6 text-[14px] leading-[1.5] text-mute">
              Vai sumir {confirming.messageCount}{' '}
              {confirming.messageCount === 1 ? 'mensagem' : 'mensagens'} · não tem volta.
            </p>
            <div className="flex flex-col gap-2.5">
              <PillButton
                variant="filled"
                fullWidth
                onClick={handleDeleteOne}
                disabled={deleting}
                className="!bg-danger !border-danger"
              >
                {deleting ? 'Apagando…' : 'Apagar'}
              </PillButton>
              <PillButton
                variant="outline"
                fullWidth
                onClick={() => setConfirming(null)}
                disabled={deleting}
              >
                Cancelar
              </PillButton>
            </div>
          </>
        )}
      </BottomSheet>
    </AppShell>
  );
}
