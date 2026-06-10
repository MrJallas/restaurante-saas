export type AuthErrorCode = 'AUTH_MISSING' | 'AUTH_INVALID' | 'AUTH_FORBIDDEN';

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
