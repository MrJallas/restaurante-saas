import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { VipService } from './vip.service';

class ToggleFlagDto {
  @IsIn(['vip', 'allergy', 'reincidente'])
  flag!: string;

  @IsIn(['add', 'remove'])
  action!: 'add' | 'remove';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

/**
 * Session flag toggle endpoint · per docs/features/vip-customer.md.
 * Manager / host can flag a session as VIP / allergy. Staff "waiter" cannot
 * (handled by StaffOnlyGuard for now; finer-grained role check is a follow-up).
 */
@Controller(':slug/staff/sessions')
export class VipController {
  constructor(private readonly service: VipService) {}

  @Post(':tableSessionId/flags')
  @UseGuards(StaffOnlyGuard)
  async toggle(
    @Param('tableSessionId') tableSessionId: string,
    @Body() dto: ToggleFlagDto,
  ) {
    return this.service.toggle(tableSessionId, dto.flag, dto.action, {
      staffId: dto.staffId,
      customerId: dto.customerId,
      reason: dto.reason,
    });
  }

  @Get(':tableSessionId/flags')
  async list(@Param('tableSessionId') tableSessionId: string) {
    return this.service.getActiveFlags(tableSessionId);
  }
}
