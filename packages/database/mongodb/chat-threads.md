# MongoDB schema: chat history (chat-threads + chat-messages)

Per-tenant chat history (cliente <-> assistant) e arquivado em MongoDB pra
suportar:

- Browsing read-only (UI lista threads do cliente, paginacao por data)
- LGPD instant erasure (`deleteMany({ tenant_id, customer_id })` apaga
  todas as mensagens de um cliente em <100ms, sem percorrer Postgres)
- Schema flexivel (assistant pode anexar metadata variavel sem migrations)

Postgres ainda guarda `assistant_messages` pra billing/audit (tokens, custo,
modelo, etc). MongoDB e o "store de leitura" do conteudo conversacional.

## Database

`restaurant_chat` (db unica; `tenant_id` discrimina por restaurante).

## Collections

### `chat_threads`

Uma thread por (tenant_id, customer_id, table_session_id). Quando o cliente
volta numa nova mesa, abre uma nova thread. Quando volta na MESMA mesa, a
thread continua.

```
{
  _id: ObjectId,
  tenant_id: string,           // schema name (ex: "restaurant_dev")
  customer_id: string,         // UUID
  table_session_id: string,    // UUID
  visit_id: string | null,     // UUID
  title: string | null,        // gerado pelo LLM ("Pedido vegano", etc) ou null
  message_count: int,
  first_message_at: ISODate,
  last_message_at: ISODate,
  created_at: ISODate,
  updated_at: ISODate,
  metadata: object             // freeform (model_used, tags, etc)
}
```

### `chat_messages`

Uma row por mensagem (user OU assistant). Liga `thread_id` -> `chat_threads`.

```
{
  _id: ObjectId,
  thread_id: ObjectId,         // ref chat_threads._id
  tenant_id: string,
  customer_id: string,         // duplicado pra LGPD delete-by-customer rapido
  table_session_id: string,
  visit_id: string | null,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  model_used: string | null,   // "gpt-4o", etc
  provider_used: string | null,
  tokens_in: int,
  tokens_out: int,
  latency_ms: int,
  was_blocked: boolean,
  block_reason: string | null,
  tool_calls: object | null,   // function-calling payload
  postgres_message_id: string | null,  // FK fraca pra assistant_messages.id
  created_at: ISODate
}
```

## Indexes

Criados pelo `mongo-init.ts` (idempotente).

### `chat_threads`

```
{ tenant_id: 1, customer_id: 1, last_message_at: -1 }   // listing por cliente
{ tenant_id: 1, table_session_id: 1 }                   // lookup por sessao
{ customer_id: 1 }                                       // LGPD erasure
{ created_at: 1 }
```

### `chat_messages`

```
{ thread_id: 1, created_at: 1 }                         // pagina mensagens da thread
{ tenant_id: 1, customer_id: 1 }                        // LGPD erasure (CRITICO)
{ tenant_id: 1, customer_id: 1, created_at: -1 }        // historico do cliente
{ tenant_id: 1, was_blocked: 1, created_at: -1 }        // moderacao
{ created_at: 1 }                                        // TTL futuro / archive
```

## LGPD erasure

```js
db.chat_messages.deleteMany({ tenant_id, customer_id });
db.chat_threads.deleteMany({ tenant_id, customer_id });
```

Operacao indexada (`{ tenant_id, customer_id }`); typicamente <100ms ate
~100k messages do cliente. Em paralelo, em Postgres, a row em
`lgpd_requests` e atualizada pra status='fulfilled' + fulfilled_at.

## Conexao

Driver oficial `mongodb` (Node). URI vem do env `MONGODB_URI`. Default local:

```
mongodb://localhost:27017/restaurant_chat
```

Em docker-compose o service e `mongodb` na porta 27017.
