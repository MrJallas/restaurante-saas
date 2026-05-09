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
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { VipService } from './vip.service';
import { Req } from '@nestjs/common';
import type { Request } from 'express';

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
  constructor(
    private readonly service: VipService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 10 (B-NEW-49): staffId derivado do x-staff-id header.
   * customerId NÃO é mais aceito do body (não fazia sentido — flag
   * é por session, não por customer).
   */
  @Post(':tableSessionId/flags')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async toggle(
    @Param('slug') slug: string,
    @Param('tableSessionId') tableSessionId: string,
    @Body() dto: ToggleFlagDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.toggle(
      tableSessionId,
      dto.flag,
      dto.action,
      {
        staffId,
        customerId: dto.customerId,
        reason: dto.reason,
      },
      slug,
    );
  }

  /**
   * Round 7 (B-NEW-32): adicionado StaffOnlyGuard. Antes era público —
   * atacante iterava tableSessionIds (vazam via B-NEW-31 antes do fix)
   * e mapeava clientes VIP do tenant pra phishing/social engineering.
   */
  @Get(':tableSessionId/flags')
  @UseGuards(StaffOnlyGuard)
  async list(@Param('tableSessionId') tableSessionId: string) {
    return this.service.getActiveFlags(tableSessionId);
  }
}
