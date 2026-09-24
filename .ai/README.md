# .ai/ — material de trabalho com agentes de código

Esta pasta guarda o que foi produzido para e por assistentes de código durante o desenvolvimento.
Não é documentação do produto: a documentação oficial está em `README.md` e `docs/`.

| Caminho                           | O que é                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `MEMORY.md`                       | memória de processo (convenções de trabalho, pendências, registro de rodadas) |
| `handoffs/`                       | passagens de bastão entre sessões, datadas                                    |
| `prompts/codex-round24/`          | prompts da rodada 24 (maio–junho de 2026)                                     |
| `prompts/sessoes/`                | prompts de sessões de validação e auditoria                                   |
| `prompts/superprompts/`           | prompts de retomada e alocação de simuladores                                 |
| `prompts/polimento-2026-08-31.md` | fila de polimento de 31/08/2026                                               |
| `rascunhos/`                      | rascunhos locais (fora do Git)                                                |

Mapa dos caminhos antigos de material de agente (reorganização de setembro de 2026):

| Antes                                                               | Agora                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `MEMORY.md`                                                         | `.ai/MEMORY.md`                                                 |
| `prompts-codex/*`                                                   | `.ai/prompts/codex-round24/*`                                   |
| `docs/prompts/*`                                                    | `.ai/prompts/sessoes/*`                                         |
| `docs/testing/playwright-chrome-full-ui-audit-prompt-2026-05-21.md` | `.ai/prompts/sessoes/2026-05-21-auditoria-playwright-chrome.md` |
| `qa-reports/SUPER-PROMPT-*.md`, `qa-reports/SIM-ALLOCATION.md`      | `.ai/prompts/superprompts/`                                     |
| `PROMPT-POLIMENTO.md`                                               | `.ai/prompts/polimento-2026-08-31.md`                           |
| `QA-HANDOFF-IOS.md`                                                 | `.ai/handoffs/2026-04-28-qa-handoff-ios.md`                     |
| `.claude/AGENT-COORDINATION.md`                                     | `.ai/handoffs/2026-04-30-agent-coordination.md`                 |
| `docs/plano-reestruturacao-framework.md`                            | `.ai/handoffs/2026-07-plano-reestruturacao-framework.md`        |
| `.rag-drafts/`                                                      | `.ai/rascunhos/` (local)                                        |

- Caminhos de documentação citados aqui (`docs/features/…`, `qa-reports/<relatório>`,
  `docs/design-canvas/…`) estão no mapa de `docs/README.md`.
- Na reorganização, caminhos pessoais e IPs de rede local destes arquivos viraram `<repo>`, `~` e
  `<IP-da-LAN>`, e a chave de dev antiga virou `<chave-de-dev-antiga-bloqueada-em-producao>`.
- Evidência nova de teste vai para `output/` (ignorado); relatório curado vai para
  `docs/archive/qa/<data>-<slug>/`. Decisão de produto ou arquitetura vai para `docs/decisoes/`.
- Na máquina do autor, "por que decidimos X":
  `bash <vault-do-autor>/rag/recall.sh "pergunta" --project restaurante-saas` (caminho do vault configurado na máquina do autor).
