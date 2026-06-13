# Backend notes — App do Gerente / Garçom (Painel · Operação · Equipe · Sheet Contactar cliente)

Notas de schema/endpoints sugeridos pra acompanhar o redesign.
Espelha a convenção atual de `apps/api` (NestJS) + `services/ai-service` (FastAPI) + `packages/database`.
Multi-tenant por slug.

---

## 5.6 — Sheet "Contactar cliente"

Substitui o que era `'Cortesia mesa'` como ação default secundária dos cards de alerta. Bottom-sheet vaul-style sobreposto à Operação atual — sem mudança de rota.

### Endpoint do AI service · `POST /smart-suggestions`

Gera **3-5 sugestões contextuais** para a mensagem do gerente ao cliente. Reusa o guardrail de 3 camadas do `/classify` (greeting → regex → LLM), com **pool determinístico primeiro** — LLM só entra em contexto atípico.

```python
# services/ai-service/main.py

class SuggestionRequest(BaseModel):
    tenant_slug: str
    mesa_n: int
    customer_name: Optional[str] = None
    situacao: Literal[
        'pedido_atrasado',
        'chamado_sem_resposta',
        'cliente_novo_aguardando',
        'pagamento_demorado',
        'mesa_sem_atividade',
    ]
    tempo_espera_min: int
    tipo_alerta: Optional[str] = None
    pedido_atual: Optional[dict] = None    # { name, started_at, eta_min }
    garcom_responsavel: Optional[str] = None

class Suggestion(BaseModel):
    id: str
    icon: Literal['clock', 'hand', 'plate', 'gift', 'check']
    text: str
    links_to: Optional[str] = None         # 'mgr-compensate' quando o chip
                                            # for "Quer uma cortesia pela espera?"

class SuggestionResponse(BaseModel):
    suggestions: list[Suggestion]
    includes_courtesy_offer: bool
    source: Literal['pool', 'llm']         # telemetria — quanto tá saindo via pool

@app.post("/smart-suggestions")
async def smart_suggestions(req: SuggestionRequest) -> SuggestionResponse:
    # 1. Pool determinístico (Redis) — mesmo padrão das welcome-messages
    pool_key = f"suggestions:{req.tenant_slug}:{req.situacao}"
    candidates = await redis.lrange(pool_key, 0, -1)
    if candidates:
        return render_pool(candidates, req)

    # 2. LLM fallback — só pra situações fora do pool
    return await llm_suggestions(req)
```

#### Pool determinístico por `situacao`

Mesmo padrão das welcome messages (`renderTemplate()` com placeholders `{min}`, `{garcom_nome}`, `{nome_cliente}`, `{prato}`).

```jsonc
// fixtures/suggestions-pt-BR.json — bootstrap pra Redis
{
  "pedido_atrasado": [
    { "id": "p1", "icon": "clock", "text": "Já fui verificar seu pedido na cozinha" },
    { "id": "p2", "icon": "clock", "text": "Saindo da cozinha em uns {min} min" },
    { "id": "p3", "icon": "plate", "text": "Pediu adiantar uma entrada enquanto isso?" },
    {
      "id": "p4",
      "icon": "gift",
      "text": "Que tal uma cortesia pela espera?",
      "links_to": "mgr-compensate",
    },
  ],
  "chamado_sem_resposta": [
    { "id": "c1", "icon": "hand", "text": "Estou indo aí em {min} min" },
    { "id": "c2", "icon": "hand", "text": "Manda o que precisa por aqui que adianto" },
    { "id": "c3", "icon": "hand", "text": "{garcom_nome} já tá indo na sua mesa" },
  ],
  "cliente_novo_aguardando": [
    { "id": "n1", "icon": "hand", "text": "Bem-vindo! Já vou aí" },
    { "id": "n2", "icon": "plate", "text": "Posso sugerir nossa entrada da casa enquanto isso?" },
  ],
  "pagamento_demorado": [
    { "id": "$1", "icon": "clock", "text": "Já levo a maquininha" },
    { "id": "$2", "icon": "check", "text": "Pode pagar pelo app, é instantâneo: {link}" },
  ],
}
```

#### Bootstrap

