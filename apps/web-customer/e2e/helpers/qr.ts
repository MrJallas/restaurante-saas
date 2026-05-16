import crypto from 'node:crypto';

/**
 * HMAC secrets pras 5 mesas seed do tenant `restaurant_dev`. Vem da
 * coluna `tables.qr_hmac_secret`. Sao fixos por mesa (recriar tenant
 * gera novos UUIDs — atualizar aqui se acontecer).
 *
 * Mantemos hardcoded em vez de query no DB pra que a suite rode sem
 * dependencia de pg client. Se rotacionar segredos no dev, basta uma
 * rapida `psql -c "SELECT code, qr_hmac_secret FROM tables"`.
 */
export const TABLE_SECRETS = {
  M01: '5e4cf4c2-58e9-44fe-a0c0-e3aa7a9f53eb',
  M02: 'f071eda7-4c4b-4a40-b5eb-da957f000076',
  M03: '3d8c052a-14f6-4632-9f6b-9527835d08d1',
  M04: '85ef443a-f9bb-4205-a729-05a5f2652f26',
  M05: '6068dff0-7ef8-4eb3-a042-b25e7d54f34a',
} as const;

export type TableCode = keyof typeof TABLE_SECRETS;

export interface BuildMesaUrlOptions {
  slug?: string;
  tableCode?: TableCode;
  baseUrl?: string;
  /** Para forcar ts especifico — util pra testar QR expirado. */
  ts?: number;
}

/**
 * Gera a URL assinada que o iPhone receberia ao escanear o QR. Mesmo
 * algoritmo de `apps/api/src/modules/table-session/qr-code.service.ts`
 * (`HMAC-SHA256(`${tableCode}:${ts}`, secret)`).
 */
export function buildMesaUrl({
  slug = 'restaurant_dev',
  tableCode = 'M01',
  baseUrl = 'http://localhost:3003',
  ts = Date.now(),
}: BuildMesaUrlOptions = {}): string {
  const secret = TABLE_SECRETS[tableCode];
  const tsStr = ts.toString();
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${tableCode}:${tsStr}`)
    .digest('hex');
  return `${baseUrl}/${slug}/mesa/${tableCode}?hmac=${sig}&ts=${tsStr}`;
}
