import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import type { TenantRequest } from '../tenant/tenant.middleware';
import { SmartSuggestionsResult, SmartSuggestionsService } from './smart-suggestions.service';

class SmartSuggestionsDto {
  // Optional — the tenant is already pinned by the `:slug` middleware, so we
  // default `tenantId` to the resolved slug (the AI pool is keyed by slug,
  // same as continuation/seed). An explicit value is accepted but must not
  // let a caller read another tenant's pool: we override it below.
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  situacao?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

/**
 * `POST /:slug/smart-suggestions` — staff-guarded proxy to the Python AI
 * service's `/smart-suggestions` pool. Consumed by the manager
 * `MContactClientSheet` chip loader.
 *
 * Auth: `StaffOnlyGuard` (accepts the session token injected by the web-staff
 * proxy, or the shared `x-staff-key`). The AI-service key is injected
 * server-side in `SmartSuggestionsService` — it never reaches the browser.
 *
 * Path is `/:slug/smart-suggestions` (top-level, NOT `/staff/*`) to dodge the
 * `StaffController` `@Get(':id')` wildcard, same convention as
 * `/:slug/alerts`, `/:slug/courtesies`, `/:slug/continuation`.
 */
@Controller(':slug/smart-suggestions')
export class SmartSuggestionsController {
  constructor(private readonly service: SmartSuggestionsService) {}

  @Post()
  @UseGuards(StaffOnlyGuard)
  @HttpCode(200)
  async suggest(
    @Body() dto: SmartSuggestionsDto,
    @Req() req: TenantRequest,
  ): Promise<SmartSuggestionsResult> {
    // Tenant is pinned by the slug middleware — never trust a body-supplied
    // tenantId to read a different tenant's pool.
    const tenantId = req.tenantSlug ?? dto.tenantId ?? 'restaurant_dev';

    const result = await this.service.getSuggestions({
      tenantId,
      surface: dto.surface,
      customerId: dto.customerId ?? null,
      sessionId: dto.sessionId ?? null,
      situacao: dto.situacao ?? null,
      limit: dto.limit,
    });

    // Honest empty pool on AI failure — the FE renders its own static
    // fallback rather than us fabricating chips here.
    return (
      result ?? {
        suggestions: [],
        poolExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        situacao: dto.situacao ?? null,
      }
    );
  }
}
