import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type {
  OwnerEstablishmentSettings,
  OwnerOpeningHours,
  OwnerOpeningWindow,
  OwnerSettingsDay,
  UpdateOwnerEstablishmentSettings,
} from '@restaurant/shared-types';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';

export interface PublicSettings {
  restaurantName: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  fontHero: string;
  fontBody: string;
  logoUrl: string | null;
}

interface OwnerSettingsRow {
  restaurant_name: string;
  timezone: string;
  currency: string;
  service_fee_pct: number | string;
  geofence_enabled: boolean;
  geofence_latitude: number | string | null;
  geofence_longitude: number | string | null;
  geofence_radius_meters: number | string;
  opening_hours: unknown;
  updated_at: Date | string;
  updated_by_staff_id: string | null;
}

const OWNER_SETTINGS_SELECT = `
  SELECT restaurant_name, timezone, currency, service_fee_pct,
         geofence_enabled, geofence_latitude, geofence_longitude,
         geofence_radius_meters, opening_hours, updated_at,
         updated_by_staff_id
   FROM settings
   LIMIT 1`;

// O PATCH faz read-merge-write de todos os campos owner-facing. Serializar a
// row evita lost update quando dois dispositivos alteram campos distintos ao
// mesmo tempo (ex.: nome e taxa de serviço).
const OWNER_SETTINGS_SELECT_FOR_UPDATE = `${OWNER_SETTINGS_SELECT} FOR UPDATE`;

