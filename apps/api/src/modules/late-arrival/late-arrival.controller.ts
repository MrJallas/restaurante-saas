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
import { CustomersService } from '../customers/customers.service';
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
  constructor(
    private readonly service: LateArrivalService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Round 6 (B-NEW-12): valida que o caller é o host da mesa do request
   * (ou tem x-staff-key, mas neste endpoint só SessionGuard, então
   * obrigatório customer host). Antes: dto.customerId/staffId vinham do
   * body, atacante em outra mesa do mesmo tenant podia approve/reject
   * pedido alheio passando o UUID do host real.
   */
  private async assertHostOrThrow(
    req: Request,
    requestId: string,
  ): Promise<{ customerId: string }> {
    const token =
      (req as Request & { cookies?: Record<string, string> }).cookies
        ?.recognition_token ?? null;
    if (!token) {
      throw new HttpException(
        'Identificação ausente.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const caller = await this.customers.resolveByRecognitionToken(token);
    if (!caller) {
      throw new HttpException('Identificação inválida.', HttpStatus.UNAUTHORIZED);
    }
    const isHost = await this.service.isCallerHostOfRequest(
      requestId,
      caller.customerId,
    );
    if (!isHost) {
      throw new HttpException(
        'Apenas o host da mesa pode aprovar ou rejeitar.',
        HttpStatus.FORBIDDEN,
      );
    }
    return { customerId: caller.customerId };
  }

  /**
   * Round 8 (B-NEW-27): customerId derivado do cookie. O fluxo de
   * late-arrival passa pelo /customer/identify ANTES, que seta o
   * recognition_token cookie + persiste customer no DB. Aqui o
   * cookie já está disponível. dto.customerId é IGNORADO (atacante
   * não pode criar request fake atribuído a customer alheio).
   */
  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateLateArrivalDto,
    @Session() session: SessionData,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.customers.resolveByRecognitionToken(
      ((req as Request & { cookies?: Record<string, string> }).cookies
        ?.recognition_token ?? ''),
    );
    if (!callerCustomerId) {
      throw new HttpException(
        'Identifique-se primeiro (POST /customer/identify).',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.service.create(
      {
        customerId: callerCustomerId.customerId,
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
    @Body() _dto: ApproveDto = {},
    @Req() req: Request,
  ) {
    // Round 6 (B-NEW-12): customerId derivado do cookie via host check;
    // dto.customerId/staffId IGNORADOS (atacante não pode passar UUID
    // alheio pra creditar audit). staffId só via x-staff-key flow num
    // endpoint separado (não exposto aqui — staff usa /staff/late-arrival).
    const caller = await this.assertHostOrThrow(req, id);
    return this.service.approve(
      id,
      { customerId: caller.customerId },
      slug,
    );
  }

  @Post(':id/reject')
  @UseGuards(SessionGuard)
  async reject(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RejectDto = {},
    @Req() req: Request,
  ) {
    const caller = await this.assertHostOrThrow(req, id);
    return this.service.reject(
      id,
      { customerId: caller.customerId },
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

  /**
   * P1 #23 — single-resource read. Deep-links from manager/host stat
   * detail pages (`/manager/stat/late-arrival/:id`,
   * `/host/late-arrival/[id]`) hit this. Same guard as `list` —
   * staff-only so customer sessions can't enumerate other tables'
   * requests.
   */
  @Get(':id')
  @UseGuards(StaffOnlyGuard)
  async getById(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
