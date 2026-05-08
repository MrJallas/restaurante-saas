# Backend notes — App do Cliente (4.2 → 4.5)

Notas de schema/endpoints sugeridos pra acompanhar o redesign.
Espelha a convenção atual de `apps/api` (NestJS) + `services/ai-service` (FastAPI) + `packages/database`.
Multi-tenant por slug (`/{slug}/...`).

---

## 4.2 — Mensagens de continuidade

### Pool de templates (Redis · paridade com home.service.ts)

Mesma mecânica das welcome messages:

```
KEY: continuation:{slug}:{kind}
TYPE: list (LPOP determinístico)
SEED: bootstrap a partir de fixtures/continuation-{lang}.json
REFILL: cron a cada 1h se LLEN < 3 OU on-demand quando LLEN === 0
```

Categorias (mínimo 8 templates cada — drafts em `cliente-tokens.jsx → CONTINUATION_POOL`):

| Kind | Trigger (último evento ordenado por timestamp) |
|---|---|
| `viu_cardapio` | `assistant_messages.action='menu_viewed'` |
| `chamou_garcom` | `waiter_calls.created_at` |
| `abriu_pedido` | `orders.created_at` |
| `pagou` | `payments.captured_at` |
| `voltou_sem_acao` | última ação > 8 min · fallback |

`renderTemplate()` aceita `{nome}`, `{restaurante}`, `{ultimo_prato}` — mesma assinatura do `home.service.ts`.

### Extensão do `HomeData`

```ts
// packages/database (drizzle/prisma) — sem migration: campo derivado
export interface HomeData {
  heroMessage: string;          // welcome (existente)
  lastVisitSummary: { last_items: string[] };
  isReturning: boolean;
  // novo:
  continuationMessage?: string; // se != null, sobrepõe heroMessage no UI
  continuationKind?: 'viu_cardapio' | 'chamou_garcom'
                  | 'abriu_pedido' | 'pagou' | 'voltou_sem_acao';
}
```

### `GET /{slug}/home?customerId=…` — lógica

```ts
async getHome(slug, customerId) {
  const lastAction = await deriveLastAction(slug, customerId); // SQL window function
  if (!lastAction || isNewSession(lastAction)) {
    return { heroMessage: await pickWelcome(slug), isReturning, ... };
  }
  const kind = mapEventToKind(lastAction);             // event -> kind
  const tmpl = await redis.lpop(`continuation:${slug}:${kind}`);
  return {
    heroMessage: await pickWelcome(slug),              // fallback se UI quiser
    continuationMessage: renderTemplate(tmpl, vars),
    continuationKind: kind,
    ...
  };
}
```

`isNewSession` usa janela de 30 min (config no tenant) — após pagar e ficar 30 min ocioso, próxima visita é welcome de novo, não continuation.

### Sugestões contextuais (chips)

Substituir o `SUGGESTION_CHIPS` estático por mapeamento `kind → chips[]` (já modelado em `CONTEXT_SUGGESTIONS`). Frontend renderiza, sem novo endpoint.

### 4.2.x — Camada ACK no `/classify` (NOVA · entre greeting e regex guardrails)

Quando o cliente responde só "ok", "tá", "valeu", emoji 👍 — não vale chamar LLM. Quarta camada do guardrail intercepta e devolve uma resposta curta do pool, sem custo.

