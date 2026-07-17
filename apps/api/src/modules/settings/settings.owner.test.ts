import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OwnerOnlyGuard } from '../../common/guards/owner-only.guard';
import type { TenantConnectionProvider, TenantTx } from '../tenant/tenant-connection.provider';
import { UpdateOwnerEstablishmentSettingsDto } from './owner-establishment-settings.dto';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const SETTINGS_VERSION = '2026-07-11T12:00:00.000Z';

function ownerHours() {
  return {
    mon: null,
    tue: [{ open: '18:00', close: '23:30' }],
    wed: [{ open: '18:00', close: '23:30' }],
    thu: [{ open: '18:00', close: '23:30' }],
    fri: [{ open: '18:00', close: '01:00' }],
    sat: [{ open: '12:00', close: '23:30' }],
    sun: [{ open: '12:00', close: '16:00' }],
  };
}

function harness() {
  let row = {
    restaurant_name: 'Casa Demo',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    service_fee_pct: '10.00',
    geofence_enabled: false,
    geofence_latitude: null as number | null,
    geofence_longitude: null as number | null,
    geofence_radius_meters: '25.00',
    opening_hours: ownerHours(),
    updated_at: '2026-07-11T12:00:00.000Z',
    updated_by_staff_id: null as string | null,
  };
  const auditParams: unknown[][] = [];
  const txQueries: Array<{ sql: string; params: unknown[] }> = [];
  const tx: TenantTx = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      txQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (sql.includes('UPDATE settings')) {
        row = {
          restaurant_name: params[0] as string,
          timezone: params[1] as string,
          currency: params[2] as string,
          service_fee_pct: String(params[3]),
          geofence_enabled: params[4] as boolean,
          geofence_latitude: params[5] as number | null,
          geofence_longitude: params[6] as number | null,
          geofence_radius_meters: String(params[7]),
          opening_hours: params[8] == null ? null : JSON.parse(params[8] as string),
          updated_at: '2026-07-11T13:00:00.000Z',
          updated_by_staff_id: params[9] as string,
        };
        // TypeORM/pg devolve UPDATE ... RETURNING como tuple [rows, affected].
        return [[row], 1] as unknown as unknown[];
      }
      if (sql.includes('FROM settings') && sql.includes('LIMIT 1')) return [row];
      if (sql.includes('INSERT INTO settings_audit_log')) {
        auditParams.push(params);
        return [];
      }
      throw new Error(`Query inesperada: ${sql}`);
    }),
  };
  const tenant = {
    getTenantSlug: () => 'restaurant_demo',
    query: jest.fn(async () => [row]),
    transaction: jest.fn(async <T>(work: (transaction: TenantTx) => Promise<T>) => work(tx)),
  } as unknown as TenantConnectionProvider;
  return { service: new SettingsService(tenant), auditParams, txQueries, row: () => row };
}

describe('SettingsService owner establishment settings', () => {
  it('protege GET e PATCH do estabelecimento com OwnerOnlyGuard', () => {
    const getGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      SettingsController.prototype.getEstablishmentSettings,
    ) as unknown[];
    const patchGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      SettingsController.prototype.updateEstablishmentSettings,
    ) as unknown[];
    expect(getGuards).toContain(OwnerOnlyGuard);
    expect(patchGuards).toContain(OwnerOnlyGuard);
  });

  it('persiste os campos reais e grava auditoria sem serializar a row secreta', async () => {
    const { service, auditParams, row } = harness();
    const result = await service.updateOwnerEstablishmentSettings(OWNER_ID, {
      expectedUpdatedAt: SETTINGS_VERSION,
      restaurantName: '  Casa Nova  ',
      timezone: 'America/Recife',
      currency: 'BRL',
      serviceFeePercent: 12.5,
      geofenceEnabled: true,
      geofenceLatitude: -8.0476,
      geofenceLongitude: -34.877,
      geofenceRadiusMeters: 40,
      openingHours: ownerHours(),
    });

    expect(result).toMatchObject({
      restaurantName: 'Casa Nova',
      timezone: 'America/Recife',
      serviceFeePercent: 12.5,
      geofenceEnabled: true,
      updatedByStaffId: OWNER_ID,
    });
    expect(row().restaurant_name).toBe('Casa Nova');
    expect(auditParams).toHaveLength(1);
    expect(auditParams[0][0]).toBe(OWNER_ID);
    expect(String(auditParams[0][2])).not.toMatch(/psp|secret|api_key/i);
    expect(String(auditParams[0][3])).toContain('Casa Nova');
  });

  it('recusa ativar geofence sem ponto e recusa timezone inválido', async () => {
    const { service } = harness();
    await expect(
      service.updateOwnerEstablishmentSettings(OWNER_ID, {
        expectedUpdatedAt: SETTINGS_VERSION,
        geofenceEnabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateOwnerEstablishmentSettings(OWNER_ID, {
        expectedUpdatedAt: SETTINGS_VERSION,
        timezone: 'Brasil/Inventado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserva campos persistidos quando um DTO parcial contém chaves undefined', async () => {
    const { service } = harness();
    const result = await service.updateOwnerEstablishmentSettings(OWNER_ID, {
      expectedUpdatedAt: SETTINGS_VERSION,
      restaurantName: 'Casa Parcial',
      currency: undefined,
      timezone: undefined,
      openingHours: null,
    });

    expect(result).toMatchObject({
      restaurantName: 'Casa Parcial',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      openingHours: null,
    });
  });

  it('serializa o read-merge-write do PATCH com SELECT FOR UPDATE na mesma transação', async () => {
    const { service, txQueries } = harness();
    await service.updateOwnerEstablishmentSettings(OWNER_ID, {
      expectedUpdatedAt: SETTINGS_VERSION,
      restaurantName: 'Casa Serializada',
    });

    expect(txQueries).toHaveLength(3);
    expect(txQueries[0].sql).toMatch(/^SELECT restaurant_name,/);
    expect(txQueries[0].sql).toMatch(/FROM settings LIMIT 1 FOR UPDATE$/);
    expect(txQueries[1].sql).toMatch(/^UPDATE settings SET/);
    expect(txQueries[2].sql).toMatch(/^INSERT INTO settings_audit_log/);
  });

  it('rejeita formulário stale antes de UPDATE/auditoria', async () => {
    const { service, txQueries, auditParams } = harness();
    await expect(
      service.updateOwnerEstablishmentSettings(OWNER_ID, {
        expectedUpdatedAt: '2026-07-11T11:59:00.000Z',
        serviceFeePercent: 12,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(txQueries).toHaveLength(1);
    expect(auditParams).toHaveLength(0);
  });

  it('DTO rejeita moeda não suportada e taxa operacional acima de 30%', async () => {
    const dto = plainToInstance(UpdateOwnerEstablishmentSettingsDto, {
      expectedUpdatedAt: SETTINGS_VERSION,
      currency: 'USD',
      serviceFeePercent: 31,
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['currency', 'serviceFeePercent']),
    );
  });
});
