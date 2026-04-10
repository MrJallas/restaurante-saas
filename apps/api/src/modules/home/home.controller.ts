import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData } from '../../common/guards/session.guard';
import { HomeService } from './home.service';

@Controller(':slug/home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @UseGuards(SessionGuard)
  async getHome(
    @Session() session: SessionData,
    @Query('customerId') customerId?: string,
  ) {
    return this.homeService.getHome(
      session.sessionId,
      customerId,
      session.tableLabel,
    );
  }
}
