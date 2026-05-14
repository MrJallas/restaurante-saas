import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Request, Response } from 'express';
import { getSecureCookieOptions } from '../../common/utils/cookie-options';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData } from '../../common/guards/session.guard';
import { RedisService } from '../../infra/redis/redis.service';
import { CustomersService } from './customers.service';

const RECOGNITION_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

// Round 6 (B-NEW-11) — rate limit pra /customer/identify
const IDENTIFY_RATE_MAX = 5;
const IDENTIFY_RATE_WINDOW_SECONDS = 15 * 60;
const IDENTIFY_RATE_LOCK_SECONDS = 15 * 60;

class CustomerWelcomeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @MinLength(11)
  @MaxLength(11)
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf!: string;
}

class CustomerRecognizeDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  recognitionToken?: string;
}

class CustomerIdentifyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @MinLength(11)
  @MaxLength(11)
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf!: string;

  @IsOptional()
  @IsUUID()
  currentSessionId?: string;
}

@Controller(':slug/customer')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly redis: RedisService,
  ) {}

  /**
   * `POST /customers/identify` — CPF lookup before late-arrival join.
   * Public (this is itself the auth bootstrap for late-arrival flow).
   *
   * Round 6 (B-NEW-11) hardening:
   *  - Rate limit por IP: 5 tentativas em 15min, depois 429 lock por
   *    15min. Antes era unauth+sem throttle → bruteforce CPF de leak DB
   *    + auto-login viable. Conta tanto sucessos quanto falhas pra
   *    impedir bypass via CPFs inválidos. Pattern Redis incr+expire
   *    igual ao staff.verifyPin.
   *  - `recognitionToken` REMOVIDO do body de resposta — só vai pelo
   *    cookie HttpOnly. Mesmo que CSRF passasse ou logs vazassem o
   *    body, o token não escapa. Caller legítimo (apps web) usa cookie
   *    auto-anexado em requests subsequentes.
   */
  @Post('identify')
  async identify(
    @Body() dto: CustomerIdentifyDto,
    @Req() req: { ip?: string; headers: Record<string, string | string[]> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipKey = this.identifyClientKey(req);
    await this.assertIdentifyRateLimit(ipKey);

    let result;
    try {
      result = await this.customersService.identify(
        dto.cpf,
        dto.name,
        dto.currentSessionId,
      );
    } catch (err) {
      // Conta falhas pro mesmo limite — atacante não bypassa testando
      // formats inválidos pra mapear espaço CPF.
      await this.bumpIdentifyAttempts(ipKey);
      throw err;
    }
    await this.bumpIdentifyAttempts(ipKey);

    res.cookie('recognition_token', result.recognitionToken, getSecureCookieOptions(req as Request, {
      // Round 9 (B-NEW-37): secure flag em prod com TLS. Round 21 §F:
      // getSecureCookieOptions detecta HTTPS via req.secure ou
      // X-Forwarded-Proto (Cloudflare Tunnel, proxy reverso) — Safari iOS
      // exige secure:true + sameSite:'none' quando origem é HTTPS.
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    }));

    // recognitionToken NÃO retornado no body.
    return {
      customerId: result.customerId,
      isReturning: result.isReturning,
      canonicalName: result.canonicalName,
      customer: result.customer,
    };
  }

  private identifyClientKey(req: {
    ip?: string;
    headers: Record<string, string | string[]>;
  }): string {
    // Atrás de proxy/CDN x-forwarded-for é a fonte real do IP do client.
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    const ip = (xffStr ?? req.ip ?? 'unknown').toString().split(',')[0].trim();
    return `customers:identify:${ip}`;
  }

  private async assertIdentifyRateLimit(ipKey: string): Promise<void> {
    const lockKey = `${ipKey}:lock`;
    if (await this.redis.get(lockKey)) {
      throw new HttpException(
        'Muitas tentativas. Tente novamente em alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async bumpIdentifyAttempts(ipKey: string): Promise<void> {
    const lockKey = `${ipKey}:lock`;
    const attemptsKey = `${ipKey}:attempts`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, IDENTIFY_RATE_WINDOW_SECONDS);
    }
    if (attempts >= IDENTIFY_RATE_MAX) {
      await this.redis.set(lockKey, '1', IDENTIFY_RATE_LOCK_SECONDS);
      await this.redis.del(attemptsKey);
    }
  }

  // Round 9 (B-NEW-35): mesma família do rate-limit de /identify, agora
  // pra /welcome. Compartilha as constants IDENTIFY_RATE_* (pattern
  // single-source-of-truth). Key separado pra que rate-limit de /identify
  // não engargale /welcome do mesmo IP (e vice-versa).
  private welcomeClientKey(req: {
    ip?: string;
    headers: Record<string, string | string[]>;
  }): string {
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    const ip = (xffStr ?? req.ip ?? 'unknown').toString().split(',')[0].trim();
    return `customers:welcome:${ip}`;
  }

  private async assertWelcomeRateLimit(ipKey: string): Promise<void> {
    const lockKey = `${ipKey}:lock`;
    if (await this.redis.get(lockKey)) {
      throw new HttpException(
        'Muitas tentativas de boas-vindas. Aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async bumpWelcomeAttempts(ipKey: string): Promise<void> {
    const lockKey = `${ipKey}:lock`;
    const attemptsKey = `${ipKey}:attempts`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, IDENTIFY_RATE_WINDOW_SECONDS);
    }
    if (attempts >= IDENTIFY_RATE_MAX) {
      await this.redis.set(lockKey, '1', IDENTIFY_RATE_LOCK_SECONDS);
      await this.redis.del(attemptsKey);
    }
  }

  /**
   * Manager marks a customer as VIP (permanent flag on customers table).
   *
   * Round 10 (B-NEW-48): adicionado ManagerOnlyGuard. Antes: qualquer
   * staff (waiter/cook) com `x-staff-key` flagava/desflagava VIP de
   * qualquer customer. customers.is_vip é flag PERMANENTE cross-session
   * (migration 020) — diferente de table_sessions.flags['vip'] que tem
   * ManagerOnlyGuard em vip.controller.ts:51. Agora consistente.
   */
  @Post(':customerId/vip')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async markVip(@Param('customerId') customerId: string) {
    return this.customersService.setVipFlag(customerId, true);
  }

  @Delete(':customerId/vip')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async unmarkVip(@Param('customerId') customerId: string) {
    return this.customersService.setVipFlag(customerId, false);
  }

  /**
   * Round 9 (B-NEW-35): rate-limit por IP + bumping pro reuso do mesmo
   * pattern da `/identify`. Antes: customer com session_token loops
   * CPFs conhecidos pra rotacionar `recognition_token` de qualquer
   * customer existente — account takeover via brute force CPF.
   *
   * Regras:
   *  - 5 attempts em 15min por IP (mesma janela do /identify).
   *  - 429 lock 15min após exceder.
   *  - Falhas (CPF inválido, name ausente) também contam pro limite
   *    pra impedir bypass via formats inválidos.
   *
   * Service.welcome em si ainda rotaciona token quando token-mismatch
   * — esse é o flow legítimo de "customer reclaim em outro device".
   * Mas com rate-limit + cookies HttpOnly secure, atacante não escala.
   */
  @Post('welcome')
  @UseGuards(SessionGuard)
  async welcome(
    @Body() dto: CustomerWelcomeDto,
    @Session() session: SessionData,
    @Req() req: {
      ip?: string;
      cookies?: Record<string, string>;
      headers: Record<string, string | string[]>;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipKey = this.welcomeClientKey(req);
    await this.assertWelcomeRateLimit(ipKey);

    const callerRecognitionToken = req.cookies?.recognition_token ?? null;
    let result;
    try {
      result = await this.customersService.welcome(
        dto.name,
        dto.cpf,
        session.sessionId,
        callerRecognitionToken,
      );
    } catch (err) {
      await this.bumpWelcomeAttempts(ipKey);
      throw err;
    }
    await this.bumpWelcomeAttempts(ipKey);

    res.cookie('recognition_token', result.recognitionToken, getSecureCookieOptions(req as Request, {
      // Round 9 (B-NEW-37): secure flag em prod com TLS. Round 21 §F:
      // getSecureCookieOptions detecta HTTPS via req.secure ou
      // X-Forwarded-Proto (Cloudflare Tunnel, proxy reverso) — Safari iOS
      // exige secure:true + sameSite:'none' quando origem é HTTPS.
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    }));

    // Round 7 (B-NEW-28): recognitionToken NÃO retornado no body —
     // só vai pelo cookie HttpOnly. Antes: XSS no customer-side App
     // lia `result.recognitionToken` e abria conta dele em qualquer
     // mesa do tenant. Mesma fix do /identify (round 6).
     return {
       customerId: result.customerId,
       name: result.name,
       isReturning: result.isReturning,
       totalVisits: result.totalVisits,
       lastVisitSummary: result.lastVisitSummary,
       visitId: result.visitId,
       wasReclaim: result.wasReclaim,
     };
   }

  @Post('recognize')
  @UseGuards(SessionGuard)
  async recognize(
    @Body() dto: CustomerRecognizeDto,
    @Session() session: SessionData,
    @Req() req: { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      dto.recognitionToken ?? req.cookies?.recognition_token ?? null;
    if (!token) {
      return { recognized: false };
    }

    const result = await this.customersService.recognize(
      token,
      session.sessionId,
    );

    res.cookie('recognition_token', result.recognitionToken, getSecureCookieOptions(req as Request, {
      // Round 9 (B-NEW-37): secure flag em prod com TLS. Round 21 §F:
      // getSecureCookieOptions detecta HTTPS via req.secure ou
      // X-Forwarded-Proto (Cloudflare Tunnel, proxy reverso) — Safari iOS
      // exige secure:true + sameSite:'none' quando origem é HTTPS.
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    }));

    // Round 7 (B-NEW-28): recognitionToken NÃO retornado no body —
    // só via cookie HttpOnly. Mesmo fix do welcome/identify.
    const { recognitionToken: _omit, ...safeResult } = result;
    void _omit;
    return safeResult;
  }
}
