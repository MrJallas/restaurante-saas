import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller(':slug/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('revenue')
  async getRevenueChart(@Query('days') days?: string) {
    return this.dashboardService.getRevenueChart(
      days ? parseInt(days) : 7,
    );
  }

  @Get('top-items')
  async getTopItems(@Query('limit') limit?: string) {
    const items = await this.dashboardService.getTopItems(
      limit ? parseInt(limit) : 10,
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
