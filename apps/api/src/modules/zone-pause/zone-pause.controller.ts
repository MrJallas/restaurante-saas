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
  IsIn,
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
 * TODO(F1): the canonical shape per `packages/shared-types/src/zone-pause.ts`
 * is `{ waiterId, durationMinutes, kind?, reason? }`. The current DTO still
 * exposes `zoneId` because the underlying `zone_pauses` table is keyed by
 * `zone_id` (legacy schema). F1 owns the migration that renames the column
 * to `waiter_id` — once that lands, drop `zoneId/zoneName` and switch to
 * `waiterId` to match `ZonePauseCreateDto`.
 */
class CreateZonePauseDto {
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  zoneName?: string;

  @IsOptional()
  @IsUUID()
  waiterId?: string;

  @IsOptional()
  @IsIn(['orders', 'all'])
  kind?: 'orders' | 'all';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  createdByStaffId?: string;
}

class EndZonePauseDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;

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
  zoneId?: string;
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
        // TODO(F1): once the column is renamed to `waiter_id`, prefer
        // `dto.waiterId` over `dto.zoneId`. We pass through both today so
        // the FE can already start sending the canonical field name.
        zoneId: dto.zoneId ?? dto.waiterId ?? null,
        zoneName: dto.zoneName ?? null,
        kind: dto.kind,
        durationMinutes: dto.durationMinutes,
        reason: dto.reason,
        createdByStaffId: dto.createdByStaffId,
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
        staffId: dto.staffId,
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
    return this.service.list({ active: q.active, zoneId: q.zoneId });
  }
}
