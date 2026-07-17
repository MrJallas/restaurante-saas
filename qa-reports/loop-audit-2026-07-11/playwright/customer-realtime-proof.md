# Prova Playwright: host e convidado em tempo real

Resultado: **PASS** em WebKit com emulação de iPhone 14, contra
`http://127.0.0.1:3003`.

## Controle contra falso positivo de polling

- No host, o `setInterval` de 2.500 ms usado pelo fallback de participantes
  foi interceptado antes da navegação. O React registrou quatro intervals
  (dupla montagem em desenvolvimento, em dois consumidores), todos bloqueados.
- Após os fetches iniciais, não houve novo `GET /table/participants` por
  85.571 ms. O próximo fetch começou somente 1 ms depois do frame WebSocket
  `participant:join_request`.
- No convidado, os dois registros do fallback de 8.000 ms foram bloqueados.
  Foi feita uma espera explícita superior a 9 s e, no total, não houve novo
  fetch por 58.963 ms. O próximo fetch começou somente 2 ms depois do frame
  WebSocket `participant:decision`.

## Tempos observados

| Marco | Tempo |
| --- | ---: |
| `participant:join_request` -> refetch do host | 1 ms |
| Início da espera -> banner/modal visível no host | 1.721 ms |
| `participant:decision(approved)` -> refetch do convidado | 2 ms |
| Início da espera -> home visível no convidado | 430 ms |

O host viu o banner e o diálogo com **Convidado Realtime 0711**, aprovou o
pedido e o convidado saiu de **Esperando aprovação** para a home. Ambos os
consoles terminaram sem erros e sem warnings.

## Evidências

- `customer-realtime-host-request.png`
- `customer-realtime-joiner-waiting.png`
- `customer-realtime-joiner-approved.png`
- `customer-realtime-host-after-decision.png`
- `customer-realtime-host.trace` e `customer-realtime-host.network`
- `customer-realtime-joiner.trace` e `customer-realtime-joiner.network`
- `customer-realtime-host.console.log` e `customer-realtime-joiner.console.log`
- `customer-realtime-proof.json`

## Limpeza

A sessão criada em `QRTEST91` foi encerrada pelo endpoint de liberação, o
release de limpeza foi removido e a verificação final encontrou zero sessões
ativas e zero releases abertos. Registros históricos/auditáveis foram mantidos
para não apagar evidência de execução.
