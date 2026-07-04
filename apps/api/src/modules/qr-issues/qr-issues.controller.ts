import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import type { Request } from 'express';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { QrIssueRow, QrIssueStatus, QrIssuesService } from './qr-issues.service';

class QrIssueReportDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  table_number?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  photo_url?: string;
}

class ListQrIssuesQuery {
  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved', 'all'])
  status?: QrIssueStatus | 'all';
}

@Controller(':slug/qr-issues')
export class QrIssuesController {
  constructor(
    private readonly service: QrIssuesService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  // P2 (re-scan): a lista expõe UUIDs de staff (reported_by/resolved_by) —
  // antes o GET era anônimo, vazando identidade da equipe pra qualquer um.
  // Agora exige prova de staff (mesmo guard das outras rotas de equipe).
  @Get()
  @UseGuards(StaffOnlyGuard)
  async list(@Query() q: ListQrIssuesQuery): Promise<QrIssueRow[]> {
    return this.service.list(q.status ?? 'open');
  }

  @Post()
  @HttpCode(201)
  @UseGuards(StaffOrSessionGuard)
  async report(@Body() dto: QrIssueReportDto, @Req() req: Request): Promise<QrIssueRow> {
    const reporterStaffId = this.callerResolver.tryGetStaffId(req);
    return this.service.create(dto, reporterStaffId);
  }
}
