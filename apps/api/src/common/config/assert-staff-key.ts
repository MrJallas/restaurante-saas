/**
 * P1-F fail-fast do STAFF_API_KEY.
 *
 * O header `x-staff-key` (validado por StaffOnlyGuard/StaffOrSessionGuard)
 * depende de um segredo compartilhado nao-vazio e nao-conhecido. Dois modos
 * de falha silenciosa que este guard barra no boot:
 *
 *  1. STAFF_API_KEY ausente em producao — o guard falharia fechado (403 em
 *     todo endpoint staff) sem sinal claro de config quebrada.
 *  2. STAFF_API_KEY == literal committado `dev-staff-api-key-change-in-prod`
 *     — segredo publico conhecido (esteve no git); usar em prod = qualquer
 *     um autentica como staff.
 *
 * Em dev (NODE_ENV != production) a ausencia so vira warn, mantendo o local
 * destravado.
 */
export const KNOWN_LEAKED_STAFF_KEY = 'dev-staff-api-key-change-in-prod';

export interface StaffKeyLogger {
  warn(message: string): void;
}

export function assertStaffKeyConfigured(
  logger: StaffKeyLogger,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const key = env.STAFF_API_KEY;
  const isProd = env.NODE_ENV === 'production';

  if (!key) {
    if (isProd) {
      throw new Error('STAFF_API_KEY nao configurada — obrigatoria em producao.');
    }
    logger.warn('STAFF_API_KEY vazia — endpoints StaffOnly vao rejeitar (403). OK so em dev.');
    return;
  }

  if (isProd && key === KNOWN_LEAKED_STAFF_KEY) {
    throw new Error(
      'STAFF_API_KEY usa o default committado (comprometido). Rotacione para um segredo unico.',
    );
  }
}
