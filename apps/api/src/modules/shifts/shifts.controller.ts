import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
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
  async moveMember(
    @Param('id') id: string,
    @Body() dto: MoveMemberDto,
  ) {
    return this.service.moveMember(id, dto.toShiftId);
  }

  @Patch('assignments/:id/overtime')
  async overtime(
    @Param('id') id: string,
    @Body() dto: OvertimeDto,
  ) {
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
