# Instruções para agentes de código

Antes de qualquer auditoria ou implementação não trivial:

1. Leia `CLAUDE.md` (regras, telas V20 travadas e invariantes), `.ai/README.md` e `.ai/MEMORY.md`.
2. "Por que decidimos X": `docs/decisoes/` e o RAG do autor (comando em `.ai/README.md`).
   "Onde está X": Grep/Glob na árvore atual. Não crie índice vetorial dentro do repositório.
3. Auditoria iOS interativa: `docs/desenvolvimento/testes-no-ios.md` e `scripts/audit/start-serve-sim.sh`.
4. Mudou comportamento, contrato ou rota? Atualize o doc de `docs/` (e o ADR, se for decisão) no mesmo
   commit. Em `.ai/MEMORY.md` registre só o que é de processo.
5. `README.md` e `docs/` são públicos: nada sobre agentes neles. Material de agente fica em `.ai/`.
6. Sem screenshots, traces ou vídeos no Git: evidência vai para `output/` (o Playwright limpa
   `test-results/` a cada execução).

Validação só no Simulator não prova desempenho nem comportamento de hardware: confirme em iPhone físico.
