import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { TableMergeService } from './table-merge.service';

class StaffForceMergeDto {
  @IsUUID()
  sourceTableSessionId!: string;

  @IsUUID()
  targetTableSessionId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/**
 * Staff override pra table-merge (V16 line 784: única forma de staff
 * intervir após decisão social ser tomada na mesa). Spec round 3 P1 #F-3.
 *
 * Contrato:
 *   - Ambos guards: StaffOnlyGuard (x-staff-key) + ManagerOnlyGuard (role).
 *   - Bypassa cooldown ativo entre o par (DELETE).
 *   - Cria request `approved` instantâneo, sem dual-consent.
 *   - Audit trail em `escalation_chains.steps` jsonb.
 *
 * NÃO substitui o flow customer-host normal (`POST :slug/table-merge-requests`)
 * — esse continua sendo o caminho default. O override só vira quando
 * manager presencialmente confirma os hosts e quer pular cooldown.
 */
@Controller(':slug/staff/table-merges')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
export class StaffTableMergeController {
  constructor(
    private readonly service: TableMergeService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 10 (B-NEW-49): staffId derivado do `x-staff-id` header.
   * Antes manager M com rixa fazia force-merge mas registrava
   * `staff_id = colega-W`. Audit log spoof. ManagerOnlyGuard já
   * validou role+DB no header, aqui só usamos.
   */
  @Post('force')
  async force(
    @Param('slug') slug: string,
    @Body() dto: StaffForceMergeDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.forceMerge(
      {
        sourceTableSessionId: dto.sourceTableSessionId,
        targetTableSessionId: dto.targetTableSessionId,
        staffId,
        reason: dto.reason,
      },
      slug,
    );
  }
}
