import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';

export interface SessionData {
  sessionId: string;
  tableId: string;
  tableCode: string;
  tableLabel: string;
  schemaName: string;
}

export interface SessionRequest {
  sessionData?: SessionData;
  cookies?: Record<string, string>;
  headers: Record<string, string>;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();

    const token =
      request.cookies?.session_token ||
      request.headers['x-session-token'];

    if (!token) {
      throw new HttpException('Sessao nao encontrada. Escaneie o QR Code novamente.', HttpStatus.UNAUTHORIZED);
    }

    const data = await this.redis.get(`session:${token}`);

    if (!data) {
      throw new HttpException('Sessao expirada. Escaneie o QR Code novamente.', HttpStatus.UNAUTHORIZED);
    }

    request.sessionData = JSON.parse(data) as SessionData;
    return true;
  }
}
