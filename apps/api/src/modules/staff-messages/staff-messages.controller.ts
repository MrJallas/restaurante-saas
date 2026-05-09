import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { StaffMessagesService } from './staff-messages.service';

class SendMessageDto {
  @IsUUID()
  senderStaffId!: string;

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
  @IsUUID()
  staffId!: string;
}

class StaffQueryDto {
  @IsUUID()
  staffId!: string;
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
   */
  @Post()
  async send(
    @Param('slug') slug: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ) {
    const senderStaffId = this.callerResolver.requireStaffId(req);
    return this.service.send({ ...dto, senderStaffId }, slug);
  }

  @Get('threads')
  async listThreads(@Query() _q: StaffQueryDto, @Req() req: Request) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.listThreadsForStaff(staffId);
  }

  @Get('threads/:threadId')
  async listMessages(@Param('threadId') threadId: string) {
    return this.service.listMessagesInThread(threadId);
  }

  @Post(':messageId/read')
  async markRead(
    @Param('slug') slug: string,
    @Param('messageId') messageId: string,
    @Body() _dto: ReadDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.markRead(messageId, { staffId }, slug);
  }
}
