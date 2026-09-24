/**
 * P1-F: fail-fast do STAFF_API_KEY no boot. Prova que producao rejeita
 * chave ausente e o literal committado comprometido, e que dev nao trava.
 */

import { assertStaffKeyConfigured, KNOWN_LEAKED_STAFF_KEY } from './assert-staff-key';

function makeLogger() {
  return { warn: jest.fn() };
}

describe('assertStaffKeyConfigured', () => {
  it('lanca em producao quando STAFF_API_KEY esta ausente', () => {
    const logger = makeLogger();
    expect(() =>
      assertStaffKeyConfigured(logger, { NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/STAFF_API_KEY/);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('lanca em producao quando usa o default committado comprometido', () => {
    const logger = makeLogger();
    expect(() =>
      assertStaffKeyConfigured(logger, {
        NODE_ENV: 'production',
        STAFF_API_KEY: KNOWN_LEAKED_STAFF_KEY,
      } as NodeJS.ProcessEnv),
    ).toThrow(/committado|comprometido|rotacione/i);
  });

  it('passa em producao com uma chave real setada', () => {
    const logger = makeLogger();
    expect(() =>
      assertStaffKeyConfigured(logger, {
        NODE_ENV: 'production',
        STAFF_API_KEY: 'a-unique-rotated-secret-value',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('em dev sem chave apenas avisa, nao trava', () => {
    const logger = makeLogger();
    expect(() =>
      assertStaffKeyConfigured(logger, { NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('em dev tolera o literal de dev antigo (KNOWN_LEAKED_STAFF_KEY)', () => {
    const logger = makeLogger();
    expect(() =>
      assertStaffKeyConfigured(logger, {
        NODE_ENV: 'development',
        STAFF_API_KEY: KNOWN_LEAKED_STAFF_KEY,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
