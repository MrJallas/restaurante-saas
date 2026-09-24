# Modelo de segurança

Esta página descreve as proteções que existem no código hoje. Os riscos aceitos e o que falta estão
em [Riscos aceitos e pendências](riscos-aceitos-e-pendencias.md). O fluxo de autenticação passo a
passo está em [Autenticação e sessões](../arquitetura/autenticacao-e-sessoes.md).

## Atores e superfícies

| Ator                                                          | Por onde entra                                       | Credencial                                         |
| ------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Cliente na mesa                                               | App do cliente (porta 3003), a partir do QR impresso | Token da sessão de mesa + cookie de reconhecimento |
| Equipe (recepção, garçom, cozinha, bar, caixa, gerente, dono) | App da equipe (porta 3002)                           | CPF + PIN; sessão guardada no servidor             |
| TVs da cozinha e do bar                                       | `/cozinha/tv` e `/bar/tv` no app da equipe           | PIN da TV                                          |
| Serviço de IA                                                 | Rede interna do Docker                               | Chave compartilhada `AI_SERVICE_API_KEY`           |

A API (porta 3001) é a única que decide. Os dois apps web não guardam regra de permissão que valha
sozinha: as verificações nas telas são conveniência, e a API repete todas.

## Papéis

Papéis da equipe (`staff.role`): `owner` (dono), `manager` (gerente), `host` (recepção), `waiter`
(garçom), `cook` (cozinha), `bartender` (bar) e `cashier` (caixa).

- **Dono ⊇ gerente.** Todo guard de gerente aceita `manager` e `owner`
  (`apps/api/src/common/guards/manager-only.guard.ts`). O que é só do dono usa `OwnerOnlyGuard`: hoje,
  as configurações do estabelecimento (`/manager/estabelecimento`, `PATCH
/:slug/settings/establishment`).
- Recepção: `HostOrManagerGuard` aceita `host`, `manager` e `owner`. Cozinha: `KitchenOrManagerGuard`
  aceita `cook`, `manager` e `owner`.
- O papel nunca vem só do token ou de um cabeçalho: é conferido no banco a cada requisição, com cache
  curto (`STAFF_ROLE_CACHE_TTL_MS`, padrão 60 s). Quem é desativado ou rebaixado perde o acesso.
- Quem fez a ação (autor de pausa, VIP, override de junção, resposta a reclamação) vem da sessão
  autenticada, nunca do corpo da requisição.

## Isolamento entre restaurantes

- Cada restaurante tem o próprio schema no PostgreSQL
  ([ADR 0001](../decisoes/0001-isolar-cada-restaurante-em-um-schema-do-postgres.md)). O
  `TenantMiddleware` resolve o `:slug` da URL em `public.restaurants`, valida o nome do schema com uma
  expressão regular antes de usá-lo em `SET search_path` e recusa restaurante inativo (403).
- O token de sessão do cliente guarda o schema; usá-lo na URL de outro restaurante dá 401
  (`common/guards/session-revalidation.ts`). O token da equipe guarda o slug e é recusado em outro
  restaurante.
- No WebSocket, entrar na sala de um restaurante exige que o slug e o papel batam com a sessão
  autenticada ([Tempo real](../arquitetura/tempo-real.md)).

## Superfície de rede

No `docker-compose.yml`, só a API e os dois apps publicam porta no computador (3001, 3002 e 3003).
PostgreSQL, Redis, MongoDB e o serviço de IA ficam só na rede interna do Docker. O acesso de
desenvolvimento aos bancos é por `docker exec` nos containers.

## Cliente

- **QR.** O QR impresso contém só um token público permanente da mesa (`GET /api/qr/:token`). No scan
  a API gera uma assinatura HMAC com o segredo da mesa (`tables.qr_hmac_secret`), válida por 30 min,
  e um token de acesso diário. `POST /:slug/session/init` confere os dois e registra as falhas.
- **Primeiro scan de mesa livre** passa pela recepção
  ([ADR 0004](../decisoes/0004-validar-o-primeiro-scan-do-qr-na-recepcao.md)); a cerca geográfica é
  uma barreira opcional ([Geolocalização](../produto/funcionalidades/geolocalizacao.md)).
