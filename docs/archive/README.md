# Arquivo histórico

Material que registra como o projeto chegou até aqui: planos antigos, relatórios de verificação,
capturas de design e o pitch. São **retratos datados**. Quando um texto daqui diverge do código atual,
o código vence; a documentação viva está no resto de [`docs/`](../README.md).

Os arquivos estão como foram escritos, com três exceções feitas na reorganização de setembro de 2026:
caminhos pessoais e IPs de rede local viraram `<repo>`, `~` e `<IP-da-LAN>`; a chave de desenvolvimento
antiga virou `<chave-de-dev-antiga-bloqueada-em-producao>`; e um CPF foi mascarado.

Ao ler, lembre que:

- vários relatórios citam o fluxo de chegada tardia com escalada para a equipe, removido depois
  (migration `081_drop_late_arrival_requests.sql`); hoje quem chega a uma mesa ocupada é aprovado só
  pelo cliente-anfitrião;
- os caminhos citados são os da época (`qa-reports/…`, `docs/features/…`, `docs/design-canvas/…`); o
  mapa para os caminhos atuais está em [`docs/README.md`](../README.md);
- as capturas de tela dos relatórios não são versionadas. As que já estiveram no Git podem ser
  recuperadas com `git show 03c6ed8^:qa-reports/<caminho>`; o que a reorganização removeu, com
  `git show 25bd9be^:<caminho antigo>`.

## Linha do tempo

| Quando                  | Marco                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| abril/2026              | Sprints 0 a 8 (10 a 16/04): monorepo, sessão da mesa, cardápio, pedidos, KDS, WebSocket, assistente, pagamento, dashboard, equipe e Compose |
| 2026-05-09              | Rodadas de endurecimento; linguagem visual V20 no app do cliente e runner de migrations no boot (commit `4090a80`)                          |
| maio/2026               | Auditorias estáticas, E2E cruzado com simuladores e varredura de botões sem efeito ("placebos")                                             |
| 2026-05-15              | Auditoria E2E R23: 25 frentes em paralelo                                                                                                   |
| 2026-05-18 / 2026-05-25 | QR físico com verificação pela recepção: decisão em 18/05; migration 049 no commit `3707010`, de 25/05                                      |
| 2026-05-25 a 2026-06-13 | Rodada 24: validações por funcionalidade (login da equipe, recepção, KDS, cortesias, junção de mesas, TV)                                   |
| 2026-07-04 e 05         | Correções de dinheiro e integridade; revisão de segurança; upgrade para Next 16 mantendo React 18                                           |
| 2026-07-11              | Auditoria integral: 1.597 testes em duas rodadas; `PARTIAL`, 96/100, pelo login do cliente só por CPF                                       |
| agosto/2026             | Inventário do que falta, demonstrações e consolidação do repositório (31/08)                                                                |
| 2026-08-31 / 2026-09-24 | Remoção do segundo sistema de chegada tardia: migration 081 datada de 31/08 no registro do projeto e commitada em 24/09 (`b327199`)         |

## Documentos

| Arquivo                                                                                          | O que é                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [`2026-04-plano-de-implementacao-sprints.md`](2026-04-plano-de-implementacao-sprints.md)         | plano original de implementação por sprints (era o README do repositório)                        |
| [`2026-05-18-baseline-de-performance.md`](2026-05-18-baseline-de-performance.md)                 | medição de desempenho do backend; cita a tabela `late_arrival_requests`, já removida             |
| [`2026-06-mongodb-chat-threads-schema-antigo.md`](2026-06-mongodb-chat-threads-schema-antigo.md) | schema antigo do histórico do assistente no MongoDB, em snake_case; o atual usa camelCase        |
| [`2026-07-design-sessao-staff-server-side.md`](2026-07-design-sessao-staff-server-side.md)       | desenho da sessão da equipe no servidor; as etapas que ele deixava pendentes foram implementadas |

## Relatórios de verificação (`qa/`)

A data no nome da pasta é o início da rodada. Onde a data de entrada no Git difere, as duas aparecem.

