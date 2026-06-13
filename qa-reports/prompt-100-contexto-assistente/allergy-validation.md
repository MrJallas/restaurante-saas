# Validação de alergia com LLM local (LM Studio · qwen3-coder-30b) — 2026-06-12

Pedido do Caleb: testar "me indica algo sem glúten" / "algo sem camarão"
pra confirmar que o LLM assume nas horas cruciais de recomendação pra
alérgicos. Pipeline completo (apps/api /assistant/message → ai-service →
LLM → enrichment), sessão real do stack.

Nota de ambiente: o `.env` local apontava LLM_BASE_URL pra um IP de LAN
antigo (192.168.0.56) — corrigido pro default estável
`http://host.docker.internal:1234/v1`.

## Roteamento (confirmado)

| Frase | Camada |
|---|---|
| me indica algo sem glúten | rule-gluten-free (atalho seguro: filtro determinístico por allergens) |
| tem algo sem glúten que chegue rápido? | LLM |
| me indica algo sem camarão | LLM (guarda nova `_DIETARY_RESTRICTION_RE`) |
| sou alérgico a camarão, o que você me indica? | LLM |
| me indica uma sobremesa sem lactose | LLM |

## Achado 1 — dados do seed eram o elo fraco (CORRIGIDO)

Na 1ª rodada, "sem glúten" recomendou **Bruschetta (pão!)** e **Bolinho de
Bacalhau (empanado)** — itens com glúten óbvio mas SEM o alérgeno
declarado no seed. O filtro determinístico só pode filtrar o que está
declarado ("sem glúten **declarado**" — copy honesta). Correção aplicada
(seed demo_data.sql + DB dev): Bruschetta `[gluten]`, Bolinho
`[gluten,peixe,ovo]`, Brownie com Sorvete `[gluten,lactose,ovo]`.
Pós-fix: "me indica algo sem glúten" → Carpaccio, Picanha, Risoto ✓.

## Achado 2 — LLM local NÃO é confiável pra alergia (CORRIGIDO com filtro duro)

Mesmo com `[Alergenos: gluten]` no prompt, o qwen3-coder-30b respondeu
"tem algo sem glúten que chegue rápido?" com **"Bruschetta — É sem
glúten!"** (ERRADO). O enrichment do apps/api não corrigia porque o texto
do LLM "já era específico" (`alreadySpecific`).
**Fix determinístico**: com restrição dietary ativa, a resposta é SEMPRE
re-gerada da lista filtrada por allergens — o modelo não tem voto em
segurança alimentar. Pós-fix: a mesma frase responde
"Encontrei estas opções sem glúten declarado: Carpaccio, Picanha, Risoto" ✓.

## Demais casos (LLM, comportamento aceitável)

- "me indica algo sem camarão" → opções sem camarão ✓ (cardápio não tem
  camarão; Bolinho anotado "(tem peixe, mas não camarão)" — transparente).
- "sou alérgico a camarão" → "evitamos pratos com frutos do mar" +
  opções seguras; recomendou Bolinho de Bacalhau com a ressalva de peixe
  (tecnicamente correto p/ alergia a crustáceo; ver pendência abaixo).
- "sobremesa sem lactose" → conclusão CORRETA ("não temos sobremesas sem
  lactose"), mas com lista confusa antes ("Temos algumas... (contém
  leite)") — limitação de coerência do modelo local; cada item veio
  anotado com o alérgeno e a conclusão é segura.

## Pendências/recomendações pro Caleb

1. **Vocabulário canônico de alérgenos**: o seed mistura `lactose`/`leite`
   e `egg`/`ovo`. O filtro de glúten usa regex `\bgluten\b`; outros
   alérgenos dependem do LLM ler strings livres. Vale definir enum
   canônico no cadastro do cardápio (dashboard do owner futuro).
2. **Filtro determinístico hoje cobre só glúten** (`dietary=gluten_free`
   é o único suportado pelo pipeline). Recomendo estender o mecanismo
   (dietary genérico por alérgeno declarado) quando o vocabulário canônico
   existir — aí "sem lactose"/"sem camarão" também ganham resposta
   determinística em vez de depender do LLM.
3. Alergia a crustáceo vs peixe: modelo recomenda peixe com ressalva.
   Decidir se a regra de produto deve ser mais conservadora (excluir
   frutos do mar em geral).
