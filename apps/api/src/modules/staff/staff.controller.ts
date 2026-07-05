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
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { ZoneAssignmentsService } from './zone-assignments.service';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';

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
  @IsIn(['waiter', 'cook', 'manager', 'host', 'bartender', 'cashier']) role!: string;
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4-6 digitos.' }) pin!: string;
  // Round 18 (Onda 1 wiring): campos do canvas StaffForm. Todos
  // opcionais — backend nao quebra se FE legacy mandar so name/role/pin.
  @IsOptional() @IsString() @MaxLength(20) cpf?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsIn(['Manhã', 'Tarde', 'Noite']) default_shift?: string;
}

class UpdateStaffDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsIn(['waiter', 'cook', 'manager', 'host', 'bartender', 'cashier']) role?: string;
  @IsOptional() @Matches(/^\d{4,6}$/) pin?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(20) cpf?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsIn(['Manhã', 'Tarde', 'Noite']) default_shift?: string;
}

class VerifyPinDto {
  // PIN: exatamente 4-6 digitos. Antes era so @IsString — bug-hunter
  // podia mandar payload de 1MB e o servidor calculava sha256 antes
  // de comparar.
  @IsString() @IsNotEmpty() @Matches(/^\d{4,6}$/) pin!: string;
}

/**
 * Endpoints de staff.
 *
 * Security fix — list/getById passaram a exigir StaffOnlyGuard
 * (x-staff-key). Antes eram publicos "pra que o login inicial pudesse
 * listar staffs antes do PIN", mas o roster completo inclui PII (cpf,
 * phone, email) + o mapeamento id→role (que é o próprio x-staff-id dos
 * guards de manager/host). Como o único requisito era conhecer o :slug
 * (público na URL do QR/cardápio), qualquer não-autenticado lia todo o
 * quadro de funcionários do tenant em texto claro (LGPD) e coletava os
 * UUIDs pra escalar acesso. O login real (staff-auth, CPF+PIN) não
 * consome essas rotas — todos os consumidores legítimos já mandam
 * x-staff-key. Alinha com as irmãs tables-overview / tables/:tableRef.
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
    private readonly zoneAssignments: ZoneAssignmentsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get()
  @UseGuards(StaffOnlyGuard)
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
    const sessionId = req.actorType === 'session' ? (req.sessionData?.sessionId ?? null) : null;
    return this.staffService.listActiveTables(sessionId);
  }

  @Get('tables/:tableRef/detail')
  @UseGuards(StaffOnlyGuard)
  async tableDetail(@Param('tableRef') tableRef: string) {
    return this.staffService.getTableDetail(tableRef);
  }

  /**
   * Mapa operacional de mesas pro app do garçom (tela de entrega usa pra
   * orientar onde fica a mesa: zona + grade de mesas). Diferente de
   * `my-tables` (só mesas com sessão ativa), retorna TODAS as mesas
   * ativas do tenant agrupáveis por zona. Declarado ANTES do wildcard
   * `@Get(':id')` pra Nest matcher não cair em getById('tables-overview').
   */
  /**
   * Atribuição garçom→zona do DIA (decisão Caleb 2026-07-04): fonte real
   * da carga por garçom. Leitura: qualquer staff. Escrita: manager.
   * Declaradas ANTES do wildcard :id (mesmo motivo do tables-overview).
   */
  @Get('zone-assignments')
  @UseGuards(StaffOnlyGuard)
  async listZoneAssignments() {
    return this.zoneAssignments.listToday();
  }

  @Post('zone-assignments')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async assignZone(@Body() dto: { staffId: string; zoneId: string }, @Req() req: Request) {
    const managerId = await this.callerResolver.requireActiveStaffId(req);
    if (!dto?.staffId || !dto?.zoneId) {
      throw new BadRequestException('staffId e zoneId são obrigatórios.');
    }
    return this.zoneAssignments.assign(dto.staffId, dto.zoneId, managerId);
  }

  @Delete('zone-assignments/:assignmentId')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async removeZoneAssignment(@Param('assignmentId') assignmentId: string) {
    return this.zoneAssignments.remove(assignmentId);
  }

  @Get('tables-overview')
  @UseGuards(StaffOnlyGuard)
  async tablesOverview() {
    const tables = await this.staffService.listTablesOverview();
    return { tables };
  }

  /**
   * Round 18 (Onda 4 batch 2): KPIs agregados pra
   * `ScreenManagerStaffDetail` (canvas /manager/equipe/[id]).
   * Period: today | 7d | 30d. Auth: staff-only (manager dashboard).
   *
   * Declarado ANTES do wildcard `@Get(':id')` pra Nest matcher não cair
   * em getById('performance'). Vide `path collision` em SUPER-PROMPT-V3 §9.
   *
   * IDOR-read (re-scan #5): era `StaffOrSessionGuard` — um customer com
   * `x-session-token`/cookie `session_token` de QUALQUER mesa ativa do
   * tenant passava o guard como `actorType==='session'` e lia KPIs
   * confidenciais (totalRevenue/faturamento, salesByDay, teamComparison)
   * de qualquer staff via `/staff/<uuid>/performance`. O handler nunca
   * amarrava o `:id` ao caller nem ramificava por actorType. Troca pra
   * `StaffOnlyGuard`, casando com as irmãs de dashboard de gestão neste
   * controller (tables-overview, :id, tables/:tableRef/detail,
   * zone-assignments GET) e com o precedente B-NEW-20 (dashboard revenue,
   * mesmo swap). Único consumidor FE é `ScreenManagerStaffDetail` via
   * `staffGet` (credencial de staff), então o caso legítimo não quebra.
   */
  @Get(':id/performance')
  @UseGuards(StaffOnlyGuard)
  async getPerformance(@Param('id') id: string, @Query('period') period?: string) {
    const p =
      period === '7d' || period === '30d' || period === 'today'
        ? (period as 'today' | '7d' | '30d')
        : 'today';
    return this.staffService.getPerformance(id, p);
  }

  /**
   * PII/role leak read (P2 hardening) — getById era read-only mas só
   * StaffOnlyGuard: qualquer token de staff (waiter/cook/host) lia o dossiê
   * completo (name/role/cpf/phone/email) de qualquer funcionário via
   * `/staff/<uuid>`. O único consumidor FE é `ScreenManagerStaffDetail`
   * (`/manager/equipe/[id]` → `staffRoster.get`, credencial de manager) —
   * nenhum staff não-manager consome. Fix: ManagerOnlyGuard, casando com a
   * irmã list (roster) e com create/update/delete. Leitura do dossiê de
   * staff é gestão.
   */
  @Get(':id')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async getById(@Param('id') id: string) {
    return this.staffService.getById(id);
  }

  /**
   * Privilege escalation staff→manager (re-scan de convergência #7) —
   * create/update/delete eram guardadas SÓ por StaffOnlyGuard, que NÃO checa
   * role (retorna true pra QUALQUER x-staff-token válido, emitido no login de
   * todo role, ou a x-staff-key compartilhada). Um garçom logava normal e:
   * criava manager (POST {role:'manager'}), auto-promovia (PATCH próprio-id
   * {role:'manager'}), resetava o PIN de qualquer um (PATCH {pin}) logando
   * como ele, ou deletava o gerente (DELETE). `staffService.update()` seta
   * role/pin_hash direto do DTO sem gate in-service; `delete()` é hard-delete.
   *
   * Fix: ManagerOnlyGuard casando com as irmãs de mutação de gestão —
   * StaffPinAdminController reset-pin, zone-assignments POST/DELETE, e todo o
   * conjunto vip/complaints/courtesies/lgpd/shifts/manager-account. O canvas
   * mapeia staff create/edit pra ScreenManagerStaffForm (tela de manager), e
   * o consumidor FE (staffCreate/staffUpdate/staffDelete via staffApi) manda
   * credencial de staff — o manager legítimo passa; garçom/host/cook não.
   */
  @Post()
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Patch(':id')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
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
        await this.redis.expire(`${ipKey}:attempts`, PIN_IP_RATE_WINDOW_SECONDS);
      }
      if (attempts >= PIN_IP_RATE_MAX) {
        await this.redis.set(`${ipKey}:lock`, '1', PIN_IP_LOCK_SECONDS);
        await this.redis.del(`${ipKey}:attempts`);
      }
    }

    return { valid };
  }

  private pinIpKey(req: { ip?: string; headers: Record<string, string | string[]> }): string {
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    const ip = (xffStr ?? req.ip ?? 'unknown').toString().split(',')[0].trim();
    return `staff:pin_ip:${ip}`;
  }
}
