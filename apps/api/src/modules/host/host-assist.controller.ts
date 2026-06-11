import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SessionData, SessionGuard } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { HostService } from './host.service';

class HostAssistDto {
  @IsOptional() @IsString() @MaxLength(280) reason?: string;
}

/**
 * Rota CUSTOMER-side do host module — separada do HostController porque o
 * class-level dele exige StaffOnlyGuard + HostOrManagerGuard. Aqui é o
 * cliente da mesa (SessionGuard) pedindo a RECEPÇÃO presencialmente —
 * fluxo nascido do card de junção de mesas no assistente, cujo botão
 * "Chamar recepcionista" chamava o GARÇOM (bug dos vídeos 2026-06-10).
 */
@Controller(':slug/host')
export class HostAssistController {
  constructor(private readonly service: HostService) {}

  @Post('assist')
  @UseGuards(SessionGuard)
  async requestAssist(@Session() session: SessionData, @Body() dto: HostAssistDto) {
    return this.service.requestAssist(session.sessionId, dto.reason ?? null);
  }
}
