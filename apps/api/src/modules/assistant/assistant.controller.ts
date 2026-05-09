import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { AssistantService } from './assistant.service';

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
}

@Controller(':slug/assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('message')
  @UseGuards(SessionGuard)
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Session() session: SessionData,
  ) {
    return this.assistantService.sendMessage(
      session.sessionId,
      dto.customerId || null,
      dto.message,
      session.schemaName,
    );
  }

  @Get('history')
  @UseGuards(SessionGuard)
  async getHistory(
    @Session() session: SessionData,
    @Query('customerId') customerId?: string,
  ) {
    // customerId e obrigatorio na pratica: cliente B na mesma mesa do
    // cliente A nao pode ver historico de A. Antes vazava (P1-B). Se o
    // cliente nao mandar (ex.: ainda no welcome), retornamos so as
    // mensagens anonimas (customer_id IS NULL).
    //
    // Usa `getHistoryWithToolCalls` (nao `getHistory`) pra surface as
    // tool_calls persistidas em `assistant_messages.tool_calls` (migration
    // 029) — sem isso o `ToolCallIndicator` no FE so renderiza tools
    // executadas no turno corrente, perdendo o estado quando o usuario
    // recarrega a tela.
    const history = await this.assistantService.getHistoryWithToolCalls(
      session.sessionId,
      customerId || null,
    );
    return { messages: history };
  }
}
