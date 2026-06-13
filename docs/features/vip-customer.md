# VIP customer · feature spec

> Status: a desenhar (entry point existe na MoreSheet do `ScreenManagerTableMenu`).
> Backend: a implementar.

## O que é

Marcação de **sessão como VIP**. Vale só durante a sessão da mesa — não vira atributo permanente do cliente. Impacta priorização de chamados e apresentação visual da mesa.

## Quem marca

- **Gerente:** `ScreenManagerTableMenu` · MoreSheet (3 pontinhos do topbar) · "Marcar como VIP nessa sessão"
- **Recepcionista:** mesma MoreSheet na variante host
- **Garçom:** **não** marca — só consome (vê o badge, recebe os pushes priorizados)

## Persistência

- Coluna nova em `table_sessions`:
  ```sql
  ALTER TABLE table_sessions ADD COLUMN flags text[] DEFAULT '{}';
  -- valores possíveis: 'vip' | 'allergy' | 'reincidente' | ...
  ```
- Session-scoped: limpa quando `closeBill()` fecha a mesa.
- **Não** vira marca em `customers` (loyalty fica em outro lugar · ver "Não escopo").
- Auditoria em `session_audit_logs`: evento `vip_marked` / `vip_unmarked` com `staff_id` + `at` + `reason?`

## Cálculo de prioridade (extender o balanceador existente)

Hoje `priorityOf(call, loads)` retorna `'high' | 'medium' | 'low'` baseado em saturação. **Adicionar overrides absolutos antes do branch de saturação:**

```ts
function priorityOf(call: Call, loads: Record<Station, StationLoad>): Priority {
  // OVERRIDES ABSOLUTOS (por cima da saturação) ─────
  if (call.flags?.includes('allergy')) return 'high'; // segurança alimentar
  if (call.flags?.includes('vip')) return 'high'; // experiência

  // Casos contextuais existentes:
  if (call.type === 'pediu-conta' && call.elapsedMin > 5) return 'high';
  if (call.type === 'pronto-cozinha' && call.elapsedMin > 3) return 'high';

  // Fallback: saturação da estação de origem
  const sat = saturation(loads[call.sourceStation]);
  if (sat >= HIGH_THRESHOLD) return 'high';
  if (sat >= MED_THRESHOLD) return 'medium';
  return 'low';
}
```

## Tie-break entre múltiplos `high`

Quando mais de uma chamada é `high` ao mesmo tempo, ordenar por:

1. `allergy` (segurança · primeiro de todos)
2. `vip` (experiência)
3. `elapsedMin` desc (quem espera mais)
4. tipo: `pronto-cozinha` > `pediu-conta` > `chamou-garcom` > `mais-bebida`

Documentado em ordem decrescente — quanto mais cedo na lista, mais peso.

## API

```
POST /staff/sessions/:tableSessionId/flags
  body: { flag: 'vip' | 'allergy', action: 'add' | 'remove' }
  perms: manager · host
  → 200 { flags: string[], updatedAt }

GET /staff/sessions/:tableSessionId
  → resposta inclui `flags` no payload (já vai incluir, é só não filtrar)
```

## Eventos WebSocket

- `session.flag_changed` — broadcast pra todos os garçons da praça da mesa
  - payload: `{ sessionId, tableNumber, flags: string[], by: { staffId, name } }`
- Imediato: backend dispara `call_priority_changed` pra **toda call ativa** dessa sessão (o front re-renderiza prioridade sem F5)

## Frontend · onde o VIP aparece

- **Card de mesa no Mapa (Operação · Mapa)** — badge de coroa minimal 12px no canto sup direito quando `flags.includes('vip')`. Sem pesar — só sinal.
- **Card de chamado (lista de chamados do garçom)** — pill mono caps `VIP` ao lado do nº da mesa, fundo lavado da mesma cor da prioridade alta.
- **Detalhe do chamado** — eyebrow `PRIORIDADE ALTA · VIP` (em vez do `PRIORIDADE ALTA` genérico).
- **TableMenu MoreSheet** — quando já é VIP, o item vira "**Remover VIP** dessa sessão" (toggle).

## Edge cases

- Marcar VIP **depois** que a chamada já foi classificada `low` → reclassificação imediata via `call_priority_changed`.
- Marcar VIP **na mesma sessão duas vezes** (idempotente · `flags` é set, não array).
- Sessão fechada · novo cliente senta na mesma mesa → mesa começa nova sessão **sem** o flag (correto · session-scoped).
- Garçom **não** consegue marcar (403 no backend).
- Auditoria sempre grava — não tem flag VIP "silencioso".

## Não escopo

- Cosmetics customer-facing (placa de mesa · drink de boas-vindas · cardápio especial) — feature separada, depende de inventário
- Loyalty / programa de pontos — feature separada, mora no perfil do cliente, não na sessão
- VIP automático por aniversário — feature separada, integra com reservas
- "Always VIP" no perfil — campo `customers.is_vip` — separado, requisito de governança

## Implementação sugerida

1. Migração `flags text[]` em `table_sessions` + seed pra sessões abertas com `'{}'`
2. Endpoint `POST /staff/sessions/:id/flags` + guard manager/host
3. Estender `priorityOf()` com os 2 overrides + atualizar tie-break
4. Disparar `call_priority_changed` pra todas as calls ativas da sessão ao mudar flags
5. Front: TableMenu MoreSheet wire ao endpoint + render do toggle
6. Front: badge no card de mesa (Mapa) + pill no card de chamado + eyebrow no detalhe
7. Auditoria: append em `session_audit_logs` em todo POST `/flags`

## Métricas de sucesso (sugestão)

- % de sessões com VIP marcado por turno (sentinela · uso saudável seria 5-15%; 0% indica feature não está sendo descoberta; >30% indica diluição)
- Tempo médio de resposta a chamado VIP vs não-VIP (validar que o override realmente acelera atendimento)
- Reincidência: % de mesas que **viraram** VIP no meio da sessão vs marcadas no início
