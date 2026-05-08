# Chat history + LGPD compliance · feature spec

> Status: a desenhar (entry point: hamburger menu do `apps/web-customer` · tela "Histórico de chats").
> Backend: a implementar com NoSQL · auto-deletion 30 dias.

## O que é
Persistência das conversas do cliente com a IA do restaurante, acessível pelo próprio cliente via menu hamburger. Cliente pode revisar conversas anteriores, apagar individualmente OU apagar tudo de uma vez. Sistema **auto-deleta após 30 dias** sem ação do usuário (limitação de coleta · LGPD princípio da minimização).

## Por que existe
1. **Direito de acesso (LGPD Art. 18, II)** — cliente pode ver as conversas que mantemos
2. **Direito de eliminação (LGPD Art. 18, VI)** — cliente pode apagar conversas quando quiser
3. **Princípio da minimização (LGPD Art. 6, III)** — chats só guardados pelo necessário, e por tempo limitado
4. **UX value** — útil pro cliente recuperar uma sugestão de prato que recebeu em visita anterior · ou referenciar uma reclamação passada com a gerência

## Escopo do delete · o que sai e o que fica

> **Importante:** "Apagar histórico" toca **APENAS** o NoSQL de conversas. **Não toca** o cadastro do cliente no Postgres.

### O que é apagado pela ação do usuário
Tudo que vive em **MongoDB** (ou DynamoDB):
- `chat_threads` do `customerId` (todos OU específicos, conforme botão usado)
- `chat_messages` ligadas aos threads (cascade pelo `threadId`)
- Tool calls e resultados associados (`tool_calls` / `tool_results` em cada mensagem)

### O que permanece no Postgres (não é tocado)
- `customers` · nome, telefone, CPF, e-mail, preferências, total de visitas
- `table_sessions` · histórico de visitas/sessões da pessoa
- `orders` · pedidos passados (auditoria fiscal · obrigação legal de preservar)
- `waiter_calls` · chamados feitos
- `assistant_messages` (se ainda houver registros aqui · ver migração) · mensagens com staff (gerente/garçom) · não são chat de IA
- `complaints` · reclamações registradas (pra análise operacional · auditoria)
- `assistant_messages` · só mensagens de comunicação com staff (manager bubble) · ficam preservadas pra histórico operacional

### Por que esse split

- **Cadastro (PII)**: o cliente CRIOU uma identidade no estabelecimento. Apagar dispara fluxo separado de "Encerrar cadastro" (não previsto agora · seria tela diferente · sob demanda explícita do cliente nos termos do LGPD Art. 18, VI).
- **Histórico fiscal/operacional**: pedidos e reclamações têm obrigação legal de preservação (Receita · auditoria · análise de qualidade). Não podem ser apagados por ação do cliente.
- **Conversas com IA**: são o único tipo de dado que é puramente conversacional · sem implicação fiscal · sem obrigação operacional de preservar. Por isso ficam só 30 dias e podem ser apagadas mais cedo pelo cliente.

### Copy do UI · não over-disclose

> **Decisão de produto:** o usuário não precisa ver toda hora que "seu cadastro é preservado". Isso vira ruído. A UI mostra **só ações concretas e linguagem simples**, sem prefixar tudo com LGPD.

**Sem persistent notice no rodapé.** A LGPD não aparece como banner permanente.

**Modais simplificados:**
- "Apagar todo o histórico?" → sub: "Vai sumir todas as suas conversas · não tem volta"
- "Apagar essa conversa?" → sub: "Vai sumir [N] mensagens · não tem volta"

Não menciona cadastro nem pedidos preservados. O usuário entende intuitivamente que apagar conversas não destrói o cadastro dele.

### LGPD aparece só conversacionalmente · via tool padronizada

A LGPD vira parte da experiência **só quando o cliente puxa o assunto**. Detectar via LLM quando o cliente fala (intent classification ou keyword match):
- "quero apagar meus dados"
- "quais são meus direitos LGPD"
- "quero exercer meu direito de exclusão"
- "vocês guardam minhas informações?"
- "quero saber o que vocês têm sobre mim"

Quando detectado, a LLM **NÃO compõe a resposta livremente** — chama uma tool dedicada que devolve mensagem padronizada e juridicamente correta. Isso garante:
- Copy idêntico toda vez (sem variação por LLM · zero risco de hallucination legal)
- Auditoria fácil (a frase é a mesma em todas as ocorrências)
- Atualização centralizada (mudança no copy reflete em 1 lugar só)

### Tool · `show_lgpd_notice()`

Tool sem parâmetros. LLM chama quando detecta intent LGPD. Retorna payload fixo com **2 chips de consent capture binário**:

