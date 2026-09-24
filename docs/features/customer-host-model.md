# Customer-host model · feature spec

> Status: a desenhar (entry points: app do cliente · escaneio QR de mesa ocupada · mesa fisicamente juntada).
> Backend: a implementar.

---

## ⚠️ COMO FICOU DE VERDADE (leia antes do resto · 2026-08-31)

Este arquivo é o **documento de DESENHO**, escrito antes da implementação, e
partes dele descrevem um backend que **não existe mais**. O que vale hoje:

**Chegada tardia roda em `session_participants`, e só nela.**

|                     | Como está implementado                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pedido nasce        | `POST /:slug/customer/welcome` (ou `/recognize`) → `TableSessionService.upsertParticipant` grava `session_participants` com `status='pending'`                                                 |
| Quem decide         | O **customer-host da mesa**, por `POST /:slug/table/participants/decide`                                                                                                                       |
| Solicitante desiste | `POST /:slug/table/participants/cancel`                                                                                                                                                        |
| Resultado chega     | WS `participant:decision` + poll de `GET /:slug/table/participants`                                                                                                                            |
| Telas               | Host: `ScreenHostApproveParticipant` (`/[slug]/host/approve/participant`). Cliente: `ScreenCustomerWaitingApproval` montada inline pelo `PendingApprovalWrapper` de `/[slug]/mesa/[tableCode]` |
| TTL                 | **Não existe.** O host pode demorar; nada expira sozinho                                                                                                                                       |

**O que foi REMOVIDO na migration 081 (2026-08-31):** a tabela
`late_arrival_requests`, o enum `late_arrival_request_status`, as rotas
`POST|GET /:slug/late-arrival-requests*`, os eventos WS `late_arrival.*`, as
telas `ScreenCustomerHostApproveJoin` (cliente) e `ScreenHostLateArrival`
(recepção), e a seção "Chegadas tardias" da home da recepção.

**Por quê:** aquele caminho implementava a escalada `host → recepcionista →
gerente` que a **decisão de escopo V16 abaixo descontinuou** — as colunas
`escalation_level`, `escalation_chain_id`, `approved_by_staff_id` e
`ttl_expires_at` existiam exatamente pra isso. Era o código da versão ANTERIOR
à decisão, sobrevivendo como uma segunda verdade: **zero registros** nos 4
tenants e inalcançável a partir do app (dependia de `?intent=late-arrival`, um
parâmetro que nenhum call-site jamais produziu).

**Portanto, ao ler o que vem abaixo:** onde o texto cita
`late_arrival_requests`, `POST /late-arrival-requests`, escalation chain
`type='late-arrival'`, timeout de 60s ou "escala pra recepcionista", trate como
**história de desenho, não como contrato**. A parte do desenho que VALE é a
regra de produto: _decisão social é do cliente-host, staff não aprova_.
`escalation_chains` continua vivo — mas para `table_merge`, `complaints` e
`scan_verification`, nunca para chegada tardia.

**Pendência conhecida:** a "notificação passiva ao staff" prometida na V16 **não
existe** — ver `PROMPT-POLIMENTO.md`.

---

## O que é

A primeira pessoa que escaneia o QR de uma mesa e abre a comanda vira o **`host` daquela sessão**. Esse cliente-host tem privilégio sobre **decisões sociais da mesa** que antes eram do staff:

1. Aceitar **late-arrivals** (cliente novo escaneando QR da mesma mesa)
2. Aceitar **junção de mesas** (mesa adjacente quer fundir comanda)

Staff (recepcionista, gerente, garçom) **não aprova mais essas decisões em primeiro nível**. Eles recebem **notificação passiva** depois que o cliente-host decide.

## Por que existe

- **Decisão social não é decisão operacional.** Quem conhece quem pode entrar na mesa é quem está sentado nela. Staff não sabe se "Pedro" que tá pedindo pra entrar é amigo da família ou estranho aleatório.
- **Reduz fricção do staff.** Hoje, cada late-arrival vira interrupção pra alguém da equipe. Movendo pro customer, staff só age quando customer não responde (fallback).
- **Empodera o cliente.** Ele controla o próprio espaço social no restaurante.

## Quem vira host

- **Auto-set:** primeiro `POST /sessions` que abre a comanda da mesa
- Não muda durante a sessão (mesmo se host sair · privilégio fica)
- Se o staff abre a sessão manualmente sem cliente identificado (walkin sem app) → `host_customer_id = NULL` → cascata cai pra staff direto

