import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
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

    if (Number.isFinite(this.publicSettingsCacheTtlMs) && this.publicSettingsCacheTtlMs > 0) {
      SettingsService.publicSettingsCache.set(cacheKey, {
        expiresAt: now + this.publicSettingsCacheTtlMs,
        value,
      });
    }

    return value;
  }

  // ── Tempo de preparo base (ETA do cliente) ────────────────────────────
  // Decisão Caleb 2026-06-10 (Q9): o líder da cozinha configura o range
  // base em /cozinha/eu; o motor de ETA (orders.service) parte dele e
  // ajusta dinamicamente com fila/prioridade/estágio. NULL = defaults.

  async getKitchenEta(): Promise<{
    kitchenEtaMinMinutes: number | null;
    kitchenEtaMaxMinutes: number | null;
  }> {
    const rows = (await this.tenantConn.query(
      `SELECT kitchen_eta_min_minutes, kitchen_eta_max_minutes FROM settings LIMIT 1`,
    )) as Array<{
      kitchen_eta_min_minutes: number | null;
      kitchen_eta_max_minutes: number | null;
    }>;
    return {
      kitchenEtaMinMinutes: rows[0]?.kitchen_eta_min_minutes ?? null,
      kitchenEtaMaxMinutes: rows[0]?.kitchen_eta_max_minutes ?? null,
    };
  }

  /**
   * Atualiza o range base. Permissão: cozinha (cook) ou gerente — o
   * x-staff-id já passou pelo requireActiveStaffId no controller; aqui
   * validamos o papel no DB (mesmo padrão do HostOrManagerGuard).
   */
  async updateKitchenEta(
    staffId: string,
    minMinutes: number,
    maxMinutes: number,
  ): Promise<{ kitchenEtaMinMinutes: number; kitchenEtaMaxMinutes: number }> {
    const staffRows = (await this.tenantConn.query(
      `SELECT role FROM staff WHERE id = $1 AND is_active = true`,
      [staffId],
    )) as Array<{ role: string }>;
    const role = staffRows[0]?.role;
    if (role !== 'cook' && role !== 'manager') {
      throw new ForbiddenException('Apenas cozinha ou gerente alteram o tempo de preparo.');
    }
    if (
      !Number.isInteger(minMinutes) ||
      !Number.isInteger(maxMinutes) ||
      minMinutes < 1 ||
      maxMinutes > 120 ||
      minMinutes > maxMinutes
    ) {
      throw new BadRequestException(
        'Tempo de preparo inválido: use minutos inteiros, 1–120, mínimo ≤ máximo.',
      );
    }
    await this.tenantConn.query(
      `UPDATE settings
          SET kitchen_eta_min_minutes = $1,
              kitchen_eta_max_minutes = $2,
              updated_at = now()`,
      [minMinutes, maxMinutes],
    );
    return { kitchenEtaMinMinutes: minMinutes, kitchenEtaMaxMinutes: maxMinutes };
  }
}
