'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenCustomerIdentifyBeforeJoin } from '../../../screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin';
import { getSessionToken } from '../../../lib/storage';

/**
 * `/[slug]/identify` · GATE DE CPF. Um cliente que já está sentado prova quem
 * é para alcançar uma tela pessoal. Chega aqui por bounce de
 * `useRequireCustomerId`, de `ScreenCustomerMe` ou do assistente.
 *
 * NÃO é entrada de mesa ocupada: chegada tardia começa no QR da mesa
 * (`/mesa/[code]`), vira `session_participant` pendente e quem decide é o host
 * da mesa (System A, decisão de produto V16).
 *
 * Query params:
 *  - `?redirect=/foo`     — destino pós-submit.
 *  - `?next=assistente`   — destino pretendido escrito pelo caller que bouncou.
 *    Path absoluto ou segmento relativo ao slug.
 */
export default function IdentifyPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params?.slug ?? '';
  const redirectTo = search?.get('redirect') ?? undefined;
  const next = search?.get('next') ?? undefined;

  useEffect(() => {
    // Sem session token, voltamos pro fluxo de scan: o slug index ja' explica
    // que o cliente precisa escanear o QR. Sem isso a tela renderizaria, o
    // usuario preenchia, e o POST /customer/identify falharia com 401 sem
    // mensagem clara.
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  return <ScreenCustomerIdentifyBeforeJoin slug={slug} redirectTo={redirectTo} next={next} />;
}
