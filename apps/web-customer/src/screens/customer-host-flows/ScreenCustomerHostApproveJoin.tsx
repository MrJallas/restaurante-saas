'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { useCustomerHostEvents } from '../../hooks/useCustomerHostEvents';
import {
  approveLateArrival,
  rejectLateArrival,
} from '../../lib/api/customer-host';
import { TypewriterBubble } from './TypewriterBubble';
import type { LateArrivalRequestDto } from '@restaurant/shared-types';

interface ScreenCustomerHostApproveJoinProps {
  slug: string;
  /** Initial request payload (typically pre-fetched from the WS event). */
  request: LateArrivalRequestDto;
  /** Names already at the table (for "Quem tá na mesa" block). */
  partyNames?: string[];
  /** Where to navigate after deciding. Default: home. */
  onCloseHref?: string;
  /**
   * When the host arrived via push tap, skip the typewriter animation — they
   * already made a conscious gesture, rebobinating would be irritating. Per
   * cliente-table-merge.jsx frame 03 note.
   */
  skipTypewriter?: boolean;
  /**
   * Number of queued requests behind this one. When > 0, we show a floating
   * pill "↓ Pedido novo Mesa X" hinting that the host has more to decide.
   */
  queuedCount?: number;
}

/**
 * `ScreenCustomerHostApproveJoin` · per docs/features/customer-host-model.md
 * (frame 02 of cliente-late-arrival.jsx).
 *
 * Customer-host (you) sees this when somebody scans the QR of the table
 * you're already on. Two CTAs:
 *  - approve → `POST /late-arrival-requests/:id/approve`
 *  - reject  → `POST /late-arrival-requests/:id/reject`
 *
 * The `request` payload comes from `late_arrival.created` (WS) and includes
 * `requesterName`/`visitContext` denormalized server-side, so the screen
 * never needs an extra round-trip to fetch the joiner's name.
 */
