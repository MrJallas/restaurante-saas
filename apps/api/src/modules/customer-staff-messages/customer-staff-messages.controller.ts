import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CustomersService } from '../customers/customers.service';
import { CustomerStaffMessagesService } from './customer-staff-messages.service';

class ThreadIdParamDto {
  @IsString()
  threadId!: string;
}

class CustomerSendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

/**
 * Customer-side inbox for "Mensagens com a equipe" (NoSQL · 30d TTL).
 *
 * URL prefix is `:slug/customer-staff-messages` rather than the more obvious
 * `:slug/staff-messages` because the latter is already taken by the
 * staff↔staff thread controller (`apps/api/src/modules/staff-messages/`).
 * Sharing the prefix would either require StaffOnlyGuard on the entire
 * tree (broken for customers) or route shadowing (Nest registers the first
 * controller and silently drops the second). Keeping the prefix distinct
 * makes the access boundary obvious at the routing layer.
 *
 * Auth: `recognition_token` cookie → customerId. Same ownership pattern as
 * `chat-history.controller.ts` — every list/delete/read endpoint cross-
 * checks `thread.customerId === caller.customerId` so that enumeration of
 * the deterministic threadId (`tenantId:customerId:tableSessionId`) by an
 * adjacent customer on the same table can't reach this customer's inbox.
 */
@Controller(':slug/customer-staff-messages')
export class CustomerStaffMessagesController {
  constructor(
    private readonly service: CustomerStaffMessagesService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Resolve customerId from the `recognition_token` cookie. Identical to
   * `ChatHistoryController.resolveCallerCustomerId` — kept inline because
   * the customer-side guards (SessionGuard) only carry table-session data,
   * not customer identity.
   */
  private async resolveCallerCustomerId(req: Request): Promise<string> {
    const token =
      (req as Request & { cookies?: Record<string, string> }).cookies
        ?.recognition_token ?? null;
    if (!token) {
      throw new HttpException(
        'Identificação ausente. Faça login pra acessar suas mensagens.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const resolved = await this.customers.resolveByRecognitionToken(token);
    if (!resolved) {
      throw new HttpException(
        'Identificação expirada. Faça login novamente.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return resolved.customerId;
  }

  @Get('threads')
  @UseGuards(SessionGuard)
  async listThreads(@Req() req: Request, @Tenant() tenantId: string) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.listThreads(customerId, tenantId);
  }

  @Get('threads/:threadId/messages')
  @UseGuards(SessionGuard)
  async getMessages(@Param() p: ThreadIdParamDto, @Req() req: Request) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.getThreadMessages(p.threadId, customerId);
  }

  @Post('threads/:threadId/read')
  @UseGuards(SessionGuard)
  async markRead(@Param() p: ThreadIdParamDto, @Req() req: Request) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.markRead(p.threadId, customerId);
  }

  /**
   * Customer → staff reply. Persists in Mongo + emits WS for a future staff
   * inbox to react. No auto-routing yet — by design (the spec leaves the
   * staff-side inbox UI as a follow-up).
   *
   * The `tableSessionId` for the thread is taken from the URL-bound thread
   * doc (looked up in the service via the threadId), NOT from the body —
   * a customer cannot inject a stranger's session id.
   */
  @Post('threads/:threadId/messages')
  @UseGuards(SessionGuard)
  async customerSend(
    @Param() p: ThreadIdParamDto,
    @Body() dto: CustomerSendMessageDto,
    @Req() req: Request,
    @Tenant() tenantId: string,
  ) {
    const customerId = await this.resolveCallerCustomerId(req);

    // Ownership lookup: the thread doc carries tableSessionId. Looking it
    // up here (instead of trusting the body) keeps the IDOR surface tight.
    const messages = await this.service.getThreadMessages(
      p.threadId,
      customerId,
    );
    // `getThreadMessages` 404s if the thread doesn't belong to this
    // customer; if it succeeds the thread exists & is owned. We then need
    // the thread's tableSessionId — re-fetch via listThreads (cheap with
    // the customerId+lastMessageAt index) and find the row.
    void messages; // ack the ownership check
    const threads = await this.service.listThreads(customerId, tenantId);
    const own = threads.find((t) => t.threadId === p.threadId);
    if (!own) {
      throw new HttpException(
        'Thread não encontrada.',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.service.appendOutbound({
      tenantId,
      customerId,
      tableSessionId: own.tableSessionId,
      content: dto.content,
    });
  }

  @Delete('threads/:threadId')
  @UseGuards(SessionGuard)
  async deleteThread(@Param() p: ThreadIdParamDto, @Req() req: Request) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.deleteThread(p.threadId, customerId);
  }

  /** Bulk delete — wipes every thread for this customer. */
  @Delete()
  @UseGuards(SessionGuard)
  async deleteAll(@Req() req: Request) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.deleteAll(customerId);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Staff-side endpoints (round 22)
  //
  // Manager precisa ver as mensagens dos clientes enviadas via
  // `send_message_to_manager`. As rotas abaixo são protegidas por
  // `StaffOnlyGuard` (x-staff-key header) e usam o tenant do path-param
  // — NÃO carregam `recognition_token` cookie.
  // ───────────────────────────────────────────────────────────────────────

  @Get('staff/threads')
  @UseGuards(StaffOnlyGuard)
  async listStaffThreads(@Tenant() tenantId: string) {
    return this.service.listInboundForTenant(tenantId);
  }

  @Get('staff/threads/:threadId/messages')
  @UseGuards(StaffOnlyGuard)
  async getStaffThreadMessages(
    @Param() p: ThreadIdParamDto,
    @Tenant() tenantId: string,
  ) {
    return this.service.getThreadMessagesForStaff(p.threadId, tenantId);
  }

  @Post('staff/threads/:threadId/read')
  @UseGuards(StaffOnlyGuard)
  async markStaffRead(
    @Param() p: ThreadIdParamDto,
    @Tenant() tenantId: string,
  ) {
    return this.service.markReadByStaff(p.threadId, tenantId);
  }
}
