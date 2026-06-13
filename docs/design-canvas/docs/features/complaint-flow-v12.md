# V12 · Avaliação pós-entrega + Reclamação como chamado novo

Feature ponta-a-ponta cobrindo (i) o cliente avaliando o pedido após o garçom marcá-lo como `delivered`,
(ii) reclamação chegando pro gerente como **chamado novo tipo `complaint`**, e (iii) a resposta
retornando ao chat IA do cliente como `ManagerBubble` com **chip-action inset** opcional.

Canvas:

- Cliente: [`app-cliente-canvas-v2.html`](../../app-cliente-canvas-v2.html) · 6 seções · 10 frames
- Gerente: [`app-garcom-canvas-v12.html`](../../app-garcom-canvas-v12.html) · 7 seções · 7 frames

Handoff:

- `handoff/cliente/cliente-screens-v2.jsx` — todas as telas do cliente + `ManagerBubbleWithAction`
- `handoff/garcom/garcom-complaint.jsx` — telas do gerente + `MComplaintInProgressCard` + `ScreenComplaintDetail`

---

## Fluxograma

### Cliente

```
ScreenWaiterDeliveryConfirm (garçom marca delivered)
        │
        ↓  (delay 3-5 min · backend agenda push)
push lockscreen "Como foi o pedido?"
        │  tap
        ↓
ScreenCustomerOrderRating (rota /[slug]/avaliar/[orderId])
        │
        ├─ rating ≥ 4 + textarea vazia → POST /customer/orders/:id/rating → finaliza
        │     └─ opcional · ContinuationHome msg "Que bom que curtiu! Quer pedir um café?"
        │
        ├─ rating ≤ 3 OU textarea preenchida ────┐
        │                                         ↓
        └─ tap "Reportar um problema" ──→ ScreenCustomerComplaintCompose
                                                  │
                                                  ↓  POST /customer/orders/:id/complaint
                                          ScreenCustomerComplaintWaiting
                                                  │ (10s spinner OU tap "Voltar pra mesa")
                                                  ↓
                                          Home com continuation message especial
                                          ("Sua reclamação está com a Renata · respondeu em ~2 min em média")
                                                  │
                                                  ↓  WS complaint.responded
                                          ManagerBubble com chip-action no chat IA
                                          + push de resposta (som "humano respondendo")
```

### Gerente

```
WS complaint.created (broadcast managers do tenant)
        │
        ↓
push lockscreen "Reclamação · Mesa N · <nome>" (som crítico · NÃO silencia em zone-pause)
        +
Painel · Em curso · MInProgressCard kind="complaint" (border-left brick)
        +
Operação · Alertas · card no topo (CRÍTICO · HÁ X MIN · RECLAMAÇÃO)
        │
        ↓  tap
ScreenCallDetail type="complaint"
   hero brick lavado · estrelas filled brick · bubble do cliente com chip do tipo
   │
   ├─ chip "Já estou indo · 2 min"  (mais usado · primário)
   ├─ chip "Vou verificar com a cozinha · 3 min"
   ├─ chip "Mando uma cortesia pela espera"  → atalho pra ScreenManagerCompensateClient
   └─ chip "Custom · escrever do meu jeito"  → composer textarea
        │
        ↓  POST /staff/complaints/:id/respond
WS complaint.responded (target customer) · push pro cliente · cria entry em assistant_messages
        +
MInProgressCard vira state="resolved-summary" (border-left moss · 30 s antes de sumir)
   "Caleb leu há 12 s · pode marcar como resolvida"
        │
        ↓  WS complaint.read · 30 s timeout · OU tap "Marcar como resolvida"
POST /staff/complaints/:id/resolve · WS complaint.resolved · card some
```

---

## Schema · `complaints`

