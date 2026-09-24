# Matriz de cenários operacionais

| Cenário | Personas/sistemas | Prova | Estado |
| --- | --- | --- | --- |
| QR sem passar pela recepção | cliente, host, gerente, garçom, WS | serve-sim/Playwright + DB + cascata | PASS |
| Cliente com reserva | cliente, host, mesa | Playwright live; seating/liberação atômicos | PASS |
| Walk-in colocado na fila | cliente, host | Playwright live; fonte só vira seated no commit | PASS |
| Cliente entra sozinho e host aceita | cliente, host | realtime sem polling | PASS |
| Convidado entra em mesa ocupada | host customer, joiner | realtime request/decision | PASS |
| Gerente escala equipe/turnos | gerente, staff | API/UI/RBAC e workload | PASS |
| Garçom com mais mesas | gerente, dois garçons | tenant live `pwload711`; alerta singleton | PASS |
| Pedidos concorrentes | três clientes, duas mesas, API | Playwright + idempotência/locks | PASS |
| ETA sob carga | cozinha, pedidos | clock por item/estação + testes de quantidade | PASS com modelo atual |
| Gargalo no painel | gerente, dashboard | lateOrders kitchen-only + workload | PASS |
| Cozinha prepara e chama entrega | cook, waiter | KDS individual + noite E2E | PASS |
| Bar não conclui cozinha | bartender/cook | testes station-scoped + rotas `/bar` | PASS |
| LLM compara pratos | cliente, LM Studio | chamada real Gemma 4 26B | PASS |
| LLM indisponível/erro | cliente, AI service | fallback/rule layer + testes | PASS |
| Conta individual/mesa/split | clientes, pagamento | live + concorrência + DB | PASS |
| Pix | cliente | UI demo explícita; sem confirmação do cliente | PASS como demo |
| Feedback e reclamação | cliente, staff | pagamento/visita/ownership + live | PASS |
| LGPD | cliente, API, PG/Mongo/Redis/WS | live + CAS/lease + testes adversariais | PASS |
| Configuração do dono | dois owners, manager | Playwright com 200/409/403 | PASS |
| Caixa | cashier | guard/rota/logout; sem dados/mutação financeira | PASS como holding |
| Falha de backend em tela operacional | todas staff/customer | estados error/stale/retry e CTA bloqueado | PASS |
| Retorno em aparelho novo sem cookie | cliente | CPF conhecido emite cookie canônico; takeover é possível | ACEITO TEMPORARIAMENTE · RISCO ALTO |
| Liquidação real no caixa/Pix | cashier/PSP | integração não existe | FORA DO CLAIM |
| Hardware/performance iPhone | todas mobile | nenhum aparelho físico nesta rodada | NÃO PROVADO |
