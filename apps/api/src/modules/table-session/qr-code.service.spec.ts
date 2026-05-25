/**
 * Contract assertions for the fixed-QR daily access token layer.
 *
 * apps/api does not ship a Jest runner today, so this follows the existing
 * project convention: the file is type-checked by `tsc`/Nest build and can be
 * executed directly with `npx ts-node`.
 */

import { QrCodeService } from './qr-code.service';

/* eslint-disable no-console */
export function runQrCodeServiceAssertions(): void {
  const service = new QrCodeService();
  const tableCode = 'M01';
  const secret = 'table-secret';
  const today = new Date('2026-05-18T12:00:00.000Z');
  const yesterday = new Date('2026-05-17T12:00:00.000Z');

  const token = service.generateDailyAccessToken(tableCode, secret, today);

  if (!service.validateDailyAccessToken(tableCode, token, secret, today)) {
    throw new Error('QR access token generated for the same day was rejected.');
  }

  if (service.validateDailyAccessToken(tableCode, token, secret, yesterday)) {
    throw new Error('QR access token from another day was accepted.');
  }

  if (service.validateDailyAccessToken('M02', token, secret, today)) {
    throw new Error('QR access token for another table was accepted.');
  }

  if (service.validateDailyAccessToken(tableCode, token, 'wrong-secret', today)) {
    throw new Error('QR access token signed with another secret was accepted.');
  }

  if (service.validateDailyAccessToken(tableCode, '2026-05-18.bad', secret, today)) {
    throw new Error('Malformed QR access token signature was accepted.');
  }

  const ts = `${today.getTime()}`;
  const hmac = service.generateHmac(tableCode, secret, ts);
  const realNow = Date.now;
  try {
    Date.now = () => today.getTime();
    if (!service.validateHmac(tableCode, hmac, ts, secret)) {
      throw new Error('Legacy QR HMAC generated for current timestamp was rejected.');
    }
    if (service.validateHmac(tableCode, hmac, `${today.getTime() - 31 * 60 * 1000}`, secret)) {
      throw new Error('Legacy QR HMAC older than 30 minutes was accepted.');
    }
  } finally {
    Date.now = realNow;
  }

  console.log('qr-code.service assertions OK');
}

if (require.main === module) {
  runQrCodeServiceAssertions();
}
