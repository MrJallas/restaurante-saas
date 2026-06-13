import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { authErrorResponse } from '../../common/guards/auth-error-response';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { AlertRow, AlertSeverity, AlertStatus, AlertsService } from './alerts.service';

class ListAlertsQuery {
  @IsOptional()
  @IsIn(['crítica', 'atenção', 'info', 'all'])
  sev?: AlertSeverity | 'all';

  @IsOptional()
  @IsIn(['open', 'dismissed', 'resolved', 'all'])
  status?: AlertStatus | 'all';

  @IsOptional() @IsString() limit?: string;
}

/**
 * Round 18 (Onda 4 batch 2): persistencia de alertas operacionais
 * usados pela `ScreenManagerAlertsAll`. Migration 045 cria a tabela.
 *
 * Endpoints:
 *   GET  /:slug/alerts?sev=crítica|atenção|info|all&status=open|dismissed|resolved|all
 *   POST /:slug/alerts/:id/dismiss
 *   POST /:slug/alerts/:id/resolve
 *
 * Auth: role-aware staff. Manager/owner ve tudo; host/waiter/cook/etc.
 * recebem apenas alertas cujo kind combina com o papel.
 *
 * Path: `/:slug/alerts` (NAO `/staff/alerts`) pq o `StaffController`
 * usa `@Get(':id')` wildcard que captura `/staff/alerts` como
 * getById('alerts') e quebra com "invalid uuid syntax". Mesmo
 * pattern de `/:slug/courtesies` e `/:slug/shifts` (round 18).
 */
@Controller(':slug/alerts')
export class AlertsController {
  constructor(
    private readonly service: AlertsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get()
  @UseGuards(StaffOnlyGuard)
  async list(@Query() q: ListAlertsQuery, @Req() req: Request): Promise<{ alerts: AlertRow[] }> {
    const limit = q.limit ? parseInt(q.limit, 10) : undefined;
    const role = await this.resolveCallerRole(req);
    const alerts = await this.service.listForRole(role, {
      sev: q.sev,
      status: q.status,
      limit: Number.isFinite(limit as number) ? limit : undefined,
    });
    return { alerts };
  }

  @Post(':id/dismiss')
  @UseGuards(StaffOnlyGuard)
  @HttpCode(200)
  async dismiss(@Param('id') id: string, @Req() req: Request): Promise<AlertRow> {
    const role = await this.resolveCallerRole(req);
    return this.service.dismissForRole(id, role);
  }

  @Post(':id/resolve')
  @UseGuards(StaffOnlyGuard)
  @HttpCode(200)
  async resolve(@Param('id') id: string, @Req() req: Request): Promise<AlertRow> {
    const role = await this.resolveCallerRole(req);
    return this.service.resolveForRole(id, role);
  }

  private async resolveCallerRole(req: Request): Promise<string> {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    const role = await this.service.resolveActiveStaffRole(staffId);
    if (!role) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }
    return role;
  }
}
