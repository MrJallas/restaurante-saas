import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_INVALID',
  [HttpStatus.FORBIDDEN]: 'AUTH_FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

function normalizeMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value) && value.length > 0) {
    return 'Dados inválidos. Revise e tente novamente.';
  }
  return fallback;
}

function responseBody(exception: HttpException, status: number) {
  const response = exception.getResponse();
  if (!response || typeof response !== 'object') {
    const message = normalizeMessage(response, 'Erro inesperado. Tente novamente.');
    return {
      message_user: message,
      message,
      code: DEFAULT_CODES[status] ?? 'REQUEST_FAILED',
      statusCode: status,
    };
  }

  const record = response as {
    message_user?: unknown;
    message?: unknown;
    code?: unknown;
    error_code?: unknown;
    error?: unknown;
    debug?: unknown;
  };

  const code =
    typeof record.code === 'string'
      ? record.code
      : typeof record.error_code === 'string'
        ? record.error_code
        : DEFAULT_CODES[status] ?? 'REQUEST_FAILED';

  const messageUser = normalizeMessage(
    record.message_user ?? record.message,
    status >= 500 ? 'Erro interno. Tente novamente.' : 'Não foi possível concluir esta ação.',
  );

  const body: {
    message_user: string;
    message: unknown;
    code: string;
    statusCode: number;
    error?: string;
    debug?: unknown;
  } = {
    message_user: messageUser,
    message: record.message ?? messageUser,
    code,
    statusCode: status,
  };

  if (typeof record.error === 'string') {
    body.error = record.error;
  }

  if (record.debug && process.env.NODE_ENV !== 'production') {
    body.debug = record.debug;
  }

  return body;
}

@Catch(HttpException)
export class UserMessageExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();

    res.status(status).json(responseBody(exception, status));
  }
}
