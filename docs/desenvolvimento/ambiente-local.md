# Ambiente local

Versão longa do "Como subir e testar" do [README](../../README.md). O jeito suportado de rodar o
projeto é o Docker Compose da raiz: Postgres, Redis, MongoDB, API, serviço de IA e os dois apps web
sobem em containers. Node e Python no computador só são necessários para rodar testes fora dos
containers.

## Pré-requisitos

- Git e um shell bash/zsh (macOS ou Linux; no Windows, WSL2).
- Docker Desktop, ou Docker Engine com o plugin Compose v2. Reserve **pelo menos 12 GB** de memória
  para a VM do Docker: a API roda com `--max-old-space-size=6144` (`docker-compose.yml`, serviço `api`).
- Portas 3001, 3002 e 3003 livres.
- Internet no primeiro boot (imagens, `npm install` dentro dos containers, imagem do serviço de IA).
- Opcional: Node.js ≥ 20.19 (`engines` do `package.json` raiz) e Python 3.11, para testes no host.

## Serviços, portas e nomes fixos

| Serviço (container)                        | Porta no computador  | Observação                             |
| ------------------------------------------ | -------------------- | -------------------------------------- |
| App do cliente (`restaurant-web-customer`) | 3003                 | entra-se pelo QR Code da mesa          |
| App da equipe (`restaurant-web-staff`)     | 3002                 | `http://localhost:3002/login`          |
| API (`restaurant-api`)                     | 3001                 | prefixo `/api`; saúde em `/api/health` |
| Serviço de IA (`restaurant-ai`)            | não publicada (8000) | só na rede interna do Compose          |
| Postgres, Redis, MongoDB                   | não publicadas       | Postgres escuta na 5434 dentro da rede |

Acesso direto aos bancos, quando precisar:

```bash
docker exec -it restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas
docker exec -it restaurant-redis redis-cli
docker exec -it restaurant-mongodb mongosh
```

Os três volumes de dados são **externos e têm nome fixo** (`restaurant-saas_postgres_data`,
`restaurant-saas_mongodb_data`, `restaurant-saas_redis_data`), e todo serviço tem `container_name`
fixo. Consequências: só existe **um** stack por máquina (dois clones usariam os mesmos volumes e
nomes), e apagar esses volumes apaga todos os dados do sistema.

## Variáveis de ambiente

O Compose lê o `.env` da raiz. A referência é o [`.env.example`](../../.env.example): os valores dele
são os defaults do `docker-compose.yml`, com duas exceções: os dois segredos obrigatórios, que não têm
default, e `HOME_CONTINUATION_ENABLED` (`false` no `.env.example`, `true` no compose).

```bash
cp .env.example .env
sed -i.bak \
  -e "s/^SESSION_TOKEN_SECRET=.*/SESSION_TOKEN_SECRET=$(openssl rand -hex 32)/" \
  -e "s/^STAFF_API_KEY=.*/STAFF_API_KEY=$(openssl rand -hex 32)/" .env
rm .env.bak
```

Sem `openssl`: `python3 -c "import secrets; print(secrets.token_hex(32))"` e cole o valor.

| Variável                                                        | Quem lê                            | Uso                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_TOKEN_SECRET`                                          | API                                | **Obrigatória.** HMAC do `x-session-token` do cliente. O Compose não sobe sem ela; em produção a API aborta no boot                                |
| `STAFF_API_KEY`                                                 | API, serviço de IA, web-staff      | **Obrigatória.** Chave `x-staff-key`, injetada só no servidor pelo proxy do web-staff                                                              |
| `PUBLIC_HOST`                                                   | API (CORS, redirect do QR), fronts | IP do computador na rede local para testar no celular; `localhost` no resto                                                                        |
| `NEXT_PUBLIC_ALLOW_INSECURE_LAN_GEOLOCATION`                    | web-customer                       | `true` usa localização sintética em HTTP pela rede local (só desenvolvimento)                                                                      |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`                   | serviço de IA                      | provedor e endpoint do LLM (ver [serviço de IA](../arquitetura/servico-de-ia.md))                                                                  |
| `LLM_MODEL_MAIN`, `LLM_MODEL_CLASSIFIER`                        | serviço de IA                      | modelo da conversa e do filtro de assunto                                                                                                          |
| `LLM_REASONING_EFFORT`, `LLM_REQUEST_TIMEOUT`                   | serviço de IA                      | parâmetro de raciocínio e tempo máximo do LLM (s)                                                                                                  |
| `LLM_COMPACT_PROMPT`, `LLM_COMPACT_TOOL_SCHEMAS`                | serviço de IA                      | encurtam o prompt de sistema e as ferramentas para modelos locais                                                                                  |
| `AI_SERVICE_TIMEOUT_MS`                                         | API                                | quanto a API espera o serviço de IA (ms)                                                                                                           |
| `AI_SERVICE_API_KEY`                                            | API e serviço de IA                | header `X-AI-Service-Key` entre os dois                                                                                                            |
| `HOME_CONTINUATION_ENABLED`                                     | API                                | `false` (valor do `.env.example`) mostra os dois botões canônicos na home do cliente; `true` (padrão do compose) mostra as sugestões do assistente |
| `CUSTOMER_WELCOME_RATE_MAX`, `_WINDOW_SECONDS`, `_LOCK_SECONDS` | API                                | limite do `/customer/welcome` por IP real + sessão da mesa                                                                                         |
| `TV_ACCESS_PIN`                                                 | web-staff                          | PIN das telas de TV; vazio libera em desenvolvimento e bloqueia as chamadas de TV em produção/staging                                              |

