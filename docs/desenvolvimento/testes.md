# Testes

Como rodar cada suíte, o que ela cobre e o que ela exige do ambiente. Para subir o stack e criar o
restaurante de demonstração, ver [ambiente local](ambiente-local.md).

| Suíte                | Onde                                                                                         | Runner                    | Precisa do stack no ar? |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------- | ----------------------- |
| Unitários da API     | `apps/api/src/**/*.test.ts` (157 arquivos)                                                   | Jest + Supertest          | não (usa fakes)         |
| Unitários dos fronts | `apps/web-customer/src` (31), `apps/web-staff/src` (22)                                      | Jest (`next/jest`, jsdom) | não                     |
| Serviço de IA        | `services/ai-service/tests/` (17 arquivos de teste)                                          | pytest                    | não (LLM simulado)      |
| Ponta a ponta        | `apps/web-customer/e2e/specs/` (13 specs)                                                    | Playwright                | **sim, com o seed**     |
| Smoke manuais        | `apps/web-staff/__tests__/smoke-cors.test.ts`, `apps/web-staff/src/lib/api.identity.spec.ts` | `node:test`, ts-node      | a API, no smoke de CORS |

## Unitários (Jest)

```bash
npm install                                   # os node_modules do host são independentes dos containers
npm test                                      # Turborepo: api, web-customer e web-staff
npm test --workspace @restaurant/api          # jest --runInBand
npm run lint
npm run format:check                          # Prettier no repositório inteiro; hoje passa
```

- O Jest roda só `*.test.ts(x)`. Na API, os 6 `*.spec.ts` que restam são specs legados executados à mão
  com ts-node; a convenção e o modelo de teste HTTP com Supertest estão em
  [`apps/api/TESTING.md`](../../apps/api/TESTING.md).
- Os testes da API não tocam Postgres, Redis nem MongoDB reais: dependências entram como fakes.
- Checagem de tipos por pacote: `npm exec --workspace @restaurant/api -- tsc --noEmit -p tsconfig.json`
  (idem `@restaurant/web-customer` e `@restaurant/web-staff`).
- `node_modules` desatualizado no host produz falhas falsas (ex.: módulo não encontrado). Rode
  `npm install` antes, ou rode dentro do container:
  `docker exec restaurant-api sh -c "cd /repo/apps/api && npm test"` (966 de 966 no ensaio).

## Serviço de IA (pytest)

Os testes simulam o LLM: não precisam de GPU nem de chave de API. As dependências de teste ficam no
`requirements-dev.lock` (a imagem Docker instala só o `requirements.lock`, sem pytest).

```bash
cd services/ai-service
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.lock
python -m pytest -q
```

Ou dentro do container do stack, sem instalar Python no host:

```bash
docker exec restaurant-ai sh -c 'pip install -q -r requirements-dev.lock && env -i PATH="$PATH" python -m pytest -q'
```

O `env -i` é necessário: as variáveis que o Compose injeta no container (por exemplo
`AI_SERVICE_API_KEY`) mudam o comportamento dos testes, que então falham com 401. Com o ambiente
limpo, o resultado no ensaio foi 435 de 435.

## Ponta a ponta (Playwright)

Configuração em `apps/web-customer/playwright.config.ts`: WebKit com o perfil iPhone 14, geolocalização
concedida, `baseURL` em `E2E_BASE_URL` (padrão `http://localhost:3003`) e **execução em série**
(`workers: 1`, `fullyParallel: false`).

Pré-requisitos: stack no ar com o seed aplicado, Node no host com `npm install` feito e o CLI `docker`
disponível. Vários specs e helpers consultam e alteram o banco com `docker exec restaurant-postgres
psql …` (e o Redis e o MongoDB do mesmo jeito), por isso dependem dos nomes fixos de container.

```bash
cd apps/web-customer
npx playwright install webkit
npx playwright test                                                  # suíte inteira, em série
npx playwright test e2e/specs/restaurant-night-simulation.spec.ts    # uma noite completa
npx playwright show-report                                           # relatório HTML
```