export function ScreenCustomerHostApproveJoin({
  slug,
  request,
  partyNames = [],
  onCloseHref,
  skipTypewriter = false,
  queuedCount = 0,
}: ScreenCustomerHostApproveJoinProps) {
  const router = useRouter();
  const { customerId, sessionId } = useSession();
  const [busy, setBusy] = useState<'approving' | 'rejecting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [autoExpired, setAutoExpired] = useState(false);

  // Countdown · same TTL the request has on the server (60s default). When
  // the WS `late_arrival.expired` event arrives, autoExpired flips and the
  // CTAs become disabled.
  useEffect(() => {
    const target = new Date(request.expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [request.expiresAt]);

  // WS subscription · listen for the request being closed (by us in another
  // tab, or by timeout). Keeps the UI in sync without polling.
  useCustomerHostEvents({
    sessionId,
    customerId,
    onEvent: (event) => {
      if (event.type === 'late_arrival.expired' && event.payload.requestId === request.id) {
        setAutoExpired(true);
      }
      if (event.type === 'late_arrival.approved' && event.payload.requestId === request.id) {
        // Already approved (likely from the manager fallback or another tab).
        router.push(onCloseHref ?? `/${slug}`);
      }
    },
  });

  const handleApprove = useCallback(async () => {
    if (busy || autoExpired) return;
    setBusy('approving');
    setError(null);
    try {
      await approveLateArrival(request.id, { customerId: customerId ?? undefined, slug });
      router.push(onCloseHref ?? `/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar.');
      setBusy(null);
    }
  }, [busy, autoExpired, request.id, customerId, slug, router, onCloseHref]);

  const handleReject = useCallback(async () => {
    if (busy || autoExpired) return;
    setBusy('rejecting');
    setError(null);
    try {
      await rejectLateArrival(request.id, {
        customerId: customerId ?? undefined,
        slug,
      });
      router.push(onCloseHref ?? `/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar.');
      setBusy(null);
    }
  }, [busy, autoExpired, request.id, customerId, slug, router, onCloseHref]);

  const subText = useMemo(() => {
    const total = partyNames.length;
    return total > 0
      ? `Tem espaço · ${request.requesterName} pode sentar com vocês.`
      : `${request.requesterName} quer entrar na mesa.`;
  }, [partyNames.length, request.requesterName]);

  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <div className="flex flex-1 flex-col px-[22px] pb-6 pt-[max(env(safe-area-inset-top),20px)]">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[1.2px] text-faint">
          Mesa {request.tableNumber} · alguém quer entrar
          {secondsLeft != null && !autoExpired && ` · ${secondsLeft} s`}
        </p>

        <h1 className="text-[22px] font-bold leading-[1.2] tracking-[-0.4px] text-ink">
          {request.requesterName} quer juntar a sua mesa
        </h1>

        <p className="mt-2 text-[14px] font-medium leading-[1.5] tracking-[-0.05px] text-mute">
          {subText}
        </p>

        {/* Typewriter "a chamada" — per cliente-late-arrival.jsx note: when
            the request lands while host is in the chat, the LLM types out
            the heads-up in real time. We surface a short version of that
            message here too, with the border-left mostarda accent, so the
            screen feels continuous with the in-chat experience. */}
        <div className="mt-4">
          <TypewriterBubble
            eyebrow={`Pedido da Mesa ${request.tableNumber} · agora`}
            text={`${request.requesterName} acabou de escanear o QR e quer juntar a sua mesa.${
              request.visitContext ? ` ${request.visitContext}.` : ''
            } Decide aí — você tem 60 s.`}
            skipAnimation={skipTypewriter}
            urgent={!autoExpired}
          />
        </div>

        {/* Bloco · quem tá na mesa */}
        {partyNames.length > 0 && (
          <div className="mt-5 rounded-[14px] border border-border-soft bg-surface p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[1px] text-mute">
                Quem tá na mesa
              </span>
              <span className="text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
                {partyNames.length}{' '}
                {partyNames.length === 1 ? 'pessoa' : 'pessoas'}
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {partyNames.map((name, i) => (
                <PersonRow key={`${name}-${i}`} name={name} you={i === 0} />
              ))}
            </ul>
          </div>
        )}

        {/* Bloco · quem quer entrar */}
        <div className="mt-3 rounded-[14px] border-[1.3px] border-ink bg-white p-3.5">
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-ink">
            Quem quer entrar
          </span>
          <div className="mt-3">
            <PersonRow
              name={request.requesterName}
              sub={request.visitContext}
              size={42}
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-[10px] border border-danger/30 bg-danger/5 p-2.5 text-[12px] text-danger">
            {error}
          </p>
        )}

        {autoExpired && (
          <p className="mt-4 rounded-[10px] border border-mute/20 bg-surface p-2.5 text-[12px] text-mute">
            Esse pedido expirou. {request.requesterName} já recebeu a sugestão
            de chamar a recepcionista.
          </p>
        )}

        <div className="flex-1 min-h-4" />

        <div className="mt-5 flex flex-col gap-2.5">
          <PillButton
            variant="filled"
            onClick={handleApprove}
            disabled={!!busy || autoExpired}
            className="w-full"
          >
            {busy === 'approving' ? 'Aprovando…' : 'Sim, pode entrar'}
          </PillButton>
          <PillButton
            variant="outline"
            onClick={handleReject}
            disabled={!!busy || autoExpired}
            className="w-full"
          >
            {busy === 'rejecting' ? 'Rejeitando…' : 'Não, era engano'}
          </PillButton>
        </div>
      </div>

      {/* Floating pill: "Pedido novo Mesa X" — surfaces when more late-arrival
          requests are queued behind this one. The host taps to advance.
          Visual matches ScrollPill in cliente-table-merge.jsx. */}
      {queuedCount > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] z-40 flex justify-center">
          <span
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white"
            style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M6 2v8M2 7l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            Pedido novo Mesa {request.tableNumber} ({queuedCount})
          </span>
        </div>
      )}
    </main>
  );
}

function PersonRow({
  name,
  sub,
  you,
  size = 36,
}: {
  name: string;
  sub?: string;
  you?: boolean;
  size?: number;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const subLine = you ? 'Você · host' : sub;
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-full text-[12px] font-bold tracking-[-0.4px] ${
          you ? 'bg-ink text-white' : 'border border-border-soft bg-[#e8e6e0] text-ink'
        }`}
        style={{
          width: size,
          height: size,
          fontSize: size >= 40 ? 14 : 12,
        }}
      >
        {initial}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold tracking-[-0.1px] text-ink">
          {name}
        </span>
        {subLine && (
          <span className="text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
            {subLine}
          </span>
        )}
      </div>
    </li>
  );
}
