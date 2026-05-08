# Chat history · LGPD privacy flow

> **Status: rascunho · texto canônico é exemplo** · cliente edita após
> revisão jurídica antes de subir pra produção.

Spec do fluxo de privacidade do app do cliente. Define quando o aviso LGPD
aparece, qual a frase canônica imutável que o backend retorna, e como a
solicitação de exclusão é roteada pra gerência.

Frames visuais em `app-cliente-canvas-v14.html` · seção **v14.7**
(canvas anterior `v13.html` está com texto `15 dias úteis` que foi corrigido
no round 9-bis · não usar como referência).

---

## Princípio

Cliente tem direito legal (LGPD · Art. 18) de pedir exclusão dos seus dados
a qualquer momento. O app do cliente deve oferecer esse caminho de forma
**explícita, gratuita e em até 1 toque**, sem fricção e sem esconder atrás
de menus.

Aviso aparece quando a IA detecta intent de privacidade — não vive numa tela
de configurações enterrada.

---

## Triggers

A IA chama `show_lgpd_notice()` quando o cliente diz qualquer coisa que
expressa intent de privacidade:

- "quero apagar meus dados"
- "vocês guardam minhas informações?"
- "quais meus direitos?"
- "como vocês tratam meus dados?"
- "lgpd"
- "delete my data"
- "exclui meus dados"

Detecção via classifier server-side · não regex · com fallback liberal
(falso-positivo é OK · falso-negativo deixa cliente sem direito legal).

---

## Texto canônico · `show_lgpd_notice`

> **★ Este texto é EXEMPLO · cliente edita após revisão jurídica.** ★
>
> Vive em código backend (`apps/ai-service/src/lgpd/notice.ts` ou similar)
> · imutável em runtime · só muda via deploy · auditável.

**Texto exemplo (placeholder):**

> "Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão
> dos seus dados a qualquer momento. Posso apagar suas conversas agora?"

(V13 dizia "Posso encaminhar sua solicitação pra gerência?" · mudou no
round 9-bis pra refletir que a ação é imediata e não vai pra gerência.)

**Apresentação visual** (frame v13.7 · `LGPDNoticeBubble`):
- Container `#fafaf8` · border 1px borderSoft · border-left 3px ink · radius 10
- Mono label "AVISO LGPD" no topo (caps tracking 1.2)
- Texto Inter 15px line-height 1.5 ink · sem ornamentos
- 2 chips abaixo: `Sim, quero excluir` · `Não, não quero excluir`

**Não banido pela regra de chips** (que normalmente proíbe Sim/Ok/Tá bom):
exceção explícita pra confirmações destrutivas e LGPD.

---

## `lgpd_data_request(type)` · server-side

> **Escopo dessa tool: apenas `type='erasure'` das conversas (chat_threads
> + chat_messages no NoSQL).** A ação é **imediata** · não tem prazo de
> processamento.
>
> O prazo legal LGPD de 15 dias úteis aplica-se a pedidos de **PII completa**
> (cadastro do cliente · CPF · histórico de pedidos · pagamentos) — esses
> casos vão por outro canal (formulário no site `/privacidade` ou DPO via
> e-mail) e estão **fora do escopo dessa tool**. Documento separado.

Quando cliente confirma (tap "Sim, quero excluir" OU resposta afirmativa em
texto livre), backend executa **na mesma transação**:

1. **Apaga imediatamente** todos os `chat_threads` e `chat_messages` do
   customer no NoSQL · escopo: tenant atual + sessions antigas dessa pessoa.
2. Cria registro `lgpd_requests` com:
   - `id` (uuid)
   - `protocol` = `LGPD-{YYYY-MM-DD}-{4 hex chars}` (formato user-facing)
   - `tenant_id`, `customer_id`, `table_session_id`
   - `type` = `'erasure'` (default · futuros: `'export'`, `'correction'`)
   - `requested_at` (timestamp)
   - `executed_at` (timestamp · default `now()` · == `requested_at` neste fluxo)
   - `status` = `'fulfilled'` (★ direto · não `'pending'`)
   - `expires_at` = `requested_at + 90 dias` (TTL pro registro de comprovante)
3. **Não notifica gerente** · ação consumada server-side · não precisa de
   approval humano. (Auditoria fica no `audit_log`.)
