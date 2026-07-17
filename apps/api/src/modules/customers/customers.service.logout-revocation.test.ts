import { CustomersService } from './customers.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { TableSessionService } from '../table-session/table-session.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { EventsGateway } from '../websocket/events.gateway';

const OLD_TOKEN = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

describe('CustomersService.revokeRecognitionToken', () => {
  it('rotaciona no PG, invalida cache WS e desconecta o customer reconhecido', async () => {
    const tenant = {
      getTenantSchemaName: () => 'restaurant_demo',
      query: jest.fn(async () => [[{ id: CUSTOMER_ID }], 1]),
    } as unknown as TenantConnectionProvider;
    const redis = { del: jest.fn(async () => undefined) } as unknown as RedisService;
    const events = { disconnectCustomer: jest.fn() } as unknown as EventsGateway;
    const service = new CustomersService(tenant, {} as TableSessionService, redis, events);

    await expect(service.revokeRecognitionToken(OLD_TOKEN)).resolves.toBe(true);
    expect(redis.del).toHaveBeenCalledWith(`recognition_customer:restaurant_demo:${OLD_TOKEN}`);
    expect(events.disconnectCustomer).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('token inexistente não invalida cache nem desconecta outra pessoa', async () => {
    const tenant = {
      getTenantSchemaName: () => 'restaurant_demo',
      query: jest.fn(async () => [[], 0]),
    } as unknown as TenantConnectionProvider;
    const redis = { del: jest.fn() } as unknown as RedisService;
    const events = { disconnectCustomer: jest.fn() } as unknown as EventsGateway;
    const service = new CustomersService(tenant, {} as TableSessionService, redis, events);

    await expect(service.revokeRecognitionToken(OLD_TOKEN)).resolves.toBe(false);
    expect(redis.del).not.toHaveBeenCalled();
    expect(events.disconnectCustomer).not.toHaveBeenCalled();
  });
});
