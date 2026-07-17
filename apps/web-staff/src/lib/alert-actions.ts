import type { AlertActionDescriptor } from './api/manager';
import { toInternalPath } from './safe-internal-path';

export function normalizeAlertActions(
  actions: AlertActionDescriptor[] | null | undefined,
): AlertActionDescriptor[] {
  return (actions ?? [])
    .filter((action) => typeof action?.label === 'string' && action.label.trim().length > 0)
    .slice(0, 2);
}

export function resolveManagerAlertRoute(
  action: AlertActionDescriptor,
  tenantSlug: string,
): string {
  const supplied = action.route ? toInternalPath(action.route) : null;
  if (supplied) {
    const url = new URL(supplied, 'http://internal.local');
    if (!url.searchParams.has('slug')) url.searchParams.set('slug', tenantSlug);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  const qs = `?slug=${encodeURIComponent(tenantSlug)}`;
  const label = action.label.toLowerCase();
  if (/cozinha|fila|entregar/.test(label)) return `/manager/kitchen-reorder${qs}`;
  if (/realocar/.test(label)) return `/manager/equipe/sobrecarga${qs}`;
  if (/pausar|pausa/.test(label)) return `/manager/pausa-zona${qs}`;
  if (/cliente|mensagem|conversa/.test(label)) return `/manager/mensagens${qs}`;
  if (/garçom|garcom|equipe/.test(label)) return `/manager/equipe${qs}`;
  return `/manager/alertas${qs}`;
}
