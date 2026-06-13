import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { ShiftsService } from './shifts.service';

class DateQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

// Round 18: usar IsString + Matches em vez de IsUUID porque o seed da
// migration 043 usa IDs determinísticos (`11111111-...-aaaaaaaaaaaa`)
// que nao conformam a UUID v1-v5 (version bits nao são 1-5). Match
// validates apenas o formato 8-4-4-4-12 hex.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class AddMemberDto {
  @Matches(UUID_LIKE) shiftId!: string;
  @IsUUID() staffId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) workDate!: string;
}

class MoveMemberDto {
  @Matches(UUID_LIKE) toShiftId!: string;
}

class OvertimeDto {
  @IsInt() @Min(0) @Max(600) minutes!: number;
}

class DuplicateWeekDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) fromDate!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) toDate!: string;
}

class ShiftEndRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ShiftEndDecisionDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  responseMessage?: string;
}

/**
 * Round 18 (Onda 2 backend): persistencia de turnos.
 *
 * Path NAO usa /staff/* porque StaffController tem `:id` wildcard que
 * captura children paths. Usar `/shifts/*` evita conflito (mesmo padrao
 * do `/courtesies` em CourtesiesController).
 *
 * Auth: ManagerOnlyGuard em todas as mutacoes — escala é decisão de
 * gestão. GET tambem manager-only por padrao mas sem prejuizo de futuro
 * relax pra waiter (canvas mostra waiter consultando proprio turno).
 */
@Controller(':slug/shifts')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get()
  async list(@Query() q: DateQuery) {
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    return this.service.listForDate(date);
  }

  @Post('assignments')
  @HttpCode(201)
  async addMember(@Body() dto: AddMemberDto) {
    return this.service.addMember({
      shiftId: dto.shiftId,
      staffId: dto.staffId,
      workDate: dto.workDate,
    });
  }

  @Patch('assignments/:id/move')
  async moveMember(@Param('id') id: string, @Body() dto: MoveMemberDto) {
    return this.service.moveMember(id, dto.toShiftId);
  }

  @Patch('assignments/:id/overtime')
  async overtime(@Param('id') id: string, @Body() dto: OvertimeDto) {
    return this.service.setOvertime(id, dto.minutes);
  }

  @Delete('assignments/:id')
  async removeMember(@Param('id') id: string) {
    return this.service.removeMember(id);
  }

  @Post('duplicate-week')
  @HttpCode(201)
  async duplicateWeek(@Body() dto: DuplicateWeekDto) {
    return this.service.duplicateWeek(dto.fromDate, dto.toDate);
  }
}

@Controller(':slug/waiter')
@UseGuards(StaffOnlyGuard)
export class WaiterShiftRequestsController {
  constructor(
    private readonly service: ShiftsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Post(':id/request-shift-end')
  @HttpCode(201)
  async requestShiftEndForId(
    @Param('slug') slug: string,
    @Param('id') waiterId: string,
    @Body() dto: ShiftEndRequestDto,
    @Req() req: Request,
  ) {
    const callerStaffId = await this.callerResolver.requireActiveStaffId(req);
    if (callerStaffId !== waiterId) {
      throw new ForbiddenException('Você só pode solicitar encerramento do seu próprio turno.');
    }
    return this.service.requestShiftEnd({
      waiterId,
      reason: dto.reason,
      slug,
    });
  }

  @Post('shift-end-requests')
  @HttpCode(201)
  async requestShiftEnd(
    @Param('slug') slug: string,
    @Body() dto: ShiftEndRequestDto,
    @Req() req: Request,
  ) {
    const waiterId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.requestShiftEnd({
      waiterId,
      reason: dto.reason,
      slug,
    });
  }
}

@Controller(':slug/manager/shift-end-requests')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
export class ManagerShiftEndRequestsController {
  constructor(
    private readonly service: ShiftsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Post(':id/decision')
  @HttpCode(200)
  async decide(
    @Param('slug') slug: string,
    @Param('id') requestId: string,
    @Body() dto: ShiftEndDecisionDto,
    @Req() req: Request,
  ) {
    const managerId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.decideShiftEndRequest({
      requestId,
      managerId,
      decision: dto.decision,
      responseMessage: dto.responseMessage,
      slug,
    });
  }
}
