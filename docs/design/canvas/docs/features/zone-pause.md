# Feature spec · Zone-pause (pausa de zona do garçom)

> Pausa de pedidos novos restrita às mesas atendidas por um garçom específico,
> sem afetar o resto do salão. Acionada pelo gerente quando um garçom está
> sobrecarregado e precisa "respirar" alguns minutos pra entregar a fila atual
> antes de pegar pedido novo.

**Diferença em relação à pausa global** (`/manager/orders/pause`): essa pausa
afeta o salão inteiro — cliente continua vendo o cardápio, mas o ETA cresce
silenciosamente em todas as mesas. **Zone-pause** é cirúrgica: só os clientes
das mesas do garçom alvo veem ETA aumentado; o resto do salão funciona normal.

---

## Trigger

Acionada por um dos dois caminhos:

1. **`ScreenManagerStatDetail` variante `sobrecarga`** — KPI detail "Mensagem
   direta pro Caleb" → ação "Pausar mesas do Caleb por 5 min" + chip-row de
   duração 5/10/15/30 min.
2. **`MContactStaffSheet`** (V9) — chip de sugestão "Pause os pedidos novos
   das suas mesas por 5 min" → backend interpreta como zone-pause shortcut e
   gera uma bubble especial dentro da thread `/staff/messages` (chip-action
   bubble · ★ V10 ★) com card mostarda "ZONE-PAUSE · 5 MIN" + CTA "Ver pausa".

---

## Schema

```sql
CREATE TABLE zone_pauses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  staff_id        uuid NOT NULL REFERENCES staff_users(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz NOT NULL,
  duration_min    smallint NOT NULL CHECK (duration_min IN (5, 10, 15, 30)),
  triggered_by    uuid REFERENCES staff_users(id),  -- gerente
  trigger_source  text CHECK (trigger_source IN ('overload-detail', 'contact-staff-chip', 'manual')),
  released_at     timestamptz,                       -- NULL = ainda ativa OU expirou sozinha
  released_by     uuid REFERENCES staff_users(id),   -- NULL = auto-release
  CHECK (ends_at > started_at)
);

CREATE INDEX zone_pauses_active_idx
  ON zone_pauses(staff_id, ends_at)
  WHERE released_at IS NULL;
```

**Active definition:** `released_at IS NULL AND ends_at > now()`.

---

## Endpoints

```
POST /{slug}/staff/:id/zone-pause
  body: { duration_min: 5|10|15|30, source: 'overload-detail'|'contact-staff-chip'|'manual' }
  -> 201 { id, started_at, ends_at, duration_min }
  side-effects:
    - dispara WS event `zone_pause.started` pro device do garçom alvo
    - dispara WS event `zone_pause.started` pro device do gerente acionador
    - agenda job de auto-release em ends_at

POST /{slug}/staff/:id/zone-pause/:pause_id/release
  -> 200 { released_at }
  side-effects:
    - dispara WS event `zone_pause.released` pra ambos lados

GET /{slug}/staff/:id/zone-pause/active
  -> 200 { ...zone_pause } | 204 (sem pausa ativa)
```

---

## WS events

| Evento                     | Direção                       | Payload                                       | Quando                           |
| -------------------------- | ----------------------------- | --------------------------------------------- | -------------------------------- |
| `zone_pause.started`       | server → staff alvo + gerente | `{ id, ends_at, duration_min, triggered_by }` | gerente acionou pause            |
| `zone_pause.released`      | server → staff alvo + gerente | `{ id, released_at, by_auto }`                | timer terminou OU release manual |
| `zone_pause.expiring_soon` | server → staff alvo           | `{ id, ends_at, seconds_left }`               | 30s antes de expirar             |

---

## Effect on order intake

Quando há um `zone_pauses` ativo pra `staff_id=X`:

- Pedidos novos do **cardápio digital** vindos de mesas atendidas pelo garçom X
  ficam em **fila congelada** (`orders.status = 'pending_zone_pause'`). Não
  entram na cozinha. ETA mostrado pro cliente cresce silenciosamente em
  `+remaining_min`.
- Pedidos do cardápio digital de mesas de **outros garçons** seguem normais.
- Quando a pause expira (auto OU manual), todos os pedidos `pending_zone_pause`
  do garçom alvo entram na cozinha de uma vez, em ordem cronológica de
  inserção (FIFO). Sem reordenação especial.

---

## Pedido manual lançado pelo garçom durante a pausa (★ V10 · 2026-05 ★)

> **Importante:** zone-pause é uma proteção de fluxo de cozinha contra
> sobrecarga, não uma trava sobre o garçom. Garçom continua atendendo a
> mesa fisicamente — leva água, conversa, pega pedido falado.

Quando o **garçom alvo lança um pedido manualmente** durante uma zone-pause
ativa (caso de uso real: cliente da mesa 14 chamou na faixa, pediu de boca
"mais uma cerveja e um couvert", garçom entra no app e lança pra mesa
manualmente), o backend **NÃO BARRA o pedido**. Ele entra no MESMO congelador
que pedidos do cardápio digital — `orders.status = 'pending_zone_pause'` —
e libera junto quando a pause expira.

Por que não barrar:

1. **Garçom é a fonte de verdade do que está acontecendo na mesa**, não o
   sistema. Se ele lançou manualmente, é porque cliente está pedindo na
   frente dele e bloquear seria pior UX que adiar 4 min.
2. **Cliente continua vendo o pedido na linha do tempo** (ETA já cresceu
   silenciosamente, então não é surpresa).
3. **Trava só geraria atrito** — garçom acharia que o app está quebrado.

UX side-effect:

- Toast discreto após o lançar: `"Pedido entra no fluxo quando a pausa
encerrar (em 4:23)."` — sem cor de erro, mostarda discreta. Garçom vê e
  entende; cliente nunca vê esse aviso.
- O pedido aparece na fila do `ScreenManagerOrdersPause` em modo zone com
  badge `MANUAL` ao lado do `DIGITAL` — gerente vê de onde veio se for
  preciso auditar.

Mesmo comportamento se a pausa for **global** (não zone), mas só o garçom
atribuído pode lançar manualmente sem trava — fluxos do cliente continuam
no congelador. Ver `ScreenManagerOrdersPause` para a UI de pausa global.

---

## Edge cases

- Se o gerente acionar zone-pause pra um garçom que **já tem zone-pause
  ativa**, o `POST /zone-pause` retorna 409 com `{ error: 'already_paused',
ends_at }`. Frontend abre o `ScreenManagerOrdersPause` em modo zone do
  pause existente.
- Se o garçom alvo **encerrar o turno** durante a zone-pause, ela é
  auto-released (`released_by = NULL · trigger_source registra
'shift-end'`). Pedidos `pending_zone_pause` daquele garçom são
  redistribuídos pro garçom de cobertura conforme `staff_users.is_paused` →
  na prática isso não acontece com frequência e cai no fluxo de
  realocação de mesa (ver `host-swap` no canvas).
- Push lockscreen `manager-message` recebido **durante** uma zone-pause é
  **silenciado** (sem som, sem vibração) mas a mensagem ainda aparece na
  Caixa de Mensagens (V10 · `ScreenStaffMessages`) e na aba Chamados —
  tipicamente a mensagem é o gerente pedindo confirmação que a pausa está
  funcionando, e tocar um som no garçom já apertado seria contraproducente.
