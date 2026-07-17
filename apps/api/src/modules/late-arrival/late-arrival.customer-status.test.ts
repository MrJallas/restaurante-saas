import { LateArrivalService } from './late-arrival.service';

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  visit_id: null,
  table_session_id: '22222222-2222-4222-8222-222222222222',
  customer_id: '33333333-3333-4333-8333-333333333333',
  requested_at: '2026-07-11T12:00:00.000Z',
  expected_arrival_at: '2026-07-11T12:30:00.000Z',
  status: 'approved',
  approved_by_staff_id: null,
  approved_by_customer_id: null,
  decided_at: '2026-07-11T12:00:10.000Z',
  escalation_level: 0,
  escalation_chain_id: null,
  ttl_expires_at: '2026-07-11T12:01:00.000Z',
  message: null,
  created_at: '2026-07-11T12:00:00.000Z',
  table_number: 7,
  requester_name: 'Bia',
  total_visits: 1,
};

describe('LateArrivalService.getRequesterStatus', () => {
  it('lê status quando request, caller e sessão pertencem ao mesmo fluxo', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([ROW]);
    const service = new LateArrivalService({ query } as never);

    const result = await service.getRequesterStatus(ROW.id, ROW.customer_id, ROW.table_session_id);

    expect(result.status).toBe('approved');
    expect(query.mock.calls[0][1]).toEqual([ROW.id, ROW.customer_id, ROW.table_session_id]);
  });

  it('não revela se o caller ou a sessão não forem donos', async () => {
    const service = new LateArrivalService({ query: jest.fn().mockResolvedValue([]) } as never);
    await expect(
      service.getRequesterStatus(ROW.id, 'outro-customer', ROW.table_session_id),
    ).rejects.toMatchObject({ status: 404 });
  });
});