```sql
CREATE TABLE complaints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id uuid NOT NULL REFERENCES table_sessions(id),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  order_id         uuid NOT NULL REFERENCES orders(id),
  rating           smallint CHECK (rating BETWEEN 1 AND 5),  -- NULL se cliente foi direto pro complaint
  problem_type     text CHECK (problem_type IN ('demora','item-errado','item-faltando','comida-fria','outro')),
  description      text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  responded_at     timestamptz,
  responded_by     uuid REFERENCES staff(id),
  resolved_at      timestamptz,
  resolved_by      uuid REFERENCES staff(id),
  thread_id        uuid                 -- liga ao thread em assistant_messages
);

CREATE INDEX idx_complaints_unresolved
  ON complaints(table_session_id, created_at)
  WHERE resolved_at IS NULL;
```

Idempotência: backend garante **1 rating por order_id** (UNIQUE em `ratings.order_id`) e
**1 complaint open por order_id** (UNIQUE PARTIAL `WHERE resolved_at IS NULL`).

`assistant_messages` ganha um `kind='complaint_response'` (já existe `kind` text). Nada novo, só
um valor de enum lógico — `from_role='staff'` continua sendo o sinal canônico de que veio do
gerente, e o `metadata` JSONB carrega `{ chipAction?: 'on-the-way'|'kitchen-check'|'courtesy'|'custom', complaintId }`.

---

## Endpoints

### Customer

```
POST /customer/orders/:orderId/rating
  body: { rating: 1-5, comment?: string }
  → 201 { id, savedAt }
  side-effect: se rating ≥ 4 + comment vazio, encerra. Senão devolve { redirectTo: '/avaliar/.../complaint' }.

POST /customer/orders/:orderId/complaint
  body: { rating?: 1-5, problemType: enum, description: string }
  → 201 { complaintId, threadId, eta: '~2 min' }
  side-effect:
    · INSERT em complaints
    · WS complaint.created (broadcast managers do tenant)
    · push pro device dos managers on-shift
    · cria entry em painel.in_progress (kind='complaint')
```

### Manager (staff)

```
GET /staff/complaints?status=open|resolved|all
  → 200 [{ id, customerName, table, rating, problemType, description, createdAt, ... }]

POST /staff/complaints/:id/respond
  body: { content: string, chipAction?: 'on-the-way'|'kitchen-check'|'courtesy'|'custom' }
  → 200 { messageId, deliveredAt }
  side-effect:
    · UPDATE complaints SET responded_at=now(), responded_by=$staff
    · INSERT em assistant_messages (from_role='staff', kind='complaint_response',
                                    metadata: { chipAction, complaintId })
    · WS complaint.responded (target customer device · "human-responding" sound)
    · MInProgressCard vira state='resolved-summary' por 30s no painel do gerente

POST /staff/complaints/:id/resolve
  body: { reason?: string }
  → 200 { resolvedAt }
  side-effect:
    · UPDATE complaints SET resolved_at=now(), resolved_by=$staff
    · WS complaint.resolved (broadcast managers) · MInProgressCard some

POST /staff/complaints/:id/forward
  body: { toStaffId: uuid }
  → 200 { forwardedAt }  -- ação do MoreSheet "Encaminhar pra outro gerente"
```

---

## WebSocket events

| event                 | target                       | payload                                                         |
| --------------------- | ---------------------------- | --------------------------------------------------------------- |
| `complaint.created`   | broadcast managers do tenant | `{ complaintId, tableNumber, customerId, problemType, rating }` |
| `complaint.responded` | target customer device       | `{ complaintId, messageId, content, chipAction? }`              |
| `complaint.read`      | target manager que respondeu | `{ complaintId, readAt }`                                       |
| `complaint.resolved`  | broadcast managers           | `{ complaintId, resolvedAt, resolvedBy }`                       |

`complaint.read` dispara automaticamente quando o cliente abre o chat e a `ManagerBubble` entra
no viewport (IntersectionObserver no client). `30 s` após `complaint.responded`, se não houver
`complaint.read`, o `MInProgressCard` ainda some — o card resolved-summary é puramente de
feedback ao gerente, não bloqueia a transição.

