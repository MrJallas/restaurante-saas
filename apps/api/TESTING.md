# Testes do apps/api — Jest/Supertest (prompt 100 §5.4)

Decisão Caleb 2026-06-11: formalizar Jest + Supertest no workspace, com
migração gradual dos specs ts-node.

## Rodar

```bash
npm test --workspace @restaurant/api      # jest --runInBand
```

## Convenção de nomes

| Sufixo | O que é | Quem roda |
|---|---|---|
| `*.test.ts` | Teste Jest (unit ou HTTP/supertest). **Padrão novo.** | `npm test` |
| `*.spec.ts` | Spec ts-node legado (type-checked pelo `tsc`; executável via `node -r ts-node/register`). | manual |

O Jest só executa `*.test.ts` (ver `jest.config.js`) — specs legados não
quebram a suíte enquanto não forem migrados.

## Migrar um spec ts-node → Jest

1. Renomeie `foo.spec.ts` → `foo.test.ts`.
2. Troque a função `runFooAssertions()` + `throw new Error(...)` por
   `describe/it` + `expect(...)`.
3. Remova o bloco `if (require.main === module)`.
4. Fakes existentes (fake `TenantConnectionProvider`, fake Mongo
   `Collection`, fake `ExecutionContext`) continuam valendo — só o runner
   muda.

Migrados como prova (2026-06-12): `round17-contract.test.ts`,
`table-session/qr-code.service.test.ts`, `alerts/alerts.service.test.ts`.

## Padrão Supertest (HTTP-level)

Template: `src/modules/continuation/continuation.controller.test.ts`.

```ts
const moduleRef = await Test.createTestingModule({
  controllers: [MeuController],
  providers: [{ provide: MeuService, useValue: fake }],
})
  .overrideGuard(MeuGuard)
  .useValue({ canActivate: () => true })
  .compile();

app = moduleRef.createNestApplication();
// SEMPRE espelhar o pipeline do main.ts:
app.useGlobalPipes(
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
);
await app.init();

await request(app.getHttpServer())
  .post('/restaurant_dev/minha-rota')
  .send({ ... })
  .expect(201);
```

Pontos de atenção:

- As rotas são `:slug/...` — use um slug literal no path do supertest.
- Sem a `ValidationPipe` global o teste valida MENOS que a produção.
- Guards com dependência de DB/Redis: `overrideGuard(...).useValue(...)`.
- DB/Redis/Mongo reais ficam FORA da suíte — injete fakes via
  `providers: [{ provide: X, useValue: ... }]` (exemplos em
  `continuation.service.test.ts`: fake tenantConn roteado por substring
  de SQL + fake Redis em memória + `global.fetch` mockado).
