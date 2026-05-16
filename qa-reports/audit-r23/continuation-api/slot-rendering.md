# Slot rendering — fallback validation (Round 4 C-NEW-4 + Round 19 C1)

## Comportamento esperado

- **Round 19 C1** (`requires_slots` filter em `get_continuation`): se `slots[req]` está vazio/whitespace, a variante é excluída do pool elegível. Outras variantes do mesmo kind continuam disponíveis.
- **Round 4 C-NEW-4** (`render_continuation` special case): `voltou_sem_acao` sem `last_item` troca o template inteiro pra copy neutra ("Bem-vindo de volta. Posso sugerir algo novo ou mostrar o cardápio do dia?").

## Testes (10 calls cada)

| Cenário | Variantes vistas | Sample rendered | Veredito |
|---|---|---|---|
| `voltou_sem_acao` **sem** last_item | `vs3` | "Voltou! Que tal experimentar algo novo hoje? Posso indicar uma combinação." | **OK** — vs1/vs2 filtrados (requerem last_item), vs4 também (requer customerName), vs3 único elegível. C-NEW-4 NÃO foi aplicado porque o template selecionado (vs3) não declara `last_item` em `slots` |
| `voltou_sem_acao` **com** last_item=Hamburguer | `vs1`, `vs3` | "Bem-vindo de volta. Da última vez foi Hamburguer. Posso sugerir algo parecido..." | **OK** — vs1 abre (last_item presente), vs3 também |
| `viu_menu` **sem** customerName | `vm1`, `vm3`, `vm4` | "E aí, achou algo bom? Posso comparar dois pratos..." | **OK** — vm2 filtrado (requer customerName), vm1/vm3/vm4 rotacionam |
| `chamou_garcom` **sem** waitMinutes | `cg1`, `cg3` | "Garçom notificado. Enquanto rola..." | **OK** — cg2 filtrado (requer customerName), cg4 filtrado (requer waitMinutes), cg1/cg3 rotacionam |
| `pagou` **sem** customerName | `pg2`, `pg4` | "Pagamento processado. Quer avaliar o atendimento antes de fechar?" | **OK** — pg1/pg3 filtrados (requerem customerName) |
| `pagou` **com** customerName=Caleb | `pg1`, `pg2`, `pg3`, `pg4` | "Pagamento confirmado, Caleb! Mais alguma coisa..." | **OK** — pool completo aberto |

## Hipótese sobre C-NEW-4

O caso especial em `render_continuation:566-571` aplica **apenas** quando:
1. `message["kind"] == "voltou_sem_acao"`, E
2. `"last_item"` está na lista `missing`.

Mas `missing` é derivado dos `declared_slots = message.get("slots") or []`. Como o filtro `eligible_pool` em `get_continuation:535-541` JÁ exclui variantes cujo `requires_slots` está vazio, na prática `voltou_sem_acao` sem `last_item` cai em `vs3` (slots=[], nada exigido) e nunca em `vs1` (slots=["last_item"], requires=["last_item"]).

**Resultado**: C-NEW-4 é defensivo — só dispararia se o pool tivesse uma variante cujo `slots` inclui `last_item` mas `requires_slots` NÃO inclui (cenário não existente no código atual). Funciona como safety net se alguém criar tal variante no futuro.

## Conclusão

- `requires_slots` filter (Round 19 C1) é o mecanismo real de fallback hoje.
- C-NEW-4 (Round 4) está implementado mas redundante dado o filter atual. Manter como defensivo está OK.
- **Não há render-failures** observáveis nos 6 cenários testados — todas as templates renderam sem `{slot}` literal vazando.