const TIME_24H_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const OWNER_SETTINGS_DAYS: readonly OwnerSettingsDay[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

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

  // ── Configurações do estabelecimento (owner) ────────────────────────

  async getOwnerEstablishmentSettings(): Promise<OwnerEstablishmentSettings> {
    const rows = (await this.tenantConn.query(OWNER_SETTINGS_SELECT)) as OwnerSettingsRow[];
    if (!rows[0]) {
      throw new BadRequestException('Configuração do estabelecimento não encontrada.');
    }
    return this.mapOwnerSettings(rows[0]);
  }

  async updateOwnerEstablishmentSettings(
    ownerId: string,
    patch: UpdateOwnerEstablishmentSettings,
  ): Promise<OwnerEstablishmentSettings> {
    const { expectedUpdatedAt, ...candidatePatch } = patch;
    if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      throw new BadRequestException('Versão das configurações ausente ou inválida.');
    }
    const definedPatch = Object.fromEntries(
      Object.entries(candidatePatch).filter(([, value]) => value !== undefined),
    ) as UpdateOwnerEstablishmentSettings;
    const changedFields = Object.keys(definedPatch);
    if (changedFields.length === 0) {
      throw new BadRequestException('Informe ao menos uma configuração para salvar.');
    }

    const updated = await this.tenantConn.transaction(async (tx) => {
      const currentRows = unwrapRows<OwnerSettingsRow>(
        await tx.query(OWNER_SETTINGS_SELECT_FOR_UPDATE),
      );
      if (!currentRows[0]) {
        throw new BadRequestException('Configuração do estabelecimento não encontrada.');
      }
      const current = this.mapOwnerSettings(currentRows[0]);
      if (current.updatedAt !== new Date(expectedUpdatedAt).toISOString()) {
        throw new ConflictException({
          message_user:
            'As configurações mudaram em outra aba ou dispositivo. Recarregue e revise antes de salvar.',
          code: 'SETTINGS_STALE',
        });
      }
      const next: OwnerEstablishmentSettings = {
        ...current,
        ...definedPatch,
        restaurantName:
          definedPatch.restaurantName !== undefined
            ? definedPatch.restaurantName.trim()
            : current.restaurantName,
        openingHours:
          definedPatch.openingHours !== undefined
            ? this.validateOpeningHours(definedPatch.openingHours)
            : current.openingHours,
        updatedAt: current.updatedAt,
        updatedByStaffId: ownerId,
      };
      this.validateOwnerSettings(next);

      const updatedRows = unwrapRows<OwnerSettingsRow>(
        await tx.query(
          `UPDATE settings
            SET restaurant_name = $1,
                timezone = $2,
                currency = $3,
                service_fee_pct = $4,
                geofence_enabled = $5,
                geofence_latitude = $6,
                geofence_longitude = $7,
                geofence_radius_meters = $8,
                opening_hours = $9::jsonb,
                updated_by_staff_id = $10,
                updated_at = now()
          WHERE id = (SELECT id FROM settings LIMIT 1)
          RETURNING restaurant_name, timezone, currency, service_fee_pct,
                    geofence_enabled, geofence_latitude, geofence_longitude,
                    geofence_radius_meters, opening_hours, updated_at,
                    updated_by_staff_id`,
          [
            next.restaurantName,
            next.timezone,
            next.currency,
            next.serviceFeePercent,
            next.geofenceEnabled,
            next.geofenceLatitude,
            next.geofenceLongitude,
            next.geofenceRadiusMeters,
            next.openingHours == null ? null : JSON.stringify(next.openingHours),
            ownerId,
          ],
        ),
      );
      if (!updatedRows[0]) {
        throw new BadRequestException('Não foi possível salvar as configurações.');
      }
      const result = this.mapOwnerSettings(updatedRows[0]);

      // A trilha contém somente a superfície owner-facing. Nunca serializa a
      // row inteira de settings, que também guarda segredos de PSP/QR.
      await tx.query(
        `INSERT INTO settings_audit_log
           (changed_by_staff_id, changed_fields, before_values, after_values)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
        [
          ownerId,
          changedFields,
          JSON.stringify(this.ownerSettingsSnapshot(current)),
          JSON.stringify(this.ownerSettingsSnapshot(result)),
        ],
      );
      return result;
    });

    SettingsService.publicSettingsCache.delete(
      `public-settings:v1:${this.tenantConn.getTenantSlug() ?? 'unknown'}`,
    );
    return updated;
  }

  private mapOwnerSettings(row: OwnerSettingsRow): OwnerEstablishmentSettings {
    if (row.currency !== 'BRL') {
      throw new BadRequestException('A moeda configurada neste tenant ainda não é suportada.');
    }
    return {
      restaurantName: row.restaurant_name,
      timezone: row.timezone,
      currency: row.currency,
      serviceFeePercent: this.requiredFiniteNumber(row.service_fee_pct, 'taxa de serviço'),
      geofenceEnabled: row.geofence_enabled === true,
      geofenceLatitude: this.optionalFiniteNumber(row.geofence_latitude),
      geofenceLongitude: this.optionalFiniteNumber(row.geofence_longitude),
      geofenceRadiusMeters: this.requiredFiniteNumber(
        row.geofence_radius_meters,
        'raio do geofence',
      ),
      openingHours: row.opening_hours == null ? null : this.validateOpeningHours(row.opening_hours),
      updatedAt: new Date(row.updated_at).toISOString(),
      updatedByStaffId: row.updated_by_staff_id ?? null,
    };
  }

  private validateOwnerSettings(value: OwnerEstablishmentSettings): void {
    if (value.restaurantName.length < 2 || value.restaurantName.length > 200) {
      throw new BadRequestException('Nome do restaurante deve ter entre 2 e 200 caracteres.');
    }
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: value.timezone }).format(new Date());
    } catch {
      throw new BadRequestException('Fuso horário inválido. Use um identificador IANA.');
    }
    if (value.currency !== 'BRL') {
      throw new BadRequestException('A moeda disponível nesta versão é BRL.');
    }
    if (
      !Number.isFinite(value.serviceFeePercent) ||
      value.serviceFeePercent < 0 ||
      value.serviceFeePercent > 30
    ) {
      throw new BadRequestException('Taxa de serviço deve ficar entre 0% e 30%.');
    }
    if (
      !Number.isFinite(value.geofenceRadiusMeters) ||
      value.geofenceRadiusMeters < 3 ||
      value.geofenceRadiusMeters > 1000
    ) {
      throw new BadRequestException('Raio do geofence deve ficar entre 3 e 1000 metros.');
    }
    if (value.geofenceEnabled) {
      if (value.geofenceLatitude == null || value.geofenceLongitude == null) {
        throw new BadRequestException(
          'Defina latitude e longitude antes de ativar a presença no restaurante.',
        );
      }
    }
    if (
      value.geofenceLatitude != null &&
      (value.geofenceLatitude < -90 || value.geofenceLatitude > 90)
    ) {
      throw new BadRequestException('Latitude deve ficar entre -90 e 90.');
    }
    if (
      value.geofenceLongitude != null &&
      (value.geofenceLongitude < -180 || value.geofenceLongitude > 180)
    ) {
      throw new BadRequestException('Longitude deve ficar entre -180 e 180.');
    }
  }

  private validateOpeningHours(value: unknown): OwnerOpeningHours | null {
    if (value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Horários de funcionamento inválidos.');
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length !== OWNER_SETTINGS_DAYS.length ||
      keys.some((key) => !OWNER_SETTINGS_DAYS.includes(key as OwnerSettingsDay))
    ) {
      throw new BadRequestException('Informe os sete dias da semana nos horários.');
    }

    const result = {} as OwnerOpeningHours;
    for (const day of OWNER_SETTINGS_DAYS) {
      const windows = record[day];
      if (windows === null) {
        result[day] = null;
        continue;
      }
      if (!Array.isArray(windows) || windows.length < 1 || windows.length > 3) {
        throw new BadRequestException('Cada dia aberto deve ter de um a três períodos.');
      }
      result[day] = windows.map((window) => this.validateOpeningWindow(window));
    }
    return result;
  }

  private validateOpeningWindow(value: unknown): OwnerOpeningWindow {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Período de funcionamento inválido.');
    }
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate);
    if (
      keys.length !== 2 ||
      typeof candidate.open !== 'string' ||
      typeof candidate.close !== 'string' ||
      !TIME_24H_RE.test(candidate.open) ||
      !TIME_24H_RE.test(candidate.close) ||
      candidate.open === candidate.close
    ) {
      throw new BadRequestException(
        'Use períodos HH:MM com horários de abertura e fechamento diferentes.',
      );
    }
    return { open: candidate.open, close: candidate.close };
  }

  private requiredFiniteNumber(value: unknown, label: string): number {
    const parsed = this.optionalFiniteNumber(value);
    if (parsed == null) {
      throw new BadRequestException(`Valor inválido em ${label}.`);
    }
    return parsed;
  }

  private optionalFiniteNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private ownerSettingsSnapshot(value: OwnerEstablishmentSettings) {
    return {
      restaurantName: value.restaurantName,
      timezone: value.timezone,
      currency: value.currency,
      serviceFeePercent: value.serviceFeePercent,
      geofenceEnabled: value.geofenceEnabled,
      geofenceLatitude: value.geofenceLatitude,
      geofenceLongitude: value.geofenceLongitude,
      geofenceRadiusMeters: value.geofenceRadiusMeters,
      openingHours: value.openingHours,
    };
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
    if (role !== 'cook' && role !== 'manager' && role !== 'owner') {
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