O último bloco do `.env.example` (`DATABASE_URL`, `REDIS_URL`, `MONGODB_*`, `AI_SERVICE_URL`,
`CORS_ORIGINS`, `STAFF_SESSION_REQUIRED`) só vale para processos rodando fora do Docker: o Compose
o ignora e entrega a cada container os endereços da rede interna.

Armadilhas conhecidas:

- **Não defina `POSTGRES_PASSWORD`.** Ela muda só a senha do banco; a API usa `postgres` fixo no
  Compose e deixa de conectar.
- Nas variáveis com default (`${VAR:-padrão}`), **valor vazio vale o padrão**. Ex.: `LLM_BASE_URL=`
  volta para o LM Studio em `host.docker.internal`. A exceção é `LLM_REASONING_EFFORT`
  (`${VAR-none}`): vazio é respeitado (o necessário para a API oficial da OpenAI), e o padrão `none`
  só vale quando a variável não existe no `.env`.
- O Compose repassa `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` e `GOOGLE_API_KEY` ao serviço de IA, mas o
  código só lê `LLM_API_KEY`. Também repassa à API `QR_HMAC_SECRET`, `DATABASE_HOST/PORT/USER/PASSWORD/NAME`
  e `REDIS_HOST/PORT`, que a API não lê (ela usa `DATABASE_URL` e `REDIS_URL`).
- Variáveis que o código lê mas o Compose **não** repassa (só valem fora do Docker ou com um
  `docker-compose.override.yml`): `STAFF_SESSION_REQUIRED`, `CUSTOMER_GEOFENCE_*` (a cerca normalmente
  se configura na tela do dono, ver [geolocalização](../produto/funcionalidades/geolocalizacao.md)),
  `PAYMENTS_ALLOW_CLIENT_CONFIRM`, `STAFF_RECOVERY_*`, `STAFF_SESSION_TTL_SECONDS`, `KDS_THROTTLE_*`,
  `LGPD_ERASURE_LEASE_SECONDS`, `DB_POOL_SIZE` e os TTLs de cache (`*_CACHE_TTL_MS`).

## Subir e acompanhar

```bash
docker volume create restaurant-saas_postgres_data
docker volume create restaurant-saas_mongodb_data
docker volume create restaurant-saas_redis_data
docker compose up -d --build
docker compose logs -f api        # espere "API rodando em http://localhost:3001"
curl http://localhost:3001/api/health
```

No boot, a API roda `npm install`, aplica as migrations pendentes em todo restaurante já existente
(`packages/database/scripts/migrate-tenants.ts`; falha de migration derruba o boot, ver
[ADR 0010](../decisoes/0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md)) e só
então inicia o `nest start --watch`. O healthcheck tem 4 minutos de carência. Um watchdog no comando
da API derruba o container depois de ~2 min sem saúde, e o `restart: unless-stopped` o reergue.

## Criar o restaurante de demonstração

O Compose não cria dados. Na primeira vez, crie as tabelas globais, o restaurante `restaurant_dev`
(schema com todas as migrations e as categorias padrão) e aplique o seed de demonstração:

```bash
docker exec restaurant-api sh -c "cd /repo/packages/database && npm run migrate:public \
  && npm run create-tenant -- restaurant_dev --name 'Restaurante Demo'"

docker compose exec -T postgres psql -U postgres -p 5434 -d restaurant_saas \
  -v ON_ERROR_STOP=1 -c "SET search_path = restaurant_dev" -f /dev/stdin \
  < packages/database/seeds/demo/demo_data.sql
```

