import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { StaffAuthService } from './staff-auth.service';
import { RecoveryThrottleGuard } from './recovery-throttle.guard';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cpf!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  pin!: string;
}

class ForgotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cpf!: string;
}

class ForgotVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cpf!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/)
  code!: string;
}

class ResetPinDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  resetToken!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/)
  pin!: string;
}

@Controller(':slug/staff-auth')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.staffAuth.login(dto, this.clientIp(req));
  }

  @Post('forgot')
  @HttpCode(200)
  @UseGuards(RecoveryThrottleGuard)
  forgot(@Body() dto: ForgotDto) {
    return this.staffAuth.forgot(dto);
  }

  @Post('forgot/verify')
  @HttpCode(200)
  @UseGuards(RecoveryThrottleGuard)
  verifyForgot(@Body() dto: ForgotVerifyDto) {
    return this.staffAuth.verifyForgot(dto);
  }

  @Post('reset-pin')
  @HttpCode(200)
  resetPin(@Body() dto: ResetPinDto) {
    return this.staffAuth.resetPin(dto);
  }

  /**
   * IP do peer TCP — NÃO confia em `X-Forwarded-For` / `X-Real-IP`, que são
   * forjáveis pelo cliente. Como a chave de throttle do login (cpf:ip) inclui
   * esse IP, ler o header cru deixaria o atacante rotacioná-lo a cada tentativa
   * e nunca acumular na mesma chave → lock de 5 falhas jamais dispararia
   * (mesma disciplina do RedisThrottleGuard/RecoveryThrottleGuard). Normaliza o
   * prefixo IPv4-mapeado em IPv6 (`::ffff:1.2.3.4` → `1.2.3.4`).
   *
   * Atrás de proxy confiável, configurar `app.set('trust proxy', <hops>)` no
   * main.ts e passar a usar `req.ip` (que aí respeita XFF só até os hops
   * confiáveis) — nunca voltar a ler o header diretamente.
   */
  private clientIp(req: Request): string {
    const raw = req.socket?.remoteAddress ?? req.ip ?? 'unknown';
    return raw.replace(/^::ffff:/, '');
  }
}
