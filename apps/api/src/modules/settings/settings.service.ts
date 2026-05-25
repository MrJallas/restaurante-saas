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
  private static readonly publicSettingsCache = new Map<
    string,
    { expiresAt: number; value: PublicSettings }
  >();

  private readonly publicSettingsCacheTtlMs = Number(
    process.env.PUBLIC_SETTINGS_CACHE_TTL_MS ?? 10_000,
  );

  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async getPublicSettings(): Promise<PublicSettings> {
    const cacheKey = `public-settings:v1:${this.tenantConn.getTenantSlug() ?? 'unknown'}`;
    const now = Date.now();
    const cached = SettingsService.publicSettingsCache.get(cacheKey);
    if (
      Number.isFinite(this.publicSettingsCacheTtlMs) &&
      this.publicSettingsCacheTtlMs > 0 &&
      cached &&
      cached.expiresAt > now
    ) {
      return cached.value;
    }

    const rows = await this.tenantConn.query(
      `SELECT restaurant_name, color_primary, color_secondary, color_accent,
              font_hero, font_body, logo_url
       FROM settings LIMIT 1`,
    );

    const config = (rows as Record<string, unknown>[])[0] || {};

    const value: PublicSettings = {
      restaurantName: (config.restaurant_name as string) || 'Restaurante',
      colorPrimary: (config.color_primary as string) || '#1a1a2e',
      colorSecondary: (config.color_secondary as string) || '#16213e',
      colorAccent: (config.color_accent as string) || '#e94560',
      fontHero: (config.font_hero as string) || 'Inter',
      fontBody: (config.font_body as string) || 'Inter',
      logoUrl: (config.logo_url as string) || null,
    };

    if (
      Number.isFinite(this.publicSettingsCacheTtlMs) &&
      this.publicSettingsCacheTtlMs > 0
    ) {
      SettingsService.publicSettingsCache.set(cacheKey, {
        expiresAt: now + this.publicSettingsCacheTtlMs,
        value,
      });
    }

    return value;
  }
}
