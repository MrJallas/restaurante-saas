'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost } from '../../lib/api';
import { useSession } from '../../hooks/useSession';
import { useTableSocket } from '../../hooks/useTableSocket';

/**
 * Modal mostrado APENAS pro host da mesa (`session.customerId` ===
 * participant.customerId onde isHost=true). Lista pedidos pendentes de
 * entrada e oferece "Aprovar" / "Rejeitar". Refresca tanto via WS
 * (`participant:join_request`) quanto via fetch quando a tela monta.
 *
 * Sem essa UI, novos customers ficavam preso na tela "Aguardando
 * aprovacao" indefinidamente — o host nem sabia que tinha gente
 * esperando.
 */
interface PendingParticipant {
  customerId: string;
  name: string;
  initial: string;
  color: string;
}

interface ParticipantsResponse {
  participants: {
    customerId: string;
    name: string;
    initial: string;
    color: string;
    status: 'pending' | 'approved' | 'rejected';
    isHost: boolean;
  }[];
}

export function HostApprovalModal({ slug }: { slug: string }) {
  const { sessionId, customerId } = useSession();
  const [pending, setPending] = useState<PendingParticipant[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refetch = useCallback(async () => {
    try {
      const res = await apiGet<ParticipantsResponse>(`/${slug}/table/participants`);
      const stillPending = res.participants
        .filter((p) => p.status === 'pending')
        .map(({ customerId, name, initial, color }) => ({
          customerId,
          name,
          initial,
          color,
        }));
      setPending(stillPending);
    } catch {
      /* ignore — proximo tick refetcha */
    }
  }, [slug]);

  useEffect(() => {
    if (!sessionId) return;
    void refetch();
    const interval = window.setInterval(() => {
      void refetch();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [sessionId, refetch]);

  // Escuta WS pra refetch imediato quando alguem novo pede pra entrar
  // ou quando o host (em outra aba) decide alguem.
  useTableSocket(sessionId, (event) => {
    if (event === 'participant:join_request' || event === 'participant:decision') {
      refetch();
    }
  });

  const decide = useCallback(
    async (target: PendingParticipant, decision: 'approve' | 'reject') => {
      if (!customerId) return;
      setBusy((b) => ({ ...b, [target.customerId]: true }));
      try {
        await apiPost(`/${slug}/table/participants/decide`, {
          hostCustomerId: customerId,
          targetCustomerId: target.customerId,
          decision,
        });
        await refetch();
      } catch {
        /* manter na lista; usuario tenta de novo */
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[target.customerId];
          return next;
        });
      }
    },
    [slug, customerId, refetch],
  );

  if (pending.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[420px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]"
      role="dialog"
      aria-label="Pedidos de entrada na mesa"
    >
      <div
        className="rounded-[20px] border-[1.5px] border-ink bg-bg p-4"
        style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.18)' }}
      >
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.3px] text-mute">
          {pending.length === 1
            ? '1 pessoa quer entrar na mesa'
            : `${pending.length} pessoas querem entrar`}
        </p>
        <ul className="space-y-2">
          {pending.map((p) => (
            <li
              key={p.customerId}
              className="flex items-center gap-3 rounded-[14px] border border-faint/40 px-3 py-2.5"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: p.color }}
              >
                {p.initial}
              </span>
              <span className="flex-1 text-[14px] text-ink">{p.name}</span>
              <button
                type="button"
                onClick={() => decide(p, 'reject')}
                disabled={!!busy[p.customerId]}
                className="rounded-full border-[1.3px] border-ink px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-50"
                aria-label={`Rejeitar ${p.name}`}
              >
                Rejeitar
              </button>
              <button
                type="button"
                onClick={() => decide(p, 'approve')}
                disabled={!!busy[p.customerId]}
                className="rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                aria-label={`Aprovar ${p.name}`}
              >
                Aprovar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
