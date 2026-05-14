'use client';

/**
 * CallWaiterSheet — bottom-sheet vaul-style sobre a Home (canvas V20 §F07).
 *
 * Round 4 §C16. Antes a rota `/[slug]/garcom/chamar` era uma página
 * fullscreen dedicada (145 linhas). Canvas V20 (cliente-journey-v20.jsx
 * line 341) define o passo de escolher motivo como bottom-sheet sobre a
 * Home: home blurred ao fundo (filter blur(0.5px) + opacity 0.5), backdrop
 * preto 32%, sheet ~52% altura, drag handle 40×4 cinza claro, 5 motivos
 * com icon + label + sub, CTA "Confirmar chamado →" filled disabled até
 * seleção, swipe-down dismiss (close em 60%+).
 *
 * Sem dependência externa: vaul NÃO está em package.json. Implementamos
 * via touch handlers + transform/transition CSS. Animação de entrada
 * usa `animate-slide-up-overlay` do globals.css (220ms ease-out).
 *
 * Ao confirmar, navega pra `/[slug]/garcom/chamando?callId=...` (esta
 * tela de "chamado em andamento" continua sendo rota — só a etapa de
 * escolher motivo virou sheet).
 */

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../../lib/api';
import { useSession } from '../../hooks/useSession';
import { useSheetDrag } from '../../hooks/useSheetDrag';

export type CallWaiterReason =
  | 'bring_menu'
  | 'place_order'
  | 'serve_drink'
  | 'ask_bill'
  | 'other';

interface ReasonItem {
  key: CallWaiterReason;
  label: string;
  sub: string;
  icon: ReactNode;
}

const ICON_SIZE = 20;
const stroke = 'currentColor';

