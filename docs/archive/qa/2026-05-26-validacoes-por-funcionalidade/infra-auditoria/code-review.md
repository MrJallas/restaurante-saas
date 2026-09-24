# Code Review - Prompt 07 Follow-up

Data: 2026-06-09

Origem do procedimento: `/code-review` adaptado do comando local do Claude Code,
pois nao ha skill Codex com esse nome instalada nesta sessao.

## Escopo

- Branch: `codex/prompt-07-infra-auditoria`
- Base local revisada: diff da ponta da branch apos o commit `0fbacbc1c993b2010d7b8736b6aeb841d7a67d3a`
- Regras locais: `CLAUDE.md` lido; nenhuma alteracao em UI V20 bloqueada foi feita.

## Findings

Nenhum finding de bug/regressao com confianca >= 80% permaneceu apos as correcoes.

## Observacoes revisadas

- O filtro HTTP preserva `message` e `statusCode`, alem de `message_user` e `code`.
- `scripts/audit-ui.sh` agora executa asserts depois de cada abertura e tap.
- Evidencias IDB pesadas foram removidas da arvore versionada; o Git mantem so
  `qa-reports/infra-auditoria/idb/summary.md`.
- O E2E `Mongo fora do ar nao bloqueia operacao Postgres` saiu do skip e passou
  na suite completa.
