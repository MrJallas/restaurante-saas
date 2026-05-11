import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import {
  AlertRow,
  AlertSeverity,
  AlertStatus,
  AlertsService,
} from './alerts.service';

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
 * Auth: manager-only — alertas sao painel de gestao operacional.
 *
 * Path: `/:slug/alerts` (NAO `/staff/alerts`) pq o `StaffController`
 * usa `@Get(':id')` wildcard que captura `/staff/alerts` como
 * getById('alerts') e quebra com "invalid uuid syntax". Mesmo
 * pattern de `/:slug/courtesies` e `/:slug/shifts` (round 18).
 */
@Controller(':slug/alerts')
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async list(@Query() q: ListAlertsQuery): Promise<{ alerts: AlertRow[] }> {
    const limit = q.limit ? parseInt(q.limit, 10) : undefined;
    const alerts = await this.service.list({
      sev: q.sev,
      status: q.status,
      limit: Number.isFinite(limit as number) ? limit : undefined,
    });
    return { alerts };
  }

  @Post(':id/dismiss')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  @HttpCode(200)
  async dismiss(@Param('id') id: string): Promise<AlertRow> {
    return this.service.dismiss(id);
  }

  @Post(':id/resolve')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  @HttpCode(200)
  async resolve(@Param('id') id: string): Promise<AlertRow> {
    return this.service.resolve(id);
  }
}