```json
{
  "messageType": "lgpd_notice",
  "content": "Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão dos seus dados a qualquer momento. Posso encaminhar sua solicitação pra gerência?",
  "chips": [
    { "label": "Sim, quero excluir",     "action": "lgpd_data_request", "params": { "type": "erasure" } },
    { "label": "Não, não quero excluir", "action": "dismiss" }
  ]
}
```

A LLM renderiza essa resposta como bubble normal (`AssistantBlock`) com os 2 chips abaixo. Nenhum texto adicional · nenhuma reformulação. **Tool indicator** durante a chamada: `··· USANDO show_lgpd_notice ···` (mesmo padrão das outras tools do Prompt 9).

### Captura de consentimento · próxima ação

A escolha do cliente é capturada **na próxima interação** após o LGPD notice — pode ser:

1. **Tap em chip da UI** (caminho rápido):
   - `Sim, quero excluir` → LLM chama `lgpd_data_request(type='erasure')`
   - `Não, não quero excluir` → LLM chama `dismiss` (sem efeito · só fecha o chips block · IA volta pro modo conversa normal)

2. **Mensagem de texto livre** (fallback) · cliente digita resposta natural:
   - LLM detecta intent (positivo/negativo) e roteia pra mesma tool
   - Exemplos:
     - "sim" / "pode encaminhar" / "quero sim" → `lgpd_data_request(type='erasure')`
     - "não" / "deixa pra lá" / "agora não" → `dismiss`
   - Se ambíguo (ex: "pode ser") · LLM pergunta de novo: "Confirma que quer encaminhar pra gerência? sim ou não"

**Persistência do notice:**

Tudo o que sobra na conversa após a resposta do cliente:

| Item | Persiste no chat? |
|---|---|
| Bubble do texto do notice ("Você, como consumidor, tem direito...") | ✅ Sim · fica visível se rolar pra cima |
| Chips `Sim, quero excluir` / `Não, não quero excluir` | ❌ Não · desativam/somem após o primeiro tap ou após o LLM rotear a resposta de texto livre |
| Resposta da tool seguinte (`lgpd_data_request` confirmação OU `dismiss` silencioso) | ✅ Sim · vira parte do histórico |

**Regra de re-aparição:** os chips de consent **NÃO ressurgem sozinhos**. Não tem auto-renderização periódica · não tem timer de re-prompt · não tem nudge passivo. A única forma de o notice (com chips ativos) aparecer **de novo** é:
- O cliente puxar o assunto novamente em outra mensagem ("quero apagar meus dados", "quais meus direitos LGPD", etc.)
- A IA detectar o intent
- A IA chamar `show_lgpd_notice` outra vez

Cada chamada de `show_lgpd_notice` é independente · gera novo bubble + novos chips ativos · histórico mantém ambas as ocorrências.

Esse design respeita 2 princípios:
- **Não-aliciamento:** software não fica empurrando "vc quer apagar?" · só responde quando perguntado
- **Não-cansaço:** se o cliente já respondeu (sim ou não), respeitar a decisão · não re-perguntar na mesma sessão

**Auditoria:** toda chamada de `lgpd_data_request` registra:
- `consent_method`: `chip` ou `free_text`
- `original_message`: o que o cliente digitou (se text)
- `chip_label`: qual chip ele tocou (se chip)
- Timestamp da resposta

Isso garante prova de consentimento ativo (não-passivo · LGPD Art. 8).

### Tool · `lgpd_data_request(type)`

Quando o cliente confirma com tap em "Sim, quero excluir" OU resposta afirmativa em texto livre, LLM chama essa segunda tool. **Deleção é imediata** · não tem prazo de 15 dias.

```
POST /customer/lgpd-requests
  body: { type: 'erasure' }
  → 201 { 
       protocolNumber: 'LGPD-2026-05-08-3F2A',  // formato AAAA-MM-DD-XXXX
       status: 'fulfilled',                       // não 'pending'
       executedAt: '2026-05-08T19:42:13Z',
       expiresAt: '2026-08-06T19:42:13Z'         // protocolo guardado 90 dias
     }
```

Backend:
- **Apaga imediatamente** todos os `chat_threads` + `chat_messages` do customer no NoSQL (cascade)
- Cria registro em `lgpd_requests` table com status `'fulfilled'` direto
- Sem push de confirmação posterior (ação consumada na hora)
- Protocolo guardado 90 dias em Postgres pra auditoria/comprovante

LLM renderiza payload fixo (também canônico · vive em backend):

```python
LGPD_REQUEST_CONFIRMED = (
  "Suas conversas foram apagadas agora. Protocolo guardado por 90 dias "
  "caso você precise de comprovante."
)
```

