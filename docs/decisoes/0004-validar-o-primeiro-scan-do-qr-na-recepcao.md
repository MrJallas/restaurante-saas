---
status: aceita
date: 2026-05-18
decision-makers: Caleb Medeiros
---

# Validar o primeiro scan do QR na recepção

## Contexto e problema

O cliente entra pelo QR impresso na mesa. A assinatura (HMAC) protege contra QR forjado, mas não contra
a foto do QR: quem fotografou pode abrir a mesa de outro lugar. A casa precisa saber quem de fato
sentou antes de liberar pedido e conta.

## Opções consideradas

Registradas pelo autor: QR rotativo ou eletrônico; confiar só na assinatura e na cerca geográfica; QR
fixo com verificação humana no primeiro scan.

## Decisão

Escolhida: "QR físico permanente e verificação humana do primeiro scan", porque o QR pode ser
impresso ou gravado na mesa e a foto dele deixa de bastar para abrir uma conta.

- Cada mesa tem um `qr_public_token` fixo (migration 049). O QR aponta para `GET /api/qr/<token>`; a
  API responde 302 para `/<slug>/mesa/<código>` com `hmac` e `ts` (válidos por 30 min) e um
  `accessToken` do dia (UTC), gerados no scan. `POST /:slug/session/init` recusa sem os três.
- Primeiro cliente de mesa livre: se a recepção liberou a mesa antes ("Liberar mesa", vale 15 min),
  ele entra aprovado e vira o cliente-anfitrião; senão fica `pending` e nasce uma verificação de scan.
- A verificação sobe numa cadeia recepção → gerente → garçom, com 60 s por nível. Gerente e dono
  decidem em qualquer nível; recepção e garçom, só no seu. Recusa, ou fim da cadeia sem decisão, recusa
  o cliente e fecha a sessão da mesa.
- Quem chega depois a uma mesa já aberta segue outro fluxo
  ([ADR 0005](0005-deixar-o-cliente-anfitriao-aprovar-quem-chega-depois.md)).

### Consequências

- Boa, porque a foto do QR não abre uma mesa sem alguém da casa ver o cliente.
- Boa, porque o QR impresso nunca muda; só o link gerado no scan expira.
- Ruim, porque a recepção precisa responder em cerca de 60 s, e o cliente espera nesse tempo.
- Ruim, porque o fluxo depende de haver alguém da equipe logado para decidir.
- Cada scan e cada decisão ficam auditados no MongoDB (`restaurant_security`: `qr_scan_events`,
  `scan_verification_events`).

## Mais informações

- Datas: modelo decidido em 2026-05-18 (registro do projeto); a migration 049 entrou no commit
  `3707010`, de 2026-05-25.
- `apps/api/src/modules/qr-resolver/`, `table-session/qr-code.service.ts`,
  `table-session/table-session.service.ts` (`upsertParticipant`),
  `scan-verification/scan-verification.service.ts`, `host/host.service.ts` (liberação da mesa)
- Cerca geográfica, opcional: [Geolocalização](../produto/funcionalidades/geolocalizacao.md)
- [Autenticação e sessões](../arquitetura/autenticacao-e-sessoes.md)
