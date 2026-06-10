import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { ManagerAccountService } from './manager-account.service';

class PatchPreferencesDto {
  @IsOptional()
  @IsObject()
  notifications?: Record<string, boolean>;

  @IsOptional()
  @IsIn(['light', 'dark', 'auto'])
  theme?: 'light' | 'dark' | 'auto';

  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;
}

class ChangePinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  currentPin!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(6)
  nextPin!: string;
}

class ShiftHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  staff?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shift?: string;
}

@Controller(':slug/manager')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
export class ManagerAccountController {
  constructor(
    private readonly service: ManagerAccountService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get('preferences')
  preferences(@Param('slug') slug: string, @Req() req: Request) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.getPreferences(slug, staffId);
  }

  @Patch('preferences')
  updatePreferences(
    @Param('slug') slug: string,
    @Body() dto: PatchPreferencesDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.updatePreferences(slug, staffId, dto);
  }

  @Post('security/change-pin')
  changePin(@Body() dto: ChangePinDto, @Req() req: Request) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.changePin(staffId, dto);
  }

  @Get('security/sessions')
  sessions(@Req() req: Request) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.listSessions(staffId, req);
  }

  @Delete('security/sessions/:sessionId')
  revokeSession(@Param('sessionId') sessionId: string, @Req() req: Request) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.revokeSession(staffId, sessionId);
  }

  @Post('shift-logs/end')
  endShift(@Param('slug') slug: string, @Req() req: Request) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.endShift(slug, staffId);
  }

  @Get('shift-logs')
  shiftLogs(
    @Param('slug') slug: string,
    @Query() query: ShiftHistoryQueryDto,
    @Req() req: Request,
  ) {
    this.callerResolver.requireStaffId(req);
    return this.service.listShiftLogs(slug, query);
  }
}