> **Nota sobre prazo legal LGPD:** os 15 dias úteis se aplicam a solicitações de **dados pessoais completos** (cadastro · PII no Postgres · obrigação fiscal de pedidos · etc). No escopo dessa tool, a ação é **só sobre conversas com IA no NoSQL**, e a deleção desse subset é instantânea técnica e legalmente. Pedido de exclusão completa de cadastro é fluxo separado, não coberto aqui.

### Schema · `lgpd_requests` (Postgres · não mexe no NoSQL)

```sql
CREATE TABLE lgpd_requests (
  id              uuid PRIMARY KEY,
  customer_id     uuid NOT NULL REFERENCES customers(id),
  tenant_id       uuid NOT NULL,
  type            text NOT NULL CHECK (type IN ('access', 'erasure', 'portability')),
  message         text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'fulfilled', 'rejected')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  fulfilled_at    timestamptz,
  fulfilled_by    uuid REFERENCES staff(id),
  response_text   text,
  request_number  serial  -- humano-legível: REQ-7234
);

CREATE INDEX idx_lgpd_pending
  ON lgpd_requests(tenant_id, created_at) WHERE status = 'pending';
```

### Por que tool · não LLM livre

- **Compliance**: copy legal precisa ser auditável e idêntica. LLM compondo cada vez = risco de erro de fato (ex: "30 dias" virar "60 dias" por hallucination).
- **Atualização**: mudou a redação? Edita 1 string. Não precisa re-treinar nem ajustar prompt.
- **Telemetria**: contagem de invocações de `show_lgpd_notice` é métrica direta de "quantos clientes perguntaram sobre LGPD".

### Frase canônica · centralizada

A frase exata vive em código backend (centralizada · pode ser i18n no futuro):

```ts
// services/ai-service/lgpd_messages.py
LGPD_NOTICE = (
  "Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão "
  "dos seus dados a qualquer momento. Posso encaminhar sua solicitação pra gerência?"
)

LGPD_REQUEST_CONFIRMED = (
  "Solicitação registrada. A gerência vai responder em até 15 dias úteis, "
  "como manda a lei. Número da sua solicitação: {request_number}"
)
```

Nenhum lugar do front-end recompõe esse texto. Sempre vem via tool result.

## Arquitetura · NoSQL

Chat data tem perfil ideal pra NoSQL:
- Schema flexível (mensagens podem ter formatos diferentes · tool calls, suggestion chips, image refs)
- Volume alto (cada cliente gera 10-100 mensagens por visita)
- Acesso por `customerId` é a query dominante
- TTL nativo (auto-deletion) é trivial em DynamoDB / MongoDB

### Recomendação: **MongoDB** (ou DynamoDB se for AWS-only)

```js
// MongoDB collection: chat_threads
{
  _id: ObjectId,
  threadId: "uuid",
  customerId: "uuid",
  tenantId: "uuid",
  sessionId: "uuid",  // sessão da mesa em que foi gerada
  visitId: "uuid",
  startedAt: ISODate,
  lastMessageAt: ISODate,
  messageCount: Number,
  expiresAt: ISODate,  // startedAt + 30 dias
  deletedByUser: Boolean,
  deletedAt: ISODate | null,
  preview: "Primeira mensagem ou resumo",  // pra mostrar na lista sem carregar mensagens
}

// MongoDB collection: chat_messages
{
  _id: ObjectId,
  messageId: "uuid",
  threadId: "uuid",
  customerId: "uuid",
  role: "user" | "assistant" | "system" | "manager",
  content: String,
  toolCalls: [{ name, params, result }] | null,
  suggestionChips: [String] | null,
  linkedItems: [{ itemId, name, price }] | null,
  createdAt: ISODate,
  expiresAt: ISODate,  // herda do thread
}
```

### TTL index
```js
db.chat_threads.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.chat_messages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

MongoDB roda o TTL job a cada 60s · documentos com `expiresAt < now()` são removidos.

### Por que NÃO Postgres
- Schema rígido — toolCalls com formatos variáveis ficam como JSON column = perde validação e queries ficam feias
- Volume — 100 mensagens × 1000 visitas/mês × 12 meses = 1.2M rows/ano só de uma loja média
- TTL no Postgres é via cron job custom · NoSQL nativo é mais robusto

### Fallback
Se a infra não tem NoSQL, use Postgres com:
- Tabela `chat_messages` com colunas JSON
- Index parcial `WHERE deleted_at IS NULL`
- Cron job diário `DELETE WHERE expires_at < now()`

Mas é solução secundária · NoSQL é o caminho recomendado.

## API

```
GET /customer/chats
  query: { from?: ISODate, limit?: number }
  → 200 [{ threadId, startedAt, lastMessageAt, messageCount, preview }]

