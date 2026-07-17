import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import * as pinUtil from './staff-pin.util';
import { StaffService } from './staff.service';

describe('StaffService.create temporary credential', () => {
  it('ignores a browser-selected PIN and generates the one-time PIN server-side', async () => {
    const random = jest.spyOn(pinUtil, 'generateTemporaryPin').mockReturnValue('654321');
    let insertedParams: unknown[] = [];
    const query = jest.fn(async (_sql: string, params: unknown[]) => {
      insertedParams = params;
      return [
        {
          id: 'staff-id',
          name: 'Maria',
          role: 'waiter',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ];
    });
    const service = new StaffService(
      { query } as unknown as TenantConnectionProvider,
      {} as RedisService,
    );

    const created = (await service.create({
      name: 'Maria',
      role: 'waiter',
      pin: '111111',
    })) as { tempPin: string; mustChangePin: boolean };

    const storedHash = String(insertedParams[2]);
    expect(created.tempPin).toBe('654321');
    expect(created.mustChangePin).toBe(true);
    expect(pinUtil.verifyPin(created.tempPin, storedHash)).toBe(true);
    expect(pinUtil.verifyPin('111111', storedHash)).toBe(false);
    random.mockRestore();
  });
});
