import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData } from '../../common/guards/session.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import type { TenantRequest } from '../tenant/tenant.middleware';
import { HomeService } from './home.service';

@Controller(':slug/home')
export class HomeController {
  constructor(
    private readonly homeService: HomeService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 12 (B-NEW-63): customerId derivado do cookie via callerResolver
   * em vez de aceitar `?customerId=<UUID>` na query. Antes vazava name +
   * last_items + favorite_items + total_spent_cents de qualquer customer
   * cujo UUID fosse conhecido (vetor: GET /table/participants).
   */
  @Get()
  @UseGuards(SessionGuard)
  async getHome(@Session() session: SessionData, @Req() req: TenantRequest) {
    const customerId =
      (await this.callerResolver.tryGetCustomerId(req)) ?? session.customerId ?? null;
    const draftCount = Number(req.headers['x-draft-order-count'] ?? 0);
    const kindHint = Array.isArray(req.headers['x-continuation-kind-hint'])
      ? req.headers['x-continuation-kind-hint'][0]
      : req.headers['x-continuation-kind-hint'];
    return this.homeService.getHome(
      session.sessionId,
      customerId ?? undefined,
      session.tableLabel,
      {
        tenantId: session.schemaName,
        kindHint,
        hasDraftOrder: Number.isFinite(draftCount) && draftCount > 0,
      },
    );
  }
}
