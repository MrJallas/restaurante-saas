import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard financeiro/analytics — exclusivo de staff/admin. Antes era
 * publico: revenue, AI usage, top items, feedback summary visiveis pra
 * qualquer um sem auth (P0 do bug-hunt round 3). Agora todos os
 * endpoints exigem `x-staff-key`. Tambem cap de query params pra evitar
 * overflow de int4 quando atacante manda days=99999999999.
 */
@Controller(':slug/dashboard')
@UseGuards(StaffOrSessionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private safePositiveInt(raw: string | undefined, def: number, max: number): number {
    if (!raw) return def;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return def;
    return Math.min(n, max);
  }

  @Get('overview')
  async getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('revenue')
  async getRevenueChart(@Query('days') days?: string) {
    // Cap em 365 dias — alem de DoS, INT4 do Postgres estoura com valores
    // como 99999999999 e devolve 500.
    return this.dashboardService.getRevenueChart(this.safePositiveInt(days, 7, 365));
  }

  @Get('top-items')
  async getTopItems(@Query('limit') limit?: string) {
    const items = await this.dashboardService.getTopItems(
      this.safePositiveInt(limit, 10, 100),
    );
    return { items };
  }

  @Get('feedback-summary')
  async getFeedbackSummary() {
    return this.dashboardService.getFeedbackSummary();
  }

  @Get('ai-usage')
  async getAiUsage() {
    return this.dashboardService.getAiUsage();
  }
}
