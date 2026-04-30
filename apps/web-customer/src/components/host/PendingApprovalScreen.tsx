'use client';

import { useEffect, useState } from 'react';
import { useSession } from '../../hooks/useSession';
import { useTableSocket } from '../../hooks/useTableSocket';

/**
 * Tela mostrada pra customer que entrou apos o host: status='pending',
 * aguarda decision do host via WS event `participant:decision`. Quando
 * vira 'approved', chama onApproved() pro pai navegar pra home; se
 * 'rejected', mostra mensagem e CTA pra escanear outro QR.
 *
 * Sem essa tela o usuario virgem caia direto na home com sessao
 * pending e qualquer acao falhava no backend, sem nenhum feedback do
 * porque.
 */
export function PendingApprovalScreen({
  hostName,
  onApproved,
}: {
  hostName: string | null;
  onApproved: () => void;
}) {
  const { sessionId, customerId } = useSession();
  const [outcome, setOutcome] = useState<'pending' | 'rejected'>('pending');

  useTableSocket(sessionId, (event, data) => {
    if (event !== 'participant:decision') return;
    const payload = data as { customerId: string; status: string };
    if (payload.customerId !== customerId) return;
    if (payload.status === 'approved') {
      onApproved();
    } else if (payload.status === 'rejected') {
      setOutcome('rejected');
    }
  });

  // Fallback: a cada 8s checa via fetch caso o WS tenha dropado.
  useEffect(() => {
    if (!sessionId || !customerId) return;
    const tick = setInterval(async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || '/api'}/${
            window.location.pathname.split('/')[1]
          }/table/participants`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          participants: { customerId: string; status: string }[];
        };
        const me = json.participants.find((p) => p.customerId === customerId);
        if (me?.status === 'approved') onApproved();
        else if (me?.status === 'rejected') setOutcome('rejected');
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(tick);
  }, [sessionId, customerId, onApproved]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      {outcome === 'pending' ? (
        <>
          <div className="flex justify-center gap-1.5">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="inline-block h-[7px] w-[7px] animate-bounce-dot rounded-full bg-ink"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
              Aguardando aprovação
            </h1>
            <p className="mt-2 text-[13px] text-mute">
              {hostName
                ? `${hostName} chegou primeiro e precisa autorizar sua entrada na mesa.`
                : 'O primeiro cliente da mesa precisa autorizar sua entrada.'}
            </p>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-danger">
            Entrada não autorizada
          </h1>
          <p className="text-[13px] text-mute">
            O cliente que reservou a mesa não aprovou sua entrada. Você pode tentar
            outra mesa ou pedir ao garçom.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border-[1.3px] border-ink bg-bg px-6 py-2.5 text-[14px] font-semibold text-ink"
          >
            Tentar novamente
          </button>
        </>
      )}
    </main>
  );
}
