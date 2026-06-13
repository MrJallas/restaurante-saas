import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { StaffMessagesService } from './staff-messages.service';

class SendMessageDto {
  // Round 18 fix: senderStaffId vira optional. Round 10 (B-NEW-49)
  // tornou-o derivado do x-staff-id header (anti-impersonation), mas
  // o validator ainda exigia o campo no body — qualquer FE/curl que
  // não passasse retornava 400 "senderStaffId must be a UUID" mesmo
  // o backend ignorando o valor. MContactStaffSheet pre-fix mandava
  // pra path errado (`/staff-messages/staff` 404) e o catch silencioso
  // escondia o erro real, então ninguém viu esse 400 antes.
  @IsOptional()
  @IsUUID()
  senderStaffId?: string;

  @IsOptional()
  @IsUUID()
  recipientStaffId?: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsString()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsBoolean()
  isBroadcast?: boolean;
}

class ReadDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;
}

class StaffQueryDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;
}

@Controller(':slug/staff-messages')
@UseGuards(StaffOnlyGuard)
export class StaffMessagesController {
  constructor(
    private readonly service: StaffMessagesService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 10 (B-NEW-49): senderStaffId/staffId derivados do x-staff-id
   * header em vez do body. Antes staff A enviava em nome de B
   * (impersonation no inbox).
   *
   * Round 12 (B-NEW-60): trocado requireStaffId → requireActiveStaffId
   * (DB cross-check). StaffOnlyGuard só valida x-staff-key; antes UUID
   * arbitrário no x-staff-id passava como sender/listener.
   */
  @Post()
  async send(@Param('slug') slug: string, @Body() dto: SendMessageDto, @Req() req: Request) {
    const senderStaffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.send({ ...dto, senderStaffId }, slug);
  }

  @Get('threads')
  async listThreads(@Query() _q: StaffQueryDto, @Req() req: Request) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.listThreadsForStaff(staffId);
  }

  /**
   * Round 13 (B-NEW-64): callerStaffId derivado do header e validado
   * em DB; service exige membership em staff_message_thread_participants
   * pra retornar mensagens. Antes era IDOR aberto (qualquer staff com a
   * x-staff-key lia DMs alheias se vazasse o threadId).
   */
  @Get('threads/:threadId')
  async listMessages(@Param('threadId') threadId: string, @Req() req: Request) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.listMessagesInThread(threadId, staffId);
  }

  @Post(':messageId/read')
  async markRead(
    @Param('slug') slug: string,
    @Param('messageId') messageId: string,
    @Body() _dto: ReadDto,
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.markRead(messageId, { staffId }, slug);
  }
}
