'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerMe } from '../../../screens/feedback-and-history/ScreenCustomerMe';

/**
 * Route: `/{slug}/eu`
 *
 * Tela "Eu" do cliente — perfil + sessão + atalhos + ações de privacidade.
 * Substitui o link passivo "Trocar perfil" do MenuDrawer.
 */
export default function CustomerMePage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  if (!slug) return null;
  return <ScreenCustomerMe slug={slug} />;
}
