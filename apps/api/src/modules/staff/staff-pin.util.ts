import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

// OWASP A02 (2026-07-05): PINs de staff eram SHA-256 SEM SAL, single-round —
// keyspace de 4-6 dígitos + hash rápido sem sal deixava um dump de
// `staff.pin_hash` reversível por rainbow table (inclusive o PIN do manager),
// e hashes idênticos vazavam PINs iguais entre staff e ENTRE TENANTS. Agora o
// hash é bcrypt: sal por-usuário embutido nos 60 chars + custo configurável,
// então o mesmo PIN gera hashes distintos e um dump não é mais reversível
// offline em tempo hábil.
//
// Migração TRANSPARENTE (sem forçar reset de ninguém): `hashPin` já grava
// bcrypt, e `verifyPin` detecta o formato do hash ARMAZENADO — bcrypt novo vs
// SHA-256 legado (hex de 64 chars). No login/troca, quando um hash legado bate
// pela verificação antiga, o chamador re-hasheia com bcrypt e faz UPDATE
// (backfill lazy — o plaintext do PIN só existe ali). Chaves antigas somem à
// medida que cada staff loga.

// Custo do bcrypt. 10 é o default consagrado (~50-100ms), folgado pra um
// keyspace de PIN e defendido online pelo lockout do Redis; o gargalo real
// desta migração é o ataque OFFLINE sobre um dump, e o sal por-usuário + o
// custo já matam a rainbow table.
const BCRYPT_ROUNDS = 10;

// Hash legado: SHA-256 hex (exatamente 64 chars hexadecimais). bcrypt começa
// com `$2a$`/`$2b$`/`$2y$`, então os dois formatos nunca colidem.
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

/**
 * Hasheia um PIN com bcrypt (sal por-usuário embutido). Usado em TODO caminho
 * de escrita: criação de staff, changePin, resetPin, reset do gerente.
 */
export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, BCRYPT_ROUNDS);
}

/**
 * Hash SHA-256 legado (sem sal). NÃO usar pra gravar — existe só pra
 * reconhecer/verificar hashes antigos ainda no banco até o backfill lazy.
 */
export function legacySha256Hash(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * True se `storedHash` é um hash SHA-256 legado (candidato a backfill).
 * bcrypt (`$2...`) retorna false.
 */
export function isLegacyPinHash(storedHash: string | null | undefined): boolean {
  return typeof storedHash === 'string' && SHA256_HEX_RE.test(storedHash);
}

/**
 * Verifica um PIN em PLAINTEXT contra o hash ARMAZENADO, detectando o formato:
 * - bcrypt (`$2...`): compareSync (timing-safe internamente).
 * - SHA-256 legado (hex 64): comparação timing-safe do digest.
 *
 * Sempre roda uma comparação real (mesmo com hash vazio/ inválido) pra não
 * abrir um oráculo de timing sobre a existência/formato do hash.
 */
export function verifyPin(pin: string, storedHash: string | null | undefined): boolean {
  if (isLegacyPinHash(storedHash)) {
    return timingSafeEqualHex(storedHash as string, legacySha256Hash(pin));
  }
  // Não-bcrypt e não-SHA256 (hash ausente/corrompido): bcrypt.compareSync
  // devolve false sem lançar, mantendo o caminho timing-consistente.
  try {
    return bcrypt.compareSync(pin, typeof storedHash === 'string' ? storedHash : '');
  } catch {
    return false;
  }
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