```bash
# 1. Carrega o JSON em Redis usando o mesmo script das welcome
node scripts/bootstrap-suggestion-pool.js fixtures/suggestions-pt-BR.json
# Output:
#   suggestions:trattoria-luna:pedido_atrasado · 4 templates carregados
#   suggestions:trattoria-luna:chamado_sem_resposta · 3 templates carregados
#   ...
```

#### Por que pool antes de LLM

- **Latência** — pool é Redis-fast; LLM tem 1-3s.
- **Custo** — não chama OpenAI/Anthropic em 80% dos casos.
- **Determinismo** — gerente vê variações controladas (sem alucinação tipo "te mando uma água com gás cortesia" — que não existe no menu).
- **Auditável** — `source: 'pool' | 'llm'` vai pra telemetria; gerente do tenant pode ver % LLM por situação.

#### Anti-prompt-injection

A camada de regex guardrails do `/classify` é reusada aqui — a request bloqueia se `customer_name` ou `pedido_atual.name` contiverem patterns conhecidos de prompt injection (`"ignore previous"`, `"system:"`, `"<|"`, etc.). Resposta neutra do pool é sempre o fallback seguro.

---

## 5.6 (cont.) — Persistência da mensagem enviada

Quando o gerente toca **"Enviar como Renata"**, o frontend chama `POST /{slug}/staff/messages` (já documentado em `cliente/server-notes.md` seção 4.5):

```ts
POST /{slug}/staff/messages
  body: {
    session_id,
    content,             // texto enviado (chip ou textarea)
    staff_id,            // do JWT
    suggestion_id?: string,  // se veio de chip · pra telemetria de adoção
  }
  -> { message_id, created_at }
```

Insere em `assistant_messages` com `from_role='staff'` + emite WS event `staff.message` pro app do cliente. Cliente vê como bubble com badge mono caps "RENATA · GERENTE" (sec 4.5 do brief).

---

## 5.7 — Mensagem direta gerente → staff (★ V9 · 2026-05 ★)

Espelha o sheet "Contactar cliente" (5.6), mas **destinatário é outro funcionário** — caso de uso central: SOBRECARGA do garçom · KPI detail "Mensagem direta pro Caleb" · cards da Equipe · ScreenManagerStaffDetail. Backend quase 100% reusado — única extensão é generalizar `assistant_messages` com `to_role` + `to_staff_id` (já tinha `from_role`).

### Schema · estende `assistant_messages`

```sql
ALTER TABLE assistant_messages
  ADD COLUMN to_role         text       CHECK (to_role IN ('client','staff')),
  ADD COLUMN to_staff_id     uuid       REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN read_at         timestamptz,
  ADD COLUMN delivered_at    timestamptz;

-- to_role default 'client' pra todas as rows existentes (compatibilidade V4-V8)
UPDATE assistant_messages SET to_role = 'client' WHERE to_role IS NULL;
ALTER TABLE assistant_messages ALTER COLUMN to_role SET NOT NULL;
ALTER TABLE assistant_messages ALTER COLUMN to_role SET DEFAULT 'client';

-- Quando to_role='staff' o session_id vira opcional (mensagens staff-to-staff
-- não pertencem a sessão de cliente). Drop NOT NULL com check condicional:
ALTER TABLE assistant_messages
  DROP CONSTRAINT IF EXISTS assistant_messages_session_required;
ALTER TABLE assistant_messages
  ADD CONSTRAINT assistant_messages_target_check
  CHECK (
    (to_role = 'client' AND session_id IS NOT NULL  AND to_staff_id IS NULL) OR
    (to_role = 'staff'  AND session_id IS NULL      AND to_staff_id IS NOT NULL)
  );

CREATE INDEX assistant_messages_to_staff_unread_idx
  ON assistant_messages(to_staff_id, created_at DESC)
  WHERE to_role = 'staff' AND read_at IS NULL;
```

### Endpoint · `POST /{slug}/staff/messages` (mesmo path · branch por to_role)

```ts
POST /{slug}/staff/messages
  body: {
    // exatamente UM dos dois conjuntos abaixo:

    // (a) cliente · existente desde V4
    session_id?: uuid,
    // (b) staff · novo V9
    to_staff_id?: uuid,

    content: string,
    suggestion_id?: string,         // se veio de chip
  }
  -> { message_id, created_at, to_role }
```

