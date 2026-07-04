import type { StaffSessionPayload } from './staff-session-token';

/**
 * Gate #34 (decisão Caleb, opção A): a identidade que AGE deriva do token
 * de sessão verificado.
 *
 * Os guards de staff (StaffOnlyGuard e o token-path do
 * `resolveAuthenticatedStaff`, usado por ManagerOnly/HostOrManager), ao
 * verificarem o `x-staff-token` com sucesso, carimbam o payload VERIFICADO
 * em `req.staffAuth`. O `CallerResolverService` lê DAQUI antes de olhar o
 * header client-controlled `x-staff-id`.
 *
 * Quando a autorização vem da `x-staff-key` legada (TV/estação, proxy
 * server-side — sem token), o carimbo NÃO acontece e `staffAuth` fica
 * ausente — o resolver cai no fallback atual do header.
 */
export interface StaffAuthRequest {
  /** Payload verificado do token de sessão — só presente pós-guard com token. */
  staffAuth?: StaffSessionPayload;
}
