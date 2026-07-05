'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from './useSession';

/**
 * Customer guard for routes that REQUIRE `session.customerId`.
 *
 * Old behavior: rotas como /chat-history, /complaints, /orders/{id}/rating
 * faziam render passivo "Faca login na proxima visita" quando o cliente
 * caia ali sem customerId (push notification antiga, deep-link salvo,
 * cookie expirado). Resultado: usuario travado sem CTA, sem caminho de
 * volta. Bug P0 #13 do bug-hunt.
 *
 * Novo comportamento: o hook aguarda o `SessionProvider` rehidratar do
 * sessionStorage (1 frame de tolerancia) e, se mesmo assim nao houver
 * `customerId`, redireciona pra `/{slug}/identify` — fluxo padrao de
 * welcome/recognize do customer-host model. Devolve `false` (loading)
 * enquanto resolve, `true` quando ha customerId valido.
 *
 * O bounce anexa `?next=<rota-atual>` (path absoluto slug-prefixado via
 * `usePathname`, com a query string preservada). O gate de CPF
 * (`ScreenCustomerIdentifyBeforeJoin` → `resolveGateDestination`) LE esse
 * `next` e, apos identificar, devolve o cliente exatamente pra tela que ele
 * queria — em vez de cair no fallback `/{slug}`. `resolveGateDestination`
 * aceita path absoluto interno como este as-is (bloqueia `//` e `http(s)://`
 * pra nao virar open-redirect), entao passar o `pathname` cru e' seguro.
 *
 * Uso:
 *   const ready = useRequireCustomerId(slug);
 *   if (!ready) return null;
 *
 * Nao depende do `isValid` (sessionId) propositalmente — algumas
 * telas chegam via deep-link de push e o sessionId so sera reidratado
 * no proximo POST /sessions; o que importa para essas rotas e o
 * customerId persistido no bundle.
 */
export function useRequireCustomerId(slug: string): boolean {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState<boolean>(!!session.customerId);

  useEffect(() => {
    if (session.customerId) {
      setReady(true);
      return;
    }
    // Da um tick pro SessionProvider rehidratar do sessionStorage antes
    // de bouncar — sem isso, hard-refresh em /chat-history ou similar
    // sempre redirecionava antes do bundle popular customerId.
    const timer = setTimeout(() => {
      if (!session.customerId) {
        // Anexa `?next=<rota-atual>` pra que o gate de CPF devolva o cliente
        // pra tela de onde ele veio (rating/complaints/historico/etc) em vez
        // do fallback `/${slug}`. `pathname` ja' e' absoluto e slug-prefixado
        // (as telas vivem sob `/[slug]/...`), formato que
        // `resolveGateDestination` consome as-is. Preserva a query string
        // original quando houver (ex.: `?tab=x`).
        const query = searchParams?.toString();
        const returnPath = query ? `${pathname}?${query}` : pathname;
        const next = returnPath ? `?next=${encodeURIComponent(returnPath)}` : '';
        router.replace(`/${slug}/identify${next}`);
      } else {
        setReady(true);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [session.customerId, router, slug, pathname, searchParams]);

  return ready;
}