O backend infere `to_role` a partir de qual campo veio (`session_id` ⇒ `'client'` · `to_staff_id` ⇒ `'staff'`). Cabeçalho `from_role` continua vindo do JWT do gerente.

### Roteamento WS pelo `EventsGateway`

`to_role='staff'` faz com que o gateway emita pro **socket do staff alvo** (não da sessão de cliente):

```ts
// apps/api/src/events/events.gateway.ts
@OnEvent('assistant_message.created')
handleStaffMessageCreated(payload: AssistantMessage) {
  if (payload.to_role === 'client') {
    return this.io.to(`session:${payload.session_id}`).emit('staff.message', payload);
  }
  // V9 · staff-to-staff
  this.io.to(`staff:${payload.to_staff_id}`).emit('manager.message', payload);
  this.push.send(payload.to_staff_id, {
    title: `${payload.from_name} mandou uma mensagem`,
    body: payload.content.slice(0, 120),
    sound: 'staff_message_soft',  // ⚠ NÃO toca durante zone-pause ativa
    data: { kind: 'manager-message', message_id: payload.id },
  });
}
```

Quando a sessão do garçom alvo está ativa (socket conectado), ele recebe via WS _em tempo real_ + push. Sessão fechada ⇒ só push. Push usa som `staff_message_soft` (mais discreto que `pedido_pronto`) e respeita o estado `zone_pauses` da feature `zone-pause.md` — durante uma pausa ativa, push de manager-message é **silenciado** mas a mensagem ainda aparece na lista de Chamados.

### Read receipt · waiter abre a mensagem

Quando o garçom abre `ScreenStaffMessageDetail` (ou toca "Marcar como lido"):

```ts
POST /{slug}/staff/messages/:id/read
  -> { read_at }
```

Backend:

1. `UPDATE assistant_messages SET read_at = NOW() WHERE id = :id AND to_staff_id = :auth_staff`
2. Emite `manager.message.read { message_id, read_at }` pro socket do gerente (`manager:${from_staff_id}`)
3. Frontend do gerente atualiza o status pill do `MContactStaffSheet` (sent state) de "Aguardando leitura…" mostarda → "Lido às 19:43" verde.

### Resposta do garçom (★ V9 ★)

`ScreenStaffMessageDetail` tem CTA "Responder" + chips de resposta rápida ("Beleza, tô indo" · "Preciso de reforço" · "Já resolvendo"). Tap abre sheet textarea simples · enviar dispara o MESMO endpoint `POST /staff/messages` mas invertido (waiter vira `from_role='staff'` · manager vira `to_staff_id`). Vai pro `MContactStaffSheet` do gerente como `ManagerBubble` invertido (visualizado no estado `sent` desenhado no canvas).

### Eventos WS adicionais

| Evento                    | Direção               | Payload                                     | Quando                                                                    |
| ------------------------- | --------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| `manager.message`         | server → staff (alvo) | mensagem completa                           | gerente enviou + push enviado                                             |
| `manager.message.read`    | server → manager      | `{ message_id, read_at }`                   | staff alvo abriu detail OU "Marcou como lido"                             |
| `manager.message.replied` | server → manager      | `{ message_id, reply_message_id, content }` | staff alvo respondeu (round-trip · vira nova row em `assistant_messages`) |

### Telemetria · adicional ao 5.6

```
event: manager_message.sent
  props: was_from_chip (bool), suggestion_id?, char_count,
         target_staff_role ('garcom'|'cozinha'|'caixa'),
         target_overload_state ('sobre'|'media'|'ok')

event: manager_message.read
  props: message_id, time_to_read_ms

event: manager_message.replied
  props: message_id, time_to_reply_ms, was_from_quick_chip (bool)
```

KPI sugerido: **% de mensagens lidas em < 60s pelo staff alvo**. Mostra se push está funcionando + se garçom não está saturado.

### Reuso futuro (★ candidato ★)

