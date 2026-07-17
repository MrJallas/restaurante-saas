import { Controller, Post, Get, Patch, Body, Param, Req, Delete, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsInt, IsOptional, IsString, Min, Max, MaxLength, IsUUID } from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { Session } from '../../common/decorators/session.decorator';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { WaiterCallsService } from './waiter-calls.service';

class CreateWaiterCallDto {
  @IsOptional()
  @IsIn(['bring_menu', 'place_order', 'serve_drink', 'ask_bill', 'other'])
  reason?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  visitId?: string | null;
}

class AcknowledgeCallDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  waiterName?: string;

  // Cap em 120min (2h). Sem isso a UI mostraria "Rodrigo - 99999 min".
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  etaMinutes?: number;
}

@Controller(':slug/waiter-calls')
export class WaiterCallsController {
  constructor(
    private readonly waiterCallsService: WaiterCallsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 8 (B-NEW-27): customerId derivado do cookie (opt-in — anonymous
   * sessions ainda podem chamar garçom sem identificação prévia). Antes:
   * customer A passava `customerId: <vítima>` e o chamado ficava
   * registrado em nome dela no audit log.
   */
  @Post()
  @UseGuards(SessionGuard)
  async createCall(
    @Session() session: SessionData,
    @Param('slug') slug: string,
    @Body() dto: CreateWaiterCallDto = {},
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.tryGetCustomerId(req);
    return this.waiterCallsService.createCall(session.sessionId, slug, {
      reason: dto.reason,
      customerId: callerCustomerId,
      visitId: dto.visitId ?? null,
    });
  }

  // NOTE: /pending is declared BEFORE /:callId because Express matches the
  // first registered route and `:callId` would otherwise swallow "pending".
  // Endpoint de staff — agora protegido pelo StaffOrSessionGuard. Antes
  // era publico (qualquer um listava todos os chamados de todas as mesas).
  @Get('pending')
  @UseGuards(StaffOnlyGuard)
  async getPendingCalls(@Req() req: Request) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.waiterCallsService.getPendingCalls(staffId);
  }

  /**
   * Customer-facing active call check. Used before opening the "choose
   * reason" sheet so a second tap shows the waiting state instead of
   * creating another call.
   */
  @Get('active')
  @UseGuards(SessionGuard)
  async getActiveCall(@Session() session: SessionData) {
    return this.waiterCallsService.getActiveCall(session.sessionId);
  }

  /**
   * Customer polls this to get the waiter's name + ETA once the call has
   * been acknowledged by staff, and to know when it resolves.
   */
  @Get(':callId')
  @UseGuards(SessionGuard)
  async getCall(@Session() session: SessionData, @Param('callId') callId: string) {
    return this.waiterCallsService.getCall(callId, session.sessionId);
  }

  /**
   * Detalhe do chamado pro GARÇOM (tela ScreenWaiterCallDetail): mesa real
   * + conta real da sessão com taxa. StaffOnly — o GET :callId de cima é
   * do customer (SessionGuard + scope da própria mesa).
   */
  @Get(':callId/staff-detail')
  @UseGuards(StaffOnlyGuard)
  async getCallStaffDetail(@Param('callId') callId: string, @Req() req: Request) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.waiterCallsService.getCallStaffDetail(callId, staffId);
  }

  /**
   * Customer cancels their own pending call (SW2 "Cancelar chamado").
   * Only valid while status is still `pending`.
   */
  @Patch(':callId/cancel')
  @UseGuards(SessionGuard)
  async cancelCall(@Session() session: SessionData, @Param('callId') callId: string) {
    return this.waiterCallsService.cancelCall(callId, session.sessionId);
  }

  @Delete(':callId')
  @UseGuards(SessionGuard)
  async deleteCall(@Session() session: SessionData, @Param('callId') callId: string) {
    return this.waiterCallsService.cancelCall(callId, session.sessionId);
  }

  // Acknowledge e resolve sao acoes de staff — antes publicas, agora
  // exigem `x-staff-key` (StaffOrSessionGuard tambem aceita session
  // pra admin/owner que possa estar em sessao normal). Sem auth, qualquer
  // um podia se passar por garcom (impersonation no nome+ETA) ou fechar
  // chamados ativos. P0 do bug-hunt.
  @Post(':callId/acknowledge')
  @UseGuards(StaffOnlyGuard)
  async acknowledgeCall(
    @Param('callId') callId: string,
    @Param('slug') slug: string,
    @Body() dto: AcknowledgeCallDto = {},
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.waiterCallsService.acknowledgeCall(
      callId,
      slug,
      staffId,
      undefined,
      dto.etaMinutes,
    );
  }

  @Post(':callId/resolve')
  @UseGuards(StaffOnlyGuard)
  async resolveCall(
    @Param('callId') callId: string,
    @Param('slug') slug: string,
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.waiterCallsService.resolveCall(callId, slug, staffId);
  }
}
