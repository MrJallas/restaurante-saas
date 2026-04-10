import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller(':slug/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('public')
  async getPublicSettings() {
    return this.settingsService.getPublicSettings();
  }
}
