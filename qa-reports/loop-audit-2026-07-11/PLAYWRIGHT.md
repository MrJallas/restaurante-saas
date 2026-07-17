# Evidência Playwright e serve-sim

## Estratégia

- Serve-sim apenas em `Romantico-*`, porta 3202, para as personas móveis; não
  foi aberto nem reutilizado o iPhone/porta 3200 de outro chat.
- Playwright CLI com contextos separados para concorrência, WebSocket, rede,
  cookies e persistência.
- WebKit com perfil iPhone 14 para cliente; viewports móveis separados para
  recepção/garçom e desktop para gerente/cozinha.
- PostgreSQL, Redis, Mongo, API e frontends reais do Compose; fixtures limpas ao
  terminar.

## Noite operacional serial

O spec `restaurant-night-simulation.spec.ts` executa, numa única invocação:

1. cliente A lê QR sem autorização, identifica-se e aguarda;
2. recepção vê o alerta realtime, abre a solicitação e aprova;
3. cliente B entra na mesa ocupada e é aceito pelo cliente anfitrião;
4. cliente C entra por outra mesa e passa pela recepção;
5. duas mesas criam/confirmam pedidos concorrentes;
6. cozinheiro autenticado vê ambos no KDS e avança itens para preparo/pronto;
7. três chamados são criados; garçom autenticado vê e reconhece;
8. garçom entrega um pedido; gerente abre mesas ativas e histórico da mesa;
9. banco confirma os estados finais; teardown fecha fixtures.

O primeiro gate pós-refatoração encontrou HTTP 500 em
`received -> in_progress`. O log real mostrou PostgreSQL `42P08` por inferência
inconsistente de `$1`. Após o cast e o teste de regressão, o fluxo passou em
uma revalidação e nas duas rodadas finais (51,1 s e 48,4 s).

O próprio spec passou a chamar a limpeza no `finally`. Após cada rodada, as
consultas autoritativas retornaram zero para sessões ativas, liberações abertas,
scans pendentes, pedidos ativos e chamados ativos em QRTEST91/92.

## Outros fluxos live

- [OWNER_DASHBOARD_RESULTS.md](playwright/OWNER_DASHBOARD_RESULTS.md): dono,
  settings, owner-only, no-op e conflito 409 entre dispositivos.
- [HOST_OPERATIONS_LIVE_RESULTS.md](playwright/HOST_OPERATIONS_LIVE_RESULTS.md):
  reserva, fila, QR não liberado, cascata e aprovação pelo anfitrião.
- [CUSTOMER_NIGHT_CLOSE_RESULTS.md](playwright/CUSTOMER_NIGHT_CLOSE_RESULTS.md):
  conta, split, Pix demo, feedback, histórico, LGPD, logout e reentrada.
- `output/playwright/pwload711-workload-live-evidence.md`: distribuição de
  mesas, carga desigual, alerta singleton, RBAC e resolução.

## LLM real

O assistente foi chamado contra LM Studio em
`http://192.168.0.15:1234/v1`, modelo `google/gemma-4-26b-a4b`. A UI recebeu
resposta real e contextual ao comparar Picanha e Bruschetta; latência observada
foi aproximadamente 1,49 s. Regra layer e fallback continuam separados para
quando o provedor não estiver acessível.

## Limite da prova

Emulação WebKit/serve-sim prova comportamento de navegador, rede, realtime e
persistência. Não prova câmera, GPS real, haptics, consumo, thermal throttling,
cor ou acessibilidade física de VoiceOver em aparelho. Esses itens continuam
como gate de dispositivo antes de release público.
