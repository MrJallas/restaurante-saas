'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getComplaint,
  listMyComplaints,
  readCachedComplaint,
  cacheComplaint,
  type ComplaintRecord,
} from '../../lib/api/feedback';
import { useSession } from '../../hooks/useSession';
import { useRequireCustomerId } from '../../hooks/useRequireCustomerId';
import { useComplaintEvents } from '../../hooks/useComplaintEvents';
import { AppShell } from '../../components/layout/AppShell';
import { PillButton } from '../../components/ui/PillButton';
import { Bubble } from '../../components/ui/Bubble';
import {
  ManagerBubble,
  type ManagerChipActionKind,
} from '../../components/ui/ManagerBubble';
import { BottomSheet } from '../../components/ui/BottomSheet';
import type { ComplaintChipAction } from '@restaurant/shared-types';

interface ScreenCustomerComplaintWaitingProps {
  slug: string;
  complaintId: string;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'manager';
  content: string;
  chipAction?: ManagerChipActionKind | null;
  staffName?: string;
  when?: string;
}

function ratingStars(n: number | null): string {
  if (!n) return '';
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes === 1) return 'há 1 min';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'há 1 h';
  if (hours < 24) return `há ${hours} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

/**
 * Complaint waiting screen · per `complaint-flow-v12.md`.
 *
 * Shows the customer's bubble at the top and the manager's response (if any)
 * as a `ManagerBubble`. When the response hasn't arrived yet, displays a
 * reassuring spinner with ETA. Subscribes to `complaint.responded` and
 * `complaint.resolved` to live-update.
 *
 * "Ver outras reclamações" opens a sheet with the customer's prior complaints
 * — useful when re-visiting after multiple complaints in the same session.
 */
export function ScreenCustomerComplaintWaiting({
  slug,
  complaintId,
}: ScreenCustomerComplaintWaitingProps) {
  const session = useSession();
  const router = useRouter();
  // P0: openOthers() depende de customerId. Sem ele, bouncamos pro
  // /identify em vez de manter o usuario travado em "Sua reclamacao".
  const ready = useRequireCustomerId(slug);
  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<ComplaintRecord[]>([]);
  const [loadingOthers, setLoadingOthers] = useState(false);
  const [resolved, setResolved] = useState(false);

  // Initial load · the BE has no customer-facing GET endpoint today, so we
  // start from the sessionStorage cache (populated by the composer on
  // create). The GET fallback is kept for future BE work — if it 404s or
  // 401s we silently fall back to whatever's in the cache.
  useEffect(() => {
    let cancelled = false;
    const cached = readCachedComplaint(complaintId);
    if (cached) setComplaint(cached);
    // Best-effort GET — when the BE adds the route it will populate fresh
    // data; today it 404s, so any error is silently absorbed.
    async function load() {
      try {
        const data = await getComplaint(slug, complaintId);
        if (!cancelled) {
          setComplaint(data);
          cacheComplaint(data);
        }
      } catch {
        // Silent fallback — cache or empty state takes over.
        if (!cancelled && !cached) {
          setError(
            'Sua reclamação foi registrada · acompanhe a resposta aqui.',
          );
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, complaintId]);

  // Live updates from the manager's actions.
  useComplaintEvents(session.sessionId, (evt) => {
    if (evt.event === 'complaint.responded') {
      if (evt.payload.complaintId !== complaintId) return;
      setComplaint((prev) =>
        prev
          ? {
              ...prev,
              status: 'responded',
              responseText: evt.payload.content,
              responseAt: new Date().toISOString(),
            }
          : prev,
      );
    } else if (evt.event === 'complaint.resolved') {
      if (evt.payload.complaintId !== complaintId) return;
      setResolved(true);
      setComplaint((prev) =>
        prev ? { ...prev, status: 'closed', closedAt: evt.payload.resolvedAt } : prev,
      );
    }
  });

  const openOthers = async () => {
    setShowOthers(true);
    if (others.length > 0 || !session.customerId) return;
    setLoadingOthers(true);
    try {
      const list = await listMyComplaints(slug, session.customerId);
      setOthers(list.filter((c) => c.id !== complaintId));
    } catch {
      // ignore — keep an empty list, not critical
    } finally {
      setLoadingOthers(false);
    }
  };

  // Map BE chipAction string union (with possible nulls) into the typed FE
  // primitive prop. The BE serializes the chipAction as string in the WS
  // payload.
  const responseChip: ManagerChipActionKind | null =
    (complaint?.responseText && (complaint as { chipAction?: ComplaintChipAction }).chipAction) ||
    null;

  const messages: ThreadMessage[] = (() => {
    if (!complaint) return [];
    const list: ThreadMessage[] = [
      {
        id: `customer-${complaint.id}`,
        role: 'user',
        content: complaint.text,
        when: formatRelative(complaint.submittedAt),
      },
    ];
    if (complaint.responseText) {
      list.push({
        id: `manager-${complaint.id}`,
        role: 'manager',
        content: complaint.responseText,
        chipAction: responseChip,
        when: formatRelative(complaint.responseAt),
      });
    }
    return list;
  })();

  if (!ready) return null;

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      onBack={() => router.push(`/${slug}`)}
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-mute">
          Sua reclamação · protocolo {complaintId.slice(0, 8).toUpperCase()}
        </div>
        <h1 className="mb-1 text-[20px] font-semibold tracking-[-0.02em] text-ink">
          {resolved
            ? 'Resolvida'
            : complaint?.status === 'responded'
              ? 'Renata respondeu'
              : 'Renata foi avisada'}
        </h1>
        {complaint && (complaint.rating ?? 0) > 0 && (
          <div className="mb-2 text-[12px] text-mute">
            Avaliação: {ratingStars(complaint.rating)}
          </div>
        )}
        <p className="mb-5 text-[13px] leading-[1.5] text-mute">
          {resolved
            ? 'A gerência marcou como resolvida. Se algo ainda incomoda, é só falar.'
            : complaint?.status === 'responded'
              ? 'Confira a resposta abaixo.'
              : 'Costuma responder em ~2 min · você verá a resposta aqui mesmo.'}
        </p>

        {error && (
          <div className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          {messages.map((msg) =>
            msg.role === 'user' ? (
              <Bubble key={msg.id} role="user">
                {msg.content}
              </Bubble>
            ) : (
              <ManagerBubble
                key={msg.id}
                name="Renata"
                role="Gerente"
                when={msg.when ?? 'agora'}
                chipAction={msg.chipAction ?? null}
              >
                {msg.content}
              </ManagerBubble>
            ),
          )}

          {/* Awaiting response · reassurance spinner */}
          {complaint && !complaint.responseText && !resolved && (
            <div className="flex items-center gap-2 self-start rounded-full border border-border-soft bg-surface px-3.5 py-2 text-[12px] text-mute">
              <span className="inline-flex gap-[3px]">
                <span className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-mute" />
                <span
                  className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-mute"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-mute"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
              Renata está respondendo
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-2.5">
          <PillButton
            variant="outline"
            fullWidth
            onClick={() => router.push(`/${slug}`)}
          >
            Voltar pra mesa
          </PillButton>
          <button
            type="button"
            onClick={openOthers}
            className="self-center text-[12px] text-mute underline-offset-2 hover:text-ink hover:underline"
          >
            Ver outras reclamações
          </button>
        </div>

        {showOthers && (
          <BottomSheet
            open={showOthers}
            onClose={() => setShowOthers(false)}
            ariaLabel="Suas outras reclamações"
          >
            <h2 className="mb-4 text-[18px] font-semibold tracking-[-0.02em] text-ink">
              Suas outras reclamações
            </h2>
            <div className="flex flex-col gap-2.5">
              {loadingOthers && (
                <div className="text-center text-[13px] text-mute">
                  Carregando…
                </div>
              )}
              {!loadingOthers && others.length === 0 && (
                <div className="text-center text-[13px] text-mute">
                  Nenhuma outra reclamação por aqui.
                </div>
              )}
              {others.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setShowOthers(false);
                    router.push(`/${slug}/complaints/${c.id}`);
                  }}
                  className="flex flex-col gap-1 rounded-[12px] border border-border-soft bg-bg px-3.5 py-3 text-left active:bg-surface"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-mute">
                    {formatRelative(c.submittedAt)} · {c.status}
                  </span>
                  <span className="line-clamp-2 text-[13px] text-ink">
                    {c.text}
                  </span>
                </button>
              ))}
            </div>
          </BottomSheet>
        )}
      </div>
    </AppShell>
  );
}
