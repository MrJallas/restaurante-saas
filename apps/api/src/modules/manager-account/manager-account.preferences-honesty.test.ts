import { BadRequestException } from '@nestjs/common';
import { ManagerAccountService } from './manager-account.service';

describe('ManagerAccountService preference honesty', () => {
  const service = new ManagerAccountService({} as never, {} as never, {} as never);

  it.each([
    { notifications: { 'turn.push': true } },
    { twoFactorEnabled: true },
    { theme: 'dark' as const, twoFactorEnabled: false },
  ])('rejects unsupported preferences before touching persistence: %o', async (patch) => {
    try {
      await service.updatePreferences('demo-bistro', 'staff-1', patch);
      throw new Error('Expected unsupported preference update to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'FEATURE_NOT_AVAILABLE',
      });
    }
  });
});
