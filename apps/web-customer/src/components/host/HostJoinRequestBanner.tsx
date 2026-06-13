'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '../../lib/api';
import { useSession } from '../../hooks/useSession';
import { useTableSocket } from '../../hooks/useTableSocket';

/**
 * Notification banner shown on the mesa home for the host when another
 * customer is pending join. Tap deep-links to
 * `/[slug]/host/approve/participant` — the full-screen V20 accept view.
 *
 * Round 19 — built per user ask: "faça uma tela cheia quando clica na
 * notificação". The sticky `HostApprovalModal` already exists as an
 * inline option for quick decisions; this banner is the discoverable
 * entry point that scales to multiple pending joiners and deep-links
 * into the full-screen flow.
 *
 * Empty state: renders nothing. The banner only mounts when at least
 * one non-host participant is `status='pending'`. WS-aware via
 * `useTableSocket` — events `participant:join_request` /
 * `participant:decision` trigger a refetch.
 */
interface ParticipantsResponse {
  participants: {
    customerId: string;
    name: string;
    status: 'pending' | 'approved' | 'rejected';
    isHost: boolean;
  }[];
}

export function HostJoinRequestBanner({ slug }: { slug: string }) {
  const router = useRouter();
  const { sessionId } = useSession();
  const [pendingCount, setPendingCount] = useState(0);
  const [firstName, setFirstName] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await apiGet<ParticipantsResponse>(`/${slug}/table/participants`);
      const pending = res.participants.filter((p) => p.status === 'pending' && !p.isHost);
      setPendingCount(pending.length);
      setFirstName(pending[0]?.name ?? null);
    } catch {
      /* mantém estado anterior — proximo tick re-tenta */
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

  useTableSocket(sessionId, (event) => {
    if (event === 'participant:join_request' || event === 'participant:decision') {
      refetch();
    }
  });

  if (pendingCount === 0 || !firstName) return null;

  const label =
    pendingCount === 1
      ? `${firstName} quer entrar`
      : `${firstName} +${pendingCount - 1} querem entrar`;

  return (
    <button
      type="button"
      onClick={() => router.push(`/${slug}/host/approve/participant`)}
      data-testid="host-join-request-banner"
      aria-label={
        pendingCount === 1
          ? `1 pessoa quer entrar na mesa, toque pra decidir`
          : `${pendingCount} pessoas querem entrar na mesa, toque pra decidir`
      }
      className="mx-[22px] mt-3 flex items-center gap-3 rounded-[14px] border-[1.3px] border-ink bg-white px-3.5 py-3 text-left transition-transform duration-100 active:scale-[0.99]"
      style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink"
        style={{ animation: 'cJoinPulse 1.6s ease-in-out infinite' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 3v10M3 8h10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-mute">
          Pedido de entrada
        </span>
        <span className="text-[14px] font-semibold leading-[1.3] tracking-[-0.05px] text-ink">
          {label}
        </span>
      </div>
      <span className="font-mono text-[16px] font-bold text-ink" aria-hidden>
        →
      </span>
      <style>{`
        @keyframes cJoinPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
      `}</style>
    </button>
  );
}
