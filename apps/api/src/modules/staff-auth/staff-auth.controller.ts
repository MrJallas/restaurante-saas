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

class ChangePinDto {
  // currentPin só limitado em tamanho (não em formato): valor errado é
  // TENTATIVA contada no throttle do service — rejeitar formatos no DTO
  // deixaria brute-force "grátis" fora do contador.
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  currentPin!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/)
  newPin!: string;
}

@Controller(':slug/staff-auth')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.staffAuth.login(dto, {
      ip: this.clientIp(req),
      userAgent: String(req.headers['user-agent'] ?? 'Navegador'),
    });
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
   * Troca de PIN LOGADO (TROCAR-PIN, decisão Caleb 2026-07-04). Este
   * controller não usa StaffOnlyGuard (as rotas irmãs são públicas de
   * propósito — são o próprio login/recovery), então a rota autentica
   * EXPLICITAMENTE: lê o `x-staff-token` (o proxy web-staff injeta a partir
   * do cookie httpOnly) e o service o verifica com verifyStaffSessionToken
   * — 401 sem token válido. O staff alvo vem do PAYLOAD do token, nunca de
   * body/header client-controlled.
   */
  @Post('change-pin')
  @HttpCode(200)
  changePin(@Body() dto: ChangePinDto, @Req() req: Request) {
    return this.staffAuth.changePin({
      token: this.staffToken(req),
      currentPin: dto.currentPin,
      newPin: dto.newPin,
    });
  }

  /**
   * Logout (P1-E re-scan, decisão Caleb 2026-07-04). Lê o `x-staff-token`
   * (injetado pelo proxy a partir do cookie httpOnly) e revoga TODAS as
   * sessões do staff no Redis — o proxy web-staff limpa o cookie ao ver a
   * rota `/staff-auth/logout`. Sem token válido responde 200 idempotente:
   * logout nunca falha, então nunca deixa o usuário preso na sessão.
   */
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request) {
    return this.staffAuth.logout(this.staffToken(req));
  }

  private staffToken(req: Request): string | undefined {
    const raw = req.headers['x-staff-token'];
    return Array.isArray(raw) ? raw[0] : raw;
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
