# Zone pause · feature spec

> Status: a desenhar (entry point existe na detail screen de SOBRECARGA do Equipe).
> Backend: a implementar.

## O que é
Pausa de pedidos novos **só nas mesas atendidas por um funcionário específico**. Diferente da pausa global (Operação · Pausar pedidos novos · pausa todo o salão), essa é localizada — o resto do restaurante funciona normal enquanto o funcionário sobrecarregado se recupera.

## Por que existe
Quando 1 garçom está sobrecarregado e o resto do salão tá tranquilo, pausar TUDO é overkill. Zone pause permite aliviar só ele, sem impactar a operação dos outros garçons. Ferramenta cirúrgica vs ferramenta de força bruta.

## Quem dispara
- **Gerente:** `ScreenManagerStatDetail` (variante `sobrecarga`) · ação "Pausar mesas do Caleb por 5 min"
- **Auto-trigger (futuro):** se saturação individual passa de 1.5x do limiar pessoal por mais de 3 min, sugere ao gerente

## Persistência
Nova tabela `zone_pauses`:

```sql
CREATE TABLE zone_pauses (
  id            uuid PRIMARY KEY,
  waiter_id     uuid NOT NULL REFERENCES staff(id),
  started_at    timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz NOT NULL,
  started_by    uuid NOT NULL REFERENCES staff(id),
  ended_at      timestamptz,
  ended_by      uuid REFERENCES staff(id),
  reason        text
);

CREATE INDEX idx_zone_pauses_active
  ON zone_pauses(waiter_id) WHERE ended_at IS NULL;
```

- TTL: padrão 5 min (configurável: 5/10/15/30 min)
- Auto-encerra quando `ends_at` é atingido (job recorrente popula `ended_at` e dispara evento)
- Pode ser encerrada manualmente pelo gerente

## Como afeta o pedido novo

- **Customer escaneando QR de mesa atendida pelo waiter pausado:**
  - O cardápio carrega normalmente
  - Botão "Adicionar ao pedido" continua visível
  - ETA exibido aumenta silenciosamente em +(duração restante da pausa)
  - **Sem notificação de "pausado" pro customer** (silent pause)
  - Pedido entra em queue interno até o pause acabar OU é submetido com atraso silencioso
- **Customer escaneando QR de mesa de outro waiter:** comportamento normal
- **Pedidos JÁ confirmados continuam fluindo** (cozinha continua preparando)

### Pedido manual lançado pelo garçom durante a pausa
> **Importante:** o garçom **não é barrado** de lançar pedidos manualmente durante a pausa das mesas dele. A pausa é sobre **fluxo**, não sobre **bloquear o garçom**.

- Garçom abre o pedido manual pela aba "Novo" → escolhe a mesa → adiciona itens → confirma · funciona normal
- O pedido criado entra no **mesmo congelador** que os pedidos vindos do cardápio digital do cliente (queue interno)
- Quando o TTL acaba (ou o gerente libera manualmente), todos os pedidos congelados são submetidos em ordem cronológica
- Justificativa: a pausa de zona alivia a **fila de pedidos novos**, não a capacidade do garçom de lançar pelos clientes que pedirem oralmente · barrar o garçom criaria fricção sem ganho operacional
- Visualmente · o app do garçom mostra um chip mono caps tiny `· FILA EM PAUSA · LIBERA EM 04:23` no card do pedido recém-criado, pra deixar claro que ele está congelado mas será processado

## API

```
POST /staff/zone-pauses
  body: { waiterId: string, durationMinutes: 5 | 10 | 15 | 30, reason?: string }
  perms: manager
  → 201 { id, endsAt }

DELETE /staff/zone-pauses/:id
  body: { reason?: string }
  perms: manager
  → 200 (encerra antes do TTL)

GET /staff/zone-pauses
  query: { waiterId?, active?: boolean }
  perms: manager
  → 200 [{ ...zonePauses }]
```

## Eventos WebSocket

- `zone_pause.started` · payload `{ id, waiterId, endsAt, startedBy }`
- `zone_pause.ended` · payload `{ id, waiterId, endedAt, endedBy?, autoExpired: boolean }`

Broadcast pra:
- Garçom afetado (vê indicador no app dele · banner no header)
- Customer já com sessão aberta nas mesas dele (front recebe e ajusta ETA silenciosamente)
- Manager (atualiza Em Curso · Painel)

## Frontend afetado

- **Manager:** botão de ação no SOBRECARGA detail · `MInProgressCard` novo `kind="zone-pause"` no Painel quando ativa
- **Garçom:** banner discreto no header do app ("Suas mesas estão em pausa por 04:23 · gerente liberará automaticamente") · som inhibit em pushes de pedido novo
- **Customer (web):** ETA aumentado silenciosamente · sem notification badge ou banner

## Edge cases

- Waiter desloga durante pause → pause continua (pedidos novos das mesas dele bloqueados até unpause ou TTL)
- Outra waiter assume mesas durante pause → pause **cancela** automaticamente (a pause é pessoal · faz sentido só enquanto o waiter for o assigned)
- Manager pausa zone do mesmo waiter 2x → idempotente (segundo POST atualiza `ends_at` do primeiro registro ativo)
- Tentativa de fechar conta durante pause → **permitida** (pause não bloqueia pagamento, só pedidos novos)
- Cliente espontaneamente sai sem pedir mais → pause segue ativa, mas não tem efeito prático
- Waiter ganha nova mesa atribuída pelo manager durante pause → mesa nova herda o estado pausado

## Não escopo

- Pause de cozinha por estação (separado · ferramenta de Operação · Reordenar fila)
- Pause de waiter individual via app dele (waiter não pausa a si mesmo · é decisão do gerente)
- Auto-pause completo (V2 desta feature · depois de medir adoption)
- Pause durante uma sessão específica (granularidade de mesa, não waiter — escopo separado)

## Implementação sugerida

1. Tabela `zone_pauses` + migrations + index parcial em registros ativos
2. Endpoints `POST /staff/zone-pauses` + `DELETE` + `GET` + guard de role manager
3. WebSocket events `zone_pause.started` / `zone_pause.ended` + broadcast targeting
4. Backend hook em `POST /tables/:n/orders`: verifica se há pause ativa pro waiter da mesa e ajusta `expectedReadyAt`
5. Job recorrente (a cada 30s) detecta `ends_at < now()` em pauses ativas e dispara `auto-end`
6. Manager front: botão de ação no `ScreenManagerStatDetail` (variante `sobrecarga`) + `MInProgressCard` `kind="zone-pause"` no Painel
7. Garçom front: banner no header + supressão de pushes de pedido novo durante pause
8. Customer front: ajuste silencioso de ETA (sem badge/banner de "pausado")

## Métricas de sucesso

- % de turnos com zone pause aplicada (sentinela · uso saudável: 5-20%; 0% indica feature não está sendo descoberta; >50% indica problema operacional crônico — necessidade de mais staff)
- Duração média da zone pause (espera-se 5-7 min · se >12 min consistentemente, indica que 5 min é insuficiente)
- Reincidência: % de waiters que recebem 2+ pauses no mesmo turno (alvo: <10% · acima disso, problema de alocação)
- Impacto no CSAT: comparar rating de mesas que tiveram pause silenciosa vs mesas similares sem pause
