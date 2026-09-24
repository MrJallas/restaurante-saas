# Customer-host model · spec

> Status: **Adopted** (V15 garçom round 8a · V15 cliente round 8b · patch retroativo V8b · 2026-05-08)
> Owners: cliente flow + garçom passive-notification flow

## Resumo

A primeira pessoa a se sentar numa mesa vira o **host** daquela mesa
(`tables.host_customer_id`). Quando outro cliente B escaneia o QR de uma mesa
**já ocupada** (late-arrival), é o host — não o staff — que decide se B pode
entrar. Staff só recebe **notificação passiva** depois que o host aprovou.

Esse modelo elimina cascata operacional pro staff em cenários sociais que o
cliente da mesa resolve melhor (ele sabe quem é amigo, quem é estranho, quem
tava chegando atrasado).

## Identificação obrigatória pré-late-arrival

> **Regra:** Toda `late_arrival_request` exige `requesting_customer_id` apontando
> pra um `customers` com `name NOT NULL` **e** `cpf_hash NOT NULL`. Não existe
> late-arrival anônimo.

### Por que

Pedir aprovação social pra um `?` anônimo é ruim de validar. O host olha o
push, não reconhece nada, e fica em dúvida se aceita ou recusa. Com nome real
("Marina"), o host decide informado: _"ah, é a Maria, irmã do João"_ ou
_"não conheço, era engano"_. **Pergunta social só funciona com nome.**

CPF entra como **chave de auto-reconhecimento entre visitas**: na próxima vez
que escanear, o backend reconhece o cliente sem ele precisar redigitar nome ou
preferências. Bonus side-effect: dificulta criar identidades fake na mesma
sessão (anti-fraude leve · não é o objetivo principal).

### Como o flow garante isso

1. Cliente B escaneia QR de mesa ocupada.
2. Backend detecta late-arrival.
3. **Se** `customers.name IS NULL` na sessão atual (1ª visita do device, ainda
   não passou por recognize/welcome):
   - App cliente B mostra **bloqueio obrigatório**
     `ScreenCustomerIdentifyBeforeJoin` ANTES de chamar a API de late-arrival.
   - Title: _"Quem é você?"_ · Sub: _"[Host] vai ver seu nome pra decidir se
     você pode entrar"_.
   - Inputs: _"Seu primeiro nome"_ (não-vazio) **+** _"Seu CPF"_ (mask
     `000.000.000-00` · dígitos verificadores validados no front).
   - Mono caps: _"SÓ PRA MESA SABER QUEM É · CPF NOS AJUDA A TE RECONHECER NA
     PRÓXIMA VISITA"_.
   - CTA filled `Continuar` (disabled até ambos campos válidos).
4. **Se** `customers.name IS NOT NULL` na sessão (returning · sessão já
   identificada num welcome anterior) · pula o bloqueio · vai direto pro
   `ScreenCustomerWaitingApproval`.

### Lookup por CPF · `POST /customers/identify`

Submit do bloqueio chama essa rota antes de criar a `late_arrival_request`:

```
POST /api/v1/customers/identify
{ "name": "Marina", "cpf": "147.852.963-00" }
```

Backend faz lookup por `cpf_hash`:

- **CPF existe** (returning customer noutro device · ou re-identificando):

  ```json
  {
    "isReturning": true,
    "customerId": "cus_…",
    "canonicalName": "Marina S.",
    "lastVisitAt": "2026-04-12T20:30:00Z"
  }
  ```

  App faz **merge** da sessão atual com o customer existente · auto-login ·
  próxima tela (waiting / chat) saúda com `canonicalName`. Se `canonicalName`
  difere do nome digitado, o welcome usa `"Bem-vindo de volta, ${canonicalName}"`
  (não confronta o cliente · só corrige).

- **CPF novo** (1ª visita do CPF na rede):
  ```json
  { "isReturning": false, "customerId": "cus_…", "canonicalName": "Marina" }
  ```
  Backend cria `customers` row com `name + cpf_hash` salvos · request
  prossegue normal.

Em ambos os casos · cliente nunca volta pra fora do form. Sem frame
intermediário "validating" — transição happy-path direto pro waiting.

### LGPD compliance

- **Consentimento ativo:** o sub mono caps explica explicitamente o uso do CPF
  ("nos ajuda a te reconhecer"). Cliente sabe o que tá digitando e pra quê.
- **Armazenamento:** CPF guardado como `cpf_hash` (HMAC-SHA256 com pepper
  server-side) · permite lookup determinístico sem expor o valor cru. CPF cru
  nunca persistido em log, DB de aplicação, ou response payload.
- **Expurgo:** `lgpd_data_request` (já existente) inclui `cpf_hash` no escopo
  de delete · cliente pode pedir esquecimento normalmente.
- **Cliente recusa CPF:** sem CPF, late-arrival bloqueia (CTA disabled). Copy
  amigável: _"Pra entrar na mesa, precisamos do nome e CPF · ou chama a
  recepcionista"_ (escape valve via waiter-call existente).

### Backend enforcement

- `POST /api/v1/late-arrival-requests` valida `requesting_customer_id` resolve
  pra um `customers` com `name NOT NULL` **e** `cpf_hash NOT NULL`.
- Se app cliente bypassar o bloqueio (raro · só dev / cliente quebrado),
  backend rejeita **400** com mensagem amigável:
  ```json
  {
    "error": "identify_before_join_required",
    "message": "Pra entrar numa mesa ocupada precisamos do seu primeiro nome e CPF."
  }
  ```
- App cliente trata esse 400 mostrando a mesma `ScreenCustomerIdentifyBeforeJoin`
  como recovery.

### O que isso elimina

- ✗ Push do host com sub "Cliente novo · Mesa 14" (sem nome)
- ✗ `PersonChipAnon` (avatar `?` dashed) na UI do host
- ✗ Variante `anônimo` do `ScreenCustomerHostApproveJoin`
- ✗ Hero "Cliente novo quer juntar a sua mesa"

Tudo agora usa o nome real do solicitante.

## Single approver · sem cascata

`host_customer_id` é o **único** aprovador da late-arrival.

- Se `host_customer_id IS NULL` (walk-in sem app · raro) **OU** TTL de 60 s
  expira sem resposta **OU** host clica "Não, era engano":
  → cliente B vê escape-valve **"Chamar recepcionista"** que cai no waiter-call
  existente (humano resolve com humano · sem cascata automática pro staff).
- Staff recebe **notificação passiva** (não-bloqueante) só depois que host
  aprovou · ver canvas garçom V16 seção `staff-late-arrival-info`.

## Linguagem

- Push pro customer-host = **ink neutro**, não mostarda. Mostarda fica reservada
  pro vocabulário staff (atenção operacional). Cliente recebendo pergunta
  social = tom calmo, não-urgente.
- "X entrou na mesa" no chat dos já-na-mesa = **system divider** (card dashed
  ink), não `ManagerBubble` (não é gerente falando) e não `AssistantBlock` (não
  é IA falando) · é **evento de sistema**.

## Referências

- Handoff cliente: `/handoff/cliente/cliente-late-arrival.jsx` · 8 frames iOS
- Handoff garçom (passive notify): `/handoff/garcom/garcom-late-arrival-info.jsx`
- Canvas cliente V15: `/app-cliente-canvas-v15.html`
- Canvas garçom V16: `/app-garcom-canvas-v16.html` (seção `staff-late-arrival-info`)
