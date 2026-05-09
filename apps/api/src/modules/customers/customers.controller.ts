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
import { Response } from 'express';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
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

    res.cookie('recognition_token', result.recognitionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    });

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

  /** Manager marks a customer as VIP (permanent flag on customers table). */
  @Post(':customerId/vip')
  @UseGuards(StaffOnlyGuard)
  async markVip(@Param('customerId') customerId: string) {
    return this.customersService.setVipFlag(customerId, true);
  }

  /** Manager unmarks a customer as VIP. */
  @Delete(':customerId/vip')
  @UseGuards(StaffOnlyGuard)
  async unmarkVip(@Param('customerId') customerId: string) {
    return this.customersService.setVipFlag(customerId, false);
  }

  @Post('welcome')
  @UseGuards(SessionGuard)
  async welcome(
    @Body() dto: CustomerWelcomeDto,
    @Session() session: SessionData,
    @Req() req: { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const callerRecognitionToken = req.cookies?.recognition_token ?? null;
    const result = await this.customersService.welcome(
      dto.name,
      dto.cpf,
      session.sessionId,
      callerRecognitionToken,
    );

    res.cookie('recognition_token', result.recognitionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    });

    return {
      customerId: result.customerId,
      name: result.name,
      recognitionToken: result.recognitionToken,
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

    res.cookie('recognition_token', result.recognitionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    });

    return result;
  }
}
