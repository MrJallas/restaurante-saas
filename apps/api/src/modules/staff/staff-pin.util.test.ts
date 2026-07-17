import {
  generateTemporaryPin,
  hashPin,
  verifyPin,
  isLegacyPinHash,
  legacySha256Hash,
  timingSafeEqualHex,
} from './staff-pin.util';

/**
 * OWASP A02 (2026-07-05) — migração transparente SHA-256 → bcrypt.
 *
 * O ponto do fix: `hashPin` grava bcrypt (sal por-usuário), e `verifyPin`
 * detecta o formato do hash ARMAZENADO pra continuar aceitando PINs cujo hash
 * ainda é o SHA-256 legado, até o backfill lazy migrá-los. Esta bateria fixa o
 * contrato do util isolado; a migração no login/changePin é coberta nos testes
 * do staff-auth.service.
 */
describe('staff-pin.util — bcrypt migration', () => {
  it('gera PIN temporário server-side sempre com seis dígitos', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generateTemporaryPin()).toMatch(/^\d{6}$/);
    }
  });

  it('hashPin gera bcrypt (60 chars, prefixo $2) e NÃO é determinístico (sal por-usuário)', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(a).toMatch(/^\$2[aby]\$/);
    expect(a).toHaveLength(60);
    // Mesmo PIN → hashes distintos: um dump não mais revela PINs iguais entre
    // staff nem entre tenants.
    expect(a).not.toBe(b);
    expect(isLegacyPinHash(a)).toBe(false);
  });

  it('verifyPin aceita o PIN certo e rejeita o errado no hash bcrypt novo', () => {
    const hash = hashPin('987654');
    expect(verifyPin('987654', hash)).toBe(true);
    expect(verifyPin('000000', hash)).toBe(false);
  });

  it('verifyPin ainda aceita o PIN certo num hash SHA-256 LEGADO (transparência)', () => {
    const legacy = legacySha256Hash('4321');
    expect(isLegacyPinHash(legacy)).toBe(true);
    expect(legacy).toHaveLength(64);
    expect(verifyPin('4321', legacy)).toBe(true);
    expect(verifyPin('0000', legacy)).toBe(false);
  });

  it('verifyPin não estoura com hash ausente/vazio/corrompido → false', () => {
    expect(verifyPin('1234', null)).toBe(false);
    expect(verifyPin('1234', undefined)).toBe(false);
    expect(verifyPin('1234', '')).toBe(false);
    expect(verifyPin('1234', 'nao-e-hash-nenhum')).toBe(false);
  });

  it('isLegacyPinHash: só hex de 64 chars conta como legado', () => {
    expect(isLegacyPinHash(legacySha256Hash('1'))).toBe(true);
    expect(isLegacyPinHash(hashPin('1'))).toBe(false);
    expect(isLegacyPinHash('deadbeef')).toBe(false); // curto demais
    expect(isLegacyPinHash('g'.repeat(64))).toBe(false); // não é hex
  });

  it('timingSafeEqualHex segue comparando hex de mesmo comprimento (util legado preservado)', () => {
    const h = legacySha256Hash('5555');
    expect(timingSafeEqualHex(h, legacySha256Hash('5555'))).toBe(true);
    expect(timingSafeEqualHex(h, legacySha256Hash('4444'))).toBe(false);
    expect(timingSafeEqualHex(h, 'abc')).toBe(false); // comprimentos diferentes
  });
});
