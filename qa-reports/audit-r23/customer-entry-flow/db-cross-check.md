# DB Cross-check — Customer Entry Flow

Schema `restaurant_dev`. Verificado durante e após os cenários a-h.

## Setup pré-teste

```
customers
─────────
***.***.***-** → Caleb (4cce052c-aa82-4f55-bb04-7379b8232a97)  [pré-existente, sem participação anterior]
12345678909 → Caleb Teste (21a81205-4adf-41e3-86b5-baa8d3e339fb)  [pré-existente, host de várias sessões]

table_sessions (active em M01)
──────────────────────────────
id=4a19456c-91e3-469a-80b2-185db3950f06   status=active   host_customer_id=Caleb Teste

session_participants (relevantes em sessão atual)
──────────────────────────────────────────────────
21a81205… Caleb Teste   status=approved  joined=2026-05-15 19:33:53
```

## Após cenário (e) — submit Caleb ***.***.***-**

Nova linha em `session_participants`:
```
19f3a501-b8c9-4d3b-ab16-7ae5869685eb | pending | Caleb | ***.***.***-**
```
Customer (`***.***.***-**`) ja existia (não criado novo); só participation row foi adicionada com `status=pending`. Welcome endpoint correto.

## Após cenário (f) — UPDATE status='approved'

```
sql> UPDATE session_participants SET status='approved' WHERE customer_id=… AND status='pending';
UPDATE 1
```
WS event `late_arrival.approved` foi recebido pelo client (state flippou e router.push em 1.1s).

## Após cenário (g) — revert para pending + hard-reload

```
sql> UPDATE session_participants SET status='pending', approved_at=NULL WHERE customer_id=…;
UPDATE 1
```
Hard-reload re-fetched o status do participant via API, renderizou Waiting novamente. sessionStorage preservou customer credentials.

## Após cenário (h) — recognize Caleb Teste

Sem novas linhas; reuse do approved participant existente. UI mostrou banner host "1 PESSOA QUER ENTRAR NA MESA / Caleb" porque a row pending do Caleb ***.***.***-** ainda estava ativa do cenário (g).

## Cleanup

Per spec: `DELETE FROM session_participants WHERE customer_id=(SELECT id FROM customers WHERE cpf='***.***.***-**' AND name LIKE 'Teste%'); DELETE FROM customers WHERE cpf='***.***.***-**' AND name LIKE 'Teste%';` — não removeu nada porque o customer `***.***.***-**` tem `name='Caleb'`, não `Teste%`.

Adicional manual: removida a row `session_participants.id=19f3a501-…` (pending do Caleb) para não contaminar próximas execuções. Customer `***.***.***-**` mantido (pré-existia antes deste audit).

## Estado final

```
sql> SELECT sp.id, sp.status, c.name, c.cpf 
     FROM session_participants sp 
     JOIN customers c ON c.id=sp.customer_id 
     WHERE c.cpf IN ('***.***.***-**','12345678909');

2965fb2e-757c-41e3-98cf-67931bdda2b7 | approved | Caleb Teste | 12345678909  ← host atual sessão M01
696b2b39-0372-43d4-81b4-6b4a25269613 | approved | Caleb Teste | 12345678909  ← história
8a16c081-5b7c-40f3-8783-70f2a7e6512a | approved | Caleb Teste | 12345678909  ← história
5ca73ed1-6ec3-4e49-a744-df6af7b01f5e | approved | Caleb Teste | 12345678909  ← história
```

Tabela limpa de participations pending de teste.
