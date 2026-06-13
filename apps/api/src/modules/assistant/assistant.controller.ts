import { Controller, Post, Get, Body, Query, Req, UseGuards, Param } from '@nestjs/common';
import type { Request } from 'express';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { Session } from '../../common/decorators/session.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { AssistantService } from './assistant.service';

class PendingJoinRequestDto {
  @IsUUID()
  targetCustomerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  joinerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  requestedAt?: string;

  @IsOptional()
  @IsUUID()
  tableSessionId?: string;
}

class SendMessageDto {
  // Cap em 2000 chars: prompt-injection prolongado, payload de DoS no
  // pipeline LLM (cada char ~ 1 token, 50k chars = $$ no provider) e o
  // body do Express (~100KB) eram a unica barreira. P1 do bug-hunt.
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  // @IsUUID protege contra `?customerId=../../etc/passwd` virar 500 do
  // Postgres no cast `$2::uuid` (P2). O service valida tambem que o
  // customerId pertence aos session_participants pra bloquear IDOR.
  @IsOptional()
  @IsUUID()
  customerId?: string;

  // ID de conversa gerado pelo cliente por abertura do assistente. Ele
  // separa visitas normais no Mongo; sem isso, o fallback legado agrupa
  // por dia.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_-]+$/)
  conversationId?: string;

  // Continuação explícita vinda do menu de conversas arquivadas. O service
  // só usa se o thread existir e pertencer ao customer resolvido pelo cookie.
  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Matches(/^[A-Za-z0-9_:-]+$/)
  continueThreadId?: string;

  // Contexto efêmero do browser: o service revalida contra Postgres antes
  // de repassar ao AI service, então o LLM nunca decide com payload cru.
  @IsOptional()
  @ValidateNested()
  @Type(() => PendingJoinRequestDto)
  pendingJoinRequest?: PendingJoinRequestDto;
}

class StaffToCustomerDto {
  @IsUUID() tableSessionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) message!: string;
  @IsUUID() fromStaffId!: string;
  /**
   * Destinatário da mensagem (decisão Caleb 2026-06-11): a resposta do
   * gerente é PRIVADA por cliente — persiste com customer_id e emite WS
   * só no room `customer:<id>`, nunca mais no session room (mesa toda).
   */
  @IsUUID() toCustomerId!: string;
}

@Controller(':slug/assistant')
export class AssistantController {
  constructor(
    private readonly assistantService: AssistantService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 11 (B-NEW-57): customerId derivado do cookie em vez de aceitar
   * dto.customerId arbitrário. Antes: customer A passava customerId de
   * B (vazado via /table/participants) e o assistante gravava as
   * mensagens em nome de B. Mesma família B-NEW-9 (chat-history).
   */
  @Post('message')
  @UseGuards(SessionGuard)
  async sendMessage(
    @Param('slug') slug: string,
    @Body() dto: SendMessageDto,
    @Session() session: SessionData,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.tryGetCustomerId(req);
    return this.assistantService.sendMessage(
      session.sessionId,
      callerCustomerId,
      dto.message,
      session.schemaName,
      dto.conversationId,
      dto.continueThreadId,
      slug,
      dto.pendingJoinRequest,
    );
  }

  /**
   * Round 11 (B-NEW-57): customerId derivado do cookie. Antes:
   * customer A na mesma mesa de B passava B-uuid no query e LIA toda
   * a conversa de B com o assistant (PII risk em chat). Mesma família
   * B-NEW-16 (Mongo chat-history) que round 5 cobriu — não havia sido
   * replicado pra Postgres assistant_messages.
   */
  @Get('history')
  @UseGuards(SessionGuard)
  async getHistory(
    @Session() session: SessionData,
    @Query('customerId') _customerId: string | undefined,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.tryGetCustomerId(req);
    const history = await this.assistantService.getHistoryWithToolCalls(
      session.sessionId,
      callerCustomerId,
    );
    return { messages: history };
  }

  /**
   * Round 18 (Onda 4 batch 2): manager → cliente direct message.
   *
   * Substitui o mis-routing previamente em MContactClientSheet que
   * batia em `/staff-messages` (staff↔staff). Aqui o staff (manager)
   * envia bubble pro customer aparecer em `/[slug]/assistente` com
   * role=staff. Persiste em `assistant_messages` (from_role='staff')
   * e emite WS `assistant.staff_message_received` no room
   * `session:<tableSessionId>` pra real-time.
   *
   * Auth: manager-only (decisao de produto — waiters chamam o cliente
   * via outros canais; mensagem inline no chat eh manager prerogativa).
   *
   * `fromStaffId` vem do body do FE. Defesa-em-profundidade: o service
   * valida que o staffId existe e está ativo no DB (mesmo padrao do
   * `requireActiveStaffId`). Audit-spoof prevenido pq StaffOnlyGuard
   * + ManagerOnlyGuard ja confirma que x-staff-id eh manager — body
   * mismatch eh permitido (manager pode delegar?) mas o staffId
   * persistido é o do body, nao header. Trade-off explicito.
   */
  @Post('staff-to-customer')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async staffToCustomer(@Body() dto: StaffToCustomerDto, @Tenant() tenantId: string) {
    return this.assistantService.sendStaffToCustomer({
      tableSessionId: dto.tableSessionId,
      message: dto.message,
      fromStaffId: dto.fromStaffId,
      toCustomerId: dto.toCustomerId,
      tenantId,
    });
  }
}