---

## Componentes-chave

| Componente                       | Arquivo                  | Notas                                                                          |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `ScreenCustomerOrderRating`      | `cliente-screens-v2.jsx` | 5 estrelas + textarea opcional. CTAs condicionais.                             |
| `ScreenCustomerComplaintCompose` | `cliente-screens-v2.jsx` | 5 chips de tipo · textarea obrig. · `RENATA · ON-LINE AGORA` indicator.        |
| `ScreenCustomerComplaintWaiting` | `cliente-screens-v2.jsx` | Spinner reassurance · 10 s antes de redirect.                                  |
| `ManagerBubbleWithAction`        | `cliente-screens-v2.jsx` | Extende `ManagerBubble` (V4) com `<ChipActionInset kind="...">`.               |
| `MComplaintInProgressCard`       | `garcom-complaint.jsx`   | Pattern V4 (border-left brick/moss). 2 estados: `active` · `resolved-summary`. |
| `ScreenComplaintDetail`          | `garcom-complaint.jsx`   | Hero brick · 4 chips · composer custom · MoreSheet.                            |

### `ChipActionInset` — kinds disponíveis

| `kind`          | Eyebrow + label                           | Ícone    |
| --------------- | ----------------------------------------- | -------- |
| `on-the-way`    | Renata avisou · "Chega em 3 min"          | clock    |
| `kitchen-check` | Renata avisou · "Foi falar com a cozinha" | check    |
| `courtesy`      | Renata avisou · "Cortesia a caminho"      | giftSeal |

Visual: inset row dentro do mesmo card `ManagerBubble`, separada da prosa por `border-top: 1px C.borderSoft`,
com mono caps eyebrow + ícone outline em circle 28×28. **Não floating · não card separado.**

---

## Pontos delicados

1. **Som distinto pro push de resposta da gerente** — não usar o som da IA. iOS usa um `UNNotificationSound`
   custom registrado como `human-responding.caf`. Android usa NotificationChannel com
   `setSound()` separado pra `complaint_responses`.
2. **Zone-pause não silencia complaint** — em `garcom-app/notification-router.ts`, complaints
   passam por cima do mute. Tratar como "always-deliver" mesmo quando o turno está em pausa.
3. **Idempotência do rating** — backend deve respeitar UNIQUE em `ratings.order_id`. Re-tentativa
   do cliente deve devolver `200 { alreadyRated: true }` ao invés de 409.
4. **Read receipt em rolling-window** — quando a thread com gerente está ativa (≤ 5 min após a
   última msg dela), respostas do cliente vão pra `ManagerThread`, não pra IA. Após 5 min sem
   atividade, volta pro routing IA default.
5. **Chip-action é opcional** — se a resposta da gerente foi puramente texto livre (chip "Custom"),
   `metadata.chipAction` fica `null` e o `ManagerBubble` renderiza só a prosa, sem inset.

---

## Checklist de implementação

### Backend

- [ ] migration `complaints` + index parcial unresolved
- [ ] endpoints customer (rating · complaint) + manager (list · respond · resolve · forward)
- [ ] WS events `complaint.created` · `complaint.responded` · `complaint.read` · `complaint.resolved`
- [ ] `assistant_messages.kind='complaint_response'` validation + metadata schema
- [ ] notification-router respeita complaint over zone-pause

### apps/web-customer

- [ ] rota `/[slug]/avaliar/[orderId]` + páginas rating/complaint/waiting
- [ ] componente `ManagerBubble` aceita prop `chipAction`
- [ ] continuation-message kind `pos_reclamacao`

### apps/web-staff

- [ ] `Call.type` adiciona `'complaint'`
- [ ] `MInProgressCard` aceita `kind='complaint'` (active + resolved-summary)
- [ ] `ScreenCallDetail` aceita `type='complaint'` com 4 chips
- [ ] entry em Operação · Alertas (card crítico no topo)
- [ ] push channel separado com som crítico · always-deliver
