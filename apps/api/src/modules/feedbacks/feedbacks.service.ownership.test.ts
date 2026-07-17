import { ForbiddenException } from '@nestjs/common';
import { FeedbacksService } from './feedbacks.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const SESSION = '11111111-1111-4111-8111-111111111111';
const VISIT = '22222222-2222-4222-8222-222222222222';
const CALLER = '33333333-3333-4333-8333-333333333333';

describe('FeedbacksService visit ownership', () => {
  it('não consome a avaliação única de uma visita alheia na mesma mesa', async () => {
    const query = jest.fn(async () => []);
    const service = new FeedbacksService({ query } as unknown as TenantConnectionProvider);
    await expect(
      service.submitFeedback({ visitId: VISIT, customerId: CALLER, overallRating: 5 }, SESSION),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('v.customer_id = $3'), [
      VISIT,
      SESSION,
      CALLER,
    ]);
  });

  it('exige identidade individual para leitura e escrita', async () => {
    const service = new FeedbacksService({
      query: jest.fn(),
    } as unknown as TenantConnectionProvider);
    await expect(
      service.submitFeedback({ visitId: VISIT, customerId: null, overallRating: 5 }, SESSION),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getFeedbackByVisit(VISIT, SESSION, null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
