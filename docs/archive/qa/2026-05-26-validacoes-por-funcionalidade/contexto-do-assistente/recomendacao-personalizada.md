# Recomendação personalizada por histórico (2026-06-13)

Decisão Caleb: a recomendação NÃO pode ser genérica — tem que ser de acordo
com os pedidos antigos do cliente; só na primeira visita pode ser genérica.
Estilo escolhido: **Mix — repetir + parecido**.

## Onde
`apps/api/.../assistant.service.ts` → `enrichRecommendationToolCalls`
(ponto único: tanto o rule-layer sem LLM quanto o LLM passam por aqui).
Núcleo puro exportado e testado: `rankCandidatesByHistory`
(recommendation-history.test.ts, 6 casos).

## Regra
- **Primeira vez** (sem `customer_consumption_summary.last_items`) → genérico.
- **Retornante** → re-ordena os candidatos: (1) item que ele já pediu
  (repeat), (2) parecidos da MESMA categoria do último pedido, (3) resto.
  Copy lidera com o repeat. `last_items` = itens do último pedido
  (`{name,category,quantity}`).
- Só no caminho de recomendação GENÉRICA (`alreadySpecific=false`). Pergunta
  específica do LLM ("combina com vinho tinto?") continua intacta.
- customerId vem do cookie `recognition_token` (não do body).

## Segurança alimentar PRESERVADA
O ranking recebe os candidatos JÁ filtrados por categoria + alérgeno. Um
item com o alérgeno declarado nunca chega no ranking → não pode virar
"repeat". Confirmado no cenário C abaixo.

## Validação live (stack, LLM ligado)
- A. Primeira vez (sem summary): "Eu iria nessas opções hoje: Picanha,
  Bruschetta, Bolinho" → genérico ✓
- B. Retornante (pediu Picanha na Brasa): "Da última vez você curtiu
  Picanha na Brasa. Quer de novo, ou que tal: Picanha · Risoto · Salmão"
  → lidera repeat + parecidos de Pratos Principais ✓
- C. Retornante (pediu Pão de Alho=glúten) + "me indica algo sem glúten":
  "Encontrei estas opções sem glúten declarado: Picanha, Carpaccio,
  Picanha" → Pão de Alho FORA (False) — barreira de alérgeno respeitada ✓
