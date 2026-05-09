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
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
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
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateMergeDto,
    @Session() _s: SessionData,
  ) {
    return this.service.createRequest(dto, slug);
  }

  @Post(':id/approve')
  @UseGuards(SessionGuard)
  async approve(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: DecisionDto = {},
  ) {
    return this.service.approve(id, dto.decidedByCustomerId, slug);
  }

  @Post(':id/reject')
  @UseGuards(SessionGuard)
  async reject(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: DecisionDto = {},
  ) {
    return this.service.reject(id, dto.decidedByCustomerId, dto.reason, slug);
  }

  /**
   * Round 7 (B-NEW-31): adicionado StaffOnlyGuard. Antes era público —
   * qualquer um listava todos pedidos de junção do tenant + IDs internos
   * (sourceTableSessionId, targetTableSessionId, requestingCustomerId).
   * Útil pra reconnaissance pré-ataque (B-NEW-23, B-NEW-27).
   */
  @Get()
  @UseGuards(StaffOnlyGuard)
  async list(@Query() q: ListQueryDto) {
    return this.service.list({
      status: q.status,
      tableSessionId: q.tableSessionId,
    });
  }
}
