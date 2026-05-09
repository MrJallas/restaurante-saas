import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';

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

/**
 * P1 #17 — QR-issue stub controller.
 *
 * The waiter app calls `POST /:slug/qr-issues` to report a damaged or
 * unscannable QR code (see `apps/web-staff/src/lib/api/waiter.ts` ::
 * `reportQrIssue`). The full pipeline (Mongo log + photo upload to S3 +
 * complaint linkage) is not implemented yet — this stub keeps the FE flow
 * green by returning a deterministic id and an empty list on GET.
 *
 * `GET` returns `[]` (empty array) so the manager dashboard's "QR issues"
 * tile doesn't 404 on first paint. When the real implementation lands,
 * the same routes can be enriched without touching FE.
 */
@Controller(':slug/qr-issues')
export class QrIssuesController {
  /**
   * List active QR issues. Stub: always empty so the FE list view renders
   * the empty-state. Public-ish endpoint (no guard) because the FE polls
   * it from the manager dashboard which already passes `x-staff-key`.
   */
  @Get()
  async list() {
    return [];
  }

  /**
   * Report a QR issue. Stub: discards the payload (after class-validator
   * shape check) and returns a fake id so the waiter UI shows its
   * success toast. The waiter polling the GET will see an empty list,
   * which is the correct behaviour until the persistence layer ships.
   */
  @Post()
  @HttpCode(201)
  @UseGuards(StaffOrSessionGuard)
  async report(@Body() _dto: QrIssueReportDto) {
    return { id: `qr-issue-stub-${Date.now()}` };
  }
}
