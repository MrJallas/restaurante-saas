import { ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import type { BillingService } from '../billing/billing.service';
import type { EventsGateway } from '../websocket/events.gateway';

const SESSION = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const NOTIFICATION = '33333333-3333-4333-8333-333333333333';

function setup() {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('INSERT INTO bill_split_notifications')) {
      return [{ id: NOTIFICATION, created_at: '2026-07-11T12:00:00.000Z' }];
    }
    throw new Error(`SQL inesperado: ${sql}`);
  });
  const events = {
    emitToSession: jest.fn(),
    emitToTenant: jest.fn(),
  } as unknown as EventsGateway;
  const service = new PaymentsService(
    { query, getTenantSlug: () => 'demo' } as unknown as TenantConnectionProvider,
    {} as RedisService,
    {} as BillingService,
    events,
  );
  jest.spyOn(service, 'computeSplit').mockResolvedValue({
    mode: 'equal',
    subtotalCents: 1000,
    discountCents: 0,
    discountLabel: null,
    serviceFeePct: 10,
    serviceFeeCents: 100,
    totalCents: 1100,
    allocations: [{ customerId: CUSTOMER, amountCents: 1100 }],
  });
  return { service, query, events };
}

describe('PaymentsService.notifySplit', () => {
  it('persiste a divisão canônica e emite ACK real para mesa e gestão', async () => {
    const { service, query, events } = setup();
    const result = await service.notifySplit(
      SESSION,
      'equal',
      [{ customerId: CUSTOMER, amountCents: 1 }],
      CUSTOMER,
    );

    expect(result).toMatchObject({
      ok: true,
      persisted: true,
      notificationId: NOTIFICATION,
      totalCents: 1100,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('bill_split_notifications'), [
      SESSION,
      CUSTOMER,
      'equal',
      JSON.stringify([{ customerId: CUSTOMER, amountCents: 1100 }]),
    ]);
    expect(events.emitToSession).toHaveBeenCalledWith(
      SESSION,
      'bill.split_notified',
      expect.objectContaining({ notificationId: NOTIFICATION }),
    );
    expect(events.emitToTenant).toHaveBeenCalled();
  });

  it('não aceita resumo anônimo', async () => {
    const { service } = setup();
    await expect(service.notifySplit(SESSION, 'equal', [], null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
