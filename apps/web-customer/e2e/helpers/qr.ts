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
  M01: 'b5f0bf0d-c1f6-4b89-aeab-b243b09ceff9',
  M02: 'a6a7205e-3085-4d66-91ed-6e56a9056944',
  M03: '3fbb05ce-fb04-45fe-9291-a1b6f53fbfc3',
  M04: '576dcda5-018a-4893-9388-9809cfd72705',
  M05: '6d0a126d-c9fa-4a11-881e-0ef9a96d247d',
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
