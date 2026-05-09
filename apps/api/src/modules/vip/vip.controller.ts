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

  /**
   * Round 17 (B-NEW-67): kept on the DTO for backwards-compat (FE can
   * still send it without 400) but **IGNORED** server-side. Audit field
   * `session_flags.set_by_customer_id` is no longer stamped from this
   * value — flag is a manager action, not a customer action. See the
   * controller comment on `toggle` for the audit-spoof this closes.
   */
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
   * Round 17 (B-NEW-67): `dto.customerId` agora é IGNORADO. O comentário
   * antigo dizia "customerId NÃO é mais aceito do body" mas o código
   * AINDA passava `dto.customerId` pro service, que stampava
   * `session_flags.set_by_customer_id` com UUID arbitrário do body —
   * audit log spoof. Manager M flagava mesa 5 como VIP e atribuía a
   * ação ao customer X (UUID conhecido), corrompendo trail de
   * accountability. Flag é ação de manager por design (já protegido
   * por ManagerOnlyGuard); nunca deveria ter set_by_customer_id.
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