Esse bootstrap foi executado a partir de volumes vazios: aplica as migrations até a 081 e carrega o
seed sem erro. Antes dele, o log da API mostra `relation "public.restaurants" does not exist`, o que é
esperado com o banco vazio.

O `create-tenant` registra o restaurante em `public.restaurants` (garante um plano padrão antes). O
seed (`packages/database/seeds/demo/demo_data.sql`) **apaga e recria** mesas, equipe, cardápio,
clientes e pedidos do restaurante, e cria:

- mesas M01–M05 (Salão Principal e Varanda) e as mesas de teste automatizado QRTEST91 e QRTEST92;
- 10 pratos com alérgenos declarados e foto (`apps/web-customer/public/cardapio/`), 3 promoções,
  7 dias de pedidos e avaliações para os gráficos do gerente e 3 clientes fictícios (2 VIP);
- a equipe de demonstração da tabela abaixo, mais 5 funcionários sem CPF (não fazem login).

O seed pode ser reaplicado num banco já usado (cortesias, reservas, turnos, suíte E2E): ele limpa
antes as tabelas que apontam para equipe, mesas e clientes. No ensaio, foi reaplicado duas vezes
seguidas depois da suíte E2E completa, sem erro.

### Credenciais de teste

Dados fictícios do seed. Todos usam o PIN de demonstração `1234`, em `http://localhost:3002/login`.

| Papel         | CPF (fictício) | Tela inicial |
| ------------- | -------------- | ------------ |
| Dono          | `90000000000`  | `/manager`   |
| Gerente       | `90000000001`  | `/manager`   |
| Recepcionista | `90000000002`  | `/host`      |
| Garçom        | `90000000003`  | `/waiter`    |
| Cozinha       | `90000000004`  | `/cozinha`   |

Não há bartender nem caixa no seed. Cada navegador guarda **uma** sessão de equipe: para ver dois
papéis ao mesmo tempo, use perfis de navegador diferentes. 5 PINs errados para o mesmo CPF e IP (ou 20
de qualquer IP) bloqueiam o login por 15 minutos.

## Mesas e dados para teste manual

O QR físico aponta para um endereço estável da API, `http://<host>:3001/api/qr/<qr_public_token>`, que
redireciona para o app do cliente com uma assinatura válida por 30 minutos. Sempre abra o endereço
`/api/qr/…`, nunca o link final. Os tokens de M01–M05 são gerados pelo banco:

```bash
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas \
  -c "SELECT code, label, qr_public_token FROM restaurant_dev.tables ORDER BY sort_order;"
```

- Para o roteiro manual, prefira **M03–M05**. QRTEST91/92 são dos testes automáticos.
- Os testes E2E de TV trocam o segredo do QR de M01 e M02 e deixam uma sessão ativa na M01. Também
  deixam no banco o prato "Picanha (QA Fixture)", um pedido âncora e um cliente de teste
  (`apps/web-customer/e2e/helpers/tv-fixtures.ts`). Por isso, rode o E2E **depois** do roteiro manual.
- `scripts/demo/povoar-salao.sql` ocupa M01–M04; depois dele, use M05.
- No cadastro do cliente use CPFs de exemplo, fictícios e com dígito verificador válido:
  `246.813.579-28`, `135.792.468-28` ou `864.209.753-10`. Não use os CPFs das constantes dos testes: com
  CPF já conhecido, o sistema mostra o nome gravado, não o digitado.
- Para voltar ao estado inicial, reaplique o seed e consulte de novo os `qr_public_token`, que mudam
  porque o seed recria as mesas. A equipe precisa entrar de novo.

## Scripts de demonstração

| Script                                | O que faz                                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash scripts/demo/reset-mesa.sh M03` | fecha a sessão ativa da mesa; feche a aba do cliente e escaneie de novo                                                                                                                                          |
| `scripts/demo/povoar-salao.sql`       | "salão cheio": pedidos em vários estágios em M01–M04 (`docker exec -i restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas < scripts/demo/povoar-salao.sql`); o próprio arquivo explica como reverter |
| `scripts/demo/qr-card-template.html`  | modelo visual de cartão de mesa com um marcador para o SVG do QR                                                                                                                                                 |
| `scripts/demo/demo-fora-de-casa.sh`   | rotina do autor para demonstração em outra rede: só macOS e usa LM Studio local com o Gemma; consulta o token da M01 no banco e gera o cartão de QR                                                              |

## Testar no celular (rede local)

1. Computador e celular na mesma rede. IP do computador: `ipconfig getifaddr en0` (macOS),
   `hostname -I` (Linux).
2. No `.env`, `PUBLIC_HOST=<IP>`; depois `docker compose up -d` para recriar os containers.
3. Abra `http://<IP>:3001/api/qr/<token>` no celular (ou gere a imagem do QR com
   `npx --yes qrcode -o mesa.png "http://<IP>:3001/api/qr/<token>"`). Se o firewall bloquear a 3001,
   `http://<IP>:3003/api/qr/<token>` passa pelo proxy do app do cliente e faz o mesmo redirecionamento.
