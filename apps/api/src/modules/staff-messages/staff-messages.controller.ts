import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
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
  constructor(private readonly service: StaffMessagesService) {}

  @Post()
  async send(@Body() dto: SendMessageDto) {
    return this.service.send(dto);
  }

  @Get('threads')
  async listThreads(@Query() q: StaffQueryDto) {
    return this.service.listThreadsForStaff(q.staffId);
  }

  @Get('threads/:threadId')
  async listMessages(@Param('threadId') threadId: string) {
    return this.service.listMessagesInThread(threadId);
  }

  @Post(':messageId/read')
  async markRead(
    @Param('messageId') messageId: string,
    @Body() dto: ReadDto,
  ) {
    return this.service.markRead(messageId, { staffId: dto.staffId });
  }
}
