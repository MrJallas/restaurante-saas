/**
 * Jest harness do apps/web-staff (Next 14 · React 18).
 *
 * Usa `next/jest`: o transform SWC do Next é TS/TSX-aware (sem babel/ts-jest),
 * resolve o alias `@/*` do tsconfig e carrega next.config/.env como o build real.
 *
 * Convenção de nomes espelha o apps/api: `*.test.ts(x)` → Jest.
 * Ambiente jsdom pra permitir testes de componente/hook no futuro; os testes
 * de função pura de hoje rodam igual.
 *
 * NOTA: `src/lib/api.identity.spec.ts` é um spec ts-node legado (rodável via
 * `node -r ts-node/register`), NÃO um teste Jest — por isso o testMatch pega
 * só `*.test.ts(x)`, não `*.spec.ts` (mesma convenção do apps/api).
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
