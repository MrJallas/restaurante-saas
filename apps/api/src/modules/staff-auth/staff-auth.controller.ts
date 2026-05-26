import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { StaffAuthService } from './staff-auth.service';

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
  login(
    @Body() dto: LoginDto,
    @Req() req: { ip?: string; headers: Record<string, string | string[]> },
  ) {
    return this.staffAuth.login(dto, this.clientIp(req));
  }

  @Post('forgot')
  @HttpCode(200)
  forgot(@Body() dto: ForgotDto) {
    return this.staffAuth.forgot(dto);
  }

  @Post('forgot/verify')
  @HttpCode(200)
  verifyForgot(@Body() dto: ForgotVerifyDto) {
    return this.staffAuth.verifyForgot(dto);
  }

  @Post('reset-pin')
  @HttpCode(200)
  resetPin(@Body() dto: ResetPinDto) {
    return this.staffAuth.resetPin(dto);
  }

  private clientIp(req: { ip?: string; headers: Record<string, string | string[]> }): string {
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    return (xffStr ?? req.ip ?? 'unknown').toString().split(',')[0].trim();
  }
}