`ScreenStaffMessageDetail` foi DEPRECATED no V10 (substituído por `ScreenStaffMessages` + `ScreenStaffMessageThread`). O componente continua genérico — recebe uma mensagem qualquer com `from_role='staff'` + `to_role='staff'`. No Prompt 8 (cascade QR ilegível + late-arrival), recepção pode mandar mensagem direta pro garçom da praça pelo MESMO endpoint `POST /staff/messages` (só muda o `from_name` "Letícia · recepção" e o `to_staff_id`) — agora a mensagem aparece naturalmente como thread na Caixa de Mensagens, sem precisar de tela isolada.

---

## 5.7-bis — Caixa de mensagens · threads + read receipts (★ V10 · 2026-05 ★)

V9 fechou o round-trip de mensagem unitária staff→staff. V10 consolida: a mensagem isolada vira **thread**, e cada role ganha uma Caixa de mensagens completa acessível pelo Eu (ActionRow "Mensagens" no bloco OPERAÇÃO). Round-trip do V9 continua funcionando — só que o tap do push e do item de Chamados leva direto pra `ScreenStaffMessageThread` (deep-link via `senderId`), não mais pra `ScreenStaffMessageDetail` isolado.

### Schema · estende `assistant_messages` (V10)

```sql
ALTER TABLE assistant_messages
  ADD COLUMN thread_id  uuid;

-- Backfill thread_id pra rows V9 já existentes (staff→staff)
-- O thread_id é determinístico por par de staff_ids · LEAST/GREATEST
-- garante simetria (Caleb→Renata e Renata→Caleb caem na mesma thread).
UPDATE assistant_messages
SET thread_id = uuid_generate_v5(
  '00000000-0000-0000-0000-000000000000'::uuid,    -- namespace fixo
  LEAST(from_staff_id::text, to_staff_id::text) || '|' ||
  GREATEST(from_staff_id::text, to_staff_id::text)
)
WHERE to_role = 'staff' AND thread_id IS NULL;

ALTER TABLE assistant_messages
  ALTER COLUMN thread_id SET NOT NULL
  -- só pra to_role='staff'; rows com to_role='client' deixam NULL
  -- (uma sessão de cliente já é um agrupamento natural via session_id)
  WHERE to_role = 'staff';

CREATE INDEX assistant_messages_thread_idx
  ON assistant_messages(thread_id, created_at DESC)
  WHERE thread_id IS NOT NULL;

CREATE INDEX assistant_messages_thread_unread_idx
  ON assistant_messages(thread_id, to_staff_id)
  WHERE to_role = 'staff' AND read_at IS NULL;
```

`read_at`, `delivered_at` e `to_staff_id` já tinham sido adicionados no V9 (seção 5.7) — V10 só adiciona `thread_id` + os índices de thread.

### Endpoints · novos

```ts
GET /{slug}/staff/messages/threads
  query: { include_archived?: bool, role_filter?: 'manager'|'waiter'|'cozinha'|'recepcao' }
  -> 200 [
       {
         thread_id,
         other_staff: { id, name, role, init, color, online },
         last_message: { id, content, at, from_role, from_self: bool },
         unread_count: int,
         archived_at: timestamptz | null
       }
     ]
  // ordenação: unread > 0 primeiro, depois mais recente

GET /{slug}/staff/messages/threads/:thread_id/messages
  query: { before?: timestamp (cursor), limit?: number (default 50) }
  -> 200 [
       { id, thread_id, from_role, from_staff_id, content, created_at,
         delivered_at, read_at, chip_action?: { kind, payload } }
     ]
  // ordem cronológica DESCENDENTE (mais nova primeiro · paginação volta no tempo)

POST /{slug}/staff/messages/:id/read
  -> 200 { read_at }
  // marca a mensagem alvo como lida + dispara WS event `message.read` pro emissor
  // SE created_at > now() - interval '24 hours' (privacy · não rebobina leitura > 24h)

POST /{slug}/staff/messages/threads/:thread_id/archive
  body: { archived: bool }
  -> 200 { archived_at }
```

O `POST /{slug}/staff/messages` do V9 continua existindo — apenas ganha cálculo de `thread_id` no insert (idempotente · LEAST/GREATEST do par de staff_ids).

### WS events · estendidos + novos

