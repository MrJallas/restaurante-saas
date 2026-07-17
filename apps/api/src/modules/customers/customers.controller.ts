import {
  Controller,
  Get,
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
  IsIn,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Request, Response } from 'express';
import { getSecureCookieOptions } from '../../common/utils/cookie-options';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData } from '../../common/guards/session.guard';
import { RedisService } from '../../infra/redis/redis.service';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { throttleClientIp } from '../../common/utils/throttle-client-ip';
import { CustomersService } from './customers.service';

const RECOGNITION_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

// Round 6 (B-NEW-11) — rate limit pra /customer/identify
const IDENTIFY_RATE_MAX = 5;
const IDENTIFY_RATE_WINDOW_SECONDS = 15 * 60;
const IDENTIFY_RATE_LOCK_SECONDS = 15 * 60;

function positiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class CustomerLocationDto {
  @IsIn(['unknown', 'prompt', 'granted', 'denied', 'unavailable', 'unsupported'])
  status!: 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable' | 'unsupported';

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  accuracyMeters?: number;

  @IsOptional()
  @IsString()
  capturedAt?: string;
}

class CustomerWelcomeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @MinLength(11)
  @MaxLength(11)
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerLocationDto)
  location?: CustomerLocationDto;
}

class CustomerRecognizeDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  recognitionToken?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerLocationDto)
  location?: CustomerLocationDto;
}

class CustomerIdentifyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
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
  // Welcome é SessionGuard-protected e atende grupos inteiros atrás do mesmo
  // Wi-Fi/NAT. O bucket inclui IP real + sessão de mesa e o limite default
  // comporta grupos legítimos; /identify continua separado em 5/IP.
  private readonly welcomeRateMax = positiveIntEnv('CUSTOMER_WELCOME_RATE_MAX', 30);
  private readonly welcomeRateWindowSeconds = positiveIntEnv(
    'CUSTOMER_WELCOME_RATE_WINDOW_SECONDS',
    15 * 60,
  );
  private readonly welcomeRateLockSeconds = positiveIntEnv(
    'CUSTOMER_WELCOME_RATE_LOCK_SECONDS',
    15 * 60,
  );

  constructor(
    private readonly customersService: CustomersService,
    private readonly redis: RedisService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * `POST /customers/identify` — CPF lookup before late-arrival join.
   * Public (this is itself the auth bootstrap for late-arrival flow).
   *
   * Round 6 (B-NEW-11) hardening preservado ao redor da decisão temporária de
   * produto (2026-07-11): CPF conhecido autentica o perfil existente.
   * O CPF NÃO é prova de posse; o risco de takeover foi aceito por Caleb até
   * OTP/passkey/verificação assistida. As barreiras abaixo reduzem abuso em
   * massa e vazamento do bearer, mas não eliminam esse risco.
   *
   * Barreiras preservadas:
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
    @Req()
    req: {
      ip?: string;
      socket?: { remoteAddress?: string };
      cookies?: Record<string, string>;
      headers: Record<string, string | string[]>;
    },
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
        req.cookies?.recognition_token ?? null,
      );
    } catch (err) {
      // Conta falhas pro mesmo limite — atacante não bypassa testando
      // formats inválidos pra mapear espaço CPF.
      await this.bumpIdentifyAttempts(ipKey);
      throw err;
    }
    await this.bumpIdentifyAttempts(ipKey);

    res.cookie(
      'recognition_token',
      result.recognitionToken,
      getSecureCookieOptions(req as Request, {
        // Round 9 (B-NEW-37): secure flag em prod com TLS. Round 21 §F:
        // getSecureCookieOptions detecta HTTPS via req.secure ou
        // X-Forwarded-Proto (Cloudflare Tunnel, proxy reverso) — Safari iOS
        // exige secure:true + sameSite:'none' quando origem é HTTPS.
        maxAge: RECOGNITION_COOKIE_MAX_AGE,
      }),
    );

    // recognitionToken NÃO retornado no body.
    return {
      customerId: result.customerId,
      isReturning: result.isReturning,
      canonicalName: result.canonicalName,
      customer: result.customer,
    };
  }

  private identifyClientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
    // P1 OWASP API4: chave pelo IP REAL do peer TCP (`req.socket.remoteAddress`
    // via throttleClientIp), NÃO por `X-Forwarded-For`. /identify é rota
    // NÃO-autenticada e o throttle é a única barreira; a API é exposta direto
    // (:3001) sem `trust proxy`, então o XFF é forjável — lê-lo deixaria o
    // atacante rotacioná-lo a cada request e nunca acumular na mesma chave,
    // burlando o lock → enumeração ilimitada de CPF. Mesma disciplina dos
    // guards endurecidos (RedisThrottleGuard / staff-auth.controller).
    return `customers:identify:${throttleClientIp(req)}`;
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

  // /welcome é autenticado pela sessão de mesa e vários clientes legítimos
  // compartilham o mesmo IP do Wi-Fi/NAT do restaurante. Portanto o bucket é
  // composto por IP real + table session: mantém XFF forjado fora da fronteira
  // de confiança, mas uma mesa movimentada não bloqueia as demais.
  private welcomeClientKey(
    req: { ip?: string; socket?: { remoteAddress?: string } },
    tableSessionId: string,
  ): string {
    return `customers:welcome:${throttleClientIp(req)}:${tableSessionId}`;
  }

  private async assertWelcomeRateLimit(bucketKey: string): Promise<void> {
    const lockKey = `${bucketKey}:lock`;
    if (await this.redis.get(lockKey)) {
      throw new HttpException(
        'Muitas tentativas de boas-vindas. Aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async bumpWelcomeAttempts(bucketKey: string): Promise<void> {
    const lockKey = `${bucketKey}:lock`;
    const attemptsKey = `${bucketKey}:attempts`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, this.welcomeRateWindowSeconds);
    }
    if (attempts >= this.welcomeRateMax) {
      await this.redis.set(lockKey, '1', this.welcomeRateLockSeconds);
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
   * P1-C (IDOR fix): resolve o `customerId` do CALLER pelo cookie
   * `recognition_token` (via CallerResolverService), NUNCA por
   * `session.customerId`. `session.customerId` guarda o ÚLTIMO cliente que
   * fez welcome na mesa — compartilhado entre todos os participantes (host
   * + late-arrivals). Usá-lo aqui vazava itens+notes do último welcomer pra
   * qualquer outro cliente da mesma sessão que tocasse "repetir última
   * visita". O WS gateway já resolvia identidade por PARTICIPANTE
   * (resolveRecognizedCustomer no events.gateway) — o REST agora segue o
   * mesmo canon.
   *
   * Caller sem `recognition_token` (nunca fez welcome/recognize) cai no
   * comportamento seguro: 401, sem cair no `session.customerId` alheio.
   */
  @Get('last-visit')
  @UseGuards(SessionGuard)
  async lastVisit(@Session() session: SessionData, @Req() req: Request) {
    const customerId = await this.callerResolver.tryGetCustomerId(req);
    if (!customerId) {
      throw new HttpException(
        'Identificação ausente. Faça login pra repetir a visita.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.customersService.getLastVisitItems(customerId, session.sessionId);
  }

  /**
   * Round 9 (B-NEW-35): rate-limit por IP + bumping pro reuso do mesmo
   * pattern da `/identify`. A decisão vigente permite account takeover com um
   * CPF conhecido; o limite reduz enumeração automatizada, mas não é tratado
   * como autenticação forte.
   *
   * Regras:
   *  - 30 attempts em 15min por IP real + sessão de mesa (configurável).
   *  - 429 lock 15min após atingir o limite (configurável).
   *  - Falhas (CPF inválido, name ausente) também contam pro limite
   *    pra impedir bypass via formats inválidos.
   *
   * Service.welcome reutiliza o token canônico e o emite só em cookie HttpOnly
   * para o reclaim CPF-only. Não retornar esse bearer no body.
   */
  @Post('welcome')
  @UseGuards(SessionGuard)
  async welcome(
    @Body() dto: CustomerWelcomeDto,
    @Session() session: SessionData,
    @Req()
    req: {
      ip?: string;
      socket?: { remoteAddress?: string };
      cookies?: Record<string, string>;
      headers: Record<string, string | string[]>;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const welcomeBucket = this.welcomeClientKey(req, session.sessionId);
    await this.assertWelcomeRateLimit(welcomeBucket);

    const callerRecognitionToken = req.cookies?.recognition_token ?? null;
    let result;
    try {
      result = await this.customersService.welcome(
        dto.name,
        dto.cpf,
        session.sessionId,
        callerRecognitionToken,
        dto.location,
      );
    } catch (err) {
      await this.bumpWelcomeAttempts(welcomeBucket);
      throw err;
    }
    await this.bumpWelcomeAttempts(welcomeBucket);

    res.cookie(
      'recognition_token',
      result.recognitionToken,
      getSecureCookieOptions(req as Request, {
        // Round 9 (B-NEW-37): secure flag em prod com TLS. Round 21 §F:
        // getSecureCookieOptions detecta HTTPS via req.secure ou
        // X-Forwarded-Proto (Cloudflare Tunnel, proxy reverso) — Safari iOS
        // exige secure:true + sameSite:'none' quando origem é HTTPS.
        maxAge: RECOGNITION_COOKIE_MAX_AGE,
      }),
    );

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
      locationCheck: result.locationCheck,
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
    const token = dto.recognitionToken ?? req.cookies?.recognition_token ?? null;
    if (!token) {
      return { recognized: false };
    }

    const result = await this.customersService.recognize(token, session.sessionId, dto.location);

    res.cookie(
      'recognition_token',
      result.recognitionToken,
      getSecureCookieOptions(req as Request, {
        // Round 9 (B-NEW-37): secure flag em prod com TLS. Round 21 §F:
        // getSecureCookieOptions detecta HTTPS via req.secure ou
        // X-Forwarded-Proto (Cloudflare Tunnel, proxy reverso) — Safari iOS
        // exige secure:true + sameSite:'none' quando origem é HTTPS.
        maxAge: RECOGNITION_COOKIE_MAX_AGE,
      }),
    );

    // Round 7 (B-NEW-28): recognitionToken NÃO retornado no body —
    // só via cookie HttpOnly. Mesmo fix do welcome/identify.
    const { recognitionToken: _omit, ...safeResult } = result;
    void _omit;
    return safeResult;
  }

  /**
   * Logout real do customer. Revoga o bearer persistente no banco e expira os
   * cookies HttpOnly de identidade e da mesa com os mesmos atributos usados na
   * emissão. A resposta é
   * idempotente para que um cookie já expirado nunca prenda a pessoa no app.
   * Não exige SessionGuard: a sessão da mesa pode já ter vencido justamente
   * quando a pessoa toca em sair; o recognition cookie é a credencial a
   * revogar e a operação não lê nem devolve dados do perfil.
   */
  @Post('logout')
  async logout(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const revoked = await this.customersService.revokeRecognitionToken(
      req.cookies?.recognition_token ?? '',
    );
    const cookieOptions = getSecureCookieOptions(req);
    res.clearCookie('recognition_token', cookieOptions);
    res.clearCookie('session_token', cookieOptions);
    return { ok: true, revoked };
  }
}
