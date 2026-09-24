---
status: aceita
date: 2026-05-09
decision-makers: Caleb Medeiros
---

# Adotar o V20 como canon visual e congelar telas do cliente

## Contexto e problema

O app do cliente passou por várias linguagens visuais no protótipo navegável (V2 a V16). Sem uma
referência única, cada correção reabria discussão de espaçamento, tipografia e texto, e telas já
validadas pelo autor mudavam de aparência como efeito colateral de correções funcionais.

## Decisão

Escolhida: "V20 é a fonte de verdade visual do cliente, e sete superfícies têm o visual congelado",
porque essas telas foram desenhadas à mão pelo autor e conferidas lado a lado com o protótipo.

- Canon: `docs/design/canvas/handoff/cliente/cliente-journey-v20.jsx` e `cliente-late-arrival.jsx`,
  abertos por `docs/design/canvas/app-cliente-canvas-v20.html`. V13 e V14 são legado.
- Visual congelado (layout, tipografia, tokens de cor e texto), em `apps/web-customer/src/`:
  `WelcomeModal.tsx`, `CpfInput.tsx`, `ScreenCustomerIdentifyBeforeJoin.tsx`,
  `ScreenCustomerWaitingApproval.tsx`, `CallWaiterSheet.tsx`, o aviso de conta reconhecida em
  `app/[slug]/mesa/[tableCode]/page.tsx` e a entrada de `app/[slug]/assistente/page.tsx` antes da
  primeira mensagem.
- Essas telas mudam só por decisão explícita do autor. Correção funcional sem efeito visual (por
  exemplo, atributo de acessibilidade ou evento que não dispara) e refatoração que preserva 100% da
  aparência são permitidas.

### Consequências

- Boa, porque há uma referência objetiva para revisar as telas do cliente.
- Ruim, porque a atualização de dependências fica limitada: o upgrade para Next.js 16 (commit
  `6c64ae1`, 2026-07-05) manteve React 18 para o motor de renderização não mudar essas telas, e duas
  vulnerabilidades moderadas do PostCSS interno do Next 16 ficaram aceitas, porque a correção sugerida
  força um downgrade.
- Ruim, porque divergência de texto nessas telas espera decisão de produto. Exemplo: a tela de espera
  da junção de mesas diz "Você pode tentar de novo em 20 min", e o intervalo real depois de uma
  recusa ou de um pedido sem resposta é de 10 min (`COOLDOWN_MINUTES` em
  `apps/api/src/modules/table-merge/merge-consent-state-machine.ts`).
- O `CallWaiterSheet` é exceção à tipografia: título 22/600 em vez de 26/700.
- O protótipo é referência de design, não de comportamento: onde diverge do código, vale o código
  ([Design](../design/README.md)).

## Mais informações

- Data: redesign V20 no commit `4090a80` (2026-05-09).
- Regras visuais das telas congeladas: rótulo superior em `font-mono` 10px com espaçamento 1.5px,
  título 26/700 com espaçamento -0.024em, corpo 15/500; tokens `text-ink`, `text-mute`, `text-faint`,
  `border-soft`, `bg-surface` e `bg-bg`; conteúdo centralizado com `grid place-items-center` em
  `h-[100dvh]`; o botão `PillButton` próprio, nunca `<button>` simples.
- [Design](../design/README.md)
