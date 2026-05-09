import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsBoolean,
  Matches,
  MaxLength,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { RedisService } from '../../infra/redis/redis.service';
import { StaffService } from './staff.service';

// Round 8 (B-NEW-30) — throttle GLOBAL por IP em verify-pin. Antes só
// throttle por staffId (5/5min individual): atacante com lista de N
// staffIds (vaza via GET /staff publico) tinha N*5 tentativas antes
// de qualquer lockout. Pra restaurante com 10 staff e PIN 4-digit,
// 50 tentativas = 0.5% chance/round, cumulativo eventually acerta.
const PIN_IP_RATE_MAX = 20;
const PIN_IP_RATE_WINDOW_SECONDS = 15 * 60;
const PIN_IP_LOCK_SECONDS = 15 * 60;

class CreateStaffDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsIn(['waiter', 'cook', 'manager']) role!: string;
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4-6 digitos.' }) pin!: string;
}

class UpdateStaffDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsIn(['waiter', 'cook', 'manager']) role?: string;
  @IsOptional() @Matches(/^\d{4,6}$/) pin?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class VerifyPinDto {
  // PIN: exatamente 4-6 digitos. Antes era so @IsString — bug-hunter
  // podia mandar payload de 1MB e o servidor calculava sha256 antes
  // de comparar.
  @IsString() @IsNotEmpty() @Matches(/^\d{4,6}$/) pin!: string;
}

/**
 * Endpoints de staff. List/getById ainda publicos pra que o login
 * inicial possa listar staffs antes de digitar PIN.
 *
 * Round 7 (B-NEW-19): mutações (POST/PATCH/DELETE) trocadas
 * StaffOrSessionGuard → StaffOnlyGuard. Antes (round 3) virou public→
 * StaffOrSessionGuard, mas o "Or Session" path aceita customer com
 * session ativa — customer criava staff fantasma com role manager
 * + PIN conhecido, ou rotacionava PIN de manager existente. Agora
 * exclusivamente staff (`x-staff-key`).
 *
 * verifyPin nao tem guard porque e o proprio mecanismo de login —
 * a defesa la e o throttle Redis no service (5 tentativas/5min lock).
 *
 * `my-tables` mantém StaffOrSessionGuard porque é a única rota onde
 * customer-side use case existe (cliente pode listar mesas ativas
 * pra contexto de UI).
 */
@Controller(':slug/staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async list(@Query('role') role?: string, @Query('activeOnly') activeOnly?: string) {
    const staff = await this.staffService.list(role, activeOnly === 'true');
    return { staff };
  }

  /**
   * P1 #16 — `/staff/my-tables`. Returns ActiveTableSummary[] for the
   * waiter home screen. Must be declared BEFORE the `:id` handler so
   * Nest's route matcher doesn't fall through to `getById('my-tables')`.
   */
  /**
   * Round 9 (B-NEW-44): customer (path session do StaffOrSessionGuard)
   * só vê a própria mesa, não todas as mesas ativas do tenant. Antes
   * vazava ticket_total_cents + flags VIP de todo o tenant pra qualquer
   * customer com session.
   */
  @Get('my-tables')
  @UseGuards(StaffOrSessionGuard)
  async myTables(
    @Req() req: { actorType?: 'staff' | 'session'; sessionData?: { sessionId: string } },
  ) {
    const sessionId =
      req.actorType === 'session' ? req.sessionData?.sessionId ?? null : null;
    return this.staffService.listActiveTables(sessionId);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.staffService.getById(id);
  }

  @Post()
  @UseGuards(StaffOnlyGuard)
  async create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Patch(':id')
  @UseGuards(StaffOnlyGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(StaffOnlyGuard)
  async delete(@Param('id') id: string) {
    return this.staffService.delete(id);
  }

  @Post(':id/verify-pin')
  @HttpCode(200)
  async verifyPin(
    @Param('id') id: string,
    @Body() dto: VerifyPinDto,
    @Req() req: { ip?: string; headers: Record<string, string | string[]> },
  ) {
    // Round 8 (B-NEW-30): throttle global por IP ALÉM do throttle por
    // staffId que já existe no service. Bloqueia atacante distribuindo
    // attempts entre N staff IDs.
    const ipKey = this.pinIpKey(req);
    if (await this.redis.get(`${ipKey}:lock`)) {
      throw new HttpException(
        'Muitas tentativas deste IP. Aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const valid = await this.staffService.verifyPin(id, dto.pin);

    // Sucesso reseta global counter; falha incrementa.
    if (valid) {
      await this.redis.del(`${ipKey}:attempts`);
    } else {
      const attempts = await this.redis.incr(`${ipKey}:attempts`);
      if (attempts === 1) {
        await this.redis.expire(
          `${ipKey}:attempts`,
          PIN_IP_RATE_WINDOW_SECONDS,
        );
      }
      if (attempts >= PIN_IP_RATE_MAX) {
        await this.redis.set(`${ipKey}:lock`, '1', PIN_IP_LOCK_SECONDS);
        await this.redis.del(`${ipKey}:attempts`);
      }
    }

    return { valid };
  }

  private pinIpKey(req: {
    ip?: string;
    headers: Record<string, string | string[]>;
  }): string {
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    const ip = (xffStr ?? req.ip ?? 'unknown')
      .toString()
      .split(',')[0]
      .trim();
    return `staff:pin_ip:${ip}`;
  }
}