4. Retorna ao cliente:
   - Card com protocolo (formato mono `LGPD-2026-05-08-3F2A`)
   - Mensagem canônica:
     > "Suas conversas foram apagadas agora. Protocolo guardado por 90 dias
     > caso você precise de comprovante."
5. **SEM push de confirmação posterior** · já tá pronto.
6. **SEM chips após** · ação consumada · cliente já tá com a informação.

**Frase canônica** (vive em backend `apps/ai-service/src/lgpd/messages.ts`
ou similar · imutável em runtime):

```python
LGPD_REQUEST_CONFIRMED = (
  "Suas conversas foram apagadas agora. Protocolo guardado por 90 dias "
  "caso você precise de comprovante."
)
```

---

## Schema · `lgpd_requests`

V14 (round 9-bis) · ajustado pra refletir que `erasure` de conversas é
imediato. `status` default vira `'fulfilled'` · `executed_at` substitui
`completed_at` · `expires_at` (TTL 90 dias) substitui `legal_deadline_at`
neste fluxo.

```sql
CREATE TABLE lgpd_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol           text NOT NULL UNIQUE,
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  customer_id        uuid NOT NULL REFERENCES customers(id),
  table_session_id   uuid REFERENCES table_sessions(id),
  type               text NOT NULL DEFAULT 'erasure'
                     CHECK (type IN ('erasure','export','correction')),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  executed_at        timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'fulfilled'
                     CHECK (status IN ('fulfilled','pending','rejected')),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  rejection_reason   text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- TTL · jobs de purga apagam registros expirados (mantém auditoria por 90d)
CREATE INDEX lgpd_requests_expires
  ON lgpd_requests (expires_at);

-- Lookup por customer (pra evitar duplicar protocolo se ainda tá no TTL)
CREATE INDEX lgpd_requests_customer
  ON lgpd_requests (tenant_id, customer_id, requested_at DESC);
```

**Migração de V13 → V14:**

```sql
ALTER TABLE lgpd_requests
  ALTER COLUMN status SET DEFAULT 'fulfilled',
  DROP COLUMN IF EXISTS legal_deadline_at,
  DROP COLUMN IF EXISTS staff_user_id,
  DROP COLUMN IF EXISTS completed_at,
  ADD COLUMN IF NOT EXISTS executed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz NOT NULL DEFAULT (now() + interval '90 days');

-- type rename
UPDATE lgpd_requests SET type = 'erasure'    WHERE type = 'data_deletion';
UPDATE lgpd_requests SET type = 'export'     WHERE type = 'data_export';
UPDATE lgpd_requests SET type = 'correction' WHERE type = 'data_correction';
```

---

## Re-aparição

Chips do aviso (`Sim, quero excluir` · `Não`) ativos só até a próxima ação ·
depois somem. Notice **não ressurge sozinho** · cliente pode chamar de novo
explicitamente ("vocês guardam meus dados?") e a tool é chamada de novo.

Como a deleção é imediata, normalmente **não há protocolo "em aberto"** ·
toda chamada subsequente apaga o que existe agora e gera um novo protocolo.
A IA mostra apenas o último protocolo dentro da janela de 90 dias se cliente
quiser comprovante:

> "Suas conversas já foram apagadas em **08/05/2026** · protocolo
> **LGPD-2026-05-08-3F2A** · guardado até **06/08/2026**."

(Sem chips · informação consumada.)

---

## Auditoria

Toda chamada de `show_lgpd_notice` e `lgpd_data_request` logada com:
- `tenant_id`, `customer_id`, `tool_name`, `params`, `result`, `duration_ms`
- timestamp UTC · imutável (append-only `audit_log`)
- exportável via CSV pra ANPD se solicitado

---

## O que NÃO está nesse spec

- **PII completa (cadastro · CPF · pagamentos · histórico de pedidos)** ·
  pedido legal LGPD com prazo de 15 dias úteis · **escopo separado** ·
  vai por outro canal (formulário em `/privacidade` ou DPO via e-mail) ·
  gerente revê e responde · documento dedicado.
- UI do gerente recebendo o pedido de PII completa (vai num round dedicado
  do app do gerente) — neste fluxo de chat não há tela do gerente porque
  a deleção é automática.
- Política de retenção automática (30 dias auto-delete de conversas
  inativas · documento separado).
- Cookies / web storage / consent banner (vive na landing, não no app da mesa).
- DPO contact · privacy policy completa (vivem em `/privacidade`).