## Schema

```sql
ALTER TABLE table_sessions
  ADD COLUMN host_customer_id uuid REFERENCES customers(id);

CREATE INDEX idx_sessions_host
  ON table_sessions(host_customer_id) WHERE host_customer_id IS NOT NULL;
```

## Aprovação · customer-host é o único aprovador

> **Mudança de escopo (V16):** late-arrival e junção de mesas **NÃO** escalam pra staff. Staff só recebe **notificação passiva depois da aprovação consumada**. Customer-host é o único aprovador.

### Fluxo simplificado

```
1. Customer-host (timer 60s)
   ├─ Aprova → late-arrival/merge consumado · staff recebe notificação passiva
   ├─ Recusa → cliente novo (ou outra mesa) recebe rejeição amigável
   └─ Timeout (60s sem resposta) → rejeição amigável com escape valve
                                    "Host não respondeu · quer chamar a recepcionista?"
```

### Por que não cascateia pra staff

- **Decisão social não é decisão operacional.** Staff não conhece quem pode entrar na mesa do cliente · não tem autoridade pra decidir.
- **Cascata vira ruído.** Empurrar request pra recepcionista/manager/garçom toda vez que o host demora 60s gera 3 push notifications inúteis pra staff.
- **Escape valve já existe.** Se host está distraído ou app fechado, cliente B vê mensagem amigável e clica em **"Chamar recepcionista"** · cai no flow existente de chamado de mesa · staff vai presencialmente resolver. Esse é o caminho certo: humano resolve com humano · não software escalando software.

### `host_customer_id = NULL` (walkin sem app)

Se a sessão foi aberta diretamente pelo staff (cliente sem app):

- **Late-arrival:** backend recusa automaticamente (sem host pra aprovar) · cliente B vê "Mesa não tá aceitando entrada via app · chamar a recepcionista?"
- **Junção de mesas:** bloqueia o pedido (não pode juntar com mesa sem host customer-app) · LLM responde: "A Mesa X não tá no app · pede pra recepcionista juntar manualmente"

### Identificação obrigatória pré-late-arrival · nome + CPF

> **Cliente B SEMPRE chega identificado ao host.** Não tem variante anônima.

Quando cliente B escaneia QR de mesa ocupada, antes da `late_arrival_request` ser criada:

1. **Backend checa cookie/session** do cliente B:
   - Se já tem `customerId` válido com `name` populado (returning · reconhecido) → pula form · request prossegue
   - Se não tem ou `name` IS NULL → mostra form
2. **App força mini-form `ScreenCustomerIdentifyBeforeJoin`** com 2 campos obrigatórios:
   - **Nome** · "Seu primeiro nome"
   - **CPF** · "Seu CPF" · validação de formato no front (mask `000.000.000-00`)
3. **No submit · backend faz lookup por CPF:**
   - **CPF existe no banco** (cliente já cadastrado em outra visita ou outro tenant) → faz "auto-login":
     - Merge do `customerId` anônimo atual com o cadastrado (atualiza cookie)
     - Carrega nome canônico do banco · sobrescreve o digitado se diferente (com nota: "Bem-vindo de volta, [nome do banco]")
     - Atualiza `last_visit` em `customers`
     - Request prossegue com `customerId` reconciliado
   - **CPF novo** (não existe no banco) → cria registro novo:
     - `customers.name = <input>` · `customers.cpf = <input>`
     - Mantém `customerId` da sessão atual · vincula a esse novo cadastro
     - Request prossegue
4. **Ambos os caminhos** terminam com customer-host vendo o **nome real** do cliente B na tela de approve.

### UI do form

- Title: "Quem é você?"
- Sub: "[Host] vai ver seu nome pra decidir se você pode entrar"
- Field 1: input "Seu primeiro nome" (obrigatório)
- Field 2: input "Seu CPF" com mask `000.000.000-00` (obrigatório · valida formato no front)
- Sub mono caps tiny: `SÓ PRA MESA SABER QUEM É · CPF NOS AJUDA A TE RECONHECER NA PRÓXIMA VISITA`
- CTA filled `Continuar` (disabled enquanto qualquer campo vazio ou CPF inválido)

### Razão de coletar CPF

