import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean, Matches } from 'class-validator';
import { StaffService } from './staff.service';

class CreateStaffDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsIn(['waiter', 'cook', 'manager']) role!: string;
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4-6 digitos.' }) pin!: string;
}

class UpdateStaffDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['waiter', 'cook', 'manager']) role?: string;
  @IsOptional() @Matches(/^\d{4,6}$/) pin?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class VerifyPinDto {
  @IsString() @IsNotEmpty() pin!: string;
}

@Controller(':slug/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async list(@Query('role') role?: string, @Query('activeOnly') activeOnly?: string) {
    const staff = await this.staffService.list(role, activeOnly === 'true');
    return { staff };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.staffService.getById(id);
  }

  @Post()
  async create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Delete(':id')
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
