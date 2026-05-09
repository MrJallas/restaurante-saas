import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsUUID, IsIn, IsOptional } from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { TableSessionService } from './table-session.service';

class JoinDecisionDto {
  /**
   * Round 12 (B-NEW-62): hostCustomerId agora é derivado do cookie pelo
   * callerResolver. Mantido como optional só pra compat com clientes legacy
   * que ainda mandam — service ignora o valor do body.
   */
  @IsOptional()
  @IsUUID()
  hostCustomerId?: string;

  @IsUUID()
  targetCustomerId!: string;

  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';
}

/**
 * Table-scoped read endpoints (SM3 avatar stack, SP1 split roster). These
 * sit outside `:slug/session` because they describe the table's state, not
 * the caller's own session cookie.
 */
@Controller(':slug/table')
export class TableController {
  constructor(
    private readonly tableSessionService: TableSessionService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get('participants')
  @UseGuards(SessionGuard)
  async getParticipants(@Session() session: SessionData) {
    const participants = await this.tableSessionService.getParticipants(
      session.sessionId,
    );
    return { participants };
  }

  /**
   * Host-only: aprova ou rejeita um pedido de entrada de outro
   * customer na mesa.
   *
   * Round 12 (B-NEW-62): hostCustomerId derivado do cookie. Antes vinha
   * do body — qualquer customer na mesma session conseguia passar o UUID
   * do host real, e service só validava `host_customer_id === input` (que
   * trivialmente bate). Audit registrava decisão como sendo do host
   * mesmo quando outro participante chamou. Agora o service compara o
   * host em DB contra o customerId do cookie (caller real).
   */
  @Post('participants/decide')
  @UseGuards(SessionGuard)
  async decideJoinRequest(
    @Session() session: SessionData,
    @Body() dto: JoinDecisionDto,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.requireCustomerId(req);
    return this.tableSessionService.decideJoinRequest(
      session.sessionId,
      callerCustomerId,
      dto.targetCustomerId,
      dto.decision,
    );
  }
}
