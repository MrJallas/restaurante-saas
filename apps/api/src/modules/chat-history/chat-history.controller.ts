import { Controller, Get, Delete, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsString } from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import type { SessionData } from '../../common/guards/session.guard';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { ChatHistoryService } from './chat-history.service';

class ThreadIdParam {
  @IsString()
  threadId!: string;

  // Round 21 §F — `@Param()` injeta TODOS os route params (`:slug` +
  // `:threadId`). Com `forbidNonWhitelisted: true` na global ValidationPipe,
  // a prop `slug` não declarada falhava: "property slug should not exist".
  // Declarar aqui (ainda que o service ignore) silencia a validação sem
  // afrouxar o whitelist global. Tenant real vem via @Tenant() decorator.
  @IsString()
  slug!: string;
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
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Lê o cookie `recognition_token` e resolve pra customerId. Throw 401
   * quando ausente/inválido — endpoints chat-history exigem identificação
   * persistente do customer (não basta session de mesa).
   */
  private resolveCallerCustomerId(req: Request): Promise<string> {
    // Nunca cair em SessionData.customerId: o token Redis representa a MESA e
    // esse campo pode ter sido sobrescrito pelo último participante que fez
    // welcome. Histórico é PII individual e falha fechado sem credencial.
    return this.callerResolver.requireCustomerId(req);
  }

  @Get('threads')
  @UseGuards(SessionGuard)
  async listThreads(
    @Req() req: Request,
    @Tenant() tenantId: string,
    @Session() _session: SessionData,
  ) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.listThreads(customerId, tenantId);
  }

  @Get('threads/:threadId/messages')
  @UseGuards(SessionGuard)
  async listMessages(
    @Param() p: ThreadIdParam,
    @Req() req: Request,
    @Session() _session: SessionData,
    @Tenant() tenantId: string,
  ) {
    const customerId = await this.resolveCallerCustomerId(req);
    // Service retorna mensagens filtradas pra ESTE customerId; se thread
    // não pertence ao caller, throw 404 (não vaza existência).
    return this.service.listMessagesForCustomer(p.threadId, customerId, tenantId);
  }

  @Delete('threads/:threadId')
  @UseGuards(SessionGuard)
  async deleteThread(
    @Param() p: ThreadIdParam,
    @Req() req: Request,
    @Session() _session: SessionData,
    @Tenant() tenantId: string,
  ) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.deleteThread(p.threadId, customerId, tenantId);
  }

  /** Bulk delete · alias for the LGPD erasure path. */
  @Delete()
  @UseGuards(SessionGuard)
  async deleteAll(
    @Req() req: Request,
    @Session() _session: SessionData,
    @Tenant() tenantId: string,
  ) {
    const customerId = await this.resolveCallerCustomerId(req);
    return this.service.deleteAllForCustomer(customerId, tenantId);
  }
}