- **Sessão de mesa.** O token enviado em `x-session-token` é um HMAC do id da sessão com
  `SESSION_TOKEN_SECRET`. O id da sessão pode aparecer em telas e respostas sem risco, porque não é a
  credencial ([ADR 0007](../decisoes/0007-proteger-sessoes-com-token-derivado-e-bff-da-equipe.md)).
  Cada requisição confere no banco que a sessão ainda está ativa.
- **Identidade pessoal.** O cliente identificado recebe o cookie httpOnly `recognition_token`
  (365 dias), nunca no corpo da resposta. Tudo o que é pessoal (histórico, reclamações, avaliação,
  pagamento da própria parte, exclusão LGPD) resolve o cliente por esse cookie
  (`CallerResolverService`). O `customerId` guardado na sessão de mesa é compartilhado pela mesa e
  **não** autoriza dado pessoal.
- **Login só por CPF** é uma exceção de produto aceita temporariamente
  ([ADR 0006](../decisoes/0006-aceitar-login-do-cliente-so-por-cpf-temporariamente.md)).
- **Aprovações sociais** (quem entra na mesa, junção) só aceitam o cliente-anfitrião, conferido no
  servidor ([Cliente-anfitrião](../produto/funcionalidades/cliente-host-e-mesa-compartilhada.md)).

## Equipe

- **Login** por CPF + PIN de 4 a 6 dígitos (`POST /:slug/staff-auth/login`).
- **PIN com bcrypt** (custo 10, `apps/api/src/modules/staff/staff-pin.util.ts`). Um hash SHA-256
  antigo, como o do seed de demonstração, ainda é aceito e é trocado por bcrypt no primeiro login bem
  sucedido.
- **Bloqueio por tentativas** (`staff-auth.service.ts`): 5 falhas por CPF e IP em 15 min, ou 20 falhas
  por CPF de qualquer IP, bloqueiam o login por 15 min. A recuperação de PIN tem limite próprio.
- **Sessão no servidor.** O login gera um token opaco; o Redis guarda só os dados da sessão, pela
  hash do token, por 12 h (`STAFF_SESSION_TTL_SECONDS`). Troca ou redefinição de PIN e logout
  revogam as sessões do funcionário.
- **Nada de segredo no navegador.** O app da equipe fala só com `/api/proxy` no próprio servidor
  Next. O proxy guarda o token em cookie httpOnly `staff_token`, injeta `x-staff-token` e a
  `STAFF_API_KEY` no servidor e devolve 401 sem sessão
  (`apps/web-staff/src/app/api/proxy/[...path]/route.ts`).
- **Troca obrigatória de PIN.** Sessão marcada para trocar o PIN recebe 403 em toda rota de equipe e
  é desconectada do WebSocket até a troca.
- **Chave de serviço.** A `STAFF_API_KEY` sozinha também autentica como equipe (usada pelo proxy e
  pelas TVs). Em produção, staging e preview, o token individual de sessão é obrigatório para rotas
  que dependem de papel; em desenvolvimento, `STAFF_SESSION_REQUIRED=true` antecipa esse gate.

## Limites nas entradas públicas

| Rota                               | Limite                                              | Chave                    |
| ---------------------------------- | --------------------------------------------------- | ------------------------ |
| `POST /:slug/customer/welcome`     | 30 por janela de 15 min (`CUSTOMER_WELCOME_RATE_*`) | IP real + sessão da mesa |
| `POST /:slug/customer/identify`    | 5 por 15 min                                        | IP real                  |
| Login e recuperação de PIN         | ver "Equipe"                                        | CPF, IP real             |
| `POST /:slug/staff/:id/verify-pin` | limite por IP e por funcionário                     | IP real                  |
| Handshake do WebSocket             | 30 por 60 s; handshake válido devolve a cota        | IP real                  |

"IP real" é o endereço da conexão TCP (`common/utils/throttle-client-ip.ts`). Cabeçalhos como
`X-Forwarded-For` são forjáveis e nunca entram na chave.

## Cabeçalhos e CSP

