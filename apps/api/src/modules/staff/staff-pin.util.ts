import * as crypto from 'crypto';

export function hashPin(pin: string): string {
  // SHA-256 sem salt mantem compatibilidade com os PINs seedados atuais.
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