```python
# services/ai-service/main.py — ANTES das regex guardrails

ACK_PATTERNS = [
    re.compile(
        r'^\s*(ok|okay|kk|tá|ta|blz|beleza|valeu|vlw|tranquilo|tranquila|'
        r'tudo bem|td bem|tdb|massa|show|legal|certo|combinado|fechou|fechado|'
        r'obrigad[oa]|obg|obgda|brigad[oa]|de boa|de boas|sim|claro|perfeito)'
        r'\s*[!.?]*\s*$',
        re.IGNORECASE,
    ),
    re.compile(r'^[👍👌🙏✌️🤝💪🆗]+$'),
]

def detect_ack(msg: str) -> bool:
    return any(p.match(msg) for p in ACK_PATTERNS)

# pool de respostas — Redis lpop rotativo
ACK_RESPONSES_KEY = "ack:{slug}"
ACK_BOOTSTRAP = [
    "Tô aqui se precisar.",
    "Combinado.",
    "Qualquer coisa, é só chamar.",
    "Beleza, fica à vontade.",
    "Sussa.",
    "Show. Aproveita aí.",
]

@app.post("/classify")
async def classify(req: ClassifyRequest):
    # 1. greeting detector (pré-existente)
    if detect_greeting(req.message): ...

    # 2. ACK detector (NOVO)
    if detect_ack(req.message):
        response = await redis.lpop(f"ack:{req.tenant_slug}") or random.choice(ACK_BOOTSTRAP)
        await persist_message(
            session_id=req.session_id,
            content=response,
            from_role='ai',
            kind='ack',           # NOVA coluna · diferencia de chat normal
            tokens_in=0,
            tokens_out=0,
        )
        return ClassifyResponse(
            intent='ack',
            response=response,
            should_chat=False,    # frontend NÃO renderiza chips depois
            typing_ms=600,        # mais rápido que normal (1.2s)
        )

    # 3. regex guardrails (pré-existente)
    # 4. LLM (pré-existente)
```

Schema:

```sql
ALTER TABLE assistant_messages
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'
    CHECK (kind IN ('chat', 'greeting', 'ack', 'system'));
```

Frontend (`apps/web-customer`):

- Renderiza como `AssistantBlock` normal (mono caps eyebrow + texto inline) — **não cria bubble**.
- Typing animation em **600ms** (mais rápida que normal).
- **Sem chips** depois — ack não exige próxima ação.
- Telemetria: `event: assistant.ack` com props `{ message: snippet, response_id, latency_ms }`.

Razão: economiza ~30% das chamadas LLM em sessões longas (cliente responde "ok" várias vezes durante a noite). Custo $0 + latência 0 + alucinação 0.

---

## 4.3 — Bottom sheet "Chamar garçom"

**Sem backend.** É refactor puro do UI da rota `/[slug]/garcom/chamar` → componente Drawer (`vaul`) sobreposto à `/[slug]/mesa/[tableCode]`.

```diff
- /[slug]/garcom/chamar/page.tsx       (apagar)
+ apps/web-customer/components/CallWaiterSheet.tsx
+ uso: <Drawer.Root> em torno do layout de mesa
```

A rota `/[slug]/garcom/chamando` (estado persistente) fica.

Endpoint atual de `POST /{slug}/waiter-calls` permanece — o sheet só dispara após `onConfirm`.

---

## 4.4 — Cortesia recebida

### Novos endpoints

```
POST /{slug}/courtesies
  body: { session_id, item_id, manager_id, message?: string }
  -> { courtesy_id, status: 'pending' }   # gerente cria

POST /{slug}/courtesies/:id/accept
  -> { status: 'accepted', waiter_id, eta_minutes }

POST /{slug}/courtesies/:id/decline
  -> { status: 'declined' }
```

### Tabela nova

```sql
CREATE TABLE courtesies (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  item_id         UUID NOT NULL REFERENCES menu_items(id),
  category        TEXT NOT NULL,            -- 'sobremesa', 'entrada', 'bebida', ...
  manager_id      UUID NOT NULL,            -- staff que ofereceu
  manager_message TEXT,                     -- quote opcional do gerente
  status          TEXT NOT NULL,            -- 'pending' | 'accepted' | 'declined'
  waiter_id       UUID,                     -- alocado on accept
  eta_minutes     INT,                      -- ETA mostrado no UI
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  responded_at    TIMESTAMP,

  INDEX idx_courtesies_session (tenant_id, table_session_id, status)
);
```

### WebSocket (EventsGateway)

```ts
// gerente cria → cliente recebe
socket.to(`session:${session_id}`).emit('courtesy.offered', courtesyDto);

// cliente aceita/recusa → gerente vê toast
socket.to(`staff:${tenant_id}`).emit('courtesy.responded', { id, status });
```

### Auditoria (5.5 do brief)

