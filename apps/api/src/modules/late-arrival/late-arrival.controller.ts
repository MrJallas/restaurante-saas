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
 *
 * Routes:
 *   - `POST /:slug/late-arrival-requests`              · create (session)
 *   - `POST /:slug/late-arrival-requests/:id/approve`  · host approves
 *   - `POST /:slug/late-arrival-requests/:id/reject`   · host rejects
 *   - `GET  /:slug/late-arrival-requests`              · staff list
 *
 * Two distinct endpoints (approve/reject) instead of a single `/respond`
 * endpoint with a body discriminator. RESTful and avoids ambiguity in
 * audit logs and access logs.
 */
@Controller(':slug/late-arrival-requests')
export class LateArrivalController {
  constructor(private readonly service: LateArrivalService) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateLateArrivalDto,
    @Session() session: SessionData,
  ) {
    return this.service.create(
      {
        customerId: dto.customerId,
        visitId: dto.visitId,
        tableSessionId: dto.tableSessionId ?? session.sessionId,
        expectedArrivalAt: dto.expectedArrivalAt,
        message: dto.message,
      },
      slug,
    );
  }

  @Post(':id/approve')
  @UseGuards(SessionGuard)
  async approve(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: ApproveDto = {},
  ) {
    return this.service.approve(
      id,
      {
        staffId: dto.staffId,
        customerId: dto.customerId,
      },
      slug,
    );
  }

  @Post(':id/reject')
  @UseGuards(SessionGuard)
  async reject(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RejectDto = {},
  ) {
    return this.service.reject(
      id,
      { staffId: dto.staffId, customerId: dto.customerId },
      dto.reason,
      slug,
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
