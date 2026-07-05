import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infra/redis/redis.service';
import { safeJsonParse } from '../utils/safe-json';
import { revalidateSessionOrThrow } from './session-revalidation';

export interface SessionData {
  sessionId: string;
  tableId: string;
  tableCode: string;
  tableLabel: string;
  schemaName: string;
  customerId?: string;
}

export interface SessionRequest {
  sessionData?: SessionData;
  cookies?: Record<string, string>;
  headers: Record<string, string>;
  /**
   * Schema Postgres do tenant resolvido pelo TenantMiddleware a partir do
   * slug da URL. Usado pelo guard pra cruzar o tenant do token com o da rota
   * (A04/multi-tenant).
   */
  tenantSchemaName?: string;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();

    const token = request.cookies?.session_token || request.headers['x-session-token'];

    if (!token) {
      throw new HttpException(
        'Sessao nao encontrada. Escaneie o QR Code novamente.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const data = await this.redis.get(`session:${token}`);

    if (!data) {
      throw new HttpException(
        'Sessao expirada. Escaneie o QR Code novamente.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Round 16 (B-NEW-53): safeJsonParse trata payload corrompido como
    // "session inválida" em vez de crashar 5xx.
    const parsed = safeJsonParse<SessionData>(data);
    if (!parsed) {
      throw new HttpException(
        'Sessao corrompida. Escaneie o QR Code novamente.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // A04 + multi-tenant: além de existência, cruza o tenant do token com o
    // da URL e revalida que a sessão continua ativa no Postgres (sessão
    // fechada/liberada não cria mais orders/payments).
    await revalidateSessionOrThrow(this.dataSource, parsed, request);

    request.sessionData = parsed;
    return true;
  }
}
