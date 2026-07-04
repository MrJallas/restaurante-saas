import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * Rate-limit por-IP no fluxo de recuperação de PIN (`POST /:slug/staff-auth/forgot`
 * e `.../forgot/verify`). Defense-in-depth: complementa o throttle por-(tenant,cpf)
 * do StaffAuthService — este limita o FLOOD por IP (varredura do código de 6
 * dígitos rotacionando CPFs, ou spam de emissão de código).
 *
 * Mesma disciplina do RedisThrottleGuard:
 *  - Conta pelo IP REAL do peer TCP (`req.socket.remoteAddress`); NÃO confia em
 *    X-Forwarded-For / X-Real-IP (forjáveis pra burlar o limite).
 *  - INCR+EXPIRE atômico via Lua (redis.incrWithExpiry).
 *  - Fail-open: se o Redis falhar, LIBERA (rate-limiter nunca derruba a API).
 *
 * Configurável: STAFF_RECOVERY_THROTTLE_LIMIT (default 20) por
 * STAFF_RECOVERY_THROTTLE_WINDOW_SECONDS (default 600 = janela do código).
 */
@Injectable()
export class RecoveryThrottleGuard implements CanActivate {
  private readonly logger = new Logger(RecoveryThrottleGuard.name);
  private readonly limit = Number(process.env.STAFF_RECOVERY_THROTTLE_LIMIT ?? 20);
  private readonly windowSeconds = Number(
    process.env.STAFF_RECOVERY_THROTTLE_WINDOW_SECONDS ?? 600,
  );

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `throttle:staff_recovery:${this.realIp(request)}`;

    try {
      const count = await this.redis.incrWithExpiry(key, this.windowSeconds);
      if (count > this.limit) {
        throw new HttpException(
          {
            message: 'Muitas requisições. Tente novamente em instantes.',
            message_user: 'Muitas requisições. Tente novamente em instantes.',
            code: 'RATE_LIMITED',
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(
        `RecoveryThrottleGuard fail-open: ${(err as Error)?.message ?? String(err)}`,
      );
      return true;
    }
  }

  private realIp(request: Request): string {
    const raw = request.socket?.remoteAddress ?? (request as { ip?: string }).ip ?? 'unknown';
    return raw.replace(/^::ffff:/, '');
  }
}
