import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { IsUUID, IsIn } from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { TableSessionService } from './table-session.service';

class JoinDecisionDto {
  // O host envia esses 2 campos pra aprovar/rejeitar quem pediu pra
  // entrar. Quem fez o request e quem decide vem do session token do
  // caller (host) — service valida que ele e mesmo o host.
  @IsUUID()
  hostCustomerId!: string;

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
  constructor(private readonly tableSessionService: TableSessionService) {}

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
   * customer na mesa. Service valida que `hostCustomerId` e mesmo o
   * host gravado em `table_sessions.host_customer_id` — atacante que
   * tenta forjar nao consegue.
   */
  @Post('participants/decide')
  @UseGuards(SessionGuard)
  async decideJoinRequest(
    @Session() session: SessionData,
    @Body() dto: JoinDecisionDto,
  ) {
    return this.tableSessionService.decideJoinRequest(
      session.sessionId,
      dto.hostCustomerId,
      dto.targetCustomerId,
      dto.decision,
    );
  }
}
