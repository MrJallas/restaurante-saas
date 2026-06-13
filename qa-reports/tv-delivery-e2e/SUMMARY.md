# E2E · Fluxo de entrega TV → garçom → cliente (prompt 99 §6)

Data: 2026-06-10 · Stack: docker-compose real (api 3001, staff 3002,
customer 3003, postgres/redis/mongo) · Spec:
`apps/web-customer/e2e/specs/tv-delivery-flow.spec.ts`

```
npx playwright test tv-delivery-flow --reporter=line
1 passed (10.1s)
[tv-delivery-flow] cliente atualizou via WS sem reload: true
```

## Cadeia provada (app + DB reais)

1. Cliente abre sessão na QRTEST91 (zona **Varanda**), cria pedido
   (2× Bolinho de Bacalhau) e confirma; cozinha avança até `ready`.
   Cliente vê chip **"Pronto para servir"**.
2. TV `/cozinha/tv` mostra o card e o botão **"Chamar garçom"** é
   clicado na própria TV → `order_deliveries` ganha row `pending` com
   `target_waiter_id` resolvido (Ana Garcom) e
   `GET /deliveries/pending` devolve `zone_name = "Varanda"`.
3. Banner in-app chega no app do garçom (`/waiter`, WS
   `order:handoff_called` + poll) com mesa + zona + itens
   (`01-waiter-banner.png` — banner flutuante + faixa na home).
4. `/waiter/entrega/[orderId]`: **LOCAL DA MESA = Varanda** + mapa por
   zonas com a mesa-alvo destacada (`02-waiter-entrega-mapa.png`).
5. **"Estou levando"** → pedido `in_transit`; cliente passa a ver
   **"A caminho da mesa"** e segue NÃO-entregue (assert no DB).
6. **"Confirmar entrega"** → `orders.status = delivered` +
   `order_deliveries.delivered`; **só então** o app do cliente muda pra
   **"Entregue"**, via WebSocket sem reload (`03-cliente-entregue.png`).

## Bugs reais encontrados e corrigidos pelo E2E

| Bug | Sintoma | Fix |
|---|---|---|
| Proxy TV apontava `localhost:3001` dentro do container | TV em "Erro inesperado" (502) no stack dockerizado | `STAFF_API_BASE_URL`/`STAFF_API_KEY` no compose (web-staff) |
| Filtro `_kds` com armadilha de NULL e statuses inexistentes (`called`/`in_transit`) | Pedido `ready` sem entrega **nunca aparecia** na TV; pedido já chamado continuava | `COALESCE(delivery.status,'') NOT IN ('pending','claimed')` |
| `call-waiter` exigia `x-staff-id` | TV (estação sem identidade) tomava **401** — botão nunca funcionou ponta a ponta | atribuição best-effort; `called_by` NULL = chamado pela estação |
| `GET /deliveries/pending` só retornava `claimed` | Entregas criadas pela TV invisíveis pro garçom | feed retorna `pending`+`claimed` com zona/itens/alvo |
| Specs TV usavam `psql -h localhost:5434` | Suíte TV inteira quebrada desde o hardening round 10 (porta não publicada) | helpers via `docker exec restaurant-postgres` |

## Riscos resolvidos na rodada seguinte (mesma branch)

- **Três filas na TV (urgência > VIP > normal)**: `_kds` ordena por tier
  (priority_rank>0 → urgente; flag `vip` da sessão OU customer `is_vip` →
  VIP) com FIFO dentro da fila, e o card mostra badge URGÊNCIA/VIP.
  Verificado com fixtures reais: pedido urgente de 1 min na frente do VIP
  de 5 min na frente do normal de 10 min
  (`04-tv-filas-vip-urgencia.png`); regressão TV: 48 passed.
- **Roteamento do garçom**: fallback do `resolveTargetWaiter` prefere
  garçom em turno ativo agora (staff_shift_assignments no fuso de
  `settings.timezone`) e o menos recentemente acionado (round-robin) —
  fim do "sempre a primeira por ordem alfabética".
- **Planta espacial**: migration 055 (`tables.map_x/map_y`), posições no
  seed, e a tela de entrega renderiza a planta com posições reais
  (`02-waiter-entrega-mapa.png` atualizado); fallback pra grade por zona
  quando não há posição. Editor visual pelo dono fica pro bloco §1/§7.
- **Dados demo**: home do garçom humaniza tempo de mesa aberta (min/h/d)
  e traduz `last_event` técnico; 11 sessões zumbis (>12h) fechadas no DB
  dev.

## Rodada 3 — fixes do code-review + ETA real + validação em iOS (sim)

- **15 findings do code-review aplicados** (commit `eb1fa82`): race 23505
  TV×garçom, takeover no Entregue (fim do beco sem saída), turnos
  overnight, banner (som 0→1, AudioContext singleton, audiência canônica,
  abaixo do header, +N, chamados de cliente DE VOLTA com som), socket WS
  compartilhado com retry, nome real do portador, matchesTable numérico,
  Cancelar pedido na mesa do garçom, e mais.
- **ETA real do pedido** (commit `9edbf5a`): fim do "22–28 minutos"
  hardcoded — tempo vem do backend com fila à frente (ordenação canônica
  urgência>VIP>normal ÷ linhas paralelas), encolhe por estágio
  (10–16+fila → 5–9 → 2–5 → ~3 → fim) e atualiza via WS. Asserts de
  monotonia no spec.
- **Playwright**: tv-delivery-flow + tv-kds + tv-coverage = **49 passed**.
- **Simulador iOS (xcodebuildmcp + idb)** — fluxo completo no Safari
  iPhone 16/iOS 18.2, evidências em `sim-ios/`: QR → geofence/permissões →
  WelcomeModal V20 digitado via idb → home reconhecida → pedido →
  tracker 5 passos com **"NA FILA DA COZINHA · 14–23 minutos · 1 pedido
  na sua frente"** (`05`) encolhendo pra **"EM PREPARO · 5–9"** (`06`),
  "A caminho da mesa" (`03`) e **"Entregue"** com conta (`04`) — tudo
  atualizando por WebSocket, sem reload.

Screenshots reduzidos (sips) — trace/vídeo ficam fora do Git.
