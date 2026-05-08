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
import { ZonePauseService } from './zone-pause.service';

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
 *   - `GET    /:slug/zone-pauses`        · list (any authenticated staff)
 */
@Controller(':slug/zone-pauses')
@UseGuards(StaffOnlyGuard)
export class ZonePauseController {
  constructor(private readonly service: ZonePauseService) {}

  @Post()
  @UseGuards(ManagerOnlyGuard)
  async create(@Param('slug') slug: string, @Body() dto: CreateZonePauseDto) {
    return this.service.create(
      {
        waiterId: dto.waiterId,
        durationMinutes: dto.durationMinutes,
        reason: dto.reason,
        startedBy: dto.startedBy,
      },
      slug,
    );
  }

  @Post(':id/end')
  @UseGuards(ManagerOnlyGuard)
  async end(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: EndZonePauseDto = {},
  ) {
    return this.service.endEarly(
      id,
      {
        endedBy: dto.endedBy,
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
  @UseGuards(ManagerOnlyGuard)
  async deleteAlias(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: EndZonePauseDto = {},
  ) {
    return this.end(slug, id, dto);
  }

  @Get()
  async list(@Query() q: ListQueryDto) {
    return this.service.list({ active: q.active, waiterId: q.waiterId });
  }
}
