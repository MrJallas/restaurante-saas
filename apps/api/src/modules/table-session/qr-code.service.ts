import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export type DailyAccessTokenRejectionReason =
  | 'missing'
  | 'malformed'
  | 'expired'
  | 'invalid';

export interface DailyAccessTokenValidationResult {
  valid: boolean;
  reason?: DailyAccessTokenRejectionReason;
}

@Injectable()
export class QrCodeService {
  generateHmac(tableCode: string, secret: string, timestamp: string): string {
    const data = `${tableCode}:${timestamp}`;
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  generateDailyAccessToken(
    tableCode: string,
    secret: string,
    date = new Date(),
  ): string {
    const day = this.dayKey(date);
    const signature = createHmac('sha256', secret)
      .update(`qr-access:${tableCode}:${day}`)
      .digest('hex');
    return `${day}.${signature}`;
  }

  validateDailyAccessToken(
    tableCode: string,
    token: string | null | undefined,
    secret: string,
    date = new Date(),
  ): boolean {
    return this.validateDailyAccessTokenDetailed(
      tableCode,
      token,
      secret,
      date,
    ).valid;
  }

  validateDailyAccessTokenDetailed(
    tableCode: string,
    token: string | null | undefined,
    secret: string,
    date = new Date(),
  ): DailyAccessTokenValidationResult {
    if (!token) return { valid: false, reason: 'missing' };
    const [day, signature] = token.split('.');
    if (!day || !signature || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return { valid: false, reason: 'malformed' };
    }
    if (day !== this.dayKey(date)) {
      return { valid: false, reason: 'expired' };
    }

    const expected = createHmac('sha256', secret)
      .update(`qr-access:${tableCode}:${day}`)
      .digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return { valid: false, reason: 'invalid' };
    return timingSafeEqual(a, b)
      ? { valid: true }
      : { valid: false, reason: 'invalid' };
  }

  validateHmac(
    tableCode: string,
    signature: string,
    timestamp: string,
    secret: string,
    maxAgeMs = 30 * 60 * 1000,
  ): boolean {
    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age < 0 || age > maxAgeMs) {
      return false;
    }

    const expected = this.generateHmac(tableCode, secret, timestamp);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
