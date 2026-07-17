import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { authErrorResponse } from '../guards/auth-error-response';
import { CustomersService } from '../../modules/customers/customers.service';
import { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import type { StaffAuthRequest } from '../auth/staff-auth-request';

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
  private readonly logger = new Logger(CallerResolverService.name);

  constructor(
    private readonly customers: CustomersService,
    private readonly tenantConn: TenantConnectionProvider,
  ) {}

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
      throw new HttpException('Identificação inválida ou expirada.', HttpStatus.UNAUTHORIZED);
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
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    if (cookies?.recognition_token) return cookies.recognition_token;
    // Round 5 (P0-X7-3/P2-X7-4): aceita também o header `x-recognition-token`
    // (clientes não-browser e ações host onde o token não vem como cookie).
    // Seguro: o recognition_token é a própria credencial (UUID aleatório por
    // customer) — aceitá-lo via header não enfraquece o httpOnly do cookie,
    // pois um atacante continua sem conseguir LER o token de outro cliente.
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const headerVal = headers['x-recognition-token'];
    const headerToken = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    return headerToken ?? null;
  }

  /**
   * Round 10 (B-NEW-49): resolve staffId a partir do header `x-staff-id`
   * (UUID v4 sanitized). Substitui o pattern duplicado de `dto.staffId`
   * mass-assignment em ≥8 endpoints staff-side. Audit log fica baseado
   * em quem AUTENTICOU (header pós-StaffOnlyGuard/ManagerOnlyGuard),
   * não em UUID arbitrário do body.
   *
   * Gate #34 (decisão Caleb, opção A): quando o guard verificou o
   * `x-staff-token` de sessão, a identidade VERIFICADA fica carimbada em
   * `req.staffAuth` — e ela VENCE: o header `x-staff-id` é ignorado (se
   * vier divergente do token, loga warn — tentativa de spoof ou bug de
   * client). Só sem staffAuth (fluxo key/TV legado) cai no fallback do
   * header validado por shape, comportamento anterior intacto.
   *
   * Use em controllers staff-side via DI:
   *   const staffId = this.callerResolver.requireStaffId(req);
   *   service.action(..., { staffId });   // ignora dto.staffId
   *
   * Throw 401 quando header ausente OU shape inválido. ManagerOnlyGuard
   * já valida role no DB; aqui só extraímos o ID confiável.
   */
  requireStaffId(req: Request): string {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const headerVal = headers['x-staff-id'];
    const staffId = Array.isArray(headerVal) ? headerVal[0] : headerVal;

    // Identidade do token de sessão verificado (carimbada pelo guard) —
    // fonte canônica; o header client-controlled não manda mais aqui.
    const staffAuth = (req as Request & StaffAuthRequest).staffAuth;
    if (staffAuth?.staffId) {
      if (staffId && staffId.toLowerCase() !== staffAuth.staffId.toLowerCase()) {
        this.logger.warn(
          `x-staff-id divergente do token de sessão (header=${staffId}, token=${staffAuth.staffId}) — ` +
            'possível spoof ou bug de client; usando a identidade do token (gate #34)',
        );
      }
      return staffAuth.staffId;
    }

    if (!staffId || typeof staffId !== 'string') {
      throw new HttpException(
        authErrorResponse('AUTH_MISSING', 'Sessão expirada'),
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId)) {
      throw new HttpException(
        authErrorResponse('AUTH_INVALID', 'Sessão expirada'),
        HttpStatus.UNAUTHORIZED,
      );
    }

    return staffId;
  }

  /**
   * Round 11 (B-NEW-56b): variante async que cross-checka DB pra confirmar
   * que `x-staff-id` aponta pra um staff ATIVO (is_active=true). Antes
   * `requireStaffId` só validava shape — atacante com staff-key passava
   * UUID de staff fired (is_active=false) ou inexistente, e endpoints
   * com só StaffOnlyGuard (sem ManagerOnlyGuard que já checava DB)
   * propagavam o spoof. Use em controllers staff-side com somente
   * StaffOnlyGuard.
   *
   * Gate #34: o cross-check DB continua IGUAL mesmo quando o staffId vem
   * do token verificado (`req.staffAuth`) — o token vive até 12h; staff
   * demitido/desativado no meio do turno perde acesso na hora.
   */
  async requireActiveStaffId(req: Request): Promise<string> {
    const staffId = this.requireStaffId(req);
    const rows = (await this.tenantConn.query(
      `SELECT 1 FROM staff WHERE id = $1 AND is_active = true`,
      [staffId],
    )) as unknown[];
    if (!rows.length) {
      throw new HttpException(
        authErrorResponse('AUTH_INVALID', 'Sessão expirada'),
        HttpStatus.UNAUTHORIZED,
      );
    }
    return staffId;
  }

  /** Identidade + papel atuais, derivados do caller e reconferidos no tenant. */
  async requireActiveStaffIdentity(req: Request): Promise<{ staffId: string; role: string }> {
    const staffId = this.requireStaffId(req);
    const rows = (await this.tenantConn.query(
      `SELECT role FROM staff WHERE id = $1 AND is_active = true LIMIT 1`,
      [staffId],
    )) as Array<{ role: string }>;
    if (!rows[0]?.role) {
      throw new HttpException(
        authErrorResponse('AUTH_INVALID', 'Sessão expirada'),
        HttpStatus.UNAUTHORIZED,
      );
    }
    return { staffId, role: rows[0].role };
  }

  /** Variante non-throw — retorna null se header ausente/inválido. */
  tryGetStaffId(req: Request): string | null {
    try {
      return this.requireStaffId(req);
    } catch {
      return null;
    }
  }
}
