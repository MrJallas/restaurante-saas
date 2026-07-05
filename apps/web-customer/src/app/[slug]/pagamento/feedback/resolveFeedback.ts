/**
 * Lógica pura da tela /pagamento/feedback, num módulo separado do `page.tsx`
 * porque o Next 14 proíbe named exports fora do contrato de rota num arquivo de
 * página.
 */

export interface FeedbackPayload {
  visitId: string;
  customerId?: string;
  overallRating: number;
  tags: string[];
  comment?: string;
}

export type FeedbackResolution =
  | { ok: true; payload: FeedbackPayload }
  | { ok: false; error: string };

/**
 * Valida a sessão e monta o payload de `POST /:slug/feedbacks` ANTES de bater
 * na rede.
 *
 * BUGFIX (P2 re-scan): o backend exige `visitId` (@IsUUID @IsNotEmpty — a coluna
 * é NOT NULL). O FE mandava `visitId || undefined`, então numa sessão sem
 * visitId o POST tomava 400 e o handler só setava um erro genérico "tente
 * novamente" — o retry mandava undefined de novo → loop de erro permanente.
 * Aqui barramos o envio sem visitId com uma mensagem HONESTA (não convida a
 * repetir o que sempre vai falhar). Rating 0 (nenhuma estrela) também não passa.
 */
export function resolveFeedbackSubmission(input: {
  visitId: string | null | undefined;
  customerId: string | null | undefined;
  rating: number;
  tags: string[];
  comment: string;
}): FeedbackResolution {
  if (input.rating <= 0) {
    return { ok: false, error: 'Toque numa estrela pra avaliar antes de enviar.' };
  }
  const visitId = (input.visitId ?? '').trim();
  if (!visitId) {
    return {
      ok: false,
      error:
        'Não consegui registrar sua avaliação: esta sessão não tem uma visita ativa. Reabra a mesa pelo QR pra avaliar.',
    };
  }
  const customerId = (input.customerId ?? '').trim() || undefined;
  const comment = input.comment.trim() || undefined;
  return {
    ok: true,
    payload: {
      visitId,
      customerId,
      overallRating: input.rating,
      tags: input.tags,
      comment,
    },
  };
}
