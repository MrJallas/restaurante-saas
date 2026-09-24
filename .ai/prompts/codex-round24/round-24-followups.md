# Round 24 Follow-ups

## Infra Auditoria

- `R24-INFRA-01` — Transformar a auditoria `scripts/audit-ui.sh` em teste
  Playwright + IDB híbrido com asserts de URL depois de cada tap. Hoje o script
  gera evidência visual e UI tree; a classificação final ainda é humana.
- `R24-INFRA-02` — Criar UI de gerente para configurar latitude, longitude e
  raio de geolocalização do restaurante. Documentado em
  `docs/features/geolocation.md`.
- `R24-INFRA-03` — Substituir ações de QA marcadas por feature flag
  `NEXT_PUBLIC_SHOW_WIP_FEATURES=true` por fluxos reais ou remover os botões em
  produção tela a tela.
- `R24-INFRA-04` — Expandir logs Mongo além de `shift_logs`: notificações,
  chamados cozinha-garçom, junção de mesas, pedidos de prioridade e arquivo de
  reclamações.
- `R24-INFRA-05` — Adicionar spec E2E dedicada para regressão do menu do cliente
  em `/assistente`, `/cardapio`, `/pedido` e `/conta`, cobrindo navegação por
  menu, voltar e bottom nav.
