'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { useUIState } from '../../providers/UIStateProvider';
import { useCustomerHostEvents } from '../../hooks/useCustomerHostEvents';
import { ScreenCustomerMergeCooldown } from './ScreenCustomerMergeCooldown';

export type WaitingMode = 'late-arrival' | 'merge-target' | 'merge-origin';
export type WaitingState = 'waiting' | 'approved' | 'rejected' | 'expired' | 'cooldown';

interface ScreenCustomerWaitingApprovalProps {
  slug: string;
  /**
   * `late-arrival`: customer B esperando o host aprovar entrada
   * `merge-target`: cliente A esperando o host da outra mesa aprovar a junção
   * `merge-origin`: cliente A acabou de pedir junção e espera resposta
   */
  mode?: WaitingMode;
  /**
   * The request id we're tracking. Optional for the initial render — when
   * the screen also creates the request inline, the id arrives via WS.
   */
  requestId?: string | null;
  /** ISO datetime when the underlying request expires. Drives the countdown. */
  expiresAt?: string | null;
  /** Display name of the host (for "Caleb foi avisado"). */
  hostName?: string | null;
  /** Where to navigate when approved. Defaults to home. */
  approvedRedirectTo?: string;
  /**
   * Whether to show a "Tentar de novo" CTA on failure. Default true; the
   * complaint flow may want a different label.
   */
  retryEnabled?: boolean;
}

/**
 * `ScreenCustomerWaitingApproval` · per docs/features/customer-host-model.md
 * (frames 04-06 of cliente-late-arrival.jsx).
 *
 * Three visual states:
 *  - `waiting`  : pulsing balloon, mono caps countdown, escalation pill
 *  - `approved` : green check, "redirecionando" — bridge to home in 1 s
 *  - `expired/rejected` : sleep icon, escape valves
 *
 * Event sources (via useCustomerHostEvents):
 *  - `late_arrival.approved | rejected | expired` (matched on `requestId`)
 *  - `table_merge.approved | rejected` (matched on `requestId`)
 *  - `escalation.advanced` flips the eyebrow copy without changing state
 */
