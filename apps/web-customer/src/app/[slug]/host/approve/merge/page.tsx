'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenCustomerHostApproveMerge } from '../../../../../screens/customer-host-flows/ScreenCustomerHostApproveMerge';
import { useCustomerHostEvents } from '../../../../../hooks/useCustomerHostEvents';
import { useSession } from '../../../../../hooks/useSession';
import { getSessionToken } from '../../../../../lib/storage';
import type { TableMergeRequestDto } from '@restaurant/shared-types';

/**
 * `/[slug]/host/approve/merge` · target-side approval for a table-merge.
 *
 * Mirrors the join page. Reads the request DTO from sessionStorage when
 * available (fast path · WS payload was stashed by `useCustomerHostEvents`)
 * and shows a loading indicator otherwise. We don't have a customer-scoped
 * GET endpoint for individual merge requests yet, so the WS path is the
 * supported way to hydrate this screen — the loading state is a safety net,
 * not the happy path.
 */
export default function HostApproveMergePage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params?.slug ?? '';
  const requestId = search?.get('requestId') ?? null;
  const skipTypewriter = search?.get('cold') === '1';

  const { sessionId, customerId } = useSession();

  const [request, setRequest] = useState<TableMergeRequestDto | null>(null);

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  useEffect(() => {
    if (!requestId || typeof window === 'undefined') return;
    const stashed = window.sessionStorage.getItem(`table-merge:${requestId}`);
    if (stashed) {
      try {
        setRequest(JSON.parse(stashed) as TableMergeRequestDto);
      } catch {
        /* malformed cache — wait for WS */
      }
    }
  }, [requestId]);

  // Stash incoming merge.created events so deep-link refreshes work.
  useCustomerHostEvents({
    sessionId,
    customerId,
    onEvent: (event) => {
      if (event.type === 'table_merge.created') {
        const dto: TableMergeRequestDto = {
          id: event.payload.requestId,
          status: 'pending',
          originTableNumber: event.payload.originTableNumber,
          targetTableNumber: event.payload.targetTableNumber,
          originHostName: event.payload.originHostName,
          targetHostName: event.payload.targetHostName,
          originPartySize: event.payload.originPartySize,
          targetPartySize: event.payload.targetPartySize,
          approvedByAAt: null,
          approvedByBAt: null,
          expiresAt: event.payload.expiresAt,
          createdAt: new Date().toISOString(),
        };
        try {
          window.sessionStorage.setItem(
            `table-merge:${dto.id}`,
            JSON.stringify(dto),
          );
        } catch {
          /* ignore */
        }
        if (requestId === dto.id && !request) {
          setRequest(dto);
        }
      }
    },
  });

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
        <p className="text-[13px] text-mute">Carregando pedido de junção…</p>
      </main>
    );
  }

  return (
    <ScreenCustomerHostApproveMerge
      slug={slug}
      request={request}
      skipTypewriter={skipTypewriter}
      onCloseHref={`/${slug}/assistente?mergeApproved=1&mergeRequestId=${request.id}`}
    />
  );
}
