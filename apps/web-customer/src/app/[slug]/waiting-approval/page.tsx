'use client';

import { useParams, useSearchParams } from 'next/navigation';
import {
  ScreenCustomerWaitingApproval,
  type WaitingMode,
} from '../../../screens/customer-host-flows/ScreenCustomerWaitingApproval';
import { toTenantInternalPath } from '../../../lib/safe-internal-path';
import { parseWaitingMode } from '../../../lib/waiting-approval-state';

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
  const slug = params?.slug ?? '';

  const mode: WaitingMode = parseWaitingMode(search?.get('mode'));
  const requestId = search?.get('requestId') ?? null;
  const expiresAt = search?.get('expiresAt') ?? null;
  const hostName = search?.get('hostName') ?? null;
  const redirectTo = toTenantInternalPath(search?.get('redirect'), slug) ?? undefined;

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
