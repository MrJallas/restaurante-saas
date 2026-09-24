# packages/shared-types — contratos entre API e fronts

Tipos TypeScript compartilhados pela API (`apps/api`) e pelos dois apps web (`apps/web-customer`,
`apps/web-staff`): DTOs das rotas REST, estados de domínio e os eventos do Socket.IO. Não tem lógica
de runtime além de poucas constantes (ex.: `OWNER_SETTINGS_DAYS`).

## Como é consumido

- O `package.json` aponta `main` e `types` para `./src/index.ts`: os consumidores leem o **código-fonte**,
  não um build. Os três declaram a dependência `"@restaurant/shared-types": "*"` (workspace npm).
- Nos dois fronts, o Next transpila o pacote (`transpilePackages: ['@restaurant/shared-types']` no
  `next.config.js`).
- Na API, todos os imports do pacote são só de tipo (`import type`), apagados na compilação.
- O script `build` (`tsc` → `dist/`) existe, mas nenhum consumidor usa o `dist/`. Não há testes; a
  garantia vem do `tsc` e do build de cada app.

**Mudar um tipo aqui quebra os dois lados em tempo de compilação.** É o objetivo: API e fronts não
podem divergir num contrato sem que o `tsc` acuse. Depois de alterar um arquivo, rode a checagem de
tipos dos três apps (comandos em [testes](../../docs/desenvolvimento/testes.md#unitários-jest)).

## Arquivos por domínio

| Arquivo                                        | Conteúdo                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `index.ts`                                     | tipos básicos (pedido, pagamento, mesa, chamado) e reexportações      |
| `ws-events.ts`                                 | união discriminada dos eventos do Socket.IO, com o payload de cada um |
| `customer-host.ts`                             | cliente-anfitrião, participantes e junção de mesas                    |
| `scan-verification.ts`                         | verificação do primeiro scan pela recepção                            |
| `host.ts`                                      | telas da recepção                                                     |
| `ai.ts`                                        | contrato com o assistente de IA                                       |
| `chat-history.ts`, `lgpd.ts`                   | histórico do assistente e pedidos de exclusão de dados                |
| `complaint.ts`                                 | reclamações e ações sobre elas                                        |
| `courtesy.ts`                                  | cortesias                                                             |
| `vip.ts`                                       | marcações da sessão (VIP)                                             |
| `zone-pause.ts`                                | pausa de garçom por zona                                              |
| `staff-message.ts`, `staff-message-history.ts` | mensagens internas da equipe e com o cliente                          |
| `timeline.ts`                                  | linha do tempo da mesa                                                |
| `owner-settings.ts`                            | configurações do estabelecimento (tela do dono)                       |

## Divergência conhecida

O tipo `StaffRole` de `index.ts` lista `owner | manager | waiter | kitchen`, enquanto o seed e o app
da equipe trabalham com `owner`, `manager`, `host`, `waiter`, `cook`, `bartender` e `cashier` (o app
declara o próprio tipo em `apps/web-staff/src/lib/api.ts`; o seed usa os cinco primeiros). Alinhar
exige revisar os usos nos três apps.

## Documentação relacionada

- [Tempo real](../../docs/arquitetura/tempo-real.md) (eventos do Socket.IO)
- [Visão geral da arquitetura](../../docs/arquitetura/visao-geral.md) (monorepo)
