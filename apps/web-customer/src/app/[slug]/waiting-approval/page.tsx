'use client';

import { useParams, useSearchParams } from 'next/navigation';
import {
  ScreenCustomerWaitingApproval,
  type WaitingMode,
} from '../../../screens/customer-host-flows/ScreenCustomerWaitingApproval';
import { toTenantInternalPath } from '../../../lib/safe-internal-path';
import { parseWaitingMode } from '../../../lib/waiting-approval-state';

/**
 * `/[slug]/waiting-approval` · landing page depois que um pedido de JUNÇÃO DE
 * MESAS é criado. Subscribes to WS to watch for the host's decision and
 * bridges to the success/failure screens accordingly.
 *
 * Chegada tardia NÃO passa por esta rota: o System A monta a mesma tela
 * inline em `/mesa/[tableCode]` (PendingApprovalWrapper), com o estado vindo
 * de `participant:decision`. Um deep-link sem `mode` cai no modo
 * 'late-arrival', que aqui não tem fonte autoritativa e por isso é
 * fail-closed ("Não consegui confirmar").
 *
 * Query params:
 *  - `mode`        : 'merge-target' | 'merge-origin' (default 'late-arrival',
 *                    sem fonte REST — ver acima)
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
