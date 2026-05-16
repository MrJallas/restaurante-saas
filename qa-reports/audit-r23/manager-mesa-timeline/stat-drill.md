# /manager/stat/[kind]/[id] — Stat drill-down

Subagente 16 / Audit R23 / Stat detail.

## Componente

- Page: `apps/web-staff/src/app/manager/stat/[kind]/[id]/page.tsx`
- Screen: `apps/web-staff/src/screens/manager/ScreenManagerStatDetail.tsx`

## Kinds suportados

`ScreenManagerStatDetail.tsx:31-39`:

```ts
export type StatKind =
  | 'late-arrival' | 'merge' | 'complaint' | 'escalation'
  | 'zone-pause' | 'qr-issue' | 'generic-call' | 'lgpd';
```

Sem `revenue` — caso fallback nao implementado.

## Live probes (Playwright)

Persona Manager Erica. Browser intercept `192.168.43.12:3001` → `localhost:3001` (PUBLIC_HOST env aponta para LAN antiga em docker).

| Kind | ID DB testado | Resultado | Achados |
|---|---|---|---|
| `complaint` | `9596f501-af94-42d9-b2c8-f4ee7d5b1881` | Renderiza com **bugs de mapping** | Title "Reclamação", header "MESA UNDEFINED · COMIDA-FRIA", Status RESPONDED, "DESCRIÇÃO" vazia, "ABERTA EM Invalid Date". Buttons: Resolver, Voltar. |
| `late-arrival` | `0ad49ccb-30f0-4957-933b-f01b1a9c339a` | Renderiza com bugs | Title "Chegada Tardia", "MESA UNDEFINED · undefined pediu pra entrar", Status APPROVED, "CRIADA EM 08/05/2026, 16:14:41", "EXPIRA EM Invalid Date". Sem botoes (status approved nao mostra Aprovar/Rejeitar). |
| `merge` | `72e8262b-8365-48fc-9737-4b5b8df94c61` | Renderiza com bugs | Title "Junção de Mesas", "MESA UNDEFINED → UNDEFINED · undefined quer juntar", Status PENDING, Pessoas (origem)/(destino) vazios, Expira em Invalid Date. Buttons: Rejeitar, Aprovar. |
| `lgpd` | `f80aaaca-f96d-40d7-95fb-e77082e9ec4a` | **Stuck em "Carregando…"** | API `api.lgpd.list()` nao resolve dentro de 6s (timeout do probe). |
| `escalation` | `fe797ec5-75a0-4933-bd9d-10decbfde469` | "Não encontrado." | useEffect nao tem branch para `escalation` — `data` fica `null` → fallback render. |
| `zone-pause` | `no-row-yet` (DB empty) | "Não encontrado." | `list.find(r.id === 'no-row-yet')` retorna undefined. |
| `qr-issue` | `no-row-yet` (DB empty) | "Não encontrado." | useEffect nao tem branch — sem fetch. |
| `generic-call` | `c441c7c6-9878-4dbb-8857-40f9848af871` (waiter_call) | "Não encontrado." inicial, **redireciona** para `/waiter/mensagens/<thread-id>` | useEffect nao tem branch. Algum effect/prefetch puxa para waiter mensagens. |

Screenshots: `stat-<kind>.png` em `screenshots/`.

## API hits (do useEffect)

`ScreenManagerStatDetail.tsx:60-86`:

```ts
if (kind === 'late-arrival') {
  const list = await api.lateArrival.list();
  res = list.find((r) => r.id === id) ?? null;
} else if (kind === 'merge') {
  const list = await api.tableMerge.list();
  ...
} else if (kind === 'complaint') {
  const list = await api.complaints.list();
  ...
} else if (kind === 'zone-pause') {
  const list = await api.zonePauses.list();
  ...
} else if (kind === 'lgpd') {
  const list = await api.lgpd.list();
  ...
}
```

**4 kinds sem branch**: `escalation`, `qr-issue`, `generic-call`, e qualquer kind nao listado caem direto em `loading=false` + `data=null` → "Não encontrado."

## Bugs de mapping `DTO ↔ API row`

API `GET /complaints` retorna row mapping cru (`complaints.service.ts:348+`):

```json
{
  "id": "...", "orderId": null, "customerId": "...",
  "rating": null, "problemType": "comida-fria",
  "text": "trace3", "status": "responded",
  "submittedAt": "2026-05-09T00:45:48.854Z",  // <- nao `createdAt`
  "responseText": "hello manager",
  "responseAt": "..."
  // sem `tableNumber`, `customerName`, `description`, `createdAt`
}
```

Mas o `ComplaintDto` em `shared-types/complaint.ts:61-77` espera:

- `tableNumber: number` — **ausente** → renderiza `undefined`
- `customerName: string` — **ausente**
- `description: string` — **ausente** (campo do DB e `text`)
- `createdAt: string` — **ausente** (campo do DB e `submitted_at` mapped to `submittedAt`)

Comentario relacionado em `complaints.service.ts:62`:

```
// TODO(payload): tableSessionId / tableNumber / customerName need ...
```

Mesma situacao para `late-arrival`, `merge`, `lgpd`. Frontend renderiza
sem crash mas com placeholders `undefined` / `Invalid Date`.

## Anti-pattern adicional

Filtragem cliente-side via `list().find(r => r.id === id)`:

- Fetch da lista inteira (waste em tenants grandes)
- Sem endpoint `GET /:slug/<resource>/:id` dedicado
- Sem error reporting (se id existe mas falha desserializacao, mostra "Não encontrado")

Intencional Round 18 dado volume pequeno em dev — em prod precisa virar
fetch individual.

## DetailContent render (`ScreenManagerStatDetail.tsx:145+`)

Kinds implementados:

- `late-arrival` (linhas 161-187): Hero + Status pill + Contexto + Criada em + Expira em + Rejeitar/Aprovar (se pending)
- `merge` (linhas 189-220): Hero + Status + 4 fields + Rejeitar/Aprovar (se pending)
- `complaint` (linhas 222-252): Hero + Status + Rating + Descrição + Aberta em + Resolver/Voltar
- `zone-pause` (linhas 254-283): Hero + Status + Tempo restante (count down) + Iniciada em + Encerra em + Motivo + `Encerrar agora` (se active)
- `lgpd` (linhas 286-302): Hero (protocolNumber) + Status + Aberta em + Atendida em

Fallback (linha 304-320): renderiza `<pre>JSON.stringify(data, null, 2)</pre>` mas so se `data` foi resolvido. Para os 3 kinds sem branch (`escalation`, `qr-issue`, `generic-call`), `data` fica `null` → "Não encontrado.".

## Status

**PARTIAL** — 5/8 kinds implementam useEffect, mas TODOS apresentam
bugs de mapping (campos undefined / Invalid Date). 3 kinds nao tem
branch (escalation, qr-issue, generic-call). LGPD endpoint hangs (nao
resolveu em 6s no probe).

## Sugestoes

1. **Fix mapping** em `complaints.service.ts.mapRow` para retornar
   `tableNumber`, `customerName`, `description` (renomear `text`),
   `createdAt` (renomear `submitted_at`).
2. **Implementar branches** para `escalation`, `qr-issue`, `generic-call`
   no useEffect — ou pelo menos render JSON debug no fallback.
3. **Investigar** porque `api.lgpd.list()` nao resolve em 6s.
4. **Cleanup redirect** para generic-call — provavelmente um link em
   stats das `MStat` do home/operacoes apontando errado.
5. **Endpoint dedicated** `GET /:slug/<resource>/:id` para evitar
   `list().find()` cliente-side.