4. Em HTTP pela rede local o navegador bloqueia a geolocalização; com
   `NEXT_PUBLIC_ALLOW_INSECURE_LAN_GEOLOCATION=true` o app usa uma localização sintética.
5. Se o computador mudar de rede, o IP muda: atualize `PUBLIC_HOST` e recrie os containers. Depois
   de recriar, se uma rota existente responder 404, limpe o cache `.next` (ver a tabela abaixo).

## Rodar um serviço fora do Docker

`[NÃO VERIFICADO]` Nenhum destes caminhos foi executado. Os bancos não publicam porta, então é preciso
Postgres (5434), Redis e MongoDB próprios, ou um override do Compose que publique as portas.

- API: `apps/api/src/main.ts` carrega `dotenv/config`; crie `apps/api/.env` a partir do `.env.example`
  da raiz e rode `npm run dev --workspace @restaurant/api`.
- web-customer: `API_UPSTREAM=http://localhost:3001` (o default `http://api:3001` só resolve no Compose).
- web-staff: `STAFF_API_BASE_URL=http://localhost:3001/api` e `STAFF_API_KEY` iguais aos da API.
- Serviço de IA: ver [`services/ai-service/README.md`](../../services/ai-service/README.md).

## Problemas comuns

| Sintoma                                                             | Causa e solução                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `external volume "restaurant-saas_..." not found`                   | faltou `docker volume create`                                                                                                                                                                                        |
| `STAFF_API_KEY must be set` / `SESSION_TOKEN_SECRET must be set`    | faltou preencher o `.env`                                                                                                                                                                                            |
| API reinicia sozinha ou fica `unhealthy`                            | memória insuficiente na VM do Docker (use ≥ 12 GB)                                                                                                                                                                   |
| "Mesa nao encontrada." ou restaurante inexistente                   | faltou criar o restaurante e aplicar o seed                                                                                                                                                                          |
| "QR Code invalido ou expirado."                                     | foi aberto um link final antigo; abra de novo `/api/qr/<token>`                                                                                                                                                      |
| "Conexão lenta. Toque para tentar novamente." no 1º acesso          | a tela espera a API por 3 s; na primeira compilação do Next isso estoura. Toque de novo                                                                                                                              |
| "Permita o acesso à localização…"                                   | permissão negada ou posição indisponível: libere a localização nas configurações do site e recarregue; sem posição, use DevTools → Sensors; ou abra pelo IP da rede local                                            |
| Rota existente responde 404 (comum depois de recriar os containers) | cache `.next` desatualizado: `docker exec restaurant-web-customer sh -c 'rm -rf /repo/apps/web-customer/.next/*' && docker restart restaurant-web-customer`; no app da equipe, troque `web-customer` por `web-staff` |
| Cartão da recepção "Encaminhada"/"Expirado", botões sem efeito      | passou de 60 s; espere expirar e escaneie de novo, ou `reset-mesa.sh`                                                                                                                                                |
| Cliente esperando e nada na recepção                                | a mesa já tinha sessão ativa: quem aprova é o cliente-anfitrião; use outra mesa ou `reset-mesa.sh`                                                                                                                   |
| Cliente entrou direto, sem espera                                   | a mesa tinha uma liberação ativa ("Liberar mesa", 15 min)                                                                                                                                                            |
| Linux: serviço de IA não alcança o LLM do computador                | `host.docker.internal` não existe por padrão no Docker Engine; use o IP da máquina `[NÃO VERIFICADO]`                                                                                                                |

## Zerar o ambiente

Apaga **todos** os dados do sistema nesta máquina:

```bash
docker compose down
docker volume rm restaurant-saas_postgres_data restaurant-saas_mongodb_data restaurant-saas_redis_data
```

Depois, repita "Subir e acompanhar" e "Criar o restaurante de demonstração".
