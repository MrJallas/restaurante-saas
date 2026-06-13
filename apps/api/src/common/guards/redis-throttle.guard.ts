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
 * Rate-limit Redis-backed para endpoints staff de leitura intensa — as TVs
 * de cozinha/bar fazem polling do `GET /:slug/orders/_kds`. Sem limite, o
 * endpoint (alcançável via proxy) fica aberto a flood.
 *
 * Decisões:
 *  - Conta pelo IP REAL do peer TCP (`req.socket.remoteAddress`). NÃO confia
 *    em `X-Forwarded-For` / `X-Real-IP`: o cliente pode rotacioná-los pra
 *    burlar o limite (P1-4 / P3-NEW exercitam exatamente esse bypass).
 *  - INCR atômico + EXPIRE só na 1ª request da janela → o contador reflete
 *    exatamente o nº de requests na janela (P3-2 valida counter == nº calls).
 *  - Fail-open: se o Redis falhar, LIBERA. Um rate-limiter nunca deve
 *    derrubar a API; melhor perder o limite momentaneamente que dar 5xx.
 *
 * Configurável: KDS_THROTTLE_LIMIT (default 200) por
 * KDS_THROTTLE_WINDOW_SECONDS (default 60).
 */
@Injectable()
export class RedisThrottleGuard implements CanActivate {
  private readonly logger = new Logger(RedisThrottleGuard.name);
  private readonly limit = Number(process.env.KDS_THROTTLE_LIMIT ?? 200);
  private readonly windowSeconds = Number(process.env.KDS_THROTTLE_WINDOW_SECONDS ?? 60);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `throttle:orders_kds:${this.realIp(request)}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, this.windowSeconds);
      }
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
      // O 429 acima deve propagar; qualquer OUTRO erro (ex.: Redis down)
      // cai em fail-open pra não transformar rate-limit em outage.
      if (err instanceof HttpException) throw err;
      this.logger.warn(`RedisThrottleGuard fail-open: ${(err as Error)?.message ?? String(err)}`);
      return true;
    }
  }

  /**
   * IP do peer TCP — ignora headers de proxy forjáveis. Normaliza o
   * prefixo IPv4-mapeado em IPv6 (`::ffff:1.2.3.4` → `1.2.3.4`).
   */
  private realIp(request: Request): string {
    const raw = request.socket?.remoteAddress ?? (request as { ip?: string }).ip ?? 'unknown';
    return raw.replace(/^::ffff:/, '');
  }
}
