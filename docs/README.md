# Documentação do restauranteSaaS

Tudo o que explica o sistema: o que ele faz, como é construído, por que foi construído assim e como
rodar, testar e operar. O [README da raiz](../README.md) traz a visão geral e o tutorial para subir o
projeto; esta pasta aprofunda cada assunto.

## Comece aqui

Ordem sugerida de leitura para quem está conhecendo o projeto:

1. [README da raiz](../README.md): visão geral, tutorial de subida e limitação da IA.
2. [Visão geral do produto](produto/visao-geral.md): problema, personas e uma noite no restaurante.
3. [Visão geral da arquitetura](arquitetura/visao-geral.md): containers, portas e o caminho de uma
   requisição.
4. [Decisões (ADRs)](decisoes/README.md): o porquê das principais escolhas.
5. [Ambiente local](desenvolvimento/ambiente-local.md): a versão detalhada do tutorial, com todas as
   variáveis.

## Mapa das pastas

| Pasta                                                 | Conteúdo                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| [produto/](produto/visao-geral.md)                    | o que o sistema faz e para quem; uma página por funcionalidade com regra própria |
| [arquitetura/](arquitetura/visao-geral.md)            | como o sistema é construído                                                      |
| [decisoes/](decisoes/README.md)                       | registros de decisão (ADRs), numerados                                           |
| [desenvolvimento/](desenvolvimento/ambiente-local.md) | rodar, testar e convenções de código                                             |
| [operacao/](operacao/staging.md)                      | ambiente de staging e requisitos de produção                                     |
| [seguranca/](seguranca/modelo-de-seguranca.md)        | modelo de segurança, riscos aceitos e pendências                                 |
| [design/](design/README.md)                           | canvas V20, a referência visual das telas                                        |
| [archive/](archive/README.md)                         | material histórico: planos antigos e relatórios de auditoria e QA                |

### Produto

- [Visão geral](produto/visao-geral.md)
- [Jornadas e telas](produto/jornadas-e-telas.md)
- Funcionalidades:
  [cliente anfitrião e mesa compartilhada](produto/funcionalidades/cliente-host-e-mesa-compartilhada.md) ·
  [pagamento e Pix](produto/funcionalidades/pagamento-pix.md) ·
  [geolocalização](produto/funcionalidades/geolocalizacao.md) ·
  [avaliação e reclamação](produto/funcionalidades/avaliacao-e-reclamacao.md) ·
  [histórico de chat e LGPD](produto/funcionalidades/historico-de-chat-e-lgpd.md) ·
  [cliente VIP](produto/funcionalidades/cliente-vip.md) ·
  [pausa de zona](produto/funcionalidades/pausa-de-zona.md)

### Arquitetura

- [Visão geral](arquitetura/visao-geral.md)
- [Dados e armazenamento](arquitetura/dados-e-armazenamento.md)
- [Autenticação e sessões](arquitetura/autenticacao-e-sessoes.md)
- [Tempo real](arquitetura/tempo-real.md)
- [Ciclo do pedido](arquitetura/ciclo-do-pedido.md)
- [Serviço de IA](arquitetura/servico-de-ia.md)

### Decisões

O [índice dos ADRs](decisoes/README.md) lista as 12 decisões registradas e aponta onde estão
descritas as decisões menores, que viraram seção de outros documentos.

### Desenvolvimento e operação

- [Ambiente local](desenvolvimento/ambiente-local.md)
- [Testes](desenvolvimento/testes.md)
- [Convenções](desenvolvimento/convencoes.md)
- [Roteiro E2E de uma noite](desenvolvimento/roteiro-e2e-noite.md)
- [Testes no iOS](desenvolvimento/testes-no-ios.md)
- [Staging](operacao/staging.md)

### Segurança

- [Modelo de segurança](seguranca/modelo-de-seguranca.md)
- [Riscos aceitos e pendências](seguranca/riscos-aceitos-e-pendencias.md)

## Onde foi parar cada documento antigo

A documentação foi reorganizada em setembro de 2026. Código, comentários e relatórios antigos podem
citar os caminhos anteriores; esta tabela resolve cada um. Tudo o que saiu continua no histórico do Git
(`git log --follow -- <caminho novo>` ou `git show <commit>:<caminho antigo>`).

