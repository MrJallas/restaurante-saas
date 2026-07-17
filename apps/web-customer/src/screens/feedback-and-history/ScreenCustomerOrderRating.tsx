'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '../../lib/api';
import { submitOrderRating } from '../../lib/api/feedback';
import { useSession } from '../../hooks/useSession';
import { useRequireCustomerId } from '../../hooks/useRequireCustomerId';
import { AppShell } from '../../components/layout/AppShell';
import { PillButton } from '../../components/ui/PillButton';

interface ScreenCustomerOrderRatingProps {
  slug: string;
  orderId: string;
}

/**
 * Monta o redirect pro composer de reclamação preservando o comentário digitado.
 *
 * BUGFIX (P2 re-scan): num rating <=3 com comentário, o composer recebia só
 * `?orderId=...` e o texto que o cliente já tinha escrito era descartado sem
 * aviso — ele redigitava tudo de novo. Agora o comentário viaja na query
 * (`&comment=...`, URL-encoded) pro composer pré-preencher. Comentário vazio /
 * só espaços não adiciona `comment=` (composer abre limpo, comportamento antigo).
 */
export function buildComplaintRedirect(slug: string, orderId: string, comment: string): string {
  const base = `/${slug}/complaints/new?orderId=${encodeURIComponent(orderId)}`;
  const trimmed = comment.trim();
  return trimmed ? `${base}&comment=${encodeURIComponent(trimmed)}` : base;
}

/**
 * Post-delivery order rating screen. Triggered by the BE-scheduled push
 * notification (~13min after `delivered`). The push lands on the customer's
 * lock screen and deep-links to `/{slug}/orders/{orderId}/rating`.
 *
 * UX rules per `complaint-flow-v12.md`:
 *   - 5 stars + optional textarea
 *   - rating >= 4 + empty comment → ends here, friendly toast
 *   - rating <= 3 OR comment non-empty → BE returns redirectTo and we
 *     navigate the customer to the complaint composer (`redirectTo`
 *     already contains the complaint route prefix from the BE).
 *   - already-rated (idempotent) → friendly empty-state, no error
 *
 * The image upload is omitted in this V1 (out of scope for the BE today —
 * `attachedImageUrl` exists in the complaint payload but we don't have a
 * file upload endpoint yet, so we keep the surface minimal).
 */
export function ScreenCustomerOrderRating({ slug, orderId }: ScreenCustomerOrderRatingProps) {
  const session = useSession();
  const router = useRouter();
  // P0: rating depende de customerId. Push notification cold-start
  // pode chegar aqui sem customerId; o hook bouncha pro /identify.
  const ready = useRequireCustomerId(slug);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Pre-rating push lands cold — if for some reason the customer has no
  // session (e.g. cookie expired), bounce them to the slug home so they can
  // re-establish identity. Avoids posting with `customerId=null`.
  useEffect(() => {
    if (!session.isValid) {
      // give the SessionProvider a tick to rehydrate from storage before
      // bouncing — only redirect if it's still empty after one frame.
      const timer = setTimeout(() => {
        if (!session.isValid) router.replace(`/${slug}`);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [session.isValid, router, slug]);

  const canSubmit = rating > 0 && !submitting && !!session.customerId;

  const handleSubmit = async () => {
    if (!canSubmit || !session.customerId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitOrderRating(slug, {
        orderId,
        customerId: session.customerId,
        visitId: session.visitId ?? undefined,
        rating,
        comment: comment.trim() || undefined,
      });

      // BE returns redirectTo when rating <=3 OR a complaint was auto-created
      // from a low rating with comment. Honor it; otherwise we end here.
      if (res.redirectTo) {
        // BE returns paths like `/complaint/<id>` or
        // `/complaint/compose?orderId=...` — we prefix `/${slug}` and
        // translate to our route convention.
        if (res.complaintId) {
          router.push(`/${slug}/complaints/${res.complaintId}`);
          return;
        }
        // Compose path → carry orderId AND the comment already typed so the
        // composer pre-fills instead of silently dropping the text.
        router.push(buildComplaintRedirect(slug, orderId, comment));
        return;
      }
      setDone(true);
    } catch (err: unknown) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Não consegui enviar sua avaliação agora. Tente de novo em instantes.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  if (!ready) return null;

  if (done) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={session.tableLabel ?? ''}
        onBack={() => router.push(`/${slug}`)}
        showHamburger={false}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-[22px] pb-12 text-center">
          <div className="mb-3 text-[24px] font-semibold tracking-[-0.02em]">
            Obrigado pela avaliação
          </div>
          <div className="max-w-[280px] text-[14px] leading-[1.5] text-mute">
            Quer pedir um café ou voltar pro cardápio? Estamos por aqui.
          </div>
          <div className="mt-8 flex w-full max-w-[280px] flex-col gap-2.5">
            <PillButton variant="filled" fullWidth onClick={() => router.push(`/${slug}/cardapio`)}>
              Voltar ao cardápio
            </PillButton>
            <PillButton variant="outline" fullWidth onClick={() => router.push(`/${slug}`)}>
              Voltar pra mesa
            </PillButton>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      onBack={() => router.push(`/${slug}`)}
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-mute">
          Como foi a experiência?
        </div>
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Conta pra gente
        </h1>
        <p className="mb-7 text-[14px] leading-[1.45] text-mute">
          Sua avaliação ajuda a casa a entender o que tá funcionando · e o que ainda precisa
          ajustar.
        </p>

        {/* 5 stars */}
        <div className="rounded-[14px] border-[1.4px] border-ink bg-bg p-5 text-center">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-mute">
            Toque numa estrela
          </div>
          <div
            className="flex justify-center gap-3"
            role="group"
            aria-label="Avaliação em estrelas"
          >
            {stars.map((n) => {
              const filled = (hover || rating) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
                  aria-pressed={rating === n}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  className="flex min-h-11 min-w-11 items-center justify-center transition-transform duration-100 active:scale-95"
                >
                  <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden>
                    <path
                      d="M16 4l3.5 8.5L28 14l-6.5 5.5 2 8.5L16 23l-7.5 5 2-8.5L4 14l8.5-1.5z"
                      fill={filled ? '#0a0a0a' : 'none'}
                      stroke="#0a0a0a"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              );
            })}
          </div>
          {rating > 0 && (
            <div className="mt-4 text-[14px] text-mute">
              {rating <= 2
                ? 'Sentimos muito · vamos te ouvir'
                : rating === 3
                  ? 'Vamos melhorar'
                  : rating === 4
                    ? 'Ótimo · obrigado'
                    : 'Sensacional · obrigado'}
            </div>
          )}
        </div>

        {/* textarea */}
        <div className="mt-5">
          <label
            htmlFor="rating-comment"
            className="mb-2 block text-[10px] font-semibold uppercase tracking-[1.5px] text-mute"
          >
            Comentário (opcional)
          </label>
          <textarea
            id="rating-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Quer deixar um comentário para a equipe?"
            maxLength={2000}
            rows={4}
            className="w-full resize-none rounded-[14px] border border-border-soft bg-surface px-4 py-3.5 text-[15px] leading-[1.45] text-ink outline-none placeholder:text-faint focus-within:border-ink/40"
          />
          <div className="mt-1.5 text-right font-mono text-[10px] tabular-nums text-faint">
            {comment.length}/2000
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <PillButton variant="filled" fullWidth disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? 'Enviando…' : 'Enviar avaliação'}
          </PillButton>
          <PillButton
            variant="outline"
            fullWidth
            onClick={() => router.push(buildComplaintRedirect(slug, orderId, comment))}
          >
            Reportar um problema
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
