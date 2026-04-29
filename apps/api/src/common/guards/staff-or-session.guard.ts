import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import type { SessionData, SessionRequest } from './session.guard';

/**
 * Guarda os endpoints que aceitam ate dois tipos de chamador:
 *  1. App de staff (cozinha/garcom) — autentica via header
 *     `x-staff-key` igual a `process.env.STAFF_API_KEY`. E uma chave
 *     compartilhada porque os web-staff atuais nao tem JWT proprio
 *     ainda; quando esse fluxo for migrado pra PIN/JWT, troca-se essa
 *     guarda por uma especifica.
 *  2. Customer numa sessao ativa — recebe `x-session-token` ou cookie
 *     `session_token`, mesma logica do `SessionGuard`. Util pra futuros
 *     endpoints onde o cliente tem acao parcial sobre orders dele
 *     mesmo (hoje ele tem `/confirm` e `/cancel` dedicados, isso fica
 *     como rede de seguranca).
 *
 * Se NENHUM dos dois bater, 401. Antes desse guard o `PATCH
 * /:slug/orders/:id/status` era publico — qualquer um podia avancar
 * status (delivered) ou cancelar pedido alheio em qualquer tenant.
 */
@Injectable()
export class StaffOrSessionGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();

    const staffKeyHeader = request.headers['x-staff-key'];
    const expected = process.env.STAFF_API_KEY;
    if (expected && staffKeyHeader && staffKeyHeader === expected) {
      // Encurta-circuita pra staff. Nao popula `sessionData` — o handler
      // que precisar saber quem alterou o status le `dto.changedBy`.
      return true;
    }

    const token =
      request.cookies?.session_token || request.headers['x-session-token'];

    if (!token) {
      throw new HttpException(
        'Acesso negado. Informe x-staff-key ou x-session-token.',
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

    request.sessionData = JSON.parse(data) as SessionData;
    return true;
  }
}
