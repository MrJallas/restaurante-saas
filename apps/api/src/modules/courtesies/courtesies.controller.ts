import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  CustomerCourtesiesResponse,
  CustomerCourtesyDto,
  CustomerCourtesyHistoryResponse,
} from '@restaurant/shared-types';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData, SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { CourtesiesService, CourtesyRow, CourtesyStatus } from './courtesies.service';

class ListCourtesiesQuery {
  @IsOptional() @IsString() today?: string;
  @IsOptional() @IsIn(['pendente', 'aceita', 'recusada']) status?: CourtesyStatus;
  @IsOptional() @IsString() limit?: string;
}

class CreateCourtesyDto {
  @IsIn(['Sobremesa', 'Drink', 'Desconto', 'Couvert', 'Mensagem', 'Outro'])
  type!: string;
  @IsString() @MaxLength(500) item!: string;
  @IsOptional() @IsUUID() tableSessionId?: string;
  @IsOptional() @IsInt() @Min(1) tableNumber?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class RespondCourtesyDto {
  @IsIn(['aceita', 'recusada']) status!: 'aceita' | 'recusada';
}

/**
 * Round 18 (Onda 1 wiring): persistencia das cortesias usadas pelo
 * `ScreenManagerCourtesies` (histórico) e pelo botao "Mandar cortesia"
 * em `ScreenManagerTableMenu`. Antes a lista era mock inline e o botao
 * fazia noop — agora persiste em `courtesies` (migration 042).
 *
 * Auth:
 *   • GET — manager-only (lista de cortesias enviadas é dado de gestao)
 *   • POST — manager-only (so manager autoriza cortesia)
 *   • PATCH respond — staff-only (garcom pode registrar aceite verbal)
 *
 * `manager_staff_id` deriva do header x-staff-id via CallerResolver
 * (round 18 pattern — nunca aceitar do body, audit-spoof prevention).
 */
// Path: `/:slug/courtesies` (NAO `/staff/courtesies`) — o `StaffController`
// usa `@Get(':id')` wildcard que captura `/staff/courtesies` como
// getById('courtesies') e quebra com "invalid uuid syntax". Era P1
// debug pego on-test (2026-05-09).
@Controller(':slug/courtesies')
export class CourtesiesController {
  constructor(
    private readonly service: CourtesiesService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get()
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async list(@Query() q: ListCourtesiesQuery) {
    const limit = q.limit ? parseInt(q.limit, 10) : undefined;
    return this.service.list({
      today: q.today === 'true',
      status: q.status,
      limit: Number.isFinite(limit as number) ? limit : undefined,
    });
  }

  @Post()
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  @HttpCode(201)
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateCourtesyDto,
    @Req() req: Request,
  ): Promise<CourtesyRow> {
    const managerStaffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.create({
      type: dto.type,
      item: dto.item,
      managerStaffId,
      tableSessionId: dto.tableSessionId,
      tableNumber: dto.tableNumber,
      notes: dto.notes,
      slug,
    });
  }

  @Post(':id/respond')
  @UseGuards(StaffOnlyGuard)
  @HttpCode(200)
  async respond(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RespondCourtesyDto,
  ): Promise<CourtesyRow> {
    return this.service.respond(id, dto.status, slug);
  }
}

@Controller(':slug/customer/courtesies')
export class CustomerCourtesiesController {
  constructor(private readonly service: CourtesiesService) {}

  @Get()
  @UseGuards(SessionGuard)
  async list(@Session() session: SessionData): Promise<CustomerCourtesiesResponse> {
    return {
      courtesies: await this.service.listForSession(session.sessionId, session.customerId),
    };
  }

  @Get('history')
  @UseGuards(SessionGuard)
  async history(@Session() session: SessionData): Promise<CustomerCourtesyHistoryResponse> {
    return {
      courtesies: await this.service.listHistoryForCustomer(
        session.customerId,
        session.sessionId,
      ),
      retentionDays: 30,
    };
  }

  @Post(':id/respond')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async respond(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RespondCourtesyDto,
    @Session() session: SessionData,
  ): Promise<CustomerCourtesyDto> {
    return this.service.respondForSession(
      id,
      dto.status,
      session.sessionId,
      slug,
      session.customerId,
    );
  }
}