| Evento                         | Direção                | Payload                                                | Quando                                                                 |
| ------------------------------ | ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `message.received` (estendido) | server → staff alvo    | mensagem completa + `thread_id`                        | qualquer mensagem nova entra na caixa                                  |
| `message.read` (NOVO V10)      | server → staff emissor | `{ message_id, thread_id, read_at, by: { staff_id } }` | destinatário abriu thread + bubble entrou em viewport                  |
| `thread.archived` (NOVO V10)   | server → staff dono    | `{ thread_id, archived_at }`                           | usuário arquivou thread (eco pro próprio device pra sync multi-device) |

`manager.message`, `manager.message.read` e `manager.message.replied` (V9 · seção 5.7) **viram aliases** de `message.received` / `message.read` / `message.received` — devices V9 continuam funcionando, novos devices preferem os nomes genéricos.

### Read receipt · regra de viewport

V10 muda o ponto de leitura: V9 marcava como lido quando o garçom abria `ScreenStaffMessageDetail` (tela inteira). Agora, abrir `ScreenStaffMessageThread` mostra TODAS as mensagens da thread — ler "implicitamente" só as que entram em viewport. Implementação:

```ts
// frontend · IntersectionObserver na lista de bubbles
const obs = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = e.target.dataset.messageId;
      const msg = messages.find((m) => m.id === id);
      if (!msg || msg.read_at || msg.from_role === 'self') continue;
      if (Date.now() - new Date(msg.created_at).getTime() > 86_400_000) continue; // > 24h skip
      fetch(`/staff/messages/${id}/read`, { method: 'POST' });
    }
  },
  { threshold: 0.6 },
);
```

Servidor por sua vez agrupa reads numa janela de 200ms antes de emitir o `message.read` pro emissor — evita ruído de WS quando 8 mensagens entram em viewport ao mesmo tempo. O emissor recebe um único event com array `[message_id, ...]`.

### Telemetria · adicional

```
event: thread.opened
  props: thread_id, other_role, unread_at_open, source ('me-tab'|'push-deep-link'|'calls-tab')

event: message.read
  props: thread_id, message_id, age_ms_at_read, viewport_dwell_ms

event: thread.archived / thread.unarchived
  props: thread_id, age_ms
```

KPI sugerido: **% de threads com `last_message.from_role='manager'` e `unread_count=0` em < 60s** — mede se gerente está conseguindo coordenar via mensagem (não precisa virar push escalado).

### Deprecação · `ScreenStaffMessageDetail`

A tela isolada do V9 fica deprecated. Push de `manager-message` agora carrega `data: { kind: 'manager-message', message_id, thread_id }` — frontend abre `ScreenStaffMessageThread` direto pelo `thread_id`. Devices V9 (que esperam o detail) caem no fallback: continuam abrindo a thread por trás (a única diferença visual é navegar 1 tela a mais — sem regressão funcional).

---

## 5.5 — Cortesia (decisão de produto · saiu da prominência)

`POST /{slug}/courtesies` (já documentado em cliente/server-notes.md) **continua existindo**, só muda quem chama:

| Antes (removido)                                                    | Agora                               |
| ------------------------------------------------------------------- | ----------------------------------- |
| ✗ Painel · barra "Agir agora" · 3º card "Cortesia"                  | (removido)                          |
| ✗ Cards de alerta · ação "Cortesia mesa"                            | substituído por "Contactar cliente" |
| ✓ Eu › Cortesias (histórico + criar manualmente)                    | mantido                             |
| ✓ MoreSheet de alerta · 3 pontinhos · "Mandar cortesia"             | NOVO — ação terciária               |
| ✓ Sheet "Contactar cliente" · chip "Quer uma cortesia pela espera?" | NOVO — entrada contextual           |

**Garantia de schema:** o tipo `'message'` foi removido de `ScreenManagerCompensateClient.types`. Cortesia = freebie material (`dessert · drink · couvert · discount`). Comunicação pura sem brinde fica no fluxo separado de `/staff/messages`. Isso simplifica o backend — `courtesies.category` não precisa lidar com "mensagem sem item".

---

## REMOÇÕES (decisão produto · não voltam pro app sem nova decisão)

