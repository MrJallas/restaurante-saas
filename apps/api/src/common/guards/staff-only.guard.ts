import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { authErrorResponse } from './auth-error-response';
import { RedisService } from '../../infra/redis/redis.service';
import { verifyStaffSessionToken } from '../auth/staff-session-token';
import type { StaffAuthRequest } from '../auth/staff-auth-request';

/**
 * "É staff?" — porta dos 64 endpoints StaffOnly. Aceita DUAS provas de
 * identidade de equipe:
 *   1. `x-staff-token` de sessão (verificado no Redis, confinado ao tenant)
 *      — o caminho novo (Ciclo 2, decisão Caleb 2026-07-04): o client não
 *      precisa embarcar segredo, o token é individual e expira no turno.
 *   2. `x-staff-key` compartilhada (timing-safe) — o caminho legado, mantido
 *      enquanto os clients migram e pro proxy TV/KDS que injeta a key
 *      server-side.
 * ADITIVO: a ordem tenta o token primeiro; sem token válido, cai na key. Um
 * dos dois basta.
 */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      {
        headers: Record<string, string>;
        params?: { slug?: string };
      } & StaffAuthRequest
    >();

    // 1. Token de sessão (identidade individual verificada server-side).
    const token = request.headers['x-staff-token'];
    if (token) {
      const slug = request.params?.slug ?? 'unknown';
      const payload = await verifyStaffSessionToken(this.redis, token, slug);
      if (payload) {
        // Enforcement server-side de must_change_pin (P2 hardening): o token
        // emitido no login com PIN temporário carrega mustChangePin=true. Aqui
        // — a porta dos 64 endpoints StaffOnly — ele é RECUSADO em bloco até a
        // troca. A rota de trocar o PIN (staff-auth/change-pin) NÃO passa por
        // este guard; ela verifica o token direto no service, então segue
        // acessível. Não confiamos no redirect do FE: o token temporário não
        // abre nenhuma rota privilegiada.
        if (payload.mustChangePin) {
          throw new HttpException(
            authErrorResponse(
              'AUTH_PIN_CHANGE_REQUIRED',
              'Troca de PIN obrigatória antes de continuar.',
            ),
            HttpStatus.FORBIDDEN,
          );
        }
        // Gate #34: carimba a identidade VERIFICADA pro CallerResolver ler
        // do token, não do header client-controlled `x-staff-id`. O caminho
        // da key (abaixo) NÃO carimba — TV/estação segue no fallback.
        request.staffAuth = payload;
        return true;
      }
      // Token presente mas inválido → NUNCA faz downgrade pra key (mesma
      // proteção do resolveAuthenticatedStaff).
      throw new HttpException(
        authErrorResponse('AUTH_INVALID', 'Sessão de equipe inválida. Faça login novamente.'),
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. Chave compartilhada (legado / proxy server-side).
    const provided = request.headers['x-staff-key'];
    const expected = process.env.STAFF_API_KEY;

    if (!expected || !provided) {
      throw new HttpException(
        authErrorResponse('AUTH_MISSING', 'Sessão de equipe inválida. Faça login novamente.'),
        HttpStatus.FORBIDDEN,
      );
    }

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpException(
        authErrorResponse('AUTH_INVALID', 'Sessão de equipe inválida. Faça login novamente.'),
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
