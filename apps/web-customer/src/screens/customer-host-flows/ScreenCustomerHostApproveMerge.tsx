'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { useCustomerHostEvents } from '../../hooks/useCustomerHostEvents';
import { approveTableMerge, rejectTableMerge } from '../../lib/api/customer-host';
import { TypewriterBubble } from './TypewriterBubble';
import type { TableMergeRequestDto } from '@restaurant/shared-types';

interface ScreenCustomerHostApproveMergeProps {
  slug: string;
  /** The merge request payload (typically pre-fetched from `table_merge.created`). */
  request: TableMergeRequestDto;
  /** Names already at the receiver's table (for "Sua mesa" block). */
  yourPartyNames?: string[];
  /** Names already at the requester's table (for "Mesa que quer juntar" block). */
  theirPartyNames?: string[];
  /** Where to navigate after deciding. Default: home. */
  onCloseHref?: string;
  /** Skip typewriter on cold push/open. */
  skipTypewriter?: boolean;
}

/**
 * `ScreenCustomerHostApproveMerge` · per docs/produto/funcionalidades/cliente-host-e-mesa-compartilhada.md
 * (frame 06 of cliente-table-merge.jsx — fullscreen alternative to the
 * inline typewriter bubble).
 *
 * Target customer-host approves or rejects a table-merge request from the
 * origin side. On reject, the backend records a 10-minute cooldown
 * (table-merge.service.ts) and emits `merge.cooldown_started`. We don't
 * render the cooldown UI here — that's the requester's screen — but we do
 * pass `cooldownEndsAt` back to the caller via the resolution.
 */
export function ScreenCustomerHostApproveMerge({
  slug,
  request,
  yourPartyNames = [],
  theirPartyNames = [],
  onCloseHref,
  skipTypewriter = false,
}: ScreenCustomerHostApproveMergeProps) {
  const router = useRouter();
  const { customerId, sessionId } = useSession();
  const [busy, setBusy] = useState<'approving' | 'rejecting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [autoExpired, setAutoExpired] = useState(false);

  // 60s countdown · matches REQUEST_TTL_SECONDS in table-merge.service.ts
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

  // Listen for the request being closed remotely (origin canceled, the other
  // side already rejected, etc.). The screen self-dismisses gracefully.
  useCustomerHostEvents({
    sessionId,
    customerId,
    onEvent: (event) => {
      if (event.type === 'table_merge.rejected' && event.payload.requestId === request.id) {
        setAutoExpired(true);
      }
      if (
        event.type === 'table_merge.approved' &&
        event.payload.requestId === request.id &&
        event.payload.side === 'both'
      ) {
        router.push(onCloseHref ?? `/${slug}`);
      }
    },
  });

  const handleApprove = useCallback(async () => {
    if (busy || autoExpired) return;
    setBusy('approving');
    setError(null);
    try {
      await approveTableMerge(request.id, {
        decidedByCustomerId: customerId ?? undefined,
        slug,
      });
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
      await rejectTableMerge(request.id, {
        decidedByCustomerId: customerId ?? undefined,
        slug,
      });
      router.push(onCloseHref ?? `/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar.');
      setBusy(null);
    }
  }, [busy, autoExpired, request.id, customerId, slug, router, onCloseHref]);

  const totalParty = useMemo(
    () => request.originPartySize + request.targetPartySize,
    [request.originPartySize, request.targetPartySize],
  );
  const originHost = request.originHostName?.trim() || 'A outra mesa';

  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <div className="flex flex-1 flex-col px-[22px] pb-6 pt-[max(env(safe-area-inset-top),20px)]">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[1.2px] text-faint">
          Mesas {request.originTableNumber} + {request.targetTableNumber} · junção
          {secondsLeft != null && !autoExpired && ` · ${secondsLeft} s`}
        </p>

        <h1 className="text-[22px] font-bold leading-[1.2] tracking-[-0.4px] text-ink">
          <span className="font-bold">
            {originHost} (Mesa {request.originTableNumber})
          </span>{' '}
          quer juntar com a sua mesa
        </h1>

        <p className="mt-2 text-[14px] font-medium leading-[1.5] tracking-[-0.05px] text-mute">
          Vão virar uma mesa só com <b>{totalParty} pessoas</b>. Depois vocês escolhem se juntam as
          comandas ou seguem separados.
        </p>

        <div className="mt-4">
          <TypewriterBubble
            eyebrow={`Junção Mesa ${request.originTableNumber} → Mesa ${request.targetTableNumber} · agora`}
            text={`${request.originHostName || 'A outra mesa'} pediu para juntar as mesas. Se você aceitar, abrimos a escolha de comandas na sequência.`}
            skipAnimation={skipTypewriter}
            urgent={!autoExpired}
          />
        </div>

        {/* Bloco · sua mesa */}
        <div className="mt-5 rounded-[14px] border border-border-soft bg-surface p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[1px] text-mute">
              Sua mesa · {request.targetTableNumber}
            </span>
            <span className="text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
              {request.targetPartySize} {request.targetPartySize === 1 ? 'pessoa' : 'pessoas'}
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {yourPartyNames.length > 0 ? (
              yourPartyNames.map((name, i) => (
                <PersonRow key={`y-${name}-${i}`} name={name} you={i === 0} />
              ))
            ) : (
              <li className="text-[12px] text-faint">
                {request.targetPartySize}{' '}
                {request.targetPartySize === 1 ? 'pessoa nessa mesa' : 'pessoas nessa mesa'}
              </li>
            )}
          </ul>
        </div>

        {/* Bloco · mesa que quer juntar */}
        <div className="mt-3 rounded-[14px] border-[1.3px] border-ink bg-white p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[1px] text-ink">
              Mesa que quer juntar · {request.originTableNumber}
            </span>
            <span className="text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
              {request.originPartySize} {request.originPartySize === 1 ? 'pessoa' : 'pessoas'}
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            <PersonRow key="origin-host" name={originHost} sub="Host da mesa" />
            {theirPartyNames
              .filter((n) => n !== originHost)
              .map((name, i) => (
                <PersonRow key={`t-${name}-${i}`} name={name} />
              ))}
          </ul>
        </div>

        {error && (
          <p className="mt-4 rounded-[10px] border border-danger/30 bg-danger/5 p-2.5 text-[12px] text-danger">
            {error}
          </p>
        )}

        {autoExpired && (
          <p className="mt-4 rounded-[10px] border border-mute/20 bg-surface p-2.5 text-[12px] text-mute">
            Esse pedido de junção expirou ou foi cancelado.
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
            {busy === 'approving' ? 'Aprovando…' : 'Sim, pode juntar'}
          </PillButton>
          <PillButton
            variant="outline"
            onClick={handleReject}
            disabled={!!busy || autoExpired}
            className="w-full"
          >
            {busy === 'rejecting' ? 'Rejeitando…' : 'Não, melhor separado'}
          </PillButton>
        </div>
      </div>
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
        <span className="text-[14px] font-semibold tracking-[-0.1px] text-ink">{name}</span>
        {subLine && (
          <span className="text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
            {subLine}
          </span>
        )}
      </div>
    </li>
  );
}
