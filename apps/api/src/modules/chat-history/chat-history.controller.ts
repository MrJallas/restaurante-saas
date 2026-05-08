import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsUUID, IsString } from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { ChatHistoryService } from './chat-history.service';

class CustomerQueryDto {
  @IsUUID()
  customerId!: string;
}

class ThreadIdParam {
  @IsString()
  threadId!: string;
}

/**
 * Chat history (NoSQL backed) · per docs/features/chat-history-lgpd.md.
 * Customer reads/deletes their own threads; manager audit lookups happen on
 * the staff side (see staff-messages module — operational thread lives in PG).
 */
@Controller(':slug/chat-history')
export class ChatHistoryController {
  constructor(private readonly service: ChatHistoryService) {}

  @Get('threads')
  @UseGuards(SessionGuard)
  async listThreads(
    @Query() q: CustomerQueryDto,
    @Tenant() tenantId: string,
  ) {
    return this.service.listThreads(q.customerId, tenantId);
  }

  @Get('threads/:threadId/messages')
  @UseGuards(SessionGuard)
  async listMessages(@Param() p: ThreadIdParam) {
    return this.service.listMessages(p.threadId);
  }

  @Delete('threads/:threadId')
  @UseGuards(SessionGuard)
  async deleteThread(
    @Param() p: ThreadIdParam,
    @Query('customerId') customerId: string,
    @Session() _s: SessionData,
  ) {
    return this.service.deleteThread(p.threadId, customerId);
  }

  /** Bulk delete · alias for the LGPD erasure path. */
  @Delete()
  @UseGuards(SessionGuard)
  async deleteAll(@Query() q: CustomerQueryDto) {
    return this.service.deleteAllForCustomer(q.customerId);
  }
}