- **Validação social mantida:** host vê nome real
- **Reconhecimento entre visitas:** próxima vez que esse cliente escanear QR (mesmo tenant ou outro do grupo), backend reconhece via CPF · personalização funciona (welcome com last_items, preferências)
- **Anti-fraude leve:** dificulta criação de múltiplas identidades fake na mesma sessão (CPF é único)
- **LGPD compliance:** CPF é dado pessoal · coleta consentida (cliente sabe o que tá fazendo · sub-text explica) · armazenado encriptado em `customers.cpf_encrypted` · expurgo via tool `lgpd_data_request` (ver `chat-history-lgpd.md`)

### Backend

```
POST /customers/identify
  body: { name: string, cpf: string, currentSessionId: uuid }
  → 200 { customerId, isReturning: bool, canonicalName: string }

  Lógica:
    1. Normaliza CPF (remove ./- · valida dígitos)
    2. Busca customer existente por CPF
    3a. Se existe: merge sessão atual com customerId existente · retorna isReturning=true + canonicalName do banco
    3b. Se não: cria novo customer · retorna isReturning=false + canonicalName=name
    4. Atualiza cookie/session
```

`POST /late-arrival-requests` rejeita 400 se `requesting_customer.name IS NULL OR cpf IS NULL`. App cliente garante o form antes do call · backend valida defensivamente.

### Edge cases

- **CPF inválido (formato errado):** form não habilita CTA · validação no front (algoritmo de dígitos verificadores)
- **CPF existe mas nome digitado ≠ nome do banco:** mostra mensagem amigável após submit: "Bem-vindo de volta, [nome do banco]! Já te conheço daqui." · prossegue com nome canônico
- **Cliente recusa fornecer CPF (ex: privacidade):** sem CPF, late-arrival não rola · cliente vê "Pra entrar na mesa, precisamos do nome e CPF · ou chama a recepcionista"
- **Mesmo CPF tenta entrar em 2 mesas simultâneas:** backend permite (raro · cliente pode estar em 2 lugares pelo app, ex: paga uma e pede em outra) · não bloqueia

### `escalation_chains` ainda existe · só pra QR ilegível

A tabela compartilhada criada no V15 fica · mas é usada **só pelo flow QR ilegível** (cascata puramente staff-to-staff: manager → outro manager → dono). Late-arrival e table-merge usam tabelas próprias mais simples:

> **DESATUALIZADO.** O bloco `late_arrival_requests` abaixo foi construído,
> ficou vazio e foi DROPADO na migration 081 — chegada tardia vive em
> `session_participants` (ver o banner no topo). O bloco fica aqui só como
> registro do desenho original. `escalation_chains` segue vivo para
> `table_merge`, `complaints` e `scan_verification`.

```sql
-- [REMOVIDO na migration 081] Late-arrival: tabela própria · single approver
CREATE TABLE late_arrival_requests (
  id                      uuid PRIMARY KEY,
  table_session_id        uuid NOT NULL REFERENCES table_sessions(id),
  requesting_customer_id  uuid NOT NULL REFERENCES customers(id),
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','timeout','cancelled')),
  expires_at              timestamptz NOT NULL DEFAULT (now() + interval '60 seconds'),
  responded_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Job a cada 5s detecta `expires_at < now()` em pending → marca timeout
```

## Fluxos cobertos

### Fluxo A · Late-arrival

> **DESATUALIZADO nos passos 1 e 7.** Não há escalation chain nem timeout de
> 60s: o pedido é uma row `pending` em `session_participants` e espera o host
> indefinidamente. Os passos 2-6 descrevem bem o que roda hoje, trocando
> `ScreenCustomerHostApproveJoin` por `ScreenHostApproveParticipant`.

Cliente B escaneia QR de mesa que já tem sessão ativa do Cliente A.

1. Backend detecta · cria escalation chain `type='late-arrival'`
2. Push pro customer-host (Cliente A): "Alguém quer entrar na sua mesa"
3. Cliente A vê tela `ScreenCustomerHostApproveJoin` com info do solicitante
4. Cliente A aprova OU recusa OU ignora
5. Se aprova:
   - Backend incrementa `party_size += 1`
   - Adiciona Cliente B em `session_participants` com `is_late_arrival=true`
   - Cliente B vê welcome message: "Bem-vindo à mesa do [host]"
   - Staff recebe notificação passiva (ver seção "Notificações pós-aprovação")
6. Se recusa:
   - Cliente B vê mensagem amigável: "Era engano? Confere se escaneou o QR certo"
   - Sugestão de chamar recepcionista
7. Se ignora 60s:
   - Escala pra recepcionista (step 2)
   - Cliente A perde o "1º direito de aprovar" mas pode aprovar via push se ainda quiser
   - Cliente A vê notificação atualizada: "Recepcionista vai decidir"

