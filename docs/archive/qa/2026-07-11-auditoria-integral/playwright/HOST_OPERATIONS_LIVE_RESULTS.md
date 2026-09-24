# Recepção e cliente — auditoria Playwright ao vivo

Data: 2026-07-11  
Ambiente: `restaurant_dev`, staff em `127.0.0.1:3002`, cliente em `127.0.0.1:3003`, API em `127.0.0.1:3001`  
Escopo: reserva, fila sem reserva, QR físico sem liberação, cascata de verificação e aceite de entrada por anfitrião.

## Resultado final

| Fluxo | Primeira rodada | Revalidação após correção | Resultado final |
|---|---|---|---|
| Reserva → chegada → liberação → leitura do QR | A tela de liberação perdia mesa, capacidade e tamanho do grupo | Mesa 91/Varanda/2 e grupo 2 preservados; fonte e liberação vinculadas atomicamente; leitura consumiu a liberação sem abrir verificação | PASS |
| Fila sem reserva → sentar → liberação → leitura do QR | A entrada era marcada como sentada antes da confirmação final e a tela usava dados falsos de Salão/4 | Fonte permaneceu `waiting` até a confirmação; depois foi sentada e vinculada atomicamente à Mesa 92; QR consumiu a liberação com grupo 2 | PASS |
| QR físico sem liberação → recepção → gerência → garçom | Realtime/cascata funcionavam, mas o anfitrião mantinha um CTA obsoleto após perder a atribuição | O cartão desapareceu da fila do anfitrião; detalhe mudou para `COM GERÊNCIA` e depois `COM GARÇOM`, com Aprovar/Rejeitar desabilitados | PASS |
| Cliente anfitrião aceita participante | Sem defeito funcional encontrado | Solicitação e decisão chegaram por WebSocket mesmo com fallback de polling bloqueado | PASS |

## Evidência por fluxo

### 1. Reserva

Defeito reproduzido inicialmente com a reserva `5390ca4c-c1f9-4f5f-8b57-8c0a52d21bce`: o detalhe mostrava Mesa 91, Varanda e 2 pessoas, mas a rota de liberação mostrava Salão e 4 lugares, com grupo 4. Nenhuma confirmação final foi feita nessa rodada defeituosa.

Revalidação com fixture nova:

- reserva `5b80ee04-266c-4bea-bec6-5ab4533a24a8`, `Reserva Fix Loop 0711 0338`, grupo 2;
- antes da confirmação: `arrived`, sem `table_id` e sem liberação vinculada;
- confirmação: Mesa 91/QRTEST91, Varanda, capacidade 2, grupo 2 bloqueado na UI;
- após confirmação: liberação `7df8ad21-...`, `party_size=2`, `reservation_id` correto;
- leitura do QR: sessão `80a9ed1f-...`, cliente `271fc7c3-...`, liberação consumida e `staff_party_override=2`, sem `scan_verification_request`.

Capturas: `host-reservation-fixed-confirm.png` e `host-reservation-fixed-scan-home.png`.

### 2. Fila sem reserva

Defeito reproduzido inicialmente com a entrada `56b6d827-f814-4e39-95a3-1fa7afab0c87`: o clique em “Sentar” alterava a fonte para `seated` antes da confirmação final, ainda sem mesa/resolvedor, e a tela seguinte usava Salão/4.

Revalidação com fixture nova:

- entrada `9b800fe0-0a24-4537-a918-4e8a053badb2`, `Walkin Fix Loop 0711 0341`, grupo 2;
- ao navegar para confirmação: continuou `waiting`, com `table_id`, `resolved_by` e `seated_at` nulos e nenhuma liberação;
- UI final: Mesa 92, Salão Principal, 2 lugares, fonte correta e grupo 2 bloqueado;
- confirmação: fonte `seated`, `resolved_by` do anfitrião e liberação `091bee42-...` vinculada à fila, tudo no mesmo resultado transacional;
- leitura do QR: sessão `0f08b740-...`, cliente `53fafc36-...`, liberação consumida e `staff_party_override=2`, sem verificação adicional.

Capturas: `host-waitlist-fixed-confirm.png` e `host-waitlist-fixed-scan-home.png`.

### 3. QR físico sem liberação e atribuição da cascata

Na rodada inicial, a criação da verificação chegou por WebSocket à recepção em menos de 1 ms até o refetch e em cerca de 317 ms até o cartão, com o polling de fallback bloqueado. A cascata natural recepção → gerência → garçom → timeout e a notificação final do cliente também funcionaram. O defeito era de autorização/UX: após a escalada, o cartão continuava acionável para o anfitrião e o backend respondia 403 ao clique.

Revalidação com fixture nova:

- solicitação `583db938-e6a3-47bb-baa4-164b53f2df4a`;
- sessão `0e2bbbfe-2e7f-43f8-af4f-e6696e7df904`, cliente `c4c7ce78-ede7-4d57-80e9-ef1be2992136`, cadeia `740e47fa-f134-40da-b3b5-9248123a37b5`;
- cartão inicial da recepção apareceu em cerca de 200 ms;
- ao escalar, o detalhe exibiu `QR FISICO · COM GERÊNCIA`, explicou a transferência e desabilitou Aprovar/Rejeitar;
- na home da recepção, a busca por `Scan Filter Fix 0711` retornou zero ocorrências e o contador de Atenção ficou em zero;
- na escalada seguinte, o detalhe exibiu `QR FISICO · COM GARÇOM`, mantendo as duas ações desabilitadas.

Capturas: `host-scan-fixed-detail-manager.png`, `host-scan-fixed-home-filtered.png` e `host-scan-fixed-detail-waiter.png`.

### 4. Aceite de entrada pelo cliente anfitrião

Com o polling deliberadamente bloqueado, o evento de solicitação chegou por WebSocket ao anfitrião e exibiu o banner em cerca de 308 ms. Após o aceite, a decisão chegou por WebSocket ao participante e a home foi exibida em cerca de 334 ms. Sessão usada: `44220e68-...`. Resultado: PASS realtime.

Capturas: `customer-host-accept-request.png`, `customer-host-join-waiting.png` e `customer-host-join-approved.png`.

## Observação sobre o ambiente de desenvolvimento

Durante a revalidação, a API e o frontend sofreram reinícios/hot reload por alterações feitas em paralelo. Isso gerou 502 e falhas transitórias de handshake WebSocket no log longo da reserva/operações. O retry recuperou o fluxo; a rodada estável da fila e as páginas da correção de atribuição não apresentaram erro funcional. Esses erros são interferência do restart do ambiente, não uma falha reproduzível dos fluxos finais.

## Higiene dos dados

Todas as fixtures criadas por esta auditoria foram removidas. A verificação final retornou zero para solicitação, cadeia, sessão, cliente, participantes, visitas, eventos e liberações exatas; a Mesa 92 ficou com zero sessão ativa e zero liberação aberta. As coleções Mongo relacionadas também ficaram com zero documentos correspondentes.

## Artefatos principais

- `host-operations-live.trace` / `.network`: rodada inicial com os defeitos reproduzidos;
- `host-operations-fixed.trace` / `.network`: revalidações de reserva, fila e telas do anfitrião;
- `host-scan-filter-fixed.trace` / `.network`: cliente que iniciou a nova cascata sem liberação;
- `customer-unreleased-scan.trace` / `.network`: realtime e timeout da rodada inicial;
- `customer-host-live.trace` e `customer-join-live.trace`: aceite por anfitrião com polling bloqueado;
- logs de console correspondentes no mesmo diretório.
