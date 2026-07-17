/**
 * Open-redirect fechado POR CONSTRUÇÃO.
 *
 * NÃO é denylist (não enumera padrões ruins como `//`, `/\`, `http://`…): resolve
 * o candidato contra uma base fixa e só o devolve se o RESULTADO continuar na
 * MESMA origin. Assim a classe inteira de bypass fecha de uma vez — inclusive o
 * backslash `/\host`, que o parser WHATWG normaliza para `//host` e escaparia de
 * qualquer denylist baseada em `startsWith('//')`.
 *
 * Retorna o path interno seguro (pathname + query + hash) ou `null` se `raw`
 * escapar a origin / for inválido. O caller decide o fallback.
 */
const SAFE_ORIGIN = 'https://internal.invalid';

export function toInternalPath(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s, SAFE_ORIGIN);
    // Qualquer coisa que resolva para outra origin (//h, /\h, \/h, http://h,
    // javascript: → origin opaca) é rejeitada.
    if (u.origin === SAFE_ORIGIN) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    // URL inválida → trata como não-interno.
  }
  return null;
}

/**
 * Variante tenant-scoped: além de exigir mesma origin, impede que um redirect
 * recebido de query string atravesse para outro slug. O boundary explícito
 * evita falsos positivos como `/restaurante-malicioso` para o slug
 * `restaurante`.
 */
export function toTenantInternalPath(raw: string | null | undefined, slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(slug)) return null;
  const path = toInternalPath(raw);
  if (!path) return null;
  try {
    const url = new URL(path, SAFE_ORIGIN);
    const root = `/${slug}`;
    if (url.pathname === root || url.pathname.startsWith(`${root}/`)) {
      return path;
    }
  } catch {
    // `toInternalPath` já validou; mantemos fail-closed por defesa em profundidade.
  }
  return null;
}
