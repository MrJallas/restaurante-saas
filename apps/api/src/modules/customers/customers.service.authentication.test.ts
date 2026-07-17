import { CustomersService } from './customers.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { TableSessionService } from '../table-session/table-session.service';

const CPF = '39053344705';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';
const VISIT_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const LOCATION = {
  status: 'granted' as const,
  latitude: 0,
  longitude: 0,
  accuracyMeters: 10,
};

function makeService() {
  const calls: string[] = [];
  const query = jest.fn(async (rawSql: string) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    calls.push(sql);
    if (sql.startsWith('SELECT geofence_latitude')) {
      return [
        {
          geofence_latitude: null,
          geofence_longitude: null,
          geofence_radius_meters: null,
          geofence_enabled: false,
        },
      ];
    }
    if (
      sql.startsWith('SELECT id, name, recognition_token, total_visits FROM customers WHERE cpf')
    ) {
      return [
        {
          id: CUSTOMER_ID,
          name: 'Ana',
          recognition_token: TOKEN,
          total_visits: 3,
        },
      ];
    }
    if (sql.startsWith('INSERT INTO visits')) return [{ id: VISIT_ID }];
    if (sql.startsWith('UPDATE customers SET total_visits')) return [{ total_visits: 4 }];
    if (sql.startsWith('SELECT last_items, favorite_items, total_spent_cents')) return [];
    throw new Error(`SQL inesperado: ${sql}`);
  });
  const tenant = {
    query,
    getTenantSlug: () => 'demo',
  } as unknown as TenantConnectionProvider;
  const tableSession = {
    upsertParticipant: jest.fn(async () => ({ color: '#abcdef' })),
    attachCustomerToSession: jest.fn(async () => undefined),
  } as unknown as TableSessionService;
  return {
    service: new CustomersService(tenant, tableSession),
    calls,
    tableSession,
  };
}

describe('CustomersService — decisão temporária de login somente por CPF', () => {
  it('autentica cadastro existente por CPF mesmo sem cookie anterior', async () => {
    const { service, calls } = makeService();
    await expect(service.identify(CPF, 'Ana', undefined, null)).resolves.toMatchObject({
      customerId: CUSTOMER_ID,
      isReturning: true,
      canonicalName: 'Ana',
      recognitionToken: TOKEN,
    });
    expect(calls.some((sql) => sql.startsWith('UPDATE customers SET recognition_token'))).toBe(
      false,
    );
  });

  it('CPF digitado troca o browser para o perfil encontrado mesmo com cookie de outro perfil', async () => {
    const { service } = makeService();
    await expect(
      service.identify(CPF, 'Nome ignorado', undefined, '33333333-3333-4333-8333-333333333333'),
    ).resolves.toMatchObject({
      customerId: CUSTOMER_ID,
      canonicalName: 'Ana',
      recognitionToken: TOKEN,
    });
  });

  it('cookie canônico continua idempotente', async () => {
    const { service } = makeService();
    const result = await service.identify(CPF, 'Ana', undefined, TOKEN);
    expect(result).toMatchObject({
      customerId: CUSTOMER_ID,
      isReturning: true,
      canonicalName: 'Ana',
      recognitionToken: TOKEN,
    });
  });

  it('welcome em aparelho novo entra no perfil pelo CPF e marca o reclaim explícito', async () => {
    const { service, calls, tableSession } = makeService();
    const result = await service.welcome('Nome digitado', CPF, SESSION_ID, null, LOCATION);

    expect(result).toMatchObject({
      customerId: CUSTOMER_ID,
      name: 'Ana',
      recognitionToken: TOKEN,
      isReturning: true,
      totalVisits: 4,
      visitId: VISIT_ID,
      wasReclaim: true,
    });
    expect(calls.some((sql) => sql.startsWith('UPDATE customers SET recognition_token'))).toBe(
      false,
    );
    expect(tableSession.upsertParticipant).toHaveBeenCalledWith(
      SESSION_ID,
      CUSTOMER_ID,
      VISIT_ID,
      expect.objectContaining({ slug: 'demo' }),
    );
    expect(tableSession.attachCustomerToSession).toHaveBeenCalledWith(SESSION_ID, CUSTOMER_ID);
  });

  it('welcome com cookie canônico não sinaliza reclaim', async () => {
    const { service } = makeService();
    await expect(service.welcome('Ana', CPF, SESSION_ID, TOKEN, LOCATION)).resolves.toMatchObject({
      recognitionToken: TOKEN,
      wasReclaim: false,
    });
  });
});
