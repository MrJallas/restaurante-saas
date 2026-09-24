import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Chave `x-staff-key` usada pelos specs que chamam a API direto.
 *
 * Ordem: `E2E_STAFF_API_KEY` > `STAFF_API_KEY` do ambiente > `STAFF_API_KEY` do
 * `.env` da raiz (o mesmo arquivo que o docker compose lê). Assim o E2E usa a
 * chave gerada no setup, sem literal fixo no código. Sem nenhuma das três, a
 * chave fica vazia e a API responde 403, o que aponta direto para a configuração.
 */
function resolveStaffApiKey(): string {
  const fromEnv = process.env.E2E_STAFF_API_KEY || process.env.STAFF_API_KEY;
  if (fromEnv) return fromEnv;
  try {
    const envFile = readFileSync(join(__dirname, '../../../../.env'), 'utf8');
    const match = envFile.match(/^STAFF_API_KEY=(.*)$/m);
    if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  } catch {
    // sem .env na raiz: cai no vazio (ver comentário acima)
  }
  return '';
}

export const STAFF_API_KEY = resolveStaffApiKey();