- **Nunca rode dois processos do Playwright ao mesmo tempo.** Os testes compartilham o banco e as mesas
  QRTEST91/92; em paralelo, o estado de um vaza para o outro.
- `npx playwright test --list` não precisa do stack: nenhum spec consulta o banco ao carregar o arquivo,
  só dentro dos testes e dos `beforeAll`.
- Variáveis opcionais: `E2E_BASE_URL`, `E2E_API_BASE_URL`, `E2E_STAFF_BASE_URL`, `E2E_WS_BASE_URL`,
  `E2E_HOST_CPF`, `E2E_STAFF_PIN`, `E2E_STAFF_API_KEY`, `E2E_EXPECT_LLM_MODEL` e
  `TV_DELIVERY_EVIDENCE_DIR`.

| Spec                                                                | Cobre                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `critical-paths`                                                    | QR → cadastro → home, retorno com cookie, gaveta, chamar garçom, saudação ao assistente                                                           |
| `welcome-validation`                                                | cadastro do cliente, QR sem assinatura, troca de mesa, frases que não criam pedido falso                                                          |
| `physical-qr-heavy`                                                 | QR físico: fluxo antigo bloqueado, verificação pela recepção, concorrência, isolamento entre restaurantes, MongoDB fora do ar                     |
| `rejected-participant-rescan`                                       | tela do participante recusado ao escanear de novo (API simulada com `page.route`)                                                                 |
| `restaurant-night-simulation`                                       | uma noite: 3 clientes, recepção, garçom, gerente, cozinha e histórico                                                                             |
| `courtesy-arrival`                                                  | faixa de cortesia na home do cliente                                                                                                              |
| `assistente-context`, `chat-tool-delay`, `join-table-ai-typewriter` | contexto do assistente, atraso de ferramenta, pedido de entrada decidido pelo assistente                                                          |
| `sheet-drag`                                                        | arrastar e fechar as folhas inferiores                                                                                                            |
| `tv-kds`, `tv-coverage`                                             | TVs da cozinha e do bar e regressões de segurança e concorrência (limites sem `X-Forwarded-For`, IDOR, CAS, deduplicação, PII mascarada nos logs) |
| `tv-delivery-flow`                                                  | entrega TV → garçom → cliente                                                                                                                     |

O roteiro equivalente para execução manual está em [roteiro da noite](roteiro-e2e-noite.md).

### Credenciais nos testes que chamam a API

Os specs usam as mesmas credenciais que os apps usam:

- **Cliente**: o `token` devolvido pelo `session/init` vai no `x-session-token` (é um HMAC do id da
  sessão; o `sessionId` serve só para consultas no banco). Nos specs de TV, `initTvSession`
  (`e2e/helpers/tv-fixtures.ts`) devolve os dois. Ação pessoal (feedback, decisão de anfitrião) exige
  também o cliente identificado, pelo `x-recognition-token` que o `welcome` devolve em cookie.
- **Pessoa da equipe**: `staffFetch` (`e2e/helpers/physical-qr.ts`) faz login real com CPF e PIN do seed
  e manda o `x-staff-token`. A API autoriza por papel: o cozinheiro avança o preparo da cozinha, o garçom
  entrega, o gerente e o dono fazem qualquer transição e abrem o painel. Telas do `web-staff` entram
  pelo `/login` com `loginStaffApp`: o proxy só injeta credencial com o cookie `staff_token` desse login.
- **Estação (TV)**: `x-staff-key`, a chave compartilhada que o proxy injeta. Não identifica ninguém: lê
  a fila do KDS, chama o garçom e só avança preparo (`in_progress` ou `ready`) com `station`; qualquer
  outra troca de status recebe 401 `AUTH_TOKEN_REQUIRED`.

