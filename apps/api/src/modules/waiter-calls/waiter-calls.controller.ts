import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { WaiterCallsService } from './waiter-calls.service';

@Controller(':slug/waiter-calls')
export class WaiterCallsController {
  constructor(private readonly waiterCallsService: WaiterCallsService) {}

  @Post()
  @UseGuards(SessionGuard)
  async createCall(
    @Session() session: SessionData,
    @Param('slug') slug: string,
  ) {
    return this.waiterCallsService.createCall(session.sessionId, slug);
  }

  @Post(':callId/acknowledge')
  async acknowledgeCall(
    @Param('callId') callId: string,
    @Param('slug') slug: string,
  ) {
    // In production, this would be protected by staff auth
    return this.waiterCallsService.acknowledgeCall(callId, slug, '');
  }

  @Post(':callId/resolve')
  async resolveCall(@Param('callId') callId: string) {
    return this.waiterCallsService.resolveCall(callId);
  }

  @Get('pending')
  async getPendingCalls() {
    return this.waiterCallsService.getPendingCalls();
  }
}
