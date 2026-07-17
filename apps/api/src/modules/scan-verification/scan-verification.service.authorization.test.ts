import { ForbiddenException } from '@nestjs/common';
import { ScanVerificationService } from './scan-verification.service';
import type { TenantConnectionProvider, TenantTx } from '../tenant/tenant-connection.provider';
import type { SecurityAuditService } from '../security-audit/security-audit.service';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';

function harness(actorRole: string, assignedRole: string) {
  let mutations = 0;
  const tx: TenantTx = {
    query: jest.fn(async (rawSql: string) => {
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT svr.id')) {
        return [
          {
            id: REQUEST_ID,
            table_session_id: 'session-1',
            customer_id: 'customer-1',
            escalation_chain_id: 'chain-1',
            current_assignee_role: assignedRole,
            status: 'pending',
          },
        ];
      }
      if (sql.startsWith('SELECT role FROM staff')) return [{ role: actorRole }];
      mutations += 1;
      throw new Error('ROLE_GATE_PASSED');
    }),
  };
  const tenant = {
    transaction: jest.fn(async <T>(work: (inner: TenantTx) => Promise<T>) => work(tx)),
  } as unknown as TenantConnectionProvider;
  const service = new ScanVerificationService(tenant, {} as SecurityAuditService);
  return { service, mutations: () => mutations };
}

describe('ScanVerificationService role/current-assignee boundary', () => {
  it.each([
    ['cook', 'host'],
    ['waiter', 'host'],
    ['host', 'waiter'],
    ['cashier', 'manager'],
  ])('bloqueia ator %s quando a etapa é %s antes de qualquer mutação', async (actor, assigned) => {
    const ctx = harness(actor, assigned);
    await expect(ctx.service.approve(REQUEST_ID, STAFF_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ctx.mutations()).toBe(0);
  });

  it.each([
    ['host', 'host'],
    ['waiter', 'waiter'],
    ['manager', 'host'],
    ['owner', 'waiter'],
  ])('permite ator %s na etapa %s (gerência pode assumir)', async (actor, assigned) => {
    const ctx = harness(actor, assigned);
    await expect(ctx.service.approve(REQUEST_ID, STAFF_ID)).rejects.toThrow('ROLE_GATE_PASSED');
    expect(ctx.mutations()).toBe(1);
  });
});