| Pasta                                                                                       | Arquivos | Datas (rodada · Git)  | Conteúdo e resultado                                                                                                                               |
| ------------------------------------------------------------------------------------------- | -------: | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`2026-05-09-bug-hunt-estatico/`](qa/2026-05-09-bug-hunt-estatico/)                         |       13 | 05-09 · 05-09 a 05-11 | rodadas 3 a 17 de auditoria estática de código (não há 6 nem 8); a densidade de achados cai até as rodadas 15 e 16, sem achado novo                |
| [`2026-05-09-e2e-cross-simulador/`](qa/2026-05-09-e2e-cross-simulador/)                     |        6 | 05-09                 | E2E com simuladores iOS, equipe e banco: entrada, pedido, pagamento, junção de mesas, contexto do assistente, telas "Eu"; resultados parciais      |
| [`2026-05-10-auditoria-ui-placebos/`](qa/2026-05-10-auditoria-ui-placebos/)                 |        3 | 05-09 a 05-11 · 05-11 | botões sem efeito real e varredura de interface; os placebos únicos caem de 15 para 8                                                              |
| [`2026-05-15-auditoria-e2e-r23/`](qa/2026-05-15-auditoria-e2e-r23/)                         |       28 | 05-15 · 05-16         | 25 frentes (cliente no iOS, 4 papéis da equipe, IA/API/WebSocket, V20, placebos): 18 PASS, 6 PARTIAL, 1 PASS com ressalvas, 0 FAIL; 2 P0 no garçom |
| [`2026-05-26-validacoes-por-funcionalidade/`](qa/2026-05-26-validacoes-por-funcionalidade/) |       20 | 05-26 a 06-13         | 14 validações focadas; cada subpasta tem o relatório da própria rodada (tabela abaixo)                                                             |
| [`2026-07-11-auditoria-integral/`](qa/2026-07-11-auditoria-integral/)                       |       13 | 07-11 · 07-17         | **relatório canônico**: [`FINAL-REPORT.md`](qa/2026-07-11-auditoria-integral/FINAL-REPORT.md), `PARTIAL` 96/100                                    |

Subpastas de `2026-05-26-validacoes-por-funcionalidade/` (data de entrada no Git; entre parênteses, a
data do texto quando difere):

| Subpasta                       | Data                 | Tema                                        |
| ------------------------------ | -------------------- | ------------------------------------------- |
| `api-transversais/`            | 05-26                | erros estruturados e alertas por papel      |
| `staff-login-superusers/`      | 05-26                | login da equipe por CPF + PIN               |
| `cozinha-round24/`             | 05-26                | KDS e "Chamar garçom" da cozinha            |
| `garcom-round24/`              | 05-26                | telas do garçom                             |
| `courtesy-arrival/`            | 05-27 (texto: 05-28) | cortesia chegando ao cliente                |
| `gerente-timeline-real/`       | 05-27                | linha do tempo real no gerente              |
| `home-chips-dinamicos/`        | 05-27                | sugestões dinâmicas na home                 |
| `join-table-ai-typewriter/`    | 05-28                | pedido de entrada decidido pelo assistente  |
| `table-merge-salao/`           | 05-28                | junção de mesas no salão                    |
| `table-merge-pos-confirmacao/` | 05-29                | junção depois da confirmação                |
| `infra-auditoria/`             | 06-01 (texto: 06-09) | infraestrutura de auditoria no iOS          |
| `tv-delivery-e2e/`             | 06-10                | entrega TV → garçom → cliente               |
| `contexto-do-assistente/`      | 06-12 a 06-13        | contexto do assistente (validação de 12/06) |
| `e2e-favorites-suite/`         | 06-13                | favoritos na recomendação                   |

## Design (`design/`)

- [`capturas-canvas/`](design/capturas-canvas/): 55 capturas de verificação do canvas de design (V4 a
  V16). O protótipo atual está em [`docs/design/`](../design/README.md).
- [`pitch/`](design/pitch/): `pitch-mesa.html`, a imagem do slide 6 e os 11 slides finais em PNG.
- [`rascunhos/`](design/rascunhos/): primeiro rascunho da home do cliente (23/04/2026).
