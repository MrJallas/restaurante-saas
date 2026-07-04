import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { SessionTimelineQueryService } from './session-timeline-query.service';

/**
 * M6 (timeline) — endpoints de LEITURA staff-side:
 *
 *  - GET /:slug/sessions/:sessionId/timeline?limit=&before=
 *    → { session, entries (ASC pelo comparator M1), mergeTree | null }
 *  - GET /:slug/tables/:tableNumber/sessions?limit=
 *    → { sessions: [...] } (histórico da mesa, created_at DESC)
 *
 * Auth: `StaffOnlyGuard` (x-staff-token OU x-staff-key) — qualquer papel de
 * equipe lê a timeline; não há mutação aqui. Multitenancy dupla: o Postgres
 * via TenantConnectionProvider (search_path do slug, setado pelo
 * TenantMiddleware) e o Mongo via filtro `tenantId = slug` no doc.
 *
 * `?limit`/`?before` são parse manual (não DTO/400), padrão do inbox do
 * host.controller: valor não numérico / data inválida equivale a omitir o
 * param — clamps e defaults vivem no query service (testados lá).
 */
@Controller(':slug')
@UseGuards(StaffOnlyGuard)
export class SessionTimelineController {
  constructor(private readonly query: SessionTimelineQueryService) {}

  @Get('sessions/:sessionId/timeline')
  async sessionTimeline(
    @Param('slug') slug: string,
    @Param('sessionId') sessionId: string,
    @Query('limit') limitRaw?: string,
    @Query('before') beforeRaw?: string,
  ) {
    const parsed = Number.parseInt(limitRaw ?? '', 10);
    const limit = Number.isNaN(parsed) ? undefined : parsed;
    const before =
      beforeRaw && !Number.isNaN(Date.parse(beforeRaw))
        ? new Date(beforeRaw).toISOString()
        : undefined;
    return this.query.getSessionTimeline(slug, sessionId, { limit, before });
  }

  @Get('tables/:tableNumber/sessions')
  async tableSessions(
    @Param('tableNumber', ParseIntPipe) tableNumber: number,
    @Query('limit') limitRaw?: string,
  ) {
    const parsed = Number.parseInt(limitRaw ?? '', 10);
    const limit = Number.isNaN(parsed) ? undefined : parsed;
    return this.query.listTableSessions(tableNumber, { limit });
  }
}