### Fluxo B · Junção de mesas

Mesa 14 (Família Carvalho · 4 pessoas) e Mesa 15 (Casal · 2 pessoas) decidem juntar fisicamente. Algum cliente bate "Juntar com mesa vizinha" no app OU staff puxa do POS.

#### Trigger · cliente-host pede via chat IA

Cliente A (host da M14) digita: "quero juntar com a mesa do lado".

1. LLM detecta intent → chama `request_table_merge` (sem `targetTable` ainda)
2. ToolCallIndicator · `··· USANDO request_table_merge ···`
3. **NOVO · `OverlaySalonMap` abre** (não navega · sobe como overlay sobre o chat):
   - Mini-mapa do salão com mesas próximas à M14 destacadas
   - Mesa do cliente (M14) com badge `VOCÊ TÁ AQUI`
   - Mesas adjacentes ocupadas mostram **hint de quem tá sentado** (1ª letra do nome do host · ex: "Casal Santos · 2 pessoas")
   - Mesas distantes ficam atenuadas (não selecionáveis · só faz sentido juntar com vizinhas)
   - Cliente toca a mesa alvo (M15) → seleção visual + bottom CTA `Pedir pra juntar com mesa 15`
   - X discreto pra fechar overlay sem ação
4. Após confirmar, escalation chain criada · ver passos 5+ abaixo

#### Trigger alternativo · staff via menu da mesa (V5)

Staff também pode iniciar via `ScreenManagerTableMenu` · ação "Juntar com outra mesa" · abre o mesmo `OverlaySalonMap` adaptado pra contexto staff.

#### Cascata e notificação em tempo real

5. Backend cria escalation chain `type='table-merge'` com 2 customers (host de M14 + host de M15)
6. **Ambos os hosts recebem push** + **notificação que aparece DENTRO do app em tempo real** (ver detalhe abaixo)
7. Cada um aprova individualmente em `ScreenCustomerHostApproveMerge`
8. Junção só rola se **ambos aprovarem** (consent duplo · proteção contra "puxa-mesa")

#### Notificação em tempo real · IA escreve com animação de letras

Quando o host da M15 está com o app aberto e a notificação chega, **a IA escreve a mensagem em tempo real** no chat dele (com a animação de letras aparecendo · `cTypewriter` 25ms por char):

```
[Bubble assistente · animação typewriter]
"Caleb da Mesa 14 quer juntar a mesa contigo.
 Eles são 4 pessoas, vocês são 2 · viraria
 uma mesa só com 6, uma comanda, uma conta."

[Chips contextuais · aparecem após o texto completar]
[ Aceitar pedido ] [ Negar pedido ]
```

Diferente das notificações silentes/passivas, essa **interrompe o flow conversacional** com prioridade · porque é tempo-sensitive (pessoas tão arrastando cadeiras agora). Mas não trava UI · cliente pode ignorar e continuar conversando.

Se o app está fechado: chega só o push lockscreen · ao abrir, a bubble com animação aparece logo no topo do chat.

#### Resolução

9. Se ambos aprovam:
   - Backend cria registro em `table_merges`
   - `table_sessions.merged_with_session_id` ligado nos 2
   - Comandas viram **uma só** (single bill no fim · ou split, decisão posterior)
   - Mapa do staff atualiza com **ícone novo** de mesa juntada (M14+M15)
   - Staff recebe notificação passiva + recomendação IA: "Considera realocar Henrique pra ajudar Caleb · 6 pessoas exigem mais atenção"
10. Se um recusa:
    - Outro recebe (também via typewriter): "[Host da outra mesa] preferiu não juntar · sem stress"
    - Sem efeito · mesas continuam separadas
    - **Cooldown de 20 minutos ativado** (ver seção abaixo)

### Cooldown anti-spam · 20 minutos

> Pra evitar que um cliente fique pedindo junção com a mesma mesa toda hora depois de receber não.

#### Regra

- Quando uma junção entre `(table_origin, table_target)` é **recusada** OU dá **timeout**, o backend grava em `merge_cooldowns`
- Por **20 minutos**, novas tentativas de **`request_table_merge` partindo de `table_origin` apontando pra `table_target`** são **bloqueadas no backend** (retorna 429 com mensagem amigável)
- LLM, ao tentar chamar a tool, recebe o erro e responde:
  - "A Mesa 15 disse que prefere não juntar agora · vamos esperar 20 min antes de tentar de novo? Quer chamar a recepcionista pra te ajudar?"
  - Chips: `Chamar recepcionista` · `Esperar`