- **API** (`common/security/security-headers.ts`): `nosniff`, `X-Frame-Options: DENY`, CSP
  `default-src 'none'`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`;
  HSTS só em produção. CORS restrito a `CORS_ORIGINS`.
- **Apps web**: CSP aplicada (não só relatada) com nonce por requisição e `strict-dynamic` em
  `script-src` (`src/proxy.ts` de cada um); `unsafe-eval` só em desenvolvimento; `style-src` ainda
  aceita `unsafe-inline`. No `next.config.js` de cada app ficam a `Permissions-Policy` (cliente: só
  geolocalização; equipe: só câmera, para ler o QR) e o `X-Powered-By` desligado.

## TVs

As TVs não têm login individual. O proxy do app da equipe exige o cookie `tv_pin`, emitido por `POST
/api/tv-unlock` depois de conferir o `TV_ACCESS_PIN` em tempo constante e com limite de tentativas.
Sem `TV_ACCESS_PIN`: em desenvolvimento as TVs abrem sem PIN (com aviso no log); em produção ou
staging, as rotas de TV ficam **bloqueadas**.

## Assistente de IA

- O serviço de IA exige `X-AI-Service-Key` em toda rota exceto `/health` e a documentação. Sem a
  chave configurada, recusa tudo (503) em produção e staging.
- Uma ferramenta chamada pelo LLM é só uma **intenção**: ela chama a API com o token da mesa do
  próprio cliente, e a API aplica as mesmas regras de uma chamada do app.
- Decisões críticas não passam pelo LLM: aceitar alguém na mesa e recomendar prato com restrição de
  glúten são decididos por código determinístico, e a exclusão de dados só acontece pelo botão do
  app ([ADR 0003](../decisoes/0003-separar-o-servico-de-ia-e-responder-sem-llm-quando-possivel.md)).
- Dados controlados por usuários (nome, cardápio) entram nas instruções enviadas ao LLM como dado
  literal, com marcas de instrução neutralizadas (`services/ai-service/main.py`).
- A rota interna `/tools/dispatch` recusa qualquer pedido de ferramenta de equipe.

Detalhes em [Serviço de IA](../arquitetura/servico-de-ia.md).

## LGPD

Exclusão só por ação explícita do cliente, com protocolo, lease e troca do token de reconhecimento.
Ver [Histórico de chat e LGPD](../produto/funcionalidades/historico-de-chat-e-lgpd.md) e
[ADR 0009](../decisoes/0009-excluir-dados-pessoais-so-por-acao-explicita-do-cliente.md).

## Segredos obrigatórios em produção

| Variável               | Regra no boot                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STAFF_API_KEY`        | Em produção, ausente → a API não sobe; igual à chave antiga de desenvolvimento que ficou pública no histórico → a API não sobe (`common/config/assert-staff-key.ts`) |
| `SESSION_TOKEN_SECRET` | Igual a um valor padrão público → a API não sobe em nenhum ambiente; ausente em produção → não sobe (`common/auth/session-auth-token.ts`)                            |
| `AI_SERVICE_API_KEY`   | Ausente em produção ou staging → o serviço de IA recusa as chamadas                                                                                                  |
| `TV_ACCESS_PIN`        | Ausente em produção ou staging → rotas de TV bloqueadas                                                                                                              |

O `docker-compose.yml` se recusa a subir sem `STAFF_API_KEY` e `SESSION_TOKEN_SECRET`, mesmo em
desenvolvimento. Como gerar: [Ambiente local](../desenvolvimento/ambiente-local.md).

## O que foi auditado

Os relatórios ficam no arquivo histórico ([índice](../archive/README.md)); o código atual vence
qualquer relatório.

- [Auditoria integral de 2026-07-11](../archive/qa/2026-07-11-auditoria-integral/FINAL-REPORT.md) e o
  [fechamento de segurança](../archive/qa/2026-07-11-auditoria-integral/SECURITY.md): fronteiras de
  restaurante, cliente, equipe, QR, WebSocket, pedidos, pagamentos, LGPD e IA; nenhum P0 conhecido;
  um risco alto aceito (login só por CPF); dependências sem HIGH/CRITICAL.
- [Auditoria E2E de maio](../archive/qa/2026-05-15-auditoria-e2e-r23/FINAL_REPORT.md), com a pasta
  `multi-tenant-auth-ws` sobre isolamento, autenticação e WebSocket.
- [Varredura estática de maio](../archive/qa/2026-05-09-bug-hunt-estatico/), por rodada.
