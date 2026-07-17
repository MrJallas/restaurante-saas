import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsInt, Max, Min } from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { OwnerOnlyGuard } from '../../common/guards/owner-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { SettingsService } from './settings.service';
import { UpdateOwnerEstablishmentSettingsDto } from './owner-establishment-settings.dto';

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
   * Leitura e mutação exclusivas do dono. A tela nem aparece para gerente e
   * o backend repete o gate nos dois verbos, impedindo acesso por URL direta.
   */
  @Get('establishment')
  @UseGuards(StaffOnlyGuard, OwnerOnlyGuard)
  async getEstablishmentSettings() {
    return this.settingsService.getOwnerEstablishmentSettings();
  }

  @Patch('establishment')
  @UseGuards(StaffOnlyGuard, OwnerOnlyGuard)
  async updateEstablishmentSettings(
    @Body() dto: UpdateOwnerEstablishmentSettingsDto,
    @Req() req: Request,
  ) {
    const ownerId = await this.callerResolver.requireActiveStaffId(req);
    return this.settingsService.updateOwnerEstablishmentSettings(ownerId, dto);
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
