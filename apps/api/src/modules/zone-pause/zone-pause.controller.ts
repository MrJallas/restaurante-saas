import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ZonePauseService } from './zone-pause.service';

class CreateZonePauseDto {
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  zoneName?: string;

  @IsOptional()
  @IsIn(['orders', 'all'])
  kind?: 'orders' | 'all';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  createdByStaffId?: string;
}

class EndZonePauseDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ListQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsUUID()
  zoneId?: string;
}

@Controller(':slug/zone-pauses')
@UseGuards(StaffOnlyGuard)
export class ZonePauseController {
  constructor(private readonly service: ZonePauseService) {}

  @Post()
  async create(@Body() dto: CreateZonePauseDto) {
    return this.service.create({
      zoneId: dto.zoneId ?? null,
      zoneName: dto.zoneName ?? null,
      kind: dto.kind,
      durationMinutes: dto.durationMinutes,
      reason: dto.reason,
      createdByStaffId: dto.createdByStaffId,
    });
  }

  @Post(':id/end')
  async end(@Param('id') id: string, @Body() dto: EndZonePauseDto = {}) {
    return this.service.end(id, {
      staffId: dto.staffId,
      reason: dto.reason,
    });
  }

  @Get()
  async list(@Query() q: ListQueryDto) {
    return this.service.list({ active: q.active, zoneId: q.zoneId });
  }
}
