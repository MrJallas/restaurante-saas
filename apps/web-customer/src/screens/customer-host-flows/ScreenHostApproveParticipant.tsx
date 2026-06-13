'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { useTableSocket } from '../../hooks/useTableSocket';
import { apiGet, apiPost } from '../../lib/api';

interface ParticipantRow {
  customerId: string;
  name: string;
  initial: string;
  color: string;
  status: 'pending' | 'approved' | 'rejected';
  isHost: boolean;
}

interface ParticipantsResponse {
  participants: ParticipantRow[];
}

interface ScreenHostApproveParticipantProps {
  slug: string;
  /** Where to navigate after deciding (or when no pending requests). */
  onCloseHref?: string;
  /**
   * When the host arrived via push tap, skip the typewriter animation —
   * matches `ScreenCustomerHostApproveJoin.skipTypewriter`.
   */
  skipTypewriter?: boolean;
}

/**
 * `ScreenHostApproveParticipant` · V20 canon full-screen host-accept screen
 * for the System A (`session_participants`) flow.
 *
 * Round 19 — built per user ask: "se não tiver faça uma tela cheia quando
 * clica na notificação". Before this round, the host could only see
 * pending joiners through the sticky bottom-sheet `HostApprovalModal`.
 * Now the bell/notification banner deep-links here for a full-screen
 * accept experience that matches the V20 customer-host flow (same canon
 * as `ScreenCustomerHostApproveJoin` which targets the late-arrival API).
 *
 * Differences from `ScreenCustomerHostApproveJoin`:
 *  - calls `/table/participants/decide` (System A) instead of
 *    `/late-arrival-requests/:id/approve|reject` (System B)
 *  - drives off the live `/table/participants` snapshot — multiple pending
 *    requests cycle through; resolving one auto-advances to the next
 *  - no countdown / TTL (System A doesn't time out)
 *  - WS subscription via `useTableSocket` (System A's WS contract)
 */
