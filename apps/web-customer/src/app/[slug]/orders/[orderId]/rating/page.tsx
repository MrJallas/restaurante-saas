'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerOrderRating } from '../../../../../screens/feedback-and-history/ScreenCustomerOrderRating';

/**
 * Route: `/{slug}/orders/{orderId}/rating`
 *
 * Deep-link target of the post-delivery rating push (~13min after delivered).
 * Per `docs/produto/funcionalidades/avaliacao-e-reclamacao.md`, section
 * "Avaliação do pedido".
 */
export default function OrderRatingPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  const orderId = String(params.orderId ?? '');
  if (!slug || !orderId) return null;
  return <ScreenCustomerOrderRating slug={slug} orderId={orderId} />;
}
