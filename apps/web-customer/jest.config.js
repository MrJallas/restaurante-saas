/**
 * Jest harness do apps/web-customer (Next 14 · React 18).
 *
 * Usa `next/jest`: o transform SWC do Next é TS/TSX-aware (sem babel/ts-jest),
 * resolve o alias `@/*` do tsconfig e carrega next.config/.env como o build real.
 * Isso é o que faz o `src/lib/orderPayload.test.ts` (que já existia mas nunca
 * rodava porque o babel não era TS-aware) finalmente executar.
 *
 * Convenção de nomes espelha o apps/api: `*.test.ts(x)` → Jest.
 * Ambiente jsdom pra permitir testes de componente/hook no futuro; os testes
 * de função pura de hoje (orderPayload) rodam igual.
 */
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
};

module.exports = createJestConfig(config);
