'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenCustomerHostApproveJoin } from '../../../../../screens/customer-host-flows/ScreenCustomerHostApproveJoin';
import { useCustomerHostEvents } from '../../../../../hooks/useCustomerHostEvents';
import { useSession } from '../../../../../hooks/useSession';
import { getSessionToken } from '../../../../../lib/storage';
import { apiGet } from '../../../../../lib/api';
import type { LateArrivalRequestDto } from '@restaurant/shared-types';

/**
 * `/[slug]/host/approve/join` · the host's view to approve a late-arrival.
 *
 * Two ways to land here:
 *  1. Tap on the in-app banner (already has full request data) → `?requestId`
 *  2. Tap on a push notification (cold open) — only the request id is in the
 *     deep link; we fetch the full DTO via `/late-arrival-requests` list
 *     filtered by `requestId`.
 *
 * If the request can't be found (already decided / 404), we route back home
 * with a soft toast — the host doesn't need a hard error here.
 */
export default function HostApproveJoinPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params?.slug ?? '';
  const requestId = search?.get('requestId') ?? null;
  const skipTypewriter = search?.get('cold') === '1';

  const { sessionId, customerId } = useSession();

  // ─── Bootstrap: hydrate the request DTO ─────────────────────────────────
  const [request, setRequest] = useState<LateArrivalRequestDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  useEffect(() => {
    if (!requestId || !slug) return;
    let cancelled = false;
    (async () => {
      try {
        // /:slug/late-arrival-requests is staff-guarded; for customer we'd
        // ideally use a customer-scoped endpoint. Until that's available we
        // rely on the WS payload that brought us here (the deep link should
        // carry the full DTO via session storage). Fall back to a minimal
        // DTO derived from query params when the WS payload is missing.
        const stashed =
          typeof window !== 'undefined'
            ? window.sessionStorage.getItem(`late-arrival:${requestId}`)
            : null;
        if (stashed) {
          if (!cancelled) setRequest(JSON.parse(stashed) as LateArrivalRequestDto);
          return;
        }
        // Last-resort fallback: ask the backend list endpoint. If the session
        // doesn't have staff guard access this will 401 and we'll error out
        // gracefully.
        const list = await apiGet<LateArrivalRequestDto[]>(
          `/${slug}/late-arrival-requests?status=pending`,
        );
        const found = list.find((r) => r.id === requestId);
        if (cancelled) return;
        if (found) {
          setRequest(found);
        } else {
          setLoadError('Pedido não encontrado ou já decidido.');
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar pedido.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, slug]);

  // ─── WS · stash incoming requests so subsequent navigations work ────────
  useCustomerHostEvents({
    sessionId,
    customerId,
    onEvent: (event) => {
      if (event.type === 'late_arrival.created') {
        try {
          // Cache the WS payload by id. When the host taps the banner that
          // pre-rendered the bubble, the deep-link target reads this back
          // synchronously instead of round-tripping the API.
          const stashKey = `late-arrival:${event.payload.requestId}`;
          window.sessionStorage.setItem(
            stashKey,
            JSON.stringify({
              id: event.payload.requestId,
              tableSessionId: event.payload.tableSessionId,
              tableNumber: event.payload.tableNumber,
              requestingCustomerId: event.payload.requesterCustomerId,
              requesterName: event.payload.requesterName,
              visitContext: event.payload.visitContext,
              status: 'pending',
              expiresAt: event.payload.expiresAt,
              respondedAt: null,
              createdAt: new Date().toISOString(),
            } satisfies LateArrivalRequestDto),
          );
        } catch {
          /* sessionStorage blocked — non-fatal */
        }
      }
    },
  });

  if (loadError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-[15px] text-mute">{loadError}</p>
        <button
          type="button"
          onClick={() => router.replace(`/${slug}`)}
          className="rounded-full border-[1.3px] border-ink bg-bg px-6 py-2.5 text-[14px] font-semibold text-ink"
        >
          Voltar pra mesa
        </button>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <div className="flex justify-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="inline-block h-[7px] w-[7px] animate-bounce-dot rounded-full bg-ink"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <p className="text-[13px] text-mute">Carregando pedido…</p>
      </main>
    );
  }

  return (
    <ScreenCustomerHostApproveJoin
      slug={slug}
      request={request}
      skipTypewriter={skipTypewriter}
    />
  );
}
