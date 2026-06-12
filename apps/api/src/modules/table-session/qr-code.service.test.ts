/**
 * Daily access token + legacy HMAC contracts do QR fixo. MIGRADO de
 * `qr-code.service.spec.ts` (ts-node) pra Jest no prompt 100 §5.4.
 */

import { QrCodeService } from './qr-code.service';

describe('QrCodeService', () => {
  const service = new QrCodeService();
  const tableCode = 'M01';
  const secret = 'table-secret';
  const today = new Date('2026-05-18T12:00:00.000Z');
  const yesterday = new Date('2026-05-17T12:00:00.000Z');

  describe('daily access token', () => {
    const token = service.generateDailyAccessToken(tableCode, secret, today);

    it('accepts a token generated for the same day', () => {
      expect(service.validateDailyAccessToken(tableCode, token, secret, today)).toBe(true);
    });

    it('rejects a token from another day', () => {
      expect(service.validateDailyAccessToken(tableCode, token, secret, yesterday)).toBe(false);
    });

    it('rejects a token for another table', () => {
      expect(service.validateDailyAccessToken('M02', token, secret, today)).toBe(false);
    });

    it('rejects a token signed with another secret', () => {
      expect(
        service.validateDailyAccessToken(tableCode, token, 'wrong-secret', today),
      ).toBe(false);
    });

    it('rejects a malformed signature', () => {
      expect(
        service.validateDailyAccessToken(tableCode, '2026-05-18.bad', secret, today),
      ).toBe(false);
    });
  });

  describe('legacy HMAC (ts-based)', () => {
    it('accepts a fresh HMAC and rejects one older than 30 minutes', () => {
      const ts = `${today.getTime()}`;
      const hmac = service.generateHmac(tableCode, secret, ts);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(today.getTime());
      try {
        expect(service.validateHmac(tableCode, hmac, ts, secret)).toBe(true);
        expect(
          service.validateHmac(
            tableCode,
            hmac,
            `${today.getTime() - 31 * 60 * 1000}`,
            secret,
          ),
        ).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });
});
