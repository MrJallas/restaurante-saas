import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SalonService } from './salon.service';

@Controller(':slug/salon')
export class SalonController {
  constructor(private readonly salonService: SalonService) {}

  @Get('tables/adjacent')
  @UseGuards(SessionGuard)
  async listAdjacentTables(@Session() session: SessionData, @Query('radius') radius?: string) {
    const parsedRadius = radius ? Number(radius) : undefined;
    return this.salonService.listAdjacentTables({
      currentTableId: session.tableId,
      currentSessionId: session.sessionId,
      radius: Number.isFinite(parsedRadius) ? parsedRadius : undefined,
    });
  }
}
