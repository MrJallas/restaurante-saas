export type AuthErrorCode =
  | 'AUTH_MISSING'
  | 'AUTH_INVALID'
  | 'AUTH_FORBIDDEN'
  // P2 hardening: token válido mas com must_change_pin pendente — só a rota
  // de trocar o PIN o aceita; todo o resto é bloqueado até a troca.
  | 'AUTH_PIN_CHANGE_REQUIRED';

export interface AuthErrorResponse {
  message: string;
  message_user: string;
  code: AuthErrorCode;
}

export function authErrorResponse(code: AuthErrorCode, message: string): AuthErrorResponse {
  return {
    message,
    message_user: message,
    code,
  };
}
