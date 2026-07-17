export interface FeedbackPaymentSummary {
  id: string;
  visitId: string | null;
  status: string;
}

/**
 * A tela pós-pagamento só pode afirmar sucesso com uma row liquidada da
 * sessão atual e o paymentId que originou a navegação. Pagamentos individuais
 * e de split pertencem à visita do caller; a conta inteira da mesa é
 * compartilhada (`visitId=null`) e pode ser avaliada por um participante da
 * própria sessão.
 */
export function canOpenConfirmedPaymentFeedback(input: {
  paymentId: string | null;
  visitId: string | null;
  payments: FeedbackPaymentSummary[];
}): boolean {
  if (!input.paymentId || !input.visitId) return false;
  const payment = input.payments.find((candidate) => candidate.id === input.paymentId);
  if (!payment || (payment.status !== 'confirmed' && payment.status !== 'paid')) return false;
  return payment.visitId === null || payment.visitId === input.visitId;
}
