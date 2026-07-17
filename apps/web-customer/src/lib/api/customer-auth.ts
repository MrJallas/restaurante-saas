import { apiPost } from '../api';

export interface CustomerLogoutResult {
  ok: true;
  revoked: boolean;
}

/**
 * Revoga o recognition_token no backend e recebe o Set-Cookie expirado. Só
 * depois desta confirmação a UI deve apagar o estado local/navegar.
 */
export function logoutCustomer(slug: string): Promise<CustomerLogoutResult> {
  return apiPost<CustomerLogoutResult>(`/${slug}/customer/logout`, {});
}
