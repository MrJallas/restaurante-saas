import { TableMergeService } from './table-merge.service';

const ID = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';

describe('TableMergeService.getCustomerStatus', () => {
  it('cruza request, sessão e identidade antes de devolver o lifecycle', async () => {
    const row = {
      id: ID,
      source_table_session_id: SESSION,
      target_table_session_id: '44444444-4444-4444-8444-444444444444',
      requesting_customer_id: CUSTOMER,
      target_customer_id: null,
      decided_by_customer_id: null,
      status: 'pending',
      origin_table_number: 7,
      target_table_number: 8,
      origin_host_name: 'Bia',
      target_host_name: 'Ana',
      origin_party_size: 2,
      target_party_size: 3,
      message: null,
      ttl_expires_at: '2099-07-11T12:01:00.000Z',
      cooldown_expires_at: null,
      decided_at: null,
      approved_by_a_at: null,
      approved_by_b_at: null,
      created_at: '2026-07-11T12:00:00.000Z',
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([]) // expireOverdueRequests UPDATE
      .mockResolvedValueOnce([row]);
    const service = new TableMergeService(
      { query, getTenantSlug: () => 'demo' } as never,
      {} as never,
      undefined,
    );

    const result = await service.getCustomerStatus(ID, SESSION, CUSTOMER);

    expect(result.status).toBe('pending');
    expect(query.mock.calls[0][1]).toEqual([ID, SESSION, CUSTOMER]);
  });

  it('responde 404 para outro participante da mesa', async () => {
    const service = new TableMergeService(
      { query: jest.fn().mockResolvedValue([]), getTenantSlug: () => 'demo' } as never,
      {} as never,
      undefined,
    );
    await expect(service.getCustomerStatus(ID, SESSION, 'outro-customer')).rejects.toMatchObject({
      status: 404,
    });
  });
});
