# Order status enum · canon + transições

> Fonte de verdade: `apps/api/src/modules/orders/orders.service.ts::VALID_TRANSITIONS`. Este doc espelha o map e explica as decisões.

## Estados

| Estado                 | Significado                                                                        | Quem cria/transiciona                                     |
| ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pending_confirmation` | Cliente acabou de criar o pedido. Janela de 15s pra cancelar antes da cozinha ver. | Cliente (POST /orders)                                    |
| `received`             | Pedido confirmado, cozinha vê no KDS coluna NOVOS.                                 | Cliente (PATCH /orders/:id/confirm) ou sweep auto-confirm |
| `in_progress`          | Cozinha começou a preparar. Aparece na coluna PREPARANDO.                          | Cozinha (PATCH /orders/:id/status)                        |
| `ready`                | Saiu da cozinha, pronto pra entrega. Aparece na coluna PRONTOS.                    | Cozinha                                                   |
| `delivered`            | Garçom entregou na mesa. Trigger pro rating prompt em ~13min.                      | Cozinha ou garçom                                         |
| `cancelled`            | Pedido cancelado em qualquer ponto. Terminal.                                      | Cliente, cozinha ou staff                                 |

## Aliases legacy (forward-compat)

`open` ⇆ `received` · `confirmed` ⇆ `received` · `preparing` ⇆ `in_progress`

A matriz `VALID_TRANSITIONS` aceita os aliases pra suavizar migração de rows existentes. **Novos INSERT sempre usam o nome canônico**: `pending_confirmation` no create, `received` no confirm.

## Transições válidas

```
pending_confirmation → received | cancelled
received             → in_progress | cancelled
in_progress          → ready | cancelled
ready                → delivered | cancelled
delivered            → (terminal)
cancelled            → (terminal)

# legacy aliases
open       → confirmed | received | cancelled
confirmed  → preparing | in_progress | cancelled
preparing  → ready | cancelled
```

## Bug histórico (P0-B-2 / Cat 2 do round 3)

`apps/web-staff/src/app/cozinha/page.tsx` filtrava só os aliases legacy (`open`/`confirmed` em NOVOS, `preparing` em PREPARANDO). 6/7 orders criadas pela API ficavam invisíveis no KDS porque o backend insere `received` e transiciona pra `in_progress`. Fix: filtro aceita ambos os nomes (canônico + alias) — preserva forward-compat sem reescrever migrations.

## Decisões

- **Enum textual** em vez de pgEnum: facilita aliases legacy sem precisar de DROP TYPE/CASCADE em produção.
- **Auto-confirm 15s**: balanceia "cancelar imediato" com "cozinha não espera infinito". Sweep job lazy nos polls do KDS, sem depender de @nestjs/schedule.
- **Audit em `order_status_history`**: toda transição grava (from, to, changed_by) — KDS mostra timeline e analytics consegue medir tempo médio por estágio.
