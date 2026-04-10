import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

export interface PublicSettings {
  restaurantName: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  fontHero: string;
  fontBody: string;
  logoUrl: string | null;
}

@Injectable()
export class SettingsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async getPublicSettings(): Promise<PublicSettings> {
    const rows = await this.tenantConn.query(
      `SELECT restaurant_name, color_primary, color_secondary, color_accent,
              font_hero, font_body, logo_url
       FROM settings LIMIT 1`,
    );

    const config = (rows as Record<string, unknown>[])[0] || {};

    return {
      restaurantName: (config.restaurant_name as string) || 'Restaurante',
      colorPrimary: (config.color_primary as string) || '#1a1a2e',
      colorSecondary: (config.color_secondary as string) || '#16213e',
      colorAccent: (config.color_accent as string) || '#e94560',
      fontHero: (config.font_hero as string) || 'Inter',
      fontBody: (config.font_body as string) || 'Inter',
      logoUrl: (config.logo_url as string) || null,
    };
  }
}