| Caminho antigo                                      | Caminho atual                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` (plano de sprints)                      | [archive/2026-04-plano-de-implementacao-sprints.md](archive/2026-04-plano-de-implementacao-sprints.md)                                   |
| `SETUP.md`                                          | removido; substituído pelo [README](../README.md) e por [ambiente local](desenvolvimento/ambiente-local.md)                              |
| `docs/features/customer-host-model.md`              | [produto/funcionalidades/cliente-host-e-mesa-compartilhada.md](produto/funcionalidades/cliente-host-e-mesa-compartilhada.md)             |
| `docs/features/complaint-flow-v12.md`               | [produto/funcionalidades/avaliacao-e-reclamacao.md](produto/funcionalidades/avaliacao-e-reclamacao.md)                                   |
| `docs/features/geolocation.md`                      | [produto/funcionalidades/geolocalizacao.md](produto/funcionalidades/geolocalizacao.md)                                                   |
| `docs/features/chat-history-lgpd.md`                | [produto/funcionalidades/historico-de-chat-e-lgpd.md](produto/funcionalidades/historico-de-chat-e-lgpd.md)                               |
| `docs/features/vip-customer.md`                     | [produto/funcionalidades/cliente-vip.md](produto/funcionalidades/cliente-vip.md)                                                         |
| `docs/features/zone-pause.md`                       | [produto/funcionalidades/pausa-de-zona.md](produto/funcionalidades/pausa-de-zona.md)                                                     |
| `docs/features/order-status.md`                     | [arquitetura/ciclo-do-pedido.md](arquitetura/ciclo-do-pedido.md)                                                                         |
| `docs/features/roteiro-noite-restaurante-e2e.md`    | [desenvolvimento/roteiro-e2e-noite.md](desenvolvimento/roteiro-e2e-noite.md)                                                             |
| `docs/features/r23-functional-backlog.md`           | [archive/qa/2026-05-15-auditoria-e2e-r23/backlog-funcional-onda4.md](archive/qa/2026-05-15-auditoria-e2e-r23/backlog-funcional-onda4.md) |
| `docs/PIX-STATUS.md`                                | [produto/funcionalidades/pagamento-pix.md](produto/funcionalidades/pagamento-pix.md)                                                     |
| `docs/SECURITY-FOLLOWUPS.md`                        | [seguranca/riscos-aceitos-e-pendencias.md](seguranca/riscos-aceitos-e-pendencias.md)                                                     |
| `docs/staging.md`                                   | [operacao/staging.md](operacao/staging.md)                                                                                               |
| `docs/dev/mongodb-logs.md`                          | [arquitetura/dados-e-armazenamento.md](arquitetura/dados-e-armazenamento.md)                                                             |
| `docs/dev/idb-setup.md`                             | incorporado a [desenvolvimento/testes-no-ios.md](desenvolvimento/testes-no-ios.md)                                                       |
| `docs/audits/serve-sim.md`                          | [desenvolvimento/testes-no-ios.md](desenvolvimento/testes-no-ios.md)                                                                     |
| `docs/performance/baseline-2026-05.md`              | [archive/2026-05-18-baseline-de-performance.md](archive/2026-05-18-baseline-de-performance.md)                                           |
| `docs/design-sessao-staff-server-side.md`           | [archive/2026-07-design-sessao-staff-server-side.md](archive/2026-07-design-sessao-staff-server-side.md)                                 |
| `packages/database/mongodb/chat-threads.md`         | [archive/2026-06-mongodb-chat-threads-schema-antigo.md](archive/2026-06-mongodb-chat-threads-schema-antigo.md)                           |
| `docs/design-canvas/` e `docs/design-canvas-final/` | [design/canvas/](design/README.md) (a segunda era uma cópia idêntica); capturas antigas em [archive/design/](archive/README.md)          |
| `qa-reports/<relatório>`                            | [archive/qa/](archive/README.md), em 6 pastas datadas; a pasta `prompt-100-contexto-assistente/` virou `contexto-do-assistente/`         |
| `apps/api/.env.example`                             | removido; use o `.env.example` da raiz                                                                                                   |

## Como contribuir com a documentação

- **Comportamento do produto** mudou: atualize a página em `produto/` no mesmo commit do código.
- **Como algo é construído** mudou: atualize `arquitetura/`.
- **Decisão nova** de produto ou de engenharia, com alternativas descartadas: crie um ADR em
  `decisoes/` com o próximo número livre (números nunca são reutilizados) e registre-o no índice. Se a
  decisão substitui outra, marque a antiga como substituída em vez de apagá-la.
- **Relatórios** de auditoria, QA ou desempenho são retratos datados: vão para `archive/`, com a data
  no nome, e não são atualizados depois. Quando o código diverge deles, vale o código.
- Português do Brasil, links relativos e diagramas em Mermaid.
