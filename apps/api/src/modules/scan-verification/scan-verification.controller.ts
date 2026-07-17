import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { HostOrManagerGuard } from '../../common/guards/host-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { ScanVerificationService } from './scan-verification.service';
import type { ScanVerificationRequestDto, ScanVerificationStatus } from '@restaurant/shared-types';

class ListScanVerificationQuery {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'expired'])
  status?: ScanVerificationStatus;
}

class RejectScanVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller(':slug/scan-verification-requests')
@UseGuards(StaffOnlyGuard)
export class ScanVerificationController {
  constructor(
    private readonly service: ScanVerificationService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get()
  @UseGuards(HostOrManagerGuard)
  async list(@Query() q: ListScanVerificationQuery): Promise<ScanVerificationRequestDto[]> {
    return this.service.list({ status: q.status });
  }

  @Get(':id')
  @UseGuards(HostOrManagerGuard)
  async getById(@Param('id') id: string): Promise<ScanVerificationRequestDto> {
    return this.service.getById(id);
  }

  /**
   * P1-D (gate #34): o ator que aprova/rejeita a verificação de scan físico
   * (libera sessão/mesa) deriva do token de sessão VERIFICADO — `req.staffAuth`
   * carimbado pelo StaffOnlyGuard — via `requireActiveStaffId`, que prefere o
   * token e só cai no header `x-staff-id` no fluxo key/TV legado. Antes, um
   * helper local lia o header cru (spoofável): staff com x-staff-key +
   * x-staff-id de OUTRO aprovava scan em nome dele. `requireActiveStaffId`
   * ainda cross-checka `is_active` no DB (rota só StaffOnlyGuard, sem
   * ManagerOnlyGuard).
   */
  @Post(':id/approve')
  async approve(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ScanVerificationRequestDto> {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.approve(id, staffId, slug);
  }

  @Post(':id/reject')
  async reject(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RejectScanVerificationDto,
    @Req() req: Request,
  ): Promise<ScanVerificationRequestDto> {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.reject(id, staffId, dto.reason, slug);
  }
}
