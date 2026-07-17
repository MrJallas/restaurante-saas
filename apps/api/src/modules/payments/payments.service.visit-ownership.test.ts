import { PaymentsService } from './payments.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const VICTIM_VISIT = '22222222-2222-4222-8222-222222222222';
const CALLER = '33333333-3333-4333-8333-333333333333';

describe('PaymentsService visit ownership', () => {
  it('ignora visitId do body e resolve a visita exclusivamente pelo caller autenticado', async () => {
    const query = jest.fn(async (rawSql: string, _params: unknown[]) => {
      if (rawSql.includes('SELECT id FROM visits')) return [];
      throw new Error(`SQL inesperado: ${rawSql}`);
    });
    const instance = new PaymentsService(
      { query } as unknown as TenantConnectionProvider,
      {} as RedisService,
      {} as never,
    );

    await expect(
      instance.requestPayment(SESSION, VICTIM_VISIT, 'individual', 'pix', {
        callerCustomerId: CALLER,
      }),
    ).rejects.toThrow(/identificar sua comanda/i);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('customer_id = $2'), [
      SESSION,
      CALLER,
    ]);
  });
});
