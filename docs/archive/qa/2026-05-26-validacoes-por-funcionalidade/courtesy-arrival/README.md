# Courtesy arrival QA

Data: 2026-05-28

## Ambiente

- Worktree: `prompt-11-courtesy-arrival`
- Branch: `codex/prompt-11-courtesy-arrival`
- API/web-customer/web-staff recriados via Docker Compose montando esta worktree.
- AI service recriado apontando para LM Studio em `http://<IP-da-LAN>:1234/v1`.
- Mesa funcional usada no Playwright: M15.
- Mesa usada no iOS Simulator: QR Teste 92.

## Evidencias

- `playwright-manager-m15-before-send.png`: gerente antes de enviar a cortesia.
- `playwright-manager-m15-after-send.png`: gerente apos envio real.
- `playwright-mobile-courtesy-arrived.png`: cliente recebeu a cortesia sem refresh.
- `playwright-mobile-courtesy-accepted.png`: cliente aceitou pelo app.
- `playwright-mobile-after-reload-no-pending.png`: reload sem reaparecer cortesia aceita.
- `playwright-mobile-pending-after-reload.png`: pendente recuperada pelo fetch inicial apos reload.
- `ios-m22-127-initial.png` e `ios-m22-127-after-allow.png`: tentativa via iPhone Simulator + idb. Safari abriu o app e exibiu o prompt de localizacao, mas o app continuou recebendo geolocalizacao como indisponivel/negada apos permitir.
- `ios-visible-safari-before-ai.png`: iPhone Simulator ja aberto no Safari, antes do novo teste com LM Studio.
- `ios-simulator-location-courtesy-visible.png`: QR fisico reaberto no Simulator com localizacao ativa e cortesia pendente visivel.
- `ios-simulator-lmstudio-ai-view-courtesy.png`: pergunta enviada no Safari do Simulator; a IA respondeu com `VIEW_COURTESY` e mostrou a cortesia da mesa.

## Observacoes

- O fluxo funcional completo foi validado por Playwright mobile contra a stack Docker da branch.
- O teste iOS/idb nao concluiu aceite/recusa por bloqueio de geolocalizacao do Safari no simulador, mesmo apos `idb approve`, `idb set-location`, `xcrun simctl privacy grant location` e `xcrun simctl location set`.
- Em reteste posterior, o iPhone Simulator 16 Pro iOS 18.4 recebeu localizacao via `simctl`/`idb`, reabriu o QR fisico `qrtest92-public-token-fixed`, executou `/session/init` e exibiu a cortesia pendente.
- O chat real de `view_courtesy` foi executado contra LM Studio (`qwen/qwen3-coder-30b`) via `restaurant-ai`; o backend registrou `POST /api/:slug/assistant/message` 201 e o AI service registrou `POST /classify` + `POST /chat` 200.