A chave vem de `e2e/helpers/staff-key.ts`, nesta ordem: `E2E_STAFF_API_KEY`, `STAFF_API_KEY` do
ambiente e `STAFF_API_KEY` do `.env` da raiz (o mesmo que o Compose lê). Sem nenhuma das três, a chave
fica vazia e a API responde 401, o que aponta direto para a configuração. Com o `.env` do tutorial, não
é preciso exportar nada.

O `GET /:slug/orders/_kds` tem cache de 3 s no Redis. Teste que insere pedido direto no banco chama
`clearKdsCache()` antes de ler a fila; e a estação do item vem de `menu_items.kind` (`drink` vai para o
bar), não do nome da categoria.

### Testes que dependem do LLM

- `assistente-context.spec.ts`, teste "pergunta aberta usa o LLM real…": falha sem LLM, por definição.
  O teste "chip/frase direta: rule-layer sem LLM…", no mesmo arquivo, passa sem ele.
- Medido sem LLM, esse é o **único** teste que falha pela ausência do modelo:
  `join-table-ai-typewriter.spec.ts` e a saudação "olá" de `critical-paths.spec.ts` passam, porque a
  camada de regras responde sem o LLM.

O `chat-tool-delay.spec.ts` simula as respostas do assistente com `page.route` e não depende do LLM.

### Efeitos no ambiente e dados que ficam

- `physical-qr-heavy` **para e religa** o container `restaurant-mongodb` (teste "Mongo fora do ar") e
  cria um segundo restaurante, `restaurant_e2e_other`, para testar o isolamento.
- `tv-kds` e `tv-coverage` trocam o segredo do QR de M01 e M02 e deixam uma sessão ativa na M01.
  O helper `e2e/helpers/tv-fixtures.ts` também deixa, sem apagar depois, o prato "Picanha (QA
  Fixture)" disponível no cardápio, um pedido âncora na sessão da M01 e o cliente de `TV_MARIA_CPF`.
- O `tv-kds` cria e apaga um cliente próprio (constante local `TEST_CPF`, diferente da de
  `e2e/helpers/session.ts`); a limpeza apaga antes verificações, participantes e visitas desse CPF.
- O `tv-delivery-flow` abre e encerra um chamado de garçom na QRTEST91, atendido pelo garçom do seed
  que tem login: a entrega vai para quem atendeu a mesa, e só esse garçom consegue entrar no app.
- Os helpers de sessão usam `TEST_CPF` e `TEST_NAME` (`e2e/helpers/session.ts`) como cliente padrão.

Recomendação: rode o E2E **depois** de qualquer roteiro manual. `bash scripts/demo/reset-mesa.sh M01` e
`M02` liberam só as mesas. Para voltar ao estado do tutorial, reaplique o seed (ele limpa também as
tabelas que os testes sujam, e foi reaplicado duas vezes seguidas depois da suíte completa) e consulte
de novo os `qr_public_token`, que mudam porque o seed recria as mesas.

### Resultado medido

Ambiente novo, `.env` do tutorial (segredos gerados, `HOME_CONTINUATION_ENABLED=false`), seed do
passo 4 e sem LLM: **144 de 146** execuções passam, igual em duas rodadas seguidas (ambiente recém-criado
e depois de reaplicar o seed).

| Quantidade          | Onde                 | Causa                                                                |
| ------------------- | -------------------- | -------------------------------------------------------------------- |
| 1 + 1 não executada | `assistente-context` | o teste da pergunta aberta exige LLM; o seguinte, em série, não roda |

Condições da medição (2026-09-24): Chromium com o perfil iPhone 14 (a máquina não tinha acesso ao
download do WebKit do Playwright), PostgreSQL, Redis e MongoDB nos containers do Compose e API, apps
web e serviço de IA rodando direto no Linux, com as mesmas variáveis do Compose. Falta confirmar em
WebKit, o navegador da configuração padrão.

A suíte tem 146 testes, e não 142: no `tv-kds`, três testes em que a chave compartilhada bastava
viraram pares com o contrato atual, em que a chave sozinha recebe 401 e o caminho autorizado recebe
200 (sessão individual da equipe, ou a TV informando a estação): troca de status direto na API e pelo
proxy da TV, e painel do gerente. O quarto a mais é a rajada paralela do `welcome` no `tv-coverage`
(P1-X7-3), que confere que o limite processa exatamente 30.

