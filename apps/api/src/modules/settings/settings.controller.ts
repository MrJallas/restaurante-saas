import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsInt, Max, Min } from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { SettingsService } from './settings.service';

class UpdateKitchenEtaDto {
  @IsInt() @Min(1) @Max(120) minMinutes!: number;
  @IsInt() @Min(1) @Max(120) maxMinutes!: number;
}

@Controller(':slug/settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get('public')
  async getPublicSettings() {
    return this.settingsService.getPublicSettings();
  }

  /**
   * Tempo de preparo base usado pela ETA do cliente (decisão Caleb
   * 2026-06-10, Q9). GET é staff (a tela /cozinha/eu lê); o PATCH valida
   * no service que o papel é cook|manager — o líder da cozinha ajusta o
   * range base e o motor de ETA segue dinâmico por fila/prioridade/estágio.
   */
  @Get('kitchen-eta')
  @UseGuards(StaffOnlyGuard)
  async getKitchenEta() {
    return this.settingsService.getKitchenEta();
  }

  @Patch('kitchen-eta')
  @UseGuards(StaffOnlyGuard)
  async updateKitchenEta(@Body() dto: UpdateKitchenEtaDto, @Req() req: Request) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.settingsService.updateKitchenEta(staffId, dto.minMinutes, dto.maxMinutes);
  }
}
