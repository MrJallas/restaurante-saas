'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { apiPost } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { PillButton } from '../../../../components/ui/PillButton';

const TAGS = ['Comida', 'Atendimento', 'Ambiente', 'Rapidez', 'Assistente IA'] as const;

export default function PagamentoFeedbackPage() {
  const params = useParams();
  const { push } = useNav();
  const { visitId, customerId } = useSession();
  const slug = params.slug as string;

  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const toggleTag = (t: string) => {
    setSelectedTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const handleSubmit = async () => {
    if (submitting || rating === 0) return;
    setSubmitting(true);
    try {
      await apiPost(`/${slug}/feedbacks`, {
        visitId: visitId || undefined,
        customerId: customerId || undefined,
        overallRating: rating,
        tags: selectedTags,
        comment: comment || undefined,
      });
    } catch {
      /* ignore */
    }
    setSent(true);
    setTimeout(() => push(`/${slug}/cardapio`), 1600);
  };

  const skip = () => {
    push(`/${slug}/cardapio`);
  };

  if (sent) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink">
        <div className="flex h-[72px] w-[72px] animate-pop-in items-center justify-center rounded-full border-[1.5px] border-success text-[28px] text-success">
          ✓
        </div>
        <div className="text-[20px] font-semibold tracking-[-0.02em]">Obrigado!</div>
        <div className="text-[13px] text-mute">Sua opinião nos ajuda a melhorar.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <div className="flex shrink-0 justify-end px-[22px] pb-1.5 pt-[14px]">
        <button
          type="button"
          onClick={skip}
          className="text-[12px] text-mute underline underline-offset-[3px]"
        >
          Agora não
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-5 px-6 pb-5 pt-4">
        <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full border-[1.5px] border-success text-[24px] text-success">
          ✓
        </div>

        <div className="text-center">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-success">
            Pagamento confirmado
          </div>
          <div className="text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-pretty">
            Como foi sua experiência?
          </div>
          <div className="mt-2 text-[13px] text-mute text-pretty">
            Sua opinião nos ajuda a melhorar.
          </div>
        </div>

        <div className="flex gap-2.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = n <= rating;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                className={`flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.2px] text-[20px] transition-colors ${
                  active
                    ? 'border-ink bg-ink text-white'
                    : 'border-border-soft bg-bg text-faint'
                }`}
              >
                ★
              </button>
            );
          })}
        </div>

        <div className="w-full">
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
            O que você mais gostou?
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => {
              const selected = selectedTags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={`rounded-full border-[1.2px] border-ink px-3.5 py-[7px] text-[12px] font-medium transition-colors ${
                    selected ? 'bg-ink text-white' : 'bg-bg text-ink'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Conte mais sobre sua experiência (opcional)…"
          rows={3}
          className="w-full resize-none rounded-[14px] border-[1.2px] border-dashed border-border-soft bg-bg p-3.5 text-[13px] text-ink outline-none placeholder:italic placeholder:text-faint focus:border-solid focus:border-ink"
        />
      </div>

      <div className="shrink-0 px-[22px] pb-safe pb-6 pt-2.5">
        <PillButton
          variant="filled"
          fullWidth
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
        >
          {submitting ? 'Enviando…' : 'Enviar avaliação'}
        </PillButton>
      </div>
    </div>
  );
}
