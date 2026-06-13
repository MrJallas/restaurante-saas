'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenCustomerIdentifyBeforeJoin } from '../../../screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin';
import { getSessionToken } from '../../../lib/storage';

/**
 * `/[slug]/identify` · CPF-gate before late-arrival join. Per
 * docs/features/customer-host-model.md.
 *
 * Two ways to land here:
 *  1. Customer B scans QR of an occupied table → `/mesa/[code]` redirects
 *     here when no `recognition_token` cookie exists
 *  2. Direct link from staff (rare) — same UX, just no implicit context
 *
 * Optional `?host=Caleb&redirect=/foo` query params let the caller pre-fill
 * the host name shown in the sub-text and override the post-submit route.
 */
export default function IdentifyPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params?.slug ?? '';
  const hostName = search?.get('host');
  const redirectTo = search?.get('redirect') ?? undefined;

  useEffect(() => {
    // Sem session token, voltamos pro fluxo de scan: o slug index ja' explica
    // que o cliente precisa escanear o QR. Sem isso a tela renderizaria, o
    // usuario preenchia, e o POST /customer/identify falharia com 401 sem
    // mensagem clara.
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  return (
    <ScreenCustomerIdentifyBeforeJoin slug={slug} hostName={hostName} redirectTo={redirectTo} />
  );
}
