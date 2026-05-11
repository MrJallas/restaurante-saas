# Round 19 · Continuation API contextual tests

**Endpoint**: `POST /api/restaurant_dev/continuation`
**Spec**: V20 canon screenshots from user (home pós-cardapio, home pós-chamou-garcom, home pós-abriu-pedido, home pós-pagou, home pós-reclamação, home pós-voltou-sem-ação)

## Resultados

| Kind | Status | Texto retornado | Chips | Match canvas | Bug? |
|---|---|---|---|---|---|
| **first_time** | ✅ | "Bem-vindo! Posso te ajudar a escolher? Tem prato do dia legal hoje." | [] | OK (segment-routed via AI service) | — |
| **chamou_garcom** | ✅ | "Avisei o garçom — ele tá indo aí. Quer ir vendo a próxima rodada enquanto isso?" | ver-bebidas · ver-sobremesas · cancelar-chamado · eta-garcom | ✅ EXATO canvas | — |
| **abriu_pedido** | ✅ | "Seu pedido tá com a cozinha. Te aviso aqui quando estiver pronto pra ir. Quer adicionar algo enquanto espera?" | adicionar-bebida · ver-pedido · pedir-mais · eta-cozinha + subtitle "PEDIDO EM ANDAMENTO" | ✅ EXATO canvas | — |
| **pagou** | ⚠️ | "Paguinho registrado, . Mais alguma coisa antes de fechar a comanda?" | conta-final · cafe · ainda-quero · avaliar | ✅ texto OK, chips OK | 🐛 **Bug**: "Paguinho registrado, ." — vírgula sem nome quando `customer_name` é null. Template não trata o fallback. |
| **pos_reclamacao** | ⚠️ | "Recebido. A gerência já foi notificada — eles voltam pra você logo." | [] | ❌ Canvas mostra "Sua reclamação está com a Renata. Ela respondeu em ~2 min em média." + 3 chips (Ver chat · Pedir mais tarde · Falar de novo) | 🐛 **Gap**: template muito genérico vs canvas; sem chips. |
| **viu_cardapio** | ❌ | (nunca emite) | — | ❌ Canvas mostra "Tava bisbilhotando o menu? Posso te recomendar uma sobremesa do dia ou um vinho que combina." + chips | 🐛 **Gap maior**: continuation.service.ts:99 comment explicitamente diz "no DB signal exists yet — type preservado pra forward-compat". Sem `customer_events`/`menu_view` table, nunca dispara. |
| **voltou_sem_acao** | ✅ | (testado indiretamente — caia aqui quando complaint não existia mas outras tabelas tinham rows antigas) | — | OK | — |

## Bugs detectados

### Bug C1 — pagou template não-graceful quando customer_name=null
Texto fica "Paguinho registrado, ." — vírgula seguida de ponto. Template no AI service não tem fallback. Fix: ou trim vírgula+espaço se nome vazio, ou trocar template pra "Paguinho registrado. Mais alguma coisa..." quando sem nome.

### Bug C2 — pos_reclamacao chips ausentes vs canvas
Canvas V20 mostra 3 chips (Ver chat · Pedir mais tarde · Falar de novo) e texto rico mencionando o nome da gerente + tempo médio de resposta. Atual retorna texto genérico sem chips. Fix: enriquecer template no AI service + popular slots (manager_name, avg_response_min).

### Bug C3 — viu_cardapio nunca emite (gap arquitetural)
Sem tabela `customer_events`/`menu_view` ou outro signal, continuation.service não sabe quando o cliente viu o cardápio. Canvas V20 mostra greeting contextual após menu viewing.

**Fix proposto**: criar `046_customer_events.sql` (table_session_id, event_type, metadata jsonb, created_at), wirar evento no FE customer em `/cardapio` page mount (ou no clique do "Ver cardápio" PillButton no /assistente landing), atualizar continuation.service.ts priority 4 pra checar `customer_events WHERE event_type='menu_viewed' AND created_at >= now() - INTERVAL '10 minutes'`.

## Próximos passos (round 19 onda 2)

1. C1 quick fix: template fallback no AI service (`services/ai-service/services/continuation.py` provavelmente)
2. C2: enriquecer pos_reclamacao template + popular slots
3. C3: migration 046 + FE event logging + service detection

Estes 3 fixes resolvem 100% do gap de continuation contextual.
