# Charter do loop de auditoria integral — 2026-07-11

## Objetivo

Levar o `restauranteSaaS` a um estado verificavelmente íntegro e manutenível,
continuando — sem reiniciar — o trabalho da PR #65 e da auditoria Fable:
backend, serviços, bancos, regras de negócio, frontends cliente/staff, todos os
controles, realtime, segurança, acessibilidade, arquitetura e operação local.

## Base e trabalho protegido

- Base canônica: branch `fix/framework-bugfixes`, PR #65, HEAD inicial
  `43a7b925a0f02d25a0c93d9b1a8a3d987e7f00b9`.
- Preservar os sete arquivos não commitados deixados pelo Fable: correção de
  open redirect, remoção do `NEXT_PUBLIC_STAFF_API_KEY` morto e testes.
- Não tocar nas mudanças do checkout-base em
  `<repo>` (RAG/serve-sim,
  `MEMORY.md`, `CLAUDE.md` e artefatos pré-existentes) sem necessidade
  explícita de integração.
- Preservar o visual V20 bloqueado. Correções funcionais e de acessibilidade
  nesses arquivos devem manter aparência, copy e hierarquia deliberadas,
  salvo decisão já registrada pelo dono.
- Pix continua uma demonstração intencional até integração com PSP; a UI deve
  ser honesta, mas o loop não inventará liquidação real.

## Escopo

- NestJS API, FastAPI/LLM/rule-layer, Postgres multi-schema, Redis e Mongo.
- Next.js customer e staff: cliente, host, garçom, gerente, cozinha e TVs.
- AuthN/AuthZ, isolamento de tenant, ownership, idempotência, concorrência,
  dinheiro, retenção/LGPD, auditoria, WebSocket e estados degradados.
- Rotas, botões, links, formulários, sheets, menus, teclado, back/dismiss,
  estados loading/empty/error/offline/denied/stale e efeitos persistidos.
- Manutenibilidade: dependências, módulos grandes, duplicação, contratos,
  dead code, observabilidade, configuração, migrations e caminhos de deploy.

## Jornadas obrigatórias

1. QR/geofence → welcome/reconhecimento → mesa/retomada.
2. Cardápio/assistente/chips → draft → revisão → confirmação → KDS/bar →
   chamado de entrega → garçom → entregue/rating/reclamação.
3. Conta individual/mesa/split → Pix demonstrativo → feedback, sem cobrança
   duplicada nem divergência de total.
4. Late-arrival, participante, merge/unmerge, host approval e awareness staff.
5. Chamados/mensagens/LGPD/cortesia/contato/timeline e recuperação após reload.
6. Host: mapa, fila, reservas, troca/liberação, QR issue, perfil e notificações.
7. Garçom: home/mesas/chamados/scan/pedido/entrega/turno/mensagens/perfil.
8. Gerente: painel/operação/mapa/funil/equipe/financeiro/configuração/timeline.
9. Cozinha/bar: KDS, TV, PIN, prioridade, ETA, som e chamar garçom.

## Gates funcionais e de qualidade

- Baseline e estado final: builds, typechecks, lint, format, suites API/AI/FE,
  migrations e `git diff --check` executados com saída real registrada.
- E2E relevante em uma única invocação serial; smoke vivo de API, banco,
  Redis, Mongo, proxy e WebSocket.
- Cada CTA final deve provar navegação, resposta HTTP, evento, persistência ou
  erro explícito. Screenshot isolado não prova ação.
- Nenhum P0/P1 conhecido nem HIGH de segurança/compliance em aberto.
- Isolamento de tenant, actor derivado do token, ownership e invariantes de
  pagamento testados adversarialmente.
- Mobile: Safari no Simulator via launcher oficial/serve-sim; safe areas,
  teclado, rolagem, light/dark, texto ampliado, contraste, Reduce Motion e
  nomes/ordem acessíveis. Hardware, desempenho tátil, haptics, sensores e cor
  só ficam “provados” com iPhone físico.
- RQS >= 90 conforme `MEMORY.md`, sem gate obrigatório omitido.

## Evidência e registro

- Comandos e resultados neste diretório, priorizando texto e manifests leves.
- Achados trazem jornada, reprodução, esperado, observado, evidência,
  severidade, owner provável e estado do fix.
- Mudança comportamental exige teste RED quando praticável e atualização da
  memória/RAG ao final.

## Regra de encerramento

O loop termina somente após duas rodadas consecutivas, iniciadas de estado
fresco, sem novo achado material e com todos os gates ainda verdes. Bloqueios
externos — dispositivo físico, credencial, signing ou serviço pago — ficam
nomeados como não provados; não são convertidos em PASS.
