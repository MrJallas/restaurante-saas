'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiPatch } from '../../../../lib/api';
import { useDraftOrder } from '../../../../providers/DraftOrderProvider';
import { useSession } from '../../../../hooks/useSession';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';

const TOTAL_SECONDS = 15;
const REVEAL_INTERVAL_MS = 2200;
const SERVICE_RATE = 0.1;

export default function PedidoConfirmandoPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tableLabel } = useSession();
  const slug = params.slug as string;
  const orderId = searchParams.get('orderId') ?? '';

  const { items, totalCents, clear } = useDraftOrder();
  const [seconds, setSeconds] = useState(TOTAL_SECONDS);
  const [reveal, setReveal] = useState(0);
  const [busy, setBusy] = useState(false);
  const autoSentRef = useRef(false);

  const service = Math.round(totalCents * SERVICE_RATE);
  const total = totalCents + service;
  const pct = ((TOTAL_SECONDS - seconds) / TOTAL_SECONDS) * 100;
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  useEffect(() => {
    if (items.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    items.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setReveal((r) => Math.max(r, i + 1));
        }, i * REVEAL_INTERVAL_MS + 200),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [items]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const confirmNow = useCallback(async () => {
    if (busy || !orderId) return;
    setBusy(true);
    try {
      await apiPatch(`/${slug}/orders/${orderId}/confirm`, {});
    } catch {
      /* backend may auto-confirm */
    }
    clear();
    router.replace(`/${slug}/pedido/enviado?orderId=${orderId}`);
  }, [busy, clear, orderId, router, slug]);

  const cancelEdit = useCallback(async () => {
    if (busy || !orderId) return;
    setBusy(true);
    try {
      await apiPatch(`/${slug}/orders/${orderId}/cancel`, {});
    } catch {
      /* ignore */
    }
    router.replace(`/${slug}/pedido/revisar`);
  }, [busy, orderId, router, slug]);

  useEffect(() => {
    if (seconds === 0 && !autoSentRef.current) {
      autoSentRef.current = true;
      confirmNow();
    }
  }, [seconds, confirmNow]);

  if (items.length === 0) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pedido/confirmando`}
      >
        <div className="flex flex-1 items-center justify-center">
          <div className="text-[13px] text-mute">Carregando confirmação…</div>
        </div>
      </AppShell>
    );
  }

  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pedido/confirmando`}
      noMainPadding
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col">
        <div className="shrink-0 px-[22px]">
          <div className="h-[3px] overflow-hidden rounded-[2px] bg-border-soft">
            <div
              className="h-full bg-ink transition-[width] duration-1000 linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="shrink-0 px-[22px] pb-1.5 pt-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
                Confirmando pedido
              </div>
              <div className="text-[22px] font-semibold tracking-[-0.02em]">
                Você tem {seconds}s para revisar
              </div>
            </div>
            <div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center">
              <svg
                width="58"
                height="58"
                viewBox="0 0 58 58"
                className="absolute inset-0"
                aria-hidden
              >
                <circle cx="29" cy="29" r={radius} fill="none" stroke="var(--color-border-soft)" strokeWidth="2" />
                <circle
                  cx="29"
                  cy="29"
                  r={radius}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="2"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 29 29)"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <span className="text-[22px] font-semibold tabular-nums">{seconds}</span>
            </div>
          </div>
          <div className="text-[12px] text-mute text-pretty">
            Seus itens estão sendo organizados. Confira cada um abaixo.
          </div>
        </div>

        <div className="flex-1 overflow-auto px-[22px] pb-5 pt-3.5">
          {items.map((it, i) => {
            const shown = i < reveal;
            const lineTotal = it.priceCents * it.quantity;
            return (
              <div
                key={it.draftId}
                className={`flex items-start gap-3.5 py-4 ${
                  i < items.length - 1 ? 'border-b border-border-soft' : ''
                }`}
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? 'translateY(0)' : 'translateY(12px)',
                  filter: shown ? 'blur(0)' : 'blur(4px)',
                  transition: 'opacity 0.5s ease, transform 0.5s ease, filter 0.5s ease',
                }}
              >
                <div
                  className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
                    shown
                      ? 'border-[1.3px] border-ink bg-ink text-white'
                      : 'border-[1.3px] border-border-soft bg-bg text-faint'
                  }`}
                >
                  {it.quantity}×
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <div className="text-[16px] font-medium tracking-[-0.01em]">{it.name}</div>
                    <div className="text-[14px] font-semibold tabular-nums">
                      {fmt(lineTotal)}
                    </div>
                  </div>
                  {it.note && (
                    <div className="mt-0.5 text-[12px] italic leading-[1.4] text-mute text-pretty">
                      obs: {it.note}
                    </div>
                  )}
                  {it.size && (
                    <div className="mt-0.5 text-[11px] text-faint">{it.size}</div>
                  )}
                </div>
                {shown && (
                  <div className="flex h-[22px] w-[22px] shrink-0 animate-pop-in items-center justify-center rounded-full bg-success text-[13px] text-white">
                    ✓
                  </div>
                )}
              </div>
            );
          })}

          {reveal >= items.length && (
            <div className="mt-4 flex animate-fade-up items-start gap-2.5 rounded-[14px] border border-border-soft bg-surface p-3.5 text-[13px] leading-[1.45] text-ink text-pretty">
              <span className="text-[14px]">✦</span>
              <div>
                <b>Tudo certo?</b> Total de{' '}
                <b className="tabular-nums">{fmt(total)}</b>. O pedido será enviado
                automaticamente em {seconds}s, ou confirme agora.
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
          <PillButton onClick={cancelEdit} disabled={busy} className="flex-1">
            ← Editar
          </PillButton>
          <PillButton
            variant="filled"
            onClick={confirmNow}
            disabled={busy}
            className="flex-[2]"
          >
            Confirmar agora
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
