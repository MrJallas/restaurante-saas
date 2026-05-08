import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsISO8601,
  MaxLength,
  IsIn,
} from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { LateArrivalService } from './late-arrival.service';

class CreateLateArrivalDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @IsUUID()
  tableSessionId?: string;

  @IsOptional()
  @IsISO8601()
  expectedArrivalAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

class RejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

class ApproveDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

class ListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'expired'])
  status?: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @IsUUID()
  tableSessionId?: string;
}

/**
 * Late-arrival requests · per docs/features/customer-host-model.md.
 * Customer-host approves; staff/host fallback when host doesn't respond.
 */
@Controller(':slug/late-arrival-requests')
export class LateArrivalController {
  constructor(private readonly service: LateArrivalService) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Body() dto: CreateLateArrivalDto,
    @Session() session: SessionData,
  ) {
    return this.service.create({
      customerId: dto.customerId,
      visitId: dto.visitId,
      tableSessionId: dto.tableSessionId ?? session.sessionId,
      expectedArrivalAt: dto.expectedArrivalAt,
      message: dto.message,
    });
  }

  @Post(':id/approve')
  @UseGuards(SessionGuard)
  async approve(@Param('id') id: string, @Body() dto: ApproveDto = {}) {
    return this.service.approve(id, {
      staffId: dto.staffId,
      customerId: dto.customerId,
    });
  }

  @Post(':id/reject')
  @UseGuards(SessionGuard)
  async reject(@Param('id') id: string, @Body() dto: RejectDto = {}) {
    return this.service.reject(
      id,
      { staffId: dto.staffId, customerId: dto.customerId },
      dto.reason,
    );
  }

  @Get()
  @UseGuards(StaffOnlyGuard)
  async list(@Query() q: ListQueryDto) {
    return this.service.list({
      status: q.status,
      visitId: q.visitId,
      tableSessionId: q.tableSessionId,
    });
  }
}
