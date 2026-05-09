import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsBoolean,
  Matches,
  MaxLength,
} from 'class-validator';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { StaffService } from './staff.service';

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
 * inicial possa listar staffs antes de digitar PIN. Mutacoes (criar/
 * editar/deletar) exigem `x-staff-key`. Antes era TUDO publico (P0
 * round 3).
 *
 * verifyPin nao tem guard porque e o proprio mecanismo de login —
 * a defesa la e o throttle Redis no service (5 tentativas/5min lock).
 */
@Controller(':slug/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

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
  @Get('my-tables')
  @UseGuards(StaffOrSessionGuard)
  async myTables() {
    return this.staffService.listActiveTables();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.staffService.getById(id);
  }

  @Post()
  @UseGuards(StaffOrSessionGuard)
  async create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Patch(':id')
  @UseGuards(StaffOrSessionGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(StaffOrSessionGuard)
  async delete(@Param('id') id: string) {
    return this.staffService.delete(id);
  }

  @Post(':id/verify-pin')
  @HttpCode(200)
  async verifyPin(@Param('id') id: string, @Body() dto: VerifyPinDto) {
    const valid = await this.staffService.verifyPin(id, dto.pin);
    return { valid };
  }
}
