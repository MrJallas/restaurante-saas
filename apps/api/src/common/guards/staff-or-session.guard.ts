import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infra/redis/redis.service';
import { safeJsonParse } from '../utils/safe-json';
import type { SessionData, SessionRequest } from './session.guard';
import { revalidateSessionOrThrow } from './session-revalidation';
import { verifyStaffSessionToken } from '../auth/staff-session-token';
import type { StaffAuthRequest } from '../auth/staff-auth-request';

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
/**
 * Round 7 (B-NEW-24): guard agora carimba `request.actorType` pra que
 * controllers possam diferenciar staff vs session no service layer (e.g.
 * orders.updateStatus precisa validar table_session_id ownership só
 * quando o caller é session, sem bloquear staff que tem direito a
 * mover qualquer pedido).
 */
export type ActorType = 'staff' | 'session';

@Injectable()
export class StaffOrSessionGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        SessionRequest & StaffAuthRequest & { actorType?: ActorType; params?: { slug?: string } }
      >();

    const staffToken = request.headers['x-staff-token'];
    if (staffToken) {
      const payload = await verifyStaffSessionToken(
        this.redis,
        staffToken,
        request.params?.slug ?? 'unknown',
      );
      if (!payload) {
        throw new HttpException('Sessão de equipe inválida.', HttpStatus.FORBIDDEN);
      }
      if (payload.mustChangePin) {
        throw new HttpException(
          'Troca de PIN obrigatória antes de continuar.',
          HttpStatus.FORBIDDEN,
        );
      }
      request.staffAuth = payload;
      request.actorType = 'staff';
      return true;
    }

    const staffKeyHeader = request.headers['x-staff-key'];
    const expected = process.env.STAFF_API_KEY;
    if (expected && staffKeyHeader) {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(staffKeyHeader, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        request.actorType = 'staff';
        return true;
      }
    }

    const token = request.cookies?.session_token || request.headers['x-session-token'];

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

    // Round 16 (B-NEW-53): safeJsonParse trata payload corrompido como
    // sessão inválida em vez de crashar 5xx.
    const parsed = safeJsonParse<SessionData>(data);
    if (!parsed) {
      throw new HttpException(
        'Sessao corrompida. Escaneie o QR Code novamente.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // A04 + multi-tenant (mesma revalidação do SessionGuard): sessão do
    // caller-session precisa estar ativa e pertencer ao tenant da URL antes
    // de deixar mover/criar orders. O ramo `x-staff-key` acima não passa por
    // aqui — staff continua com o acesso atual.
    await revalidateSessionOrThrow(this.dataSource, parsed, request);

    request.sessionData = parsed;
    request.actorType = 'session';
    return true;
  }
}
