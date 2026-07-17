import { ScanVerificationService } from './scan-verification.service';
import type { SecurityAuditService } from '../security-audit/security-audit.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

describe('ScanVerificationService — projeção da etapa atual', () => {
  it('expõe currentAssigneeRole vindo da escalation chain', async () => {
    const query = jest.fn(async () => [
      {
        id: 'request-1',
        table_session_id: 'session-1',
        table_id: 'table-1',
        table_code: 'M01',
        table_number: 1,
        customer_id: 'customer-1',
        customer_name: 'Cliente',
        cpf: '12345678901',
        status: 'pending',
        location_status: 'granted',
        latitude: null,
        longitude: null,
        accuracy_meters: null,
        distance_meters: null,
        inside_radius: null,
        radius_meters: 500,
        escalation_level: 1,
        escalation_chain_id: 'chain-1',
        current_assignee_role: 'manager',
        ttl_expires_at: '2026-07-11T07:00:00.000Z',
        decided_at: null,
        rejection_reason: null,
        created_at: '2026-07-11T06:00:00.000Z',
      },
    ]);
    const service = new ScanVerificationService(
      { query } as unknown as TenantConnectionProvider,
      {} as SecurityAuditService,
    );

    const result = await service.getById('request-1');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('ec.current_assignee_role'), [
      'request-1',
    ]);
    expect(result.currentAssigneeRole).toBe('manager');
  });
});
