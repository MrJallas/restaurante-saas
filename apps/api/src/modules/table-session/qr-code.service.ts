import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class QrCodeService {
  generateHmac(tableCode: string, secret: string, timestamp: string): string {
    const data = `${tableCode}:${timestamp}`;
    return createHmac('sha256', secret).update(data).digest('hex');
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
}
