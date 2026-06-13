/**
 * Jest do apps/api (prompt 100 §5.4 — decisão Caleb 2026-06-11).
 *
 * Convenção de nomes:
 *  - `*.test.ts`  → testes Jest (unit + supertest). É o padrão NOVO.
 *  - `*.spec.ts`  → specs ts-node legados (type-checked pelo tsc, rodáveis
 *    via `node -r ts-node/register`). Migrar gradualmente pra `.test.ts`
 *    — ver TESTING.md. Jest NÃO os executa de propósito.
 *
 * `npm test --workspace @restaurant/api` roda tudo em banda única
 * (--runInBand) — os testes usam fakes (sem DB/Redis reais), mas a banda
 * única evita flutuação de ordem enquanto a suíte cresce.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.json',
        // Specs validam DTOs com class-validator — precisa dos decorators.
        diagnostics: { warnOnly: false },
      },
    ],
  },
  clearMocks: true,
};