| Feature                                                   | Tabela / endpoint impactado                                       | O que fazer                                                                                                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pausa de garçom (telas + push)                            | sem schema próprio · só uso de `staff_users.is_paused` em runtime | manter a coluna `is_paused` no DB, só remover endpoints `POST /staff/:id/pause` e `POST /staff/:id/resume` da exposição pública. NÃO dropar coluna — pode reaparecer.                                                    |
| Watcher de QR / Segurança                                 | `session_audit_logs`, `pending_review`, `blocked_ips`             | manter intactos (são features defensivas independentes do UI). Só remover as rotas `GET /manager/security/*` e `GET /manager/security/audit`. Reaparecem em `prototypes/seguranca-qr/` quando a decisão de produto vier. |
| Análise de reserva (recepcionista revisando draft do bot) | nenhum schema novo · era só UI sobre `reservations`               | bot do WhatsApp escreve direto em `reservations` quando captura nome+telefone+CPF+data+hora obrigatórios. Sem fluxo de aprovação. Endpoint `GET /reservations/drafts` deixa de existir.                                  |

### Bot WhatsApp · contrato dos campos obrigatórios

```
nome:      string · obrigatório
telefone:  string · obrigatório · validado pelo bot via "Manda 1 que confirmo o número"
cpf:       string · obrigatório · validador padrão BR
data:      date   · obrigatório · valida contra horários abertos do tenant
hora:      time   · obrigatório · valida contra reservas existentes do dia
observacao: text · opcional · ex: "aniversário", "vegetariano", "alergia a glúten"
```

Se algum obrigatório ficar em branco, bot pergunta de novo. Bot só insere em `reservations` (status='confirmed') quando todos estiverem preenchidos. **Não há tabela `reservation_drafts`** — drafts ficam só na conversa do WhatsApp.

---

## Eventos WS adicionais

(somam-se aos da `cliente/server-notes.md`)

| Evento                    | Direção                | Payload                                                   | Quando                                                            |
| ------------------------- | ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `staff.message.delivered` | server → staff         | `{ message_id, delivered_at }`                            | cliente abriu o app + leu a bubble (driver: visibilitychange)     |
| `staff.message.read`      | server → staff         | `{ message_id, read_at }`                                 | cliente respondeu OU permaneceu 3+ s na tela com a bubble visível |
| `manager.message`         | server → staff         | mensagem completa                                         | gerente enviou direto pra outro funcionário (V9 · ver 5.7)        |
| `manager.message.read`    | server → manager       | `{ message_id, read_at }`                                 | staff alvo abriu detail (V9 · alias de `message.read` no V10)     |
| `manager.message.replied` | server → manager       | `{ message_id, reply_message_id, content }`               | staff alvo respondeu (V9 · round-trip)                            |
| `message.received`        | server → staff alvo    | mensagem completa + `thread_id`                           | qualquer mensagem nova entra na thread (V10 · ver 5.7-bis)        |
| `message.read`            | server → staff emissor | `{ message_ids[], thread_id, read_at, by: { staff_id } }` | bubbles entraram em viewport · agrupado em janela de 200ms (V10)  |
| `thread.archived`         | server → staff dono    | `{ thread_id, archived_at }`                              | usuário arquivou thread · eco multi-device (V10)                  |

Os primeiros 2 populam o estado "Aguardando leitura..." no Frame C do MContactClientSheet. Os 3 do meio (`manager.message` família) populam o sent-state do MContactStaffSheet (★ V9 ★). Os 3 últimos (`message.*` + `thread.archived`) sustentam a Caixa de Mensagens completa do V10 — read receipts em viewport-based, sync de threads multi-device.

---

## Telemetria recomendada

```
event: smart_suggestion.shown
  props: situacao, num_suggestions, source ('pool'|'llm'), latency_ms

event: smart_suggestion.tapped
  props: suggestion_id, situacao, position (0..4)

event: staff_message.sent
  props: was_from_chip (bool), suggestion_id?, char_count, time_to_send_ms

event: staff_message.replied
  props: message_id, time_to_reply_ms, customer_replied (bool)
```

KPI sugerido para o owner: **% de alertas críticos onde gerente contactou cliente em < 2 min**. Alvo razoável: > 60%.
