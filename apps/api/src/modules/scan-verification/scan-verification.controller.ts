import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ScanVerificationService } from './scan-verification.service';
import type {
  ScanVerificationRequestDto,
  ScanVerificationStatus,
} from '@restaurant/shared-types';

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
  constructor(private readonly service: ScanVerificationService) {}

  @Get()
  async list(
    @Query() q: ListScanVerificationQuery,
  ): Promise<ScanVerificationRequestDto[]> {
    return this.service.list({ status: q.status });
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<ScanVerificationRequestDto> {
    return this.service.getById(id);
  }

  @Post(':id/approve')
  async approve(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ScanVerificationRequestDto> {
    return this.service.approve(id, this.requireStaffId(req), slug);
  }

  @Post(':id/reject')
  async reject(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RejectScanVerificationDto,
    @Req() req: Request,
  ): Promise<ScanVerificationRequestDto> {
    return this.service.reject(id, this.requireStaffId(req), dto.reason, slug);
  }

  private requireStaffId(req: Request): string {
    const raw = req.headers['x-staff-id'];
    const staffId = Array.isArray(raw) ? raw[0] : raw;
    if (
      !staffId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        staffId,
      )
    ) {
      throw new HttpException('x-staff-id inválido.', HttpStatus.UNAUTHORIZED);
    }
    return staffId;
  }
}
