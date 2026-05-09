import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CustomersService } from '../../modules/customers/customers.service';

/**
 * Resolve `customerId` do caller a partir do cookie `recognition_token`.
 * Round 8 (B-NEW-27): substitui o pattern duplicado de DTO mass-assignment
 * de customerId/staffId em ≥6 controllers — cada um implementava o
 * mesmo helper inline. Agora compartilhado: 1 implementação, 1 ponto
 * de manutenção.
 *
 * Throw 401 quando cookie ausente ou token não bate em nenhum customer
 * (token rotacionado / customer apagado / cliente nunca se identificou).
 *
 * Use em controllers via DI:
 *   constructor(private callerResolver: CallerResolverService) {}
 *   async create(@Req() req: Request) {
 *     const customerId = await this.callerResolver.requireCustomerId(req);
 *     // ... use customerId em vez de dto.customerId
 *   }
 *
 * Cuidado: este helper exige que o customer JÁ tenha passado pelo
 * /customer/welcome ou /customer/recognize antes — sessão de mesa
 * sem identificação retorna 401. Endpoints que aceitam anonymous
 * sessions (e.g. customer scaneia QR mas não fez welcome ainda)
 * NÃO devem usar este helper — devem usar SessionGuard direto.
 */
@Injectable()
export class CallerResolverService {
  constructor(private readonly customers: CustomersService) {}

  async requireCustomerId(req: Request): Promise<string> {
    const token = this.extractToken(req);
    if (!token) {
      throw new HttpException(
        'Identificação ausente. Faça login pra esta ação.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const resolved = await this.customers.resolveByRecognitionToken(token);
    if (!resolved) {
      throw new HttpException(
        'Identificação inválida ou expirada.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return resolved.customerId;
  }

  /** Variante non-throw — retorna null se ausente. Útil pra endpoints opcionais. */
  async tryGetCustomerId(req: Request): Promise<string | null> {
    const token = this.extractToken(req);
    if (!token) return null;
    const resolved = await this.customers.resolveByRecognitionToken(token);
    return resolved?.customerId ?? null;
  }

  private extractToken(req: Request): string | null {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    return cookies?.recognition_token ?? null;
  }
}
