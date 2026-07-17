import type { ScanVerificationRequestDto } from '@restaurant/shared-types';
import { canHostDecideScan } from './ScreenHostScanVerification';

function requestFor(role: ScanVerificationRequestDto['currentAssigneeRole']) {
  return { currentAssigneeRole: role } as ScanVerificationRequestDto;
}

describe('scan verification — etapa atual da cascata', () => {
  it('falha fechado enquanto a solicitação ainda não foi carregada', () => {
    expect(canHostDecideScan(null)).toBe(false);
  });

  it('host decide somente enquanto a etapa pertence à recepção', () => {
    expect(canHostDecideScan(requestFor('host'))).toBe(true);
    expect(canHostDecideScan(requestFor('manager'))).toBe(false);
    expect(canHostDecideScan(requestFor('waiter'))).toBe(false);
  });
});