// 5 motivos canon do canvas (cliente-screens.jsx:146).
const REASONS: ReasonItem[] = [
  {
    key: 'bring_menu',
    label: 'Trazer o cardápio',
    sub: 'Versão impressa pra mesa',
    icon: (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M3 4.5h11a2 2 0 0 1 2 2v9.5l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-3 1.4V4.5Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M6 8h7M6 11h5" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'place_order',
    label: 'Fazer pedido',
    sub: 'Garçom anota direto',
    icon: (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="4.5" y="3" width="11" height="14" rx="1.5" stroke={stroke} strokeWidth="1.4" />
        <path d="M7.5 7h5M7.5 10h5M7.5 13h3" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'serve_drink',
    label: 'Servir bebida',
    sub: 'Reabastecer ou vinho na taça',
    icon: (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M5 4h10l-1 6.5a4 4 0 0 1-8 0L5 4Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M10 14.5V18M7 18h6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'ask_bill',
    label: 'Pedir a conta',
    sub: 'Iniciar fechamento',
    icon: (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M5 3h10v14l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 7h4M8 10h4M8 13h2" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'other',
    label: 'Outro motivo',
    sub: 'Você descreve quando atender',
    icon: (
      <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.5L5 17v-3.5h-.5a1 1 0 0 1-1-1V5.5Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
];

interface CallWaiterSheetProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  /** Top eyebrow — "MESA 12 · TURNO DA NOITE". Opcional. */
  eyebrow?: string;
  /** Quando o chamado é criado, navega aqui. Default: `/{slug}/garcom/chamando?...`. */
  onSuccessNavigate?: (callId: string, reason: CallWaiterReason) => void;
}

interface WaiterCallResponse {
  callId: string;
  waiterName?: string;
  etaMinutes?: number;
}

const DISMISS_THRESHOLD = 0.6;

export function CallWaiterSheet({
  open,
  onClose,
  slug,
  eyebrow,
  onSuccessNavigate,
}: CallWaiterSheetProps) {
  const router = useRouter();
  const { visitId, customerId } = useSession();
  const [selected, setSelected] = useState<CallWaiterReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sheetHeightFn = useCallback(() => {
    if (typeof window === 'undefined') return 520;
    return Math.round(window.innerHeight * 0.62);
  }, []);

  // Drag via React JSX handlers (vaul pattern) — versão anterior tentou
  // native addEventListener + passive:false, mas iOS Safari < 26.2 não
  // honra preventDefault em pointer events de forma consistente. Vaul
  // mostra que React handlers são suficientes se a gente usa
  // setPointerCapture no target + touch-action: none no draggable.
  const { dragY, sheetRef, dragHandleRef, isDragging, bind } = useSheetDrag({
    onDismiss: onClose,
    sheetHeightPx: sheetHeightFn,
  });

  // Reset state on reopen
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSubmitting(false);
    setErrorMsg(null);
  }, [open]);

  // Lock body scroll while sheet open. Reused logic do MenuDrawer
  // (iOS Safari ignora `overflow:hidden` no body — usamos position:fixed).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  const handleConfirm = async () => {
    if (submitting || !selected) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiPost<WaiterCallResponse>(`/${slug}/waiter-calls`, {
        reason: selected,
        visitId: visitId || undefined,
        customerId: customerId || undefined,
      });
      if (onSuccessNavigate) {
        onSuccessNavigate(res.callId, selected);
      } else {
        router.push(`/${slug}/garcom/chamando?callId=${res.callId}&reason=${selected}`);
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.message.toLowerCase().includes('avisado')
          ? 'O garçom já foi avisado. Aguarde ou fale direto com ele.'
          : 'Não foi possível chamar o garçom. Tente novamente.';
      setErrorMsg(msg);
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="Chamar garçom"
      data-testid="call-waiter-sheet"
    >
      {/* Backdrop · ink/32 + tap fecha */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-black/[0.32]"
      />

      {/* Sheet — pointer handlers vêm do hook via `{...bind}` (vaul pattern,
          React JSX em vez de native addEventListener — iOS Safari < 26.2
          não honra preventDefault em pointer events de forma consistente). */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[78dvh] flex-col select-none rounded-t-[22px] border-[1.5px] border-b-0 border-ink bg-bg px-[22px] pb-safe pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.10)] animate-slide-up-overlay [-webkit-user-select:none] [-webkit-touch-callout:none]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: isDragging
            ? undefined
            : 'transform 220ms cubic-bezier(.2,.8,.2,1)',
        }}
        onClick={(e) => e.stopPropagation()}
        {...bind}
      >
        {/* Drag handle 40×4 — área grab generosa (h-9 = 36px). `touch-action:
            none` aqui (já via className `touch-none`) evita scroll competir.
            ref no hook permite drag handle SEMPRE capturar drag (mesmo se
            for filho de um elemento interativo). */}
        <div
          ref={dragHandleRef}
          data-drag-handle="true"
          className="mx-auto mb-3.5 -my-1 flex h-9 w-full cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <div className="h-[4px] w-10 rounded-[3px] bg-border-soft opacity-60" />
        </div>

        {eyebrow && (
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[1.5px] text-mute">
            {eyebrow}
          </span>
        )}
        <h2 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Por que você precisa do garçom?
        </h2>
        <p className="mb-[18px] text-[13px] text-mute text-pretty">
          Escolha o motivo. Vou avisar e te dar o tempo estimado.
        </p>

        <div data-scroll-area="true" className="flex flex-col gap-2.5 overflow-y-auto pb-1">
          {REASONS.map((r) => {
            const sel = selected === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setSelected(r.key)}
                className={`flex items-center gap-3 rounded-[14px] border-[1.3px] px-3.5 py-3 text-left transition-colors ${
                  sel ? 'border-ink bg-surface' : 'border-border-soft bg-bg'
                }`}
                aria-pressed={sel}
              >
                <span className="shrink-0 text-ink">{r.icon}</span>
                <span className="flex-1">
                  <span className="block text-[14.5px] font-medium leading-tight text-ink">{r.label}</span>
                  <span className="mt-[1px] block text-[12px] text-mute">{r.sub}</span>
                </span>
                <span className="shrink-0 text-[14px] text-faint">›</span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-2 rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger"
          >
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || submitting}
          className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-[14.5px] font-medium tracking-[-0.005em] transition-colors active:scale-[0.99] disabled:cursor-not-allowed ${
            selected && !submitting
              ? 'bg-ink text-white'
              : 'bg-faint text-white/80'
          }`}
          data-testid="call-waiter-confirm"
        >
          {submitting ? 'Chamando…' : 'Confirmar chamado'}
          {!submitting && <span aria-hidden>→</span>}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1.5 w-full p-2.5 text-[12px] text-mute underline underline-offset-[3px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