export function ScreenCustomerWaitingApproval({
  slug,
  mode = 'late-arrival',
  requestId = null,
  expiresAt = null,
  hostName = null,
  approvedRedirectTo,
  retryEnabled = true,
}: ScreenCustomerWaitingApprovalProps) {
  const router = useRouter();
  const { openCallWaiterSheet } = useUIState();
  const { sessionId, customerId } = useSession();

  const [state, setState] = useState<WaitingState>('waiting');
  const [escalated, setEscalated] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState<{
    cooldownEndsAt: string;
    targetTableNumber?: number | null;
    message?: string | null;
  } | null>(null);

  // ─── Countdown ─────────────────────────────────────────────────────────
  // Keep recomputing seconds left until the deadline; fall back to "60 s"
  // when no expiresAt is provided (rare, but defensive against API hiccups).
  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && state === 'waiting') {
        // Soft expiration on the client. The WS event is authoritative,
        // so we wait for it; until then the eyebrow already reads "0 s".
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, state]);

  // ─── WS subscription ───────────────────────────────────────────────────
  useCustomerHostEvents({
    sessionId,
    customerId,
    onEvent: (event) => {
      switch (event.type) {
        case 'late_arrival.approved': {
          if (mode !== 'late-arrival') return;
          if (requestId && event.payload.requestId !== requestId) return;
          setState('approved');
          break;
        }
        case 'late_arrival.rejected': {
          if (mode !== 'late-arrival') return;
          if (requestId && event.payload.requestId !== requestId) return;
          setState(
            event.payload.reason === 'host_timeout' ? 'expired' : 'rejected',
          );
          break;
        }
        case 'late_arrival.expired': {
          if (mode !== 'late-arrival') return;
          if (requestId && event.payload.requestId !== requestId) return;
          setState('expired');
          break;
        }
        case 'table_merge.approved': {
          if (mode === 'late-arrival') return;
          if (requestId && event.payload.requestId !== requestId) return;
          // We only flip to "approved" on `side==='both'` — single-side
          // approvals are intermediate (the other side is still deciding).
          if (event.payload.side === 'both') {
            setState('approved');
          }
          break;
        }
        case 'table_merge.rejected': {
          if (mode === 'late-arrival') return;
          if (requestId && event.payload.requestId !== requestId) return;
          setState(
            event.payload.rejectedBy === 'timeout' ? 'expired' : 'rejected',
          );
          break;
        }
        case 'merge.cooldown_started': {
          if (mode === 'late-arrival') return;
          if (
            event.payload.originSessionId &&
            sessionId &&
            event.payload.originSessionId !== sessionId
          ) {
            return;
          }
          setCooldown({
            cooldownEndsAt: event.payload.cooldownEndsAt ?? event.payload.expiresAt,
            targetTableNumber:
              event.payload.targetTableNumber ?? event.payload.targetTable ?? null,
            message: null,
          });
          setState('cooldown');
          break;
        }
        case 'escalation.advanced': {
          // Informational — only the eyebrow text changes. Keeps customers
          // from being "stuck" on the same message when the chain progresses.
          setEscalated(true);
          break;
        }
        default:
          break;
      }
    },
  });

  // ─── Approved → redirect after a beat ──────────────────────────────────
  useEffect(() => {
    if (state !== 'approved') return;
    const id = window.setTimeout(() => {
      router.push(approvedRedirectTo ?? `/${slug}`);
    }, 1100);
    return () => window.clearTimeout(id);
  }, [state, slug, router, approvedRedirectTo]);

  // ─── Copy by mode + state ──────────────────────────────────────────────
  const eyebrow = useMemo(() => {
    if (state === 'approved') {
      if (mode === 'late-arrival') return 'Você tá na mesa';
      return 'Mesas juntadas';
    }
    if (state === 'expired') {
      if (mode === 'late-arrival') return 'Host não respondeu';
      return 'Sem resposta da outra mesa';
    }
    if (state === 'rejected') {
      if (mode === 'late-arrival') return 'Host disse não';
      return 'Outra mesa preferiu não juntar';
    }
    // waiting
    if (escalated) return 'Recepcionista vai decidir';
    if (secondsLeft != null) {
      if (mode === 'late-arrival') {
        return `Aguardando host da mesa · ${secondsLeft} s`;
      }
      return `Aguardando outra mesa · ${secondsLeft} s`;
    }
    if (mode === 'late-arrival') return 'Aguardando host da mesa';
    return 'Aguardando outra mesa';
  }, [state, escalated, secondsLeft, mode]);

  const hero = useMemo(() => {
    if (state === 'approved')
      return mode === 'late-arrival' ? 'Aprovado!' : 'Mesas juntadas!';
    if (state === 'expired')
      return mode === 'late-arrival'
        ? 'Sem resposta da mesa'
        : 'Sem resposta da outra mesa';
    if (state === 'rejected')
      return mode === 'late-arrival' ? 'Entrada não autorizada' : 'Mesas separadas';
    return 'Esperando aprovação';
  }, [state, mode]);

  const sub = useMemo(() => {
    if (state === 'approved') {
      return mode === 'late-arrival'
        ? 'Te conectando ao chat da mesa em 1 s…'
        : 'Te levando para escolher como ficam as comandas…';
    }
    if (state === 'expired') {
      return mode === 'late-arrival'
        ? `${hostName ?? 'O host da mesa'} não viu a notificação. Quer chamar a recepcionista presencialmente?`
        : 'A outra mesa não respondeu a tempo. Sem stress, vocês ficam separados mesmo.';
    }
    if (state === 'rejected') {
      return mode === 'late-arrival'
        ? 'Era engano? Confere se escaneou o QR certo. Ou chama a recepcionista pra te ajudar.'
        : 'Sem stress, vocês ficam separados mesmo. Você pode tentar de novo em 20 min.';
    }
    return mode === 'late-arrival'
      ? `${hostName ?? 'O host da mesa'} foi avisado · ele tá decidindo se você pode entrar.`
      : 'Mandamos o pedido pra outra mesa · só falta eles confirmarem.';
  }, [state, mode, hostName]);

  const eyebrowColor =
    state === 'approved'
      ? 'text-success'
      : state === 'rejected' || state === 'expired'
        ? 'text-mute'
        : 'text-mute';

  if (state === 'cooldown' && cooldown) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6 py-8">
        <ScreenCustomerMergeCooldown
          targetTableNumber={cooldown.targetTableNumber}
          cooldownEndsAt={cooldown.cooldownEndsAt}
          message={cooldown.message}
          onCallHost={openCallWaiterSheet}
          onTryAnother={() =>
            router.push(`/${slug}/assistente?prefill=quero%20tentar%20outra%20mesa`)
          }
          onContinueHere={() => router.push(`/${slug}/assistente`)}
        />
      </main>
    );
  }

  return (
    // Round 4 §C-NEW-11 — centralizado vertical+horizontal (V20 canon dos
    // outros flows: Welcome / IdentifyBeforeJoin). Antes: justify-start +
    // flex-1 spacer empurrava o CTA pro rodapé e o conteúdo ficava no
    // topo. Agora todo o bloco (eyebrow → title → sub → ícone → pill →
    // CTA) fica como uma unidade no centro do viewport.
    <main className="bg-bg" data-testid="waiting-approval">
      <div className="relative grid h-[100dvh] min-h-dvh w-full place-items-center px-6 py-8">
        <div className="flex w-full max-w-[420px] flex-col items-center text-center">
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-[1.2px] ${eyebrowColor}`}
          >
            {state === 'waiting' && (
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-bounce-dot rounded-full bg-ink align-middle" />
            )}
            {eyebrow}
          </span>

          <h1 className="mt-[14px] text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink text-pretty">
            {hero}
          </h1>

          <p className="mt-[12px] max-w-[300px] text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute text-pretty">
            {sub}
          </p>

          <div className="my-8 flex h-24 w-24 items-center justify-center">
            {state === 'waiting' && <Pulse />}
            {state === 'approved' && <CheckMark />}
            {(state === 'rejected' || state === 'expired') && <Sleep />}
          </div>

          {/* Pill ladder · indica step / redirecionamento */}
          {state === 'waiting' && (
            <div className="flex items-center gap-2 rounded-full border border-border-soft bg-surface px-3.5 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ink" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.6px] text-faint">
                {escalated ? 'recepcionista' : 'host'}
                {secondsLeft != null && ` · ${secondsLeft} s`}
              </span>
            </div>
          )}

          {state === 'approved' && (
            <div className="flex items-center gap-2 rounded-full bg-success/10 px-3.5 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.6px] text-success">
                redirecionando…
              </span>
            </div>
          )}

          {/* CTAs · variam por estado · agora colados no bloco central
              em vez de empurrados ao bottom (V20 canon). */}
          {state === 'waiting' && (
            <PillButton
              variant="outline"
              onClick={() => router.back()}
              className="mt-7"
            >
              Cancelar pedido
            </PillButton>
          )}

          {(state === 'rejected' || state === 'expired') && (
            <div className="mt-7 flex w-full flex-col gap-2.5">
              <PillButton
                variant="filled"
                fullWidth
                onClick={openCallWaiterSheet}
              >
                Chamar recepcionista
              </PillButton>
              {retryEnabled && (
                <PillButton
                  variant="outline"
                  fullWidth
                  onClick={() => window.location.reload()}
                >
                  Tentar de novo
                </PillButton>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Visual atoms ──────────────────────────────────────────────────────────
// Local placeholders for C1's animation primitives. Once C1 ships
// `apps/web-customer/src/lib/animations.ts` with `Pulse`, `CheckMark`, etc.,
// these will be replaced. For now we inline the styles to keep the screens
// self-contained and avoid breaking tsc-customer when C1 lands.

function Pulse() {
  return (
    <div
      className="flex h-24 w-24 items-center justify-center rounded-full border border-border-soft bg-surface"
      style={{ animation: 'cBalloonPulse 2.2s ease-in-out infinite' }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-[1.4px] border-ink bg-white">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M11 6v5l3 2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <style>{`
        @keyframes cBalloonPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.06); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

function CheckMark() {
  return (
    <div
      className="flex h-24 w-24 items-center justify-center rounded-full bg-success/10"
      style={{ animation: 'cCheckPop 480ms cubic-bezier(.4,0,.2,1) both' }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M6 14l5 5 11-11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <style>{`
        @keyframes cCheckPop {
          0%   { transform: scale(0.7); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Sleep() {
  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-border-soft bg-surface">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-[1.4px] border-faint bg-white text-[24px] font-semibold text-faint">
        z
      </div>
    </div>
  );
}
