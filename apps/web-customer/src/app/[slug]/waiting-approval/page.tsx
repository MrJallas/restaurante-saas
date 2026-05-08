'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ScreenCustomerWaitingApproval,
  type WaitingMode,
} from '../../../screens/customer-host-flows/ScreenCustomerWaitingApproval';
import { getSessionToken } from '../../../lib/storage';

/**
 * `/[slug]/waiting-approval` · landing page after the late-arrival /
 * table-merge request is created. Subscribes to WS to watch for the host's
 * decision and bridges to the success/failure screens accordingly.
 *
 * Query params:
 *  - `mode`        : 'late-arrival' | 'merge-target' | 'merge-origin'
 *  - `requestId`   : id of the request to track
 *  - `expiresAt`   : ISO datetime — drives the visible countdown
 *  - `hostName`    : copy hint for the sub-text
 *  - `redirect`    : where to navigate on approval (default `/[slug]`)
 */
export default function WaitingApprovalPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const mode = (search?.get('mode') as WaitingMode | null) ?? 'late-arrival';
  const requestId = search?.get('requestId') ?? null;
  const expiresAt = search?.get('expiresAt') ?? null;
  const hostName = search?.get('hostName') ?? null;
  const redirectTo = search?.get('redirect') ?? undefined;

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  return (
    <ScreenCustomerWaitingApproval
      slug={slug}
      mode={mode}
      requestId={requestId}
      expiresAt={expiresAt}
      hostName={hostName}
      approvedRedirectTo={redirectTo}
    />
  );
}
