import { HttpException } from '@nestjs/common';
import { HostService } from './host.service';
import { HostInboxService } from './host-inbox.service';
import { HostReservationsService } from './host-reservations.service';
import { HostWaitlistService } from './host-waitlist.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider, TenantTx } from '../tenant/tenant-connection.provider';

interface Call {
  sql: string;
  params: unknown[];
}

function makeHarness(source: 'reservation' | 'waitlist', party = 2, capacity = 2) {
  const txCalls: Call[] = [];
  const query = jest.fn(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT id, code FROM tables WHERE')) {
      return [{ id: 'table-91', code: '91' }];
    }
    throw new Error(`query fora da transaction: ${normalized}`);
  });

  const txQuery = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    txCalls.push({ sql: normalized, params });
    if (normalized.startsWith('SELECT id, capacity FROM tables')) {
      return [{ id: 'table-91', capacity }];
    }
    if (normalized.startsWith('SELECT id, party, status, table_id FROM reservations')) {
      return source === 'reservation'
        ? [{ id: 'reservation-1', party, status: 'arrived', table_id: null }]
        : [];
    }
    if (normalized.startsWith('SELECT id, party, status, table_id FROM waitlist_entries')) {
      return source === 'waitlist'
        ? [{ id: 'waitlist-1', party, status: 'waiting', table_id: null }]
        : [];
    }
    if (normalized.startsWith('SELECT id FROM table_sessions')) return [];
    if (normalized.startsWith('UPDATE reservations')) return [];
    if (normalized.startsWith('UPDATE waitlist_entries')) return [];
    if (normalized.startsWith('UPDATE table_qr_releases')) return [];
    if (normalized.startsWith('INSERT INTO table_qr_releases')) {
      return [{ id: 'release-1', expires_at: '2026-07-11T07:00:00.000Z' }];
    }
    throw new Error(`tx query não roteada: ${normalized}`);
  };

  const transaction = jest.fn(async <T>(work: (tx: TenantTx) => Promise<T>) =>
    work({ query: txQuery }),
  );
  const conn = { query, transaction } as unknown as TenantConnectionProvider;
  const redis = { del: jest.fn(async () => undefined) } as unknown as RedisService;
  const service = new HostService(
    conn,
    new HostWaitlistService(conn),
    new HostInboxService(conn),
    new HostReservationsService(conn),
    redis,
  );
  return { service, transaction, txCalls };
}

describe('HostService.liberateTable — reserva/fila atômicas', () => {
  it('vincula reserva, tamanho do grupo e release dentro da mesma transaction', async () => {
    const harness = makeHarness('reservation');
    const result = await harness.service.liberateTable(
      91,
      {
        mode: 'auto',
        reservationId: '11111111-1111-4111-8111-111111111111',
        partySize: 2,
        staffId: '22222222-2222-4222-8222-222222222222',
      },
      'restaurant_dev',
    );

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.txCalls.some((call) => call.sql.startsWith('UPDATE reservations'))).toBe(true);
    const insert = harness.txCalls.find((call) =>
      call.sql.startsWith('INSERT INTO table_qr_releases'),
    );
    expect(insert?.params).toEqual([
      'table-91',
      '22222222-2222-4222-8222-222222222222',
      null,
      2,
      '11111111-1111-4111-8111-111111111111',
      null,
    ]);
    expect(result).toMatchObject({ ok: true, partySize: 2, source: 'reservation' });
  });

  it('só marca a fila como seated na mesma transaction que cria a release', async () => {
    const harness = makeHarness('waitlist');
    const result = await harness.service.liberateTable(
      91,
      {
        mode: 'auto',
        waitlistId: '33333333-3333-4333-8333-333333333333',
        partySize: 2,
      },
      'restaurant_dev',
    );

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.txCalls.some((call) => call.sql.startsWith('UPDATE waitlist_entries'))).toBe(
      true,
    );
    expect(result).toMatchObject({ ok: true, partySize: 2, source: 'waitlist' });
  });

  it('rejeita grupo maior que a mesa antes de alterar origem ou criar release', async () => {
    const harness = makeHarness('reservation', 4, 2);
    await expect(
      harness.service.liberateTable(
        91,
        {
          mode: 'auto',
          reservationId: '11111111-1111-4111-8111-111111111111',
          partySize: 4,
        },
        'restaurant_dev',
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(harness.txCalls.some((call) => call.sql.startsWith('UPDATE reservations'))).toBe(false);
    expect(
      harness.txCalls.some((call) => call.sql.startsWith('INSERT INTO table_qr_releases')),
    ).toBe(false);
  });
});
