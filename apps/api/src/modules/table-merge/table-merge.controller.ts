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
  MaxLength,
  IsIn,
} from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { TableMergeService } from './table-merge.service';

class CreateMergeDto {
  @IsUUID()
  sourceTableSessionId!: string;

  @IsUUID()
  targetTableSessionId!: string;

  @IsUUID()
  requestingCustomerId!: string;

  @IsOptional()
  @IsUUID()
  targetCustomerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

class DecisionDto {
  @IsOptional()
  @IsUUID()
  decidedByCustomerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'expired', 'cooldown_blocked'])
  status?: string;

  @IsOptional()
  @IsUUID()
  tableSessionId?: string;
}

/**
 * Table-merge requests · per docs/features/customer-host-model.md.
 * 429 returned when an active cooldown blocks a new attempt.
 */
@Controller(':slug/table-merge-requests')
export class TableMergeController {
  constructor(private readonly service: TableMergeService) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(@Body() dto: CreateMergeDto, @Session() _s: SessionData) {
    return this.service.createRequest(dto);
  }

  @Post(':id/approve')
  @UseGuards(SessionGuard)
  async approve(@Param('id') id: string, @Body() dto: DecisionDto = {}) {
    return this.service.approve(id, dto.decidedByCustomerId);
  }

  @Post(':id/reject')
  @UseGuards(SessionGuard)
  async reject(@Param('id') id: string, @Body() dto: DecisionDto = {}) {
    return this.service.reject(id, dto.decidedByCustomerId, dto.reason);
  }

  @Get()
  async list(@Query() q: ListQueryDto) {
    return this.service.list({
      status: q.status,
      tableSessionId: q.tableSessionId,
    });
  }
}
