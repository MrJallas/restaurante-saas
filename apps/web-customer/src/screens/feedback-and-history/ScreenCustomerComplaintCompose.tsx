'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '../../lib/api';
import { createComplaint, cacheComplaint } from '../../lib/api/feedback';
import { useSession } from '../../hooks/useSession';
import { AppShell } from '../../components/layout/AppShell';
import { PillButton } from '../../components/ui/PillButton';
import type { ComplaintProblemType } from '@restaurant/shared-types';

interface ScreenCustomerComplaintComposeProps {
  slug: string;
  /** Pre-fills the complaint with the order context (for the rating-redirect path). */
  orderId?: string;
  /** When the rating screen has already created an OrderRating row. */
  orderRatingId?: string;
}

const PROBLEM_CHIPS: Array<{ value: ComplaintProblemType; label: string }> = [
  { value: 'demora', label: 'Demora' },
  { value: 'item-errado', label: 'Item errado' },
  { value: 'item-faltando', label: 'Item faltando' },
  { value: 'comida-fria', label: 'Comida fria' },
  { value: 'outro', label: 'Outro motivo' },
];

/**
 * Complaint composer · per `complaint-flow-v12.md` (Pattern2A → 2C in canvas).
 * 5 problem-type chips + textarea (required) + (V2 photo). Submit creates the
 * complaint and routes to the waiting screen with the protocol number.
 *
 * Photo upload is intentionally deferred — the BE accepts `attachedImageUrl`
 * but there's no upload endpoint today. We surface the field as a no-op
 * placeholder so the flow ships without blocking on infra.
 */
export function ScreenCustomerComplaintCompose({
  slug,
  orderId,
  orderRatingId,
}: ScreenCustomerComplaintComposeProps) {
  const session = useSession();
  const router = useRouter();
  const [problemType, setProblemType] = useState<ComplaintProblemType | null>(
    null,
  );
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.isValid) {
      const timer = setTimeout(() => {
        if (!session.isValid) router.replace(`/${slug}`);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [session.isValid, router, slug]);

  const canSubmit =
    !!problemType && text.trim().length > 0 && !submitting && !!session.customerId;

  const handleSubmit = async () => {
    if (!canSubmit || !session.customerId || !problemType) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createComplaint(slug, {
        orderId,
        orderRatingId,
        customerId: session.customerId,
        visitId: session.visitId ?? undefined,
        problemType,
        // shared-type calls it `description`; our composer surface uses
        // `text` (the BE field name). The helper merges the chip label.
        description: text.trim(),
        text: text.trim(),
      });
      // Cache the freshly-created complaint so the waiting screen has data
      // even on a hard reload (BE has no customer-facing GET today).
      cacheComplaint(created);
      router.replace(`/${slug}/complaints/${created.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Não consegui registrar agora. Tente de novo em instantes.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      onBack={() => router.back()}
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        {/* Renata online indicator (per spec) */}
        <div className="mb-4 flex items-center gap-2 self-start rounded-full border border-border-soft bg-surface px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-mute">
            Renata · online agora
          </span>
        </div>

        <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Reportar um problema
        </h1>
        <p className="mb-5 text-[14px] leading-[1.45] text-mute">
          Conta o que aconteceu · vou passar pra Renata. Costuma responder em
          ~2 min.
        </p>

        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-mute">
          Tipo do problema
        </div>
        <div className="mb-5 flex flex-wrap gap-2">
          {PROBLEM_CHIPS.map((chip) => {
            const active = problemType === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setProblemType(chip.value)}
                aria-pressed={active}
                className={`inline-flex items-center rounded-full px-3.5 py-2 text-[13px] font-medium tracking-[-0.005em] transition-colors duration-100 ${
                  active
                    ? 'border-[1.2px] border-ink bg-ink text-white'
                    : 'border-[1.2px] border-border-soft bg-bg text-ink active:bg-surface'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <label
          htmlFor="complaint-text"
          className="mb-2 block text-[10px] font-semibold uppercase tracking-[1.5px] text-mute"
        >
          Conta o que aconteceu
        </label>
        <textarea
          id="complaint-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="O risoto chegou frio e demorou muito · não consegui terminar"
          maxLength={2000}
          rows={5}
          className="w-full resize-none rounded-[14px] border border-border-soft bg-surface px-4 py-3.5 text-[15px] leading-[1.45] text-ink outline-none placeholder:text-faint focus-within:border-ink/40"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-faint">
            Foto opcional (em breve)
          </span>
          <span className="font-mono text-[10px] tabular-nums text-faint">
            {text.length}/2000
          </span>
        </div>

        {error && (
          <div className="mt-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <PillButton
            variant="filled"
            fullWidth
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? 'Enviando…' : 'Enviar pra Renata'}
          </PillButton>
          <PillButton
            variant="outline"
            fullWidth
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancelar
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
