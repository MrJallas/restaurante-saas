import { buildWaitingUrl } from './ScreenCustomerIdentifyBeforeJoin';

describe('buildWaitingUrl security boundary', () => {
  const input = {
    slug: 'bistro',
    requestId: '11111111-1111-4111-8111-111111111111',
  };

  it.each([
    '//evil.test/waiting-approval',
    '/\\evil.test/waiting-approval',
    'javascript:alert(document.domain)//waiting-approval',
    '/outro/waiting-approval',
    '/bistro/assistente',
  ])('faz fail-closed para base não autorizada %s', (base) => {
    expect(buildWaitingUrl({ ...input, base })).toBe(
      '/bistro/waiting-approval?requestId=11111111-1111-4111-8111-111111111111',
    );
  });

  it('preserva apenas query segura da landing e adiciona estado autoritativo', () => {
    expect(
      buildWaitingUrl({
        ...input,
        base: '/bistro/waiting-approval?mode=late-arrival',
        expiresAt: '2026-07-11T12:00:00.000Z',
        hostName: 'Ana',
      }),
    ).toBe(
      '/bistro/waiting-approval?mode=late-arrival&requestId=11111111-1111-4111-8111-111111111111&expiresAt=2026-07-11T12%3A00%3A00.000Z&hostName=Ana',
    );
  });
});
