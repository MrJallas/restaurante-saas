import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ManagerOnlyGuard } from '../common/guards/manager-only.guard';
import { StaffOnlyGuard } from '../common/guards/staff-only.guard';
import { DashboardController } from './dashboard/dashboard.controller';
import { StaffController } from './staff/staff.controller';
import { CustomerStaffMessagesController } from './customer-staff-messages/customer-staff-messages.controller';

function guardsOn(target: object, method?: string): unknown[] {
  const source = method
    ? (target as Record<string, unknown>)[method]
    : (target as { constructor: unknown }).constructor;
  return Reflect.getMetadata(GUARDS_METADATA, source as object) ?? [];
}

function expectManagerBoundary(target: object, method?: string) {
  expect(guardsOn(target, method)).toContain(ManagerOnlyGuard);
}

describe('management data boundaries', () => {
  it('dashboard financeiro/analytics inteiro exige manager', () => {
    expectManagerBoundary(DashboardController.prototype);
    expect(guardsOn(DashboardController.prototype)).toEqual(
      expect.arrayContaining([StaffOnlyGuard, ManagerOnlyGuard]),
    );
  });

  it('roster com PII e performance individual exigem manager', () => {
    expectManagerBoundary(StaffController.prototype, 'list');
    expectManagerBoundary(StaffController.prototype, 'getById');
    expectManagerBoundary(StaffController.prototype, 'getPerformance');
  });

  it('inbox customer→staff e respostas exigem manager', () => {
    expectManagerBoundary(CustomerStaffMessagesController.prototype, 'listStaffThreads');
    expectManagerBoundary(CustomerStaffMessagesController.prototype, 'getStaffThreadMessages');
    expectManagerBoundary(CustomerStaffMessagesController.prototype, 'markStaffRead');
    expectManagerBoundary(CustomerStaffMessagesController.prototype, 'staffReply');
  });
});
