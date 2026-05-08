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
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
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
 * Manager / host can flag a session as VIP / allergy. Staff "waiter" cannot:
 * `StaffOnlyGuard` validates `x-staff-key`; `ManagerOnlyGuard` enforces the
 * per-role check via the `x-staff-role` header.
 */
@Controller(':slug/staff/sessions')
export class VipController {
  constructor(private readonly service: VipService) {}

  @Post(':tableSessionId/flags')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async toggle(
    @Param('slug') slug: string,
    @Param('tableSessionId') tableSessionId: string,
    @Body() dto: ToggleFlagDto,
  ) {
    return this.service.toggle(
      tableSessionId,
      dto.flag,
      dto.action,
      {
        staffId: dto.staffId,
        customerId: dto.customerId,
        reason: dto.reason,
      },
      slug,
    );
  }

  @Get(':tableSessionId/flags')
  async list(@Param('tableSessionId') tableSessionId: string) {
    return this.service.getActiveFlags(tableSessionId);
  }
}