#### Schema · `merge_cooldowns`

```sql
CREATE TABLE merge_cooldowns (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  origin_table    smallint NOT NULL,
  target_table    smallint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  reason          text NOT NULL CHECK (reason IN ('rejected', 'timeout'))
);

CREATE INDEX idx_merge_cooldowns_active
  ON merge_cooldowns(origin_table, target_table)
  WHERE expires_at > now();
```

#### Escape valves

1. **Caminho reverso continua aberto** · se a M15 quiser pedir junção pra M14 antes dos 20 min, **funciona** (cooldown é unidirecional `origin→target`). Razão: a M15 mudou de ideia, é decisão delas.
2. **Recepcionista pode override** · cliente A pode chamar a recepcionista, ela vai na mesa, conversa pessoalmente, e via `ScreenManagerTableMenu` (V5) força a junção (com confirmação verbal dos 2 hosts presencialmente). Endpoint do staff bypassa o cooldown.
3. **Cooldown auto-expira** em 20 min · TTL natural · sem intervenção
4. **Se ambos hosts saem da mesa** (sessão fecha) antes de 20 min · cooldown vira irrelevante · não bloqueia futuras junções entre mesas físicas (nova sessão = pares novos)

#### UI no app do cliente A (quem foi recusado)

Após receber o "preferiu não juntar":

- Bubble da IA com a recusa
- Sub mono caps tiny mute: `· VOCÊ PODE TENTAR DE NOVO EM 20 MIN`
- Chips: `Chamar recepcionista` · `Pedir pra outra mesa`

### Schema · `table_merges`

```sql
CREATE TABLE table_merges (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  session_a_id    uuid NOT NULL REFERENCES table_sessions(id),
  session_b_id    uuid NOT NULL REFERENCES table_sessions(id),
  approved_by_a   uuid NOT NULL REFERENCES customers(id),  -- customer-host de A
  approved_by_b   uuid NOT NULL REFERENCES customers(id),  -- customer-host de B
  merged_at       timestamptz NOT NULL DEFAULT now(),
  unmerged_at     timestamptz,  -- se desfizeram (raro)
  unmerged_by     uuid REFERENCES staff(id)
);

ALTER TABLE table_sessions
  ADD COLUMN merged_with_session_id uuid REFERENCES table_sessions(id);
```

## Notificações pós-aprovação · staff (read-only)

Depois que customer-host aprova, staff é **avisado** mas não consultado. Notificação aparece em 3 lugares:

### 1 · Painel · seção "Em curso" · novo card

Para late-arrival aprovado:

```
[INFO] MESA 14 EXPANDIU
       3 → 4 pessoas · host aprovou
       há 12s
       [ Dispensar ]
```

Para junção aprovada:

```
[INFO] MESAS JUNTADAS
       M14 (4) + M15 (2) = 6 pessoas
       hosts aprovaram · há 8s
       [ Dispensar ] [ Realocar garçom ]
```

Auto-some em 60s · ou via Dispensar · ou após staff agir em recomendação.

### 2 · Mapa do salão · novo ícone de mesa juntada

Em `ScreenManagerOps · sub-tab Mapa` (V3):

- Mesas juntadas aparecem como **2 cards conectados visualmente** (linha pontilhada entre eles · ícone unificador no canto)
- Label dupla: `M14+M15`
- Capacidade total mostrada: `6/6` (somando)
- Tap em qualquer das duas abre `ScreenManagerTableMenu` (V5) da sessão merged
- Visual sugerido:
  ```
  ┌────┬────┐
  │ 14 │ 15 │
  │M14+M15  │  ← mostra como bloco único com label dupla
  │ 6/6     │
  └────┴────┘
  ```
- Cor da borda muda · usa cor neutra (mute) ou cor especial pra distinguir das mesas individuais

### 3 · Recomendação IA contextual (se aplicável)

Quando junção ou expansion eleva carga acima do limiar do garçom da mesa, IA sugere realoc no Painel · `MInProgressCard kind="staff-recommendation"`:

```
[RECOMENDAÇÃO IA]
"Caleb agora tem 6 pessoas na M14+M15 (era 4)"
"Considere realocar 1 mesa dele pro Henrique"
[ Aplicar sugestão ] [ Ignorar ]
```

Critérios pra IA gerar essa recomendação:

