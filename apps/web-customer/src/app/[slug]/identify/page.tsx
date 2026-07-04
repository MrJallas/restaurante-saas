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
 * Query params:
 *  - `?host=Caleb`        — pre-fills the host name shown in the sub-text.
 *  - `?redirect=/foo`     — overrides the post-submit route.
 *  - `?next=assistente`   — destino pretendido quando isto é só um GATE de CPF
 *    (cliente sentado que perdeu o customerId e foi bouncado por
 *    `useRequireCustomerId` / assistente). Path absoluto ou segmento relativo.
 *  - `?intent=late-arrival` — sinaliza EXPLICITAMENTE o fluxo late-arrival
 *    real (customer B entrando numa mesa ocupada). Sem esse sinal (nem um
 *    `redirect` apontando pra waiting-approval) a tela trata a chegada como
 *    gate: identifica e volta pro `next`/`redirect`, SEM criar
 *    late_arrival_request nem ir pra waiting-approval.
 */
export default function IdentifyPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params?.slug ?? '';
  const hostName = search?.get('host');
  const redirectTo = search?.get('redirect') ?? undefined;
  const next = search?.get('next') ?? undefined;
  const intent = search?.get('intent') === 'late-arrival' ? 'late-arrival' : 'gate';

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
    <ScreenCustomerIdentifyBeforeJoin
      slug={slug}
      intent={intent}
      hostName={hostName}
      redirectTo={redirectTo}
      next={next}
    />
  );
}
