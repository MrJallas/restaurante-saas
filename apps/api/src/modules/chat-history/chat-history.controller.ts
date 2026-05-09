import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString } from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { ChatHistoryService } from './chat-history.service';
import { CustomersService } from '../customers/customers.service';

class ThreadIdParam {
  @IsString()
  threadId!: string;
}

/**
 * Chat history (NoSQL backed) · per docs/features/chat-history-lgpd.md.
 * Customer reads/deletes their own threads; manager audit lookups happen on
 * the staff side (see staff-messages module — operational thread lives in PG).
 *
 * Round 5 (B-NEW-9 + B-NEW-16) ownership hardening:
 *   - todos os endpoints derivam `customerId` do cookie `recognition_token`
 *     em vez de aceitar via query param.
 *   - listMessages valida que `thread.customerId === caller.customerId`.
 *   - sem cookie/lookup falha → 401/403, não 200 com dados de outra pessoa.
 *
 * Antes: `?customerId=<UUID-de-outro-cliente>` deletava ou listava
 * threads alheias. threadId determinístico (`tenantId:customerId:date`)
 * tornava enumeração trivial.
 */
@Controller(':slug/chat-history')
export class ChatHistoryController {
  constructor(
    private readonly service: ChatHistoryService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Lê o cookie `recognition_token` e resolve pra customerId. Throw 401
   * quando ausente/inválido — endpoints chat-history exigem identificação
   * persistente do customer (não basta session de mesa).
   */
  private async resolveCallerCustomerId(req: Request): Promise<string> {
    const token =
      (req as Request & { cookies?: Record<string, string> }).cookies
        ?.recognition_token ?? null;
    if (!token) {
      throw new HttpException(
        'Identificação ausente. Faça login pra acessar seu histórico.',
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
  async listMessages(@Param() p: ThreadIdParam, @Req() req: Request) {
    const customerId = await this.resolveCallerCustomerId(req);
    // Service retorna mensagens filtradas pra ESTE customerId; se thread
    // não pertence ao caller, throw 404 (não vaza existência).
    return this.service.listMessagesForCustomer(p.threadId, customerId);
  }

  @Delete('threads/:threadId')
  @UseGuards(SessionGuard)
  async deleteThread(@Param() p: ThreadIdParam, @Req() req: Request) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.deleteThread(p.threadId, customerId);
  }

  /** Bulk delete · alias for the LGPD erasure path. */
  @Delete()
  @UseGuards(SessionGuard)
  async deleteAll(@Req() req: Request) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.deleteAllForCustomer(customerId);
  }
}