`courtesies` é a fonte da auditoria de cortesias acessível em `Eu › Cortesias` no app do gerente. Filtro por `manager_id`, `status`, `created_at`.

---

## 4.5 — Mensagem do gerente no chat (DECISÃO: extender `assistant_messages`)

### Schema — adicionar coluna `from_role`

Recomendação do brief (menos joins do que tabela separada):

```sql
ALTER TABLE assistant_messages
  ADD COLUMN from_role TEXT NOT NULL DEFAULT 'ai'
    CHECK (from_role IN ('customer', 'staff', 'ai'));

ALTER TABLE assistant_messages
  ADD COLUMN staff_id UUID REFERENCES staff_users(id),
  ADD COLUMN staff_name_snapshot TEXT;        -- "Renata"
                                               -- snapshot pra histórico
                                               -- não muda quando staff é renomeado

ALTER TABLE assistant_messages
  ADD COLUMN reply_to_role TEXT;              -- pra customer reply: 'staff' | 'ai'

CREATE INDEX idx_msgs_session_role
  ON assistant_messages (table_session_id, from_role, created_at);
```

Migrar `from_role='ai'` em todos os registros existentes (default já cuida).

### Novos endpoints

```
POST /{slug}/staff/messages
  body: { session_id, content, staff_id }
  -> { message_id, created_at }

  - INSERT INTO assistant_messages (..., from_role='staff', staff_id, staff_name_snapshot)
  - emit WS event 'staff.message' to session room

POST /{slug}/customer/messages
  body: { session_id, content, reply_to_role: 'staff' | 'ai' }
  -> { message_id, ... }

  - se reply_to_role='staff':
    - emit WS event 'customer.reply' para staff:tenant — vira card de "Atenção" no app gerente
    - NÃO chama AI service
  - se reply_to_role='ai':
    - flow normal (POST /chat no AI service)
```

### Sugestões inteligentes pro gerente (5.6 do brief)

```
POST /smart-suggestions  (FastAPI · ai-service)
  body: {
    tenant, mesa, situacao: 'pedido_atrasado' | 'chamado_sem_resposta' | 'cliente_novo',
    tempo_espera_min, tipo_alerta, pedido_atual?: { name, started_at, eta_min }
  }
  -> { suggestions: [{ icon: 'clock'|'hand'|'plate', label: '...', body: '...' }, ...] }
```

Reusa o guardrail de 3 camadas existente do `/classify` — greeting detector ignorado, regex guardrails (sem prometer descontos sem permissão), LLM compõe 3-5 sugestões.

### App do cliente — render

- Bubble com `from_role='staff'` aparece com:
  - Border-left 3px terracota
  - Header com badge mono "RENATA · GERENTE" (vem de `staff_name_snapshot`)
  - Sans body 15px (NÃO italic — IA é italic, gerente é "presença real")
  - Sem typing animation
  - Animação cManagerArrive (translateY 8→0 + fade 0→1, 360ms)
- Quando customer responde, `reply_to_role` é setado pra `staff` automaticamente
  enquanto a thread está ativa com gerente

---

## Sumário · novas dependências

| Pacote | Uso |
|---|---|
| `vaul` (web-customer) | Bottom sheet 4.3 |
| (nada novo no api) | endpoints adicionados em controllers existentes |
| (nada novo no ai-service) | `/smart-suggestions` adicionado em `app.py` |

## Migrations a criar

1. `2026XXXX_add_continuation_pool.sql` — bootstrap das listas Redis (script idempotente)
2. `2026XXXX_create_courtesies.sql` — tabela 4.4
3. `2026XXXX_alter_assistant_messages_from_role.sql` — colunas 4.5

## Eventos WS resumidos

| Evento | Direção | Payload |
|---|---|---|
| `courtesy.offered` | staff → customer | `CourtesyDto` |
| `courtesy.responded` | customer → staff | `{ id, status }` |
| `staff.message` | staff → customer | `MessageDto` (from_role='staff') |
| `customer.reply` | customer → staff | `MessageDto` (reply_to_role='staff') |