Medição anterior, no mesmo dia, em WebKit e antes das correções: 99 de 142. As 43 que não passavam
eram os specs de TV escritos para o modelo de autenticação anterior (26), o seletor de um botão
"Fechar" que as folhas não têm mais (5), o `scan_verification.resolved` que não chegava ao garçom no
fim da escalada (1, mais 9 cenários que não rodavam depois dele) e o teste que exige LLM (1 + 1).

Com `HOME_CONTINUATION_ENABLED=true` (padrão do Compose quando a variável não existe), mais 5 testes
falham, porque a home troca os botões "Chamar garçom" e "Ver cardápio" pelas sugestões do assistente;
o `.env.example` usa `false`.

### Evidências

- Specs que salvam capturas gravam em `output/evidencias/<spec>/` na raiz; o `tv-delivery-flow` grava em
  `TV_DELIVERY_EVIDENCE_DIR` (padrão `/tmp/tv-delivery-e2e`). `output/` é ignorado pelo Git.
- `test-results/` e `playwright-report/` são saídas do próprio Playwright (ignoradas); `test-results/` é
  limpo a cada execução.

## Smoke manuais

- `apps/web-staff/__tests__/smoke-cors.test.ts`: confere o preflight de CORS da origem `:3002`. Usa o
  runner `node:test` e a API no ar: `node --test --import tsx apps/web-staff/__tests__/smoke-cors.test.ts`.
- `apps/web-staff/src/lib/api.identity.spec.ts`: spec ts-node legado, fora do Jest.

## Roteiros de gravação (não são testes)

`apps/web-customer/e2e/demo-linkedin/` dirige a interface para gravar vídeos de demonstração. Não faz
asserção de produto e só roda com a própria configuração:
`npx playwright test -c e2e/demo-linkedin/demo.config.ts`. Os vídeos saem fora do repositório por
padrão (`DEMO_OUT_DIR`); o `noite.demo.ts` grava em `apps/web-customer/output/demo-noite`
(`DEMO_NOITE_DIR`).

## Critério de qualidade (matriz RQS)

As rodadas de auditoria usaram uma nota de 100 pontos:

| Dimensão                                                                           | Pontos |
| ---------------------------------------------------------------------------------- | -----: |
| Build, tipos, lint, migrations e `git diff --check`                                |     15 |
| E2E crítico (QR, cadastro, aprovação, pedido, KDS, garçom, pagamento, LGPD, noite) |     25 |
| API, dados e segurança (auth, papéis, isolamento, idempotência, WS)                |     20 |
| Interface por persona                                                              |     15 |
| Sem placebo (botão faz ação real ou declara a indisponibilidade)                   |     10 |
| Evidência e reprodutibilidade                                                      |     10 |
| Desempenho e instabilidade                                                         |      5 |

`PASS`: nota ≥ 90, nenhum P0, nenhum P1 confirmado em fluxo crítico, nenhum risco alto de segurança e
comandos obrigatórios verdes. `PARTIAL`: 75–89, ou P1 disputado, ou cobertura só manual. `FAIL`: nota
< 75, qualquer P0 ou risco alto, build ou E2E obrigatório falhando.

## Números de referência (histórico)

Na auditoria de 2026-07-11, cada uma das duas rodadas finais executou 1.597 testes (API 935,
web-customer 167, web-staff 87, serviço de IA 408), mais `format:check`, lint e build forçados e a noite
em Playwright. Nota técnica 96/100, classificada `PARTIAL` pelo risco aceito do login do cliente só por
CPF. Detalhes em
[`docs/archive/qa/2026-07-11-auditoria-integral/FINAL-REPORT.md`](../archive/qa/2026-07-11-auditoria-integral/FINAL-REPORT.md).
São números de uma data: a quantidade de testes mudou desde então.