GET /customer/chats/:threadId/messages
  → 200 [{ messageId, role, content, createdAt, ...metadata }]

DELETE /customer/chats/:threadId
  → 200 { deletedAt }
  side-effects: marca deletedByUser=true · expiresAt=now() (TTL remove em 60s)

DELETE /customer/chats
  → 200 { deletedCount }
  side-effects: marca todos os threads do customer como deletedByUser=true · TTL remove

GET /customer/data-policy
  → 200 { retentionDays: 30, lastFetched, contactEmail, lgpdNoticeText }
```

## Frontend

### Entry point
- Hamburger menu do customer app (`apps/web-customer`) ganha entrada nova:
  - Ícone clock-rewind (peso 1.4 igual aos outros do `Ico`)
  - Label: `Histórico de chats`
  - Sub: `30 dias atrás até hoje`
  - Tap → abre `ScreenCustomerChatHistory`

### `ScreenCustomerChatHistory` (lista)
- Topbar com back · "Histórico de chats" · ícone busca à direita
- Lista de threads agrupada por **mês**:
  - Eyebrow mono caps tiny do mês (ex: `MAIO · 2026`)
  - Cards de thread:
    - Data + hora mono caps tiny (`06 MAI · 19:42`)
    - Preview da primeira mensagem em Inter 14/500
    - Contagem de mensagens em sub mono caps tiny mute (`12 MENSAGENS`)
    - Tap → abre `ScreenCustomerChatThread` (read-only)
    - Long-press → MoreSheet com "Apagar este chat"
- Empty state com ícone chat-x:
  - "Nenhuma conversa por aqui ainda"
  - "Suas conversas com a IA da Luna aparecem aqui · ficam por 30 dias antes de sumir."
- Footer fixo com 2 elementos:
  - Botão `Apagar todo o histórico` (outline brick · destrutivo · com modal de confirmação)
  - Notice LGPD em mono caps tiny faint:
    > "SUAS CONVERSAS FICAM AQUI POR 30 DIAS E SÃO APAGADAS AUTOMATICAMENTE · LGPD ART. 18"

### `ScreenCustomerChatThread` (visualização read-only de chat antigo)
- Topbar com back · data do chat · ícone 3 pontinhos
- Banner mono caps tiny no topo:
  > "ESTE CHAT É SOMENTE LEITURA · NÃO PODE SER CONTINUADO"
- Lista de bubbles (mesmo formato do chat ativo)
- Composer **desabilitado/oculto** · sem possibilidade de continuar
- MoreSheet (3 pontinhos):
  - "Apagar este chat"
  - "Compartilhar como texto" (futuro)

### Modal · apagar tudo (confirmação destrutiva)
- Vaul-style sheet
- Title Inter 22/700: "Apagar todo o histórico?"
- Sub Inter 14/500 mute: "Vai sumir [N] conversas. Essa ação não tem volta — nem pra você nem pra Luna."
- 2 CTAs full-width stacked:
  - `Sim, apagar tudo` (filled brick · destrutivo)
  - `Cancelar` (outline)

### Modal · apagar 1 chat (confirmação leve)
- Vaul-style sheet
- Title Inter 18/700: "Apagar este chat?"
- 2 CTAs:
  - `Apagar` (filled brick)
  - `Cancelar` (outline)

## Edge cases

- **Cliente sem `customerId`** (sessão anônima · não fez `/customer/recognize`) → empty state · "Faça login na próxima visita pra ver seu histórico."
- **Cross-tenant** — chat de uma Trattoria não aparece no app de outra (filter por `tenantId`).
- **Mensagens de cortesia / staff messages** — ficam em **caixa separada** (Mensagens da gerência) · não no histórico de IA · porque envolvem comunicação humana com terceiros (gerente).
- **Auto-deletion mid-view** — se o usuário tá vendo um chat de 30 dias atrás e ele expira no meio · backend retorna 410 Gone · front mostra "este chat acabou de expirar" + redireciona pra lista.
- **Restauração** — não tem. Apagar é definitivo. Documentar no notice + na confirmação.

## Métricas

- % de clientes que abrem o histórico ao menos 1× / mês
- % de clientes que usam delete (individual ou massa)
- Tamanho médio do histórico ativo (mensagens por cliente / 30 dias)
- Custo de storage NoSQL por mês

## Não escopo

- Exportar histórico (LGPD Art. 18, V — portabilidade) → V2 desta feature · próximo round
- Compartilhar conversa por link → futuro
- Search dentro do histórico → V2
- Sincronizar entre dispositivos do mesmo customer → depende de `customerId` consistente · revisar fluxo de identificação
- Histórico de mensagens com staff (gerente) → mora em outra caixa (Caixa de mensagens da gerência) · escopo separado
- Pin/favoritar chats → futuro
