import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString, IsOptional, IsUUID, MaxLength, IsIn } from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { Session } from '../../common/decorators/session.decorator';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { TableMergeService } from './table-merge.service';

class CreateMergeDto {
  @IsOptional()
  @IsUUID()
  sourceTableSessionId?: string;

  @IsOptional()
  @IsUUID()
  targetTableSessionId?: string;

  @IsOptional()
  @IsUUID()
  requestingCustomerId?: string;

  @IsOptional()
  targetTableNumber?: number;

  @IsOptional()
  targetTableLabel?: string;

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
  @IsIn(['pending', 'approved', 'rejected', 'timeout', 'expired', 'cooldown_blocked'])
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
  constructor(
    private readonly service: TableMergeService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 10 (B-NEW-50): requestingCustomerId derivado do cookie.
   * Antes: customer A criava merge request "em nome de" customer Y
   * conhecendo UUID — audit log mostrava B como requester, manager DM
   * ia pra B, FE de B mostrava modal de junção que ele não pediu.
   * Round 8 cobriu approve/reject mas o create ficou esquecido.
   *
   * Round 12 (B-NEW-61): sourceTableSessionId pinned no session.sessionId.
   * Antes customer A em mesa 5 criava merge "entre mesa 7 e 9" passando
   * sourceTableSessionId arbitrário — WS broadcast disparava modal pra
   * cliente alheio em outra mesa, cooldown grief.
   */
  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateMergeDto,
    @Session() session: SessionData,
    @Req() req: Request,
  ) {
    if (dto.sourceTableSessionId && dto.sourceTableSessionId !== session.sessionId) {
      throw new HttpException(
        {
          message_user: 'A mesa de origem precisa ser a sua mesa atual.',
          code: 'SOURCE_SESSION_MISMATCH',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    const callerCustomerId = await this.callerResolver.requireCustomerId(req);
    return this.service.createCustomerRequest(
      {
        ...dto,
        sourceTableSessionId: session.sessionId,
        requestingCustomerId: callerCustomerId,
      },
      slug,
    );
  }

  /**
   * Round 8 (B-NEW-27): decidedByCustomerId derivado do cookie.
   * Antes customer A passava `decidedByCustomerId: <host-de-Y>` e o
   * service só validava que o UUID casava com `tgt_host`, não que o
   * caller realmente era o tgt_host. Service.approve já valida ownership,
   * mas trustar o body permitia spoof do caller no audit.
   */
  @Post(':id/approve')
  @UseGuards(SessionGuard)
  async approve(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() _dto: DecisionDto = {},
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.requireCustomerId(req);
    return this.service.approve(id, callerCustomerId, slug);
  }

  @Post(':id/reject')
  @UseGuards(SessionGuard)
  async reject(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: DecisionDto = {},
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.requireCustomerId(req);
    return this.service.reject(id, callerCustomerId, dto.reason, slug);
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
