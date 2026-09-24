# apps/web-customer — app do cliente na mesa

App web que o cliente abre ao escanear o QR Code da mesa: cadastro rápido (nome e CPF), home da mesa,
cardápio, pedido por comanda (minha ou da mesa), chamar garçom, assistente de IA, conta, pagamento,
avaliação e reclamação, cortesias e o fluxo de mesa compartilhada (o primeiro cliente aprova quem chega
depois). Next.js 16 com React 18, Tailwind 3 e `socket.io-client`. O React ficou na versão 18 no
upgrade do Next para não tocar nas telas de visual congelado
([ADR 0012](../../docs/decisoes/0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md)).

## Como roda

- **No Compose** (serviço `web-customer`, container `restaurant-web-customer`), porta **3003**.
- **Entrada:** o QR aponta para a API (`/api/qr/<token>`), que redireciona para
  `/[slug]/mesa/[tableCode]` com a assinatura do QR. Não há login do cliente fora desse caminho; a raiz
  `/` é só uma página de placeholder.
- **Mesma origem:** o navegador fala só com a porta 3003. O `next.config.js` repassa `/api/*` e
  `/socket.io/*` para `API_UPSTREAM` (padrão `http://api:3001`, o nome do serviço no Compose). Isso
  permite testar do celular sem abrir a porta 3001 e deixa cookies e CORS triviais.
- **Isolado:** `API_UPSTREAM=http://localhost:3001 npm run dev --workspace @restaurant/web-customer`
  `[NÃO VERIFICADO]`.
- `src/proxy.ts` gera a Content-Security-Policy com nonce a cada requisição; o `next.config.js` define
  os demais headers de segurança.
- As requisições do app desistem depois de 15 s (`src/lib/api.ts`).

## Scripts

| Script                        | O que faz                                           |
| ----------------------------- | --------------------------------------------------- |
| `dev`                         | `next dev --port 3003`                              |
| `build` / `start`             | build e servidor de produção do Next                |
| `test`                        | Jest (`next/jest`, jsdom), `src/**/*.test.{ts,tsx}` |
| `lint`, `lint:fix`            | ESLint                                              |
| `e2e`, `e2e:ui`, `e2e:headed` | Playwright                                          |

## Variáveis que lê

`API_UPSTREAM`, `PUBLIC_HOST` (origens aceitas pelo servidor de desenvolvimento),
`NEXT_PUBLIC_API_URL` (`/api` no Compose), `NEXT_PUBLIC_WS_URL` (vazio: mesma origem),
`NEXT_PUBLIC_ALLOW_INSECURE_LAN_GEOLOCATION` e `NEXT_PUBLIC_DEV_GEOLOCATION_*` (localização sintética
em HTTP pela rede local). Ver [ambiente local](../../docs/desenvolvimento/ambiente-local.md).

## Estrutura

```
src/
├── app/            # rotas: [slug]/mesa, cardapio, pedido, garcom, assistente, conta, pagamento,
│                   #   orders, complaints, cortesias, chat-history, eu, identify, host, waiting-approval…
├── components/     # cardapio, home, host, layout, ui, welcome
├── screens/        # telas do fluxo de mesa compartilhada e de avaliação/histórico
├── hooks/, providers/, lib/   # sessão, socket, rascunho do pedido, cliente HTTP, CPF, localização
└── proxy.ts        # CSP por requisição
public/cardapio/    # fotos dos pratos (o seed de demonstração liga 10 delas ao cardápio)
e2e/                # Playwright: specs/, helpers/ e demo-linkedin/
```

## Testes

- **Unitários:** 31 arquivos Jest em `src/`.
- **Ponta a ponta:** `e2e/specs/` com Playwright (WebKit, perfil iPhone 14), **em série**, contra o
  stack no ar com o seed aplicado. Usam as mesas QRTEST91/92 (os specs de TV também usam M01 e M02) e consultam o banco com `docker exec`.
  Os specs que chamam a API direto leem a chave de equipe do `.env` da raiz
  (`e2e/helpers/staff-key.ts`). Detalhes, dependências do LLM e dados que os testes deixam no banco:
  [testes](../../docs/desenvolvimento/testes.md).
- `e2e/demo-linkedin/` **não é teste**: são roteiros que dirigem a interface para gravar vídeos de
  demonstração, com configuração própria (`e2e/demo-linkedin/demo.config.ts`).

## Visual

Sete superfícies deste app (cadastro, campo de CPF, identificação, espera de aprovação, folha "Chamar
garçom", aviso de conta reconhecida e a abertura do assistente) seguem a linguagem visual V20 e têm o
visual congelado: correções funcionais são permitidas, mudanças de aparência só por decisão de design.
Lista, protótipo e como abrir o canvas em [design](../../docs/design/README.md).

## Documentação relacionada

- [Jornadas e telas](../../docs/produto/jornadas-e-telas.md)
- [Cliente-anfitrião e mesa compartilhada](../../docs/produto/funcionalidades/cliente-host-e-mesa-compartilhada.md)
- [Geolocalização](../../docs/produto/funcionalidades/geolocalizacao.md)
- [Autenticação e sessões](../../docs/arquitetura/autenticacao-e-sessoes.md)
