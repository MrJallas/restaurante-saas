/**
 * `useParams()` pode entregar o segmento dinâmico já percent-encoded depois
 * de navegação ou hard reload. Normalizamos uma única vez; a camada de API é
 * responsável pela única codificação de saída.
 */
export function normalizeChatThreadIdParam(value: unknown): string {
  const raw = String(value ?? '');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    // Segmento malformado segue cru e a API responde 404 estruturado. Não
    // tentamos decodificar repetidamente nem lançamos durante o render.
    return raw;
  }
}
