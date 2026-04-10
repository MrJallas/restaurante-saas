import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';

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
    maxAgeMs = 24 * 60 * 60 * 1000,
  ): boolean {
    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age < 0 || age > maxAgeMs) {
      return false;
    }

    const expected = this.generateHmac(tableCode, secret, timestamp);
    return expected === signature;
  }
}
