import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { AssistantService } from './assistant.service';

class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
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
    const history = await this.assistantService.getHistory(
      session.sessionId,
      customerId || null,
    );
    return { messages: history };
  }
}
