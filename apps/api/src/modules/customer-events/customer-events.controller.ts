import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsObject, IsOptional } from 'class-validator';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData, SessionGuard } from '../../common/guards/session.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import {
  CustomerEventsService,
  type CustomerEventType,
} from './customer-events.service';

class CreateCustomerEventDto {
  @IsIn(['menu_viewed', 'assistant_opened', 'session_resumed', 'item_viewed'])
  event_type!: CustomerEventType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

@Controller(':slug/customer/events')
export class CustomerEventsController {
  constructor(
    private readonly service: CustomerEventsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Param('slug') _slug: string,
    @Body() dto: CreateCustomerEventDto,
    @Session() session: SessionData,
    @Req() req: Request,
  ) {
    const customerId =
      session.customerId ?? (await this.callerResolver.tryGetCustomerId(req));
    const event = await this.service.create({
      tableSessionId: session.sessionId,
      customerId,
      eventType: dto.event_type,
      metadata: dto.metadata ?? {},
    });

    return { ok: true, event };
  }
}
