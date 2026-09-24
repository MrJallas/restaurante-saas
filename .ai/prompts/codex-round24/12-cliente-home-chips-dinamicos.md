# Continuação — Chips dinâmicos na home da mesa

## Contexto

Este é o monorepo `restauranteSaaS`. A continuation API já retorna `chips`, e a rota `apps/web-customer/src/app/[slug]/page.tsx` já sabe renderizar `SuggestionChip`. Mas a home principal da mesa (`/[slug]/mesa/[tableCode]`) ainda mostra botões fixos e não consome `homeData.continuationMessage.chips`.

Source-of-truth visual:

- `apps/web-customer/src/components/ui/ContinuationHome.tsx`
- `apps/web-customer/src/components/ui/SuggestionChip.tsx`
- `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx`
- `services/ai-service/services/continuation.py`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Logs/históricos novos vão para MongoDB, não Postgres.
- Erros para o usuário devem ser estruturados `{ message_user, code }`.
- Manter `test_chips_coverage_at_least_9_of_10_mutations` verde.

## Estado atual já encontrado

- `ContinuationHome` aceita `children` para chips.
- `apps/web-customer/src/app/[slug]/page.tsx` renderiza `cont.chips` com `SuggestionChip`.
- `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx` calcula `continuationMessage`, mas renderiza apenas:
  - `Chamar garçom`
  - `Ver cardápio`
  - `Repetir última visita` quando aplicável
- `homeData.continuationMessage.chips` não é mapeado na tela da mesa.

## Comportamento esperado

1. A home da mesa continua tendo ações essenciais (`Chamar garçom`, `Ver cardápio`) quando não há chips dinâmicos.
2. Quando `continuationMessage.chips` vier da API, os chips aparecem abaixo/perto do hero da continuação.
3. Chips com `action='navigate'` navegam para a rota correta.
4. Chips com `action='send'` abrem o assistente com `prefill` e enviam ou preparam o texto conforme padrão atual do assistente.
5. Chips com `action='expand'` abrem o assistente com input contextual, sem enviar automaticamente se o padrão do app for expandir.
6. Chips duplicados dos botões fixos são deduplicados para não poluir a home.
7. Layout não sobrepõe bottom nav, call waiter sheet ou teclado em mobile.

## Implementação esperada

Em `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx`:

- Criar tipo local compatível com `ContinuationChip`.
- Reusar `SuggestionChip` ou criar uma row equivalente, mantendo visual V20.
- Implementar helper `handleContinuationChip(chip)`:
  - `navigate`: se payload começa com `/`, navegar direto; senão prefixar `/${slug}/`.
  - `send`: `push('/[slug]/assistente?prefill=...')`.
  - `expand`: `push('/[slug]/assistente?prefill=...&mode=expand')` ou padrão existente equivalente.
- Usar payload string quando existir; fallback para `label`.
- Deduplicar chips por `id` ou por `action + payload`.
- Manter fallback fixo se `chips` vazio.

Se o endpoint `/home` ainda não estiver repassando `chips` em algum caso:

- Corrigir `apps/api/src/modules/home/home.service.ts` para preservar `chips`, `subtitle`, `primary_cta` da continuation API.
- Não inventar chips no frontend se o backend já tem contexto real.

## Testes esperados

- Teste unitário simples para o mapper de chip, se houver estrutura.
- Teste visual/manual mobile para garantir que texto/chips não quebram linha de forma ruim.
- Manter testes da AI:

```bash
python -m pytest services/ai-service/tests -q
```

## Validação mínima

Rodar:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-customer
python -m pytest services/ai-service/tests -q
git diff --check
```

## Validação automatizada obrigatória

- Usar simulador iOS com idb do Facebook para abrir `/[slug]/mesa/[tableCode]` com uma continuation que retorne chips.
- Usar o chat real do app com LLM local ligado quando o chip nasce de tool/assistant; o servidor atual pode ser `http://<IP-da-LAN>:1234` com modelo `qwen/qwen3-coder-30b`, mas confirme antes de rodar.
- Validar via idb taps que chips `navigate`, `send` e `expand` fazem a navegação/prefill correta.
- Conferir resposta da continuation API e screenshot iOS da home com chips renderizados.
- Salvar evidências em `qa-reports/home-chips-dinamicos/`.

Fluxo manual:

1. Forçar/gerar continuation com chips (`viu_cardapio`, `pos_reclamacao`, `pagou`, etc.).
2. Abrir `/restaurant_dev/mesa/Mxx`.
3. Confirmar chips dinâmicos renderizados.
4. Tocar chip navigate.
5. Tocar chip send/expand e confirmar assistente com prefill correto.

## Critérios de aceitação

- [ ] Home da mesa renderiza chips reais da continuation.
- [ ] Fallback fixo continua quando não há chips.
- [ ] Navigate/send/expand funcionam.
- [ ] Sem duplicação óbvia.
- [ ] `test_chips_coverage_at_least_9_of_10_mutations` passa.
