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
  async getHistory(@Session() session: SessionData) {
    const history = await this.assistantService.getHistory(session.sessionId);
    return { messages: history };
  }
}