- Junção que leva carga total do garçom acima do limiar de sobrecarga
- Late-arrival que faz mesa exceder 6 pessoas (mais difícil pra 1 garçom só)
- Pode ser silenciada pelo gerente em settings

## Edge cases

- **Customer-host sai do app no meio da decisão** → permanece como host até timer expirar · 60s · escala. Se voltar antes, vê notification "Decisão escalou pra recepcionista · você pode confirmar via push se quiser ainda"
- **Múltiplos late-arrivals simultâneos** (raro) → fila por timestamp · processa um de cada vez (host vê 1 popup por vez · não vários sobrepostos)
- **Customer-host sai fisicamente do restaurante mas mantém sessão aberta** → continua sendo host · pode aprovar via app remoto. Se ele recusar todas as junções, restaurante perde comanda + cliente novo · improvável mas possível.
- **Mesa sem customer-host** (`host_customer_id = NULL`) → cascata cai direto na recepcionista (skip step 1)
- **Junção entre mesas com hosts diferentes que recusam** · sistema NÃO insiste · não permite override do staff (decisão social respeitada)
- **Junção entre mesas onde uma é NULL** (mesa sem host customer) · só precisa do consent da que TEM host · staff aprova a NULL automaticamente
- **Customer-host aprova mas exceder capacity da mesa drasticamente** (ex: 4 pessoas + 4 late-arrivals = 8 numa mesa de 4) → staff vê alerta separado: "Mesa 14 super-lotada · 8 pessoas em cap 4 · checar se é seguro" (não bloqueia · só sinaliza)

## Não escopo

- **Customer-host transferir privilégio pra outro cliente da mesa** · não é prioridade · seria útil se host vai embora antes do fim · V2
- **Múltiplos hosts simultaneously** (ex: cada um responsável pelo próprio lado da mesa juntada) · feature complexa · V2
- **Staff override do customer-host** (forçar aceitar contra a vontade do customer-host) · NÃO vamos ter · respeito à decisão social é ponto cego
- **Histórico de aprovações por customer** (ex: "Caleb aprovou 12 late-arrivals esse mês") · vai pra analytics · não é UI de produto

## Implementação sugerida

1. Migration `host_customer_id` em `table_sessions` · backfill com `participant.joined_at min` por sessão existente
2. Estender `escalation_chains.steps` pra aceitar `role='customer-host'`
3. Tabela `table_merges` + index parcial em `unmerged_at IS NULL`
4. Endpoint `POST /escalations/:id/respond` que aceita `respondent_role: customer-host | host | manager | waiter`
5. WebSocket events: `escalation.created` (push pro cliente-host) · `escalation.approved` · `escalation.rejected` · `escalation.escalated_to_staff` · `escalation.timeout`
6. Frontend customer · `ScreenCustomerHostApproveJoin` + `ScreenCustomerHostApproveMerge`
7. Frontend customer (cliente novo) · `ScreenCustomerWaitingApproval`
8. Frontend staff · `MInProgressCard kind="info-late-arrival"` + `kind="info-table-merge"` + `kind="staff-recommendation"`
9. Frontend staff · novo ícone de mesa juntada no Mapa
10. AI service · regras de geração de `staff-recommendation` pós-junção/expansion
11. Tool customer-side · `request_table_merge(targetTable)` no inventário do Prompt 9

## Métricas

- % de late-arrivals aprovados pelo customer-host (vs cascata pra staff)
- Tempo médio de resposta do customer-host (sentinela: < 30s saudável · > 90s indica que push não está chegando)
- Taxa de junções aprovadas vs recusadas (ambos hosts) · indica adoção do feature
- Recomendações IA pós-junção: % aplicadas · % ignoradas · ajustar limiar se >70% ignoradas

## Schema · `escalation_chains` (compartilhado entre fluxos)

```sql
CREATE TABLE escalation_chains (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  type            text NOT NULL,  -- 'late-arrival' | 'table-merge' | 'qr-issue' | (futuro)
  context         jsonb NOT NULL, -- payload específico do tipo
  current_step    smallint NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','timeout','cancelled')),
  resolved_at     timestamptz,
  resolved_by     text,           -- 'customer:uuid' OU 'staff:uuid' (formato discriminado)
  created_at      timestamptz NOT NULL DEFAULT now(),
  steps           jsonb NOT NULL  -- [{ role, deadline, notified_at, responded_at? }]
);

CREATE INDEX idx_escalations_pending
  ON escalation_chains(tenant_id, current_step) WHERE status = 'pending';
```

Job recorrente a cada 10s detecta steps em deadline expirado e avança.
