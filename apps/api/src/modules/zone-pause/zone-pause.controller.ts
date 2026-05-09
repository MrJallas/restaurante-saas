import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { ZonePauseService } from './zone-pause.service';
import { Req } from '@nestjs/common';
import type { Request } from 'express';

/**
 * `StartZonePauseDto` — body of `POST /:slug/zone-pauses`.
 *
 * Per docs/features/zone-pause.md (V13): pause is **waiter-specific**, not
 * zone-wide. The `zone_pauses` table was refactored in migration 032 to
 * carry `waiter_id` / `started_by` / `ends_at` / `ended_at` / `ended_by`.
 */
class CreateZonePauseDto {
  @IsUUID()
  waiterId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Manager / receptionist that triggered the pause. */
  @IsOptional()
  @IsUUID()
  startedBy?: string;
}

class EndZonePauseDto {
  @IsOptional()
  @IsUUID()
  endedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ListQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsUUID()
  waiterId?: string;
}

/**
 * Zone pause controller.
 *
 * Routes:
 *   - `POST   /:slug/zone-pauses`        · start a pause (manager only)
 *   - `POST   /:slug/zone-pauses/:id/end` · end a pause (manager only)
 *   - `DELETE /:slug/zone-pauses/:id`     · alias of the `end` route
 *                                            (REST-style equivalent for
 *                                            clients that prefer DELETE)
 *   - `GET    /:slug/zone-pauses`        · list (staff OR session — customer
 *                                            polls this for silent ETA
 *                                            adjustment per docs/features/
 *                                            zone-pause.md; no PII exposed)
 *
 * Guard escolhido por metodo: as mutacoes seguem manager-only / staff-only
 * (nao foram afrouxadas), enquanto o GET aceita session-token pra que o
 * customer-side polling em mesa/cardapio possa avaliar pausa ativa sem
 * expor x-staff-key no browser do cliente.
 */
@Controller(':slug/zone-pauses')
export class ZonePauseController {
  constructor(
    private readonly service: ZonePauseService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 10 (B-NEW-49): startedBy/endedBy derivados do x-staff-id header
   * em vez do body. Antes: manager M pausava em nome de outro manager
   * (audit log spoof).
   */
  @Post()
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateZonePauseDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.create(
      {
        waiterId: dto.waiterId,
        durationMinutes: dto.durationMinutes,
        reason: dto.reason,
        startedBy: staffId,
      },
      slug,
    );
  }

  @Post(':id/end')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async end(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: EndZonePauseDto = {},
    @Req() req?: Request,
  ) {
    const staffId = req
      ? this.callerResolver.requireStaffId(req)
      : (dto.endedBy ?? '');
    return this.service.endEarly(
      id,
      {
        endedBy: staffId,
        reason: dto.reason,
      },
      slug,
    );
  }

  /**
   * `DELETE /:slug/zone-pauses/:id` — REST-style alias for `POST :id/end`.
   * Same handler, same DTO. Kept for backward compatibility with the legacy
   * `POST :id/end` clients.
   */
  @Delete(':id')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async deleteAlias(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: EndZonePauseDto = {},
    @Req() req?: Request,
  ) {
    return this.end(slug, id, dto, req);
  }

  @Get()
  @UseGuards(StaffOrSessionGuard)
  async list(@Query() q: ListQueryDto) {
    return this.service.list({ active: q.active, waiterId: q.waiterId });
  }
}
