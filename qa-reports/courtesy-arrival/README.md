# Courtesy arrival QA

Data: 2026-05-28

## Ambiente

- Worktree: `prompt-11-courtesy-arrival`
- Branch: `codex/prompt-11-courtesy-arrival`
- API/web-customer/web-staff recriados via Docker Compose montando esta worktree.
- Mesa funcional usada no Playwright: M15.
- Mesa usada na tentativa iOS/idb: M22.

## Evidencias

- `playwright-manager-m15-before-send.png`: gerente antes de enviar a cortesia.
- `playwright-manager-m15-after-send.png`: gerente apos envio real.
- `playwright-mobile-courtesy-arrived.png`: cliente recebeu a cortesia sem refresh.
- `playwright-mobile-courtesy-accepted.png`: cliente aceitou pelo app.
- `playwright-mobile-after-reload-no-pending.png`: reload sem reaparecer cortesia aceita.
- `playwright-mobile-pending-after-reload.png`: pendente recuperada pelo fetch inicial apos reload.
- `ios-m22-127-initial.png` e `ios-m22-127-after-allow.png`: tentativa via iPhone Simulator + idb. Safari abriu o app e exibiu o prompt de localizacao, mas o app continuou recebendo geolocalizacao como indisponivel/negada apos permitir.

## Observacoes

- O fluxo funcional completo foi validado por Playwright mobile contra a stack Docker da branch.
- O teste iOS/idb nao concluiu aceite/recusa por bloqueio de geolocalizacao do Safari no simulador, mesmo apos `idb approve`, `idb set-location`, `xcrun simctl privacy grant location` e `xcrun simctl location set`.
- O chat real de `view_courtesy` nao foi executado porque `localhost:1234` recusou conexao e o ai-service retornava 503 por falta do LLM local.
