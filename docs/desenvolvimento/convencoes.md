# Convenções de engenharia

Regras que valem para qualquer mudança no repositório. Cada uma existe por causa de um defeito real
que já aconteceu; o motivo vem junto.

## Migrations

- Ficam em `packages/database/migrations/`: `public/` (tabelas globais) e `tenant-template/` (aplicadas
  em cada restaurante). Numeração sequencial; o número 051 não existe.
- **Toda migration é idempotente.** Use `CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` e, para o
  resto, um bloco `DO $$ … IF NOT EXISTS … END $$`. Exemplo: `037_table_merge_cooldown_directional.sql`.
- **Migration aplicada nunca é editada**, nem o comentário. Correção entra numa migration nova.
- O runner `packages/database/scripts/migrate-tenants.ts` registra o que já rodou na tabela
  `__migrations__` de cada schema e roda no boot da API. Falha de migration derruba o boot; sem
  restaurantes, ele só avisa e sai com sucesso. Decisão em
  [ADR 0010](../decisoes/0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md).

## SQL e acesso a dados

- Todo `UPDATE`/`DELETE … RETURNING` consumido passa por `unwrapRows` ou `unwrapAffected`
  (`apps/api/src/modules/tenant/query-utils.ts`). O driver devolve a tupla `[rows, rowCount]`, e o cast
  direto fez um guarda de "vazio" nunca disparar: uma recursão infinita esgotou a memória da API.
  `INSERT … RETURNING` (inclusive com `ON CONFLICT DO UPDATE`) volta plano. Fakes de teste devem
  imitar a tupla.
- `NUMERIC` e agregações (`SUM`) chegam como **string** do driver `pg`: converta antes de somar
  (ex.: `billing.service.ts`).
- No SQL por estação do KDS, mantenha o cast `$1::varchar` no `SET status` e no `CASE`
  (`orders.service.ts`). Sem ele o PostgreSQL responde erro 42P08, embora os testes com fakes passem.
- Dinheiro é calculado no servidor (taxa de serviço e rateio no `BillingService`); o front só exibe.
  Ver [ADR 0011](../decisoes/0011-calcular-taxa-de-servico-e-rateio-da-mesa-no-backend.md).

## Estados operacionais

- Erro e carregamento **não** são vazio, "tudo tranquilo" nem "não encontrado". Em falha, a tela
  preserva o último dado válido, mostra o erro da fonte e oferece nova tentativa.
- Nenhuma ação que altera dados fica habilitada antes de carregar a entidade autoritativa (QR, chamado,
  reserva, fila, entrega). Não use valores padrão de mesa, tipo ou pessoa para liberar um botão.

## Sem placebo

- Botão sem efeito real no backend é defeito. Se a funcionalidade ainda não existe, a interface diz
  isso explicitamente (ex.: pagamento Pix marcado como simulado; caixa "ainda não ativado").
- Nunca capture um erro e mostre sucesso (`catch { setSuccess() }`).

## Evidência de teste

- Capturas, traces, vídeos e dumps não entram no Git. Evidência nova vai para `output/` (ignorado); o
  Playwright limpa `test-results/` a cada execução.
- Relatório curado de uma rodada de verificação vai para `docs/archive/qa/<data>-<slug>/`, em texto:
  resumo, comandos, ambiente e antes/depois do banco. No máximo uma ou duas capturas por falha.

## Formatação e lint

- Prettier (`.prettierrc`: aspas simples, vírgula final, 100 colunas). `npm run format` formata e
  `npm run format:check` confere o repositório inteiro. O `.prettierignore` deixa de fora o material
  histórico (`docs/archive/`), o protótipo de design (`docs/design/canvas/`), saídas de ferramentas e
  arquivos gerados.
- ESLint com `@typescript-eslint` (`.eslintrc.json`; `npm run lint` via Turborepo). Variáveis não usadas
  são erro, salvo com prefixo `_`.

## Dependências Python

- O serviço de IA usa Python 3.11. A imagem Docker instala só o `requirements.lock`; os testes usam o
  `requirements-dev.lock`.
- Ao mudar dependências, regenere os dois locks para Python 3.11 e rode `pip-audit` contra o lock.

## Commits

- Padrão Conventional Commits em português: `tipo(escopo): descrição no presente`, com `feat`, `fix`,
  `refactor`, `test`, `docs`, `style` e `chore`. Exemplo do histórico:
  `test(e2e): chave de staff vem do .env, sem literal fixo`.
- Uma unidade de trabalho por commit: código, teste e documentação da mesma mudança juntos. Mudou
  comportamento, contrato ou rota? Atualize o doc correspondente em `docs/` e, se for decisão, o ADR.

## Fluxo de correção de defeito

1. Reproduza o defeito (teste automatizado ou roteiro manual).
2. Escreva um teste que falha por causa dele.
3. Aplique a correção mínima.
4. Rode a suíte inteira da área, incluindo o teste novo: tudo verde.
5. Registre a evidência (antes e depois) em `output/` ou no relatório da rodada.

Defeito sem teste tende a voltar; suíte que não roda inteira não protege.

## Telas com visual congelado

Sete superfícies do app do cliente seguem a linguagem visual V20 e não mudam de aparência sem decisão
explícita do autor. Correções funcionais que não alteram o visual são permitidas. Lista e motivo em
[design](../design/README.md) e no
[ADR 0012](../decisoes/0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md).