export function ScreenHostApproveParticipant({
  slug,
  onCloseHref,
  skipTypewriter = false,
}: ScreenHostApproveParticipantProps) {
  const router = useRouter();
  const { sessionId, customerId, tableLabel } = useSession();

  const [participants, setParticipants] = useState<ParticipantRow[] | null>(null);
  const [busy, setBusy] = useState<'approving' | 'rejecting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await apiGet<ParticipantsResponse>(`/${slug}/table/participants`);
      setParticipants(res.participants);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar pedidos.');
    }
  }, [slug]);

  useEffect(() => {
    if (!sessionId) return;
    refetch();
  }, [sessionId, refetch]);

  // WS · live updates when another tab decides, or when a new joiner
  // arrives mid-decision (queue scenario).
  useTableSocket(sessionId, (event) => {
    if (event === 'participant:join_request' || event === 'participant:decision') {
      refetch();
    }
  });

  const pending = useMemo(
    () => (participants ?? []).filter((p) => p.status === 'pending' && !p.isHost),
    [participants],
  );
  const queued = pending.slice(1);
  const current = pending[0] ?? null;
  const me = (participants ?? []).find((p) => p.customerId === customerId);
  const partyNames = useMemo(
    () =>
      (participants ?? [])
        .filter((p) => p.status === 'approved')
        .map((p) => (p.customerId === customerId ? `${p.name} (você)` : p.name)),
    [participants, customerId],
  );

  // If the caller landed here but the host gate isn't satisfied, push
  // them back to home — they shouldn't see other customers' join data.
  useEffect(() => {
    if (!me) return;
    if (!me.isHost) {
      router.replace(onCloseHref ?? `/${slug}`);
    }
  }, [me, router, slug, onCloseHref]);

  // No pending → bridge back. Either the host already decided everything
  // or they arrived here without active requests; the home is the right
  // landing spot.
  useEffect(() => {
    if (!participants) return;
    if (pending.length === 0) {
      router.replace(onCloseHref ?? `/${slug}`);
    }
  }, [participants, pending.length, router, slug, onCloseHref]);

  const decide = useCallback(
    async (decision: 'approve' | 'reject') => {
      if (!current || !customerId || busy) return;
      setBusy(decision === 'approve' ? 'approving' : 'rejecting');
      setError(null);
      try {
        await apiPost(`/${slug}/table/participants/decide`, {
          hostCustomerId: customerId,
          targetCustomerId: current.customerId,
          decision,
        });
        await refetch();
        setBusy(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao responder.');
        setBusy(null);
      }
    },
    [current, customerId, busy, slug, refetch],
  );

  if (loadError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-[15px] text-mute">{loadError}</p>
        <PillButton variant="outline" onClick={() => router.replace(onCloseHref ?? `/${slug}`)}>
          Voltar pra mesa
        </PillButton>
      </main>
    );
  }

  if (!participants || !current) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <div className="flex justify-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="inline-block h-[7px] w-[7px] animate-bounce-dot rounded-full bg-ink"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <p className="text-[13px] text-mute">Carregando pedido…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg" data-testid="host-approve-participant">
      <div className="flex flex-1 flex-col px-[22px] pb-6 pt-[max(env(safe-area-inset-top),20px)]">
        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-faint">
          {tableLabel ? `${tableLabel} · ` : 'Mesa · '}alguém quer entrar
        </p>

        <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink text-pretty">
          {current.name} quer juntar a sua mesa
        </h1>

        <p className="mt-[12px] max-w-[320px] text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute text-pretty">
          {partyNames.length > 1
            ? `Tem espaço · ${current.name} pode sentar com vocês.`
            : `${current.name} acabou de escanear o QR.`}
        </p>

        {/* Bloco · "a chamada" pra dar contexto. Sem typewriter porque
            o System A não tem visit context denormalizado server-side
            (System B sim). Mantemos a borda mostarda do canon V20 do
            ScreenCustomerHostApproveJoin. */}
        <div
          className="mt-4 rounded-[12px] border-l-[3px] border-l-[#9A7212] bg-surface px-3.5 py-3"
          style={skipTypewriter ? {} : { animation: 'cFadeIn 320ms ease-out' }}
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[#7A4D10]">
            Pedido agora · sem prazo
          </span>
          <p className="mt-1 text-[14px] leading-[1.5] tracking-[-0.05px] text-ink">
            {current.name} acabou de escanear o QR da mesa. Decide aí — sem pressa.
          </p>
        </div>

        {/* Bloco · quem tá na mesa */}
        {partyNames.length > 0 && (
          <div className="mt-5 rounded-[14px] border border-border-soft bg-surface p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[1px] text-mute">
                Quem tá na mesa
              </span>
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
                {partyNames.length} {partyNames.length === 1 ? 'pessoa' : 'pessoas'}
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {partyNames.map((name, i) => (
                <PersonRow
                  key={`${name}-${i}`}
                  name={name.replace(' (você)', '')}
                  you={name.endsWith('(você)')}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Bloco · quem quer entrar */}
        <div className="mt-3 rounded-[14px] border-[1.3px] border-ink bg-white p-3.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[1px] text-ink">
            Quem quer entrar
          </span>
          <div className="mt-3">
            <PersonRow
              name={current.name}
              size={42}
              color={current.color}
              initial={current.initial}
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-[10px] border border-danger/30 bg-danger/5 p-2.5 text-[12px] text-danger">
            {error}
          </p>
        )}

        <div className="min-h-4 flex-1" />

        <div className="mt-5 flex flex-col gap-2.5">
          <PillButton
            variant="filled"
            onClick={() => decide('approve')}
            disabled={!!busy}
            className="w-full"
          >
            {busy === 'approving' ? 'Aprovando…' : 'Sim, pode entrar'}
          </PillButton>
          <PillButton
            variant="outline"
            onClick={() => decide('reject')}
            disabled={!!busy}
            className="w-full"
          >
            {busy === 'rejecting' ? 'Rejeitando…' : 'Não, era engano'}
          </PillButton>
        </div>
      </div>

      {/* Floating pill: "Pedido novo Mesa X (N)" — surfaces when more
          requests are queued behind this one. Tap dismisses to advance
          (we already auto-advance on resolve, so this is informational). */}
      {queued.length > 0 && (
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
            +{queued.length} {queued.length === 1 ? 'pedido' : 'pedidos'} na fila
          </span>
        </div>
      )}

      <style>{`
        @keyframes cFadeIn {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}

function PersonRow({
  name,
  you,
  size = 36,
  color,
  initial,
}: {
  name: string;
  you?: boolean;
  size?: number;
  color?: string;
  initial?: string;
}) {
  const fallback = (name || '?').trim().charAt(0).toUpperCase();
  const ch = initial ?? fallback;
  const subLine = you ? 'Você · host' : undefined;
  const fontSize = size >= 40 ? 14 : 12;
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-full font-bold tracking-[-0.4px] text-white`}
        style={{
          width: size,
          height: size,
          fontSize,
          background: color ?? '#0a0a0a',
        }}
      >
        {ch}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold tracking-[-0.1px] text-ink">{name}</span>
        {subLine && (
          <span className="font-mono text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
            {subLine}
          </span>
        )}
      </div>
    </li>
  );
}
