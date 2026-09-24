---
status: aceita
date: 2026-07-05
decision-makers: Caleb Medeiros
---

# Proteger sessões com token derivado e BFF da equipe

## Contexto e problema

As auditorias de segurança acharam duas credenciais expostas:

- Cliente: o token da sessão da mesa era o próprio `table_sessions.id`. Esse id aparece em respostas
  para a equipe e, por falhas pontuais, chegou a clientes de outra mesa. Quem visse o id podia assumir
  a sessão (família A07 do OWASP).
- Equipe: o app mandava a chave `x-staff-key` a partir do bundle JavaScript
  (`NEXT_PUBLIC_STAFF_API_KEY`), ou seja, qualquer visitante lia a chave no navegador.

## Opções consideradas

- Cliente: fechar cada endpoint que expõe o id (sempre sobra um); navegar por número da mesa em vez
  de id; separar a credencial do identificador.
- Equipe: só levar as chamadas para a mesma origem; ou tirar a chave do navegador com um proxy no
  servidor do próprio app (BFF, backend for frontend).

## Decisão

Escolhida: "credencial separada do identificador, e chave da equipe só no servidor", porque fecha as
duas famílias na raiz, e não endpoint por endpoint.

- `x-session-token` (e o cookie `session_token`) = HMAC-SHA256(`SESSION_TOKEN_SECRET`, id da sessão).
  O id vira um identificador inócuo; o Redis guarda a sessão sob `session:<token>` por 4 h. O cálculo
  é determinístico: aparelhos da mesma mesa reusam a mesma chave, e invalidar pelo id calcula o token.
- O app da equipe fala só com `/api/proxy` do próprio servidor Next.js. No login, o proxy guarda o
  `staffToken` em cookie httpOnly `staff_token` (12 h) e o retira da resposta; nas demais chamadas,
  injeta `x-staff-token` e a `STAFF_API_KEY`, que só existe no servidor. As TVs usam o mesmo proxy,
  com PIN (`TV_ACCESS_PIN`).
- O app do cliente também usa a mesma origem: `/api` e `/socket.io` são reescritos para a API
  (`apps/web-customer/next.config.js`).

### Consequências

- Boa, porque expor o id da sessão deixou de ser risco, e o navegador da equipe não guarda segredo.
- Boa, porque o navegador sempre fala com a origem do próprio app, então abrir o app em outro
  aparelho da rede não depende do endereço da API.
- Ruim, porque `SESSION_TOKEN_SECRET` e `STAFF_API_KEY` viraram obrigatórias: o compose não sobe sem
  elas, e em produção a API falha no boot se faltarem ou se usarem um valor público já conhecido.
- Ruim, porque todo o tráfego da equipe depende do proxy do `web-staff`; se ele cair, o app da equipe
  para.
- Sessões anteriores à mudança (token igual ao id) continuaram válidas até vencer (4 h).

## Mais informações

- Datas: sessão da equipe no servidor decidida em 2026-07-04; token derivado no commit `a326725`
  (2026-07-05). O proxy já existia desde 2026-06-09, só para as rotas de TV.
- `apps/api/src/common/auth/session-auth-token.ts`, `apps/api/src/common/guards/staff-only.guard.ts`,
  `apps/web-staff/src/app/api/proxy/[...path]/route.ts`, `apps/web-staff/src/lib/api.ts`
- [Autenticação e sessões](../arquitetura/autenticacao-e-sessoes.md)
- [Desenho original da sessão da equipe (arquivado)](../archive/2026-07-design-sessao-staff-server-side.md)
