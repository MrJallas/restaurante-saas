# Testes no iOS (Simulator)

O app do cliente roda quase sempre no Safari do iPhone, e o Chromium aceita coisas que o WebKit do iOS
quebra (posição fixa, rolagem com inércia, safe areas, teclado). Por isso, além do Playwright com
WebKit (ver [testes](testes.md)), os caminhos críticos do cliente são conferidos no Safari do iOS
Simulator. Há duas ferramentas, e as duas **só funcionam em macOS** com Xcode e simuladores iOS.

## serve-sim: operar o Simulator pelo navegador

`scripts/audit/start-serve-sim.sh` confere o ambiente (macOS em Apple Silicon, Node, `npx`, `xcrun`,
`python3`), liga um iPhone disponível se nenhum estiver ligado, abre `AUDIT_URL` no Safari do
Simulator e executa uma versão fixada do pacote `serve-sim`, que transmite a tela e aceita toques pelo
navegador em `http://localhost:3200`.

```bash
scripts/audit/start-serve-sim.sh

# Variáveis opcionais
AUDIT_URL=http://localhost:3001/api/qr/<qr_public_token> \
IOS_SIM_ID=<udid> \
SERVE_SIM_PORT=3200 \
scripts/audit/start-serve-sim.sh
```

Para trocar a versão, sobrescreva `SERVE_SIM_PACKAGE` e valide o script inteiro antes de mudar o
padrão. **Não exponha a porta 3200 à internet**; num Mac remoto, use túnel SSH autenticado ou rede
privada.

## idb: capturas e árvore de acessibilidade por tela

Pré-requisitos: `idb` (cliente, pacote `fb-idb`) e `idb_companion` (Homebrew) no `PATH`
`[NÃO VERIFICADO: comandos de instalação]`, e os apps no ar (`:3003`, `:3002`, `:3001`).

```bash
idb list-targets --json                # escolha um iPhone

TARGET_UDID=<udid-do-iphone> \
TENANT_SLUG=restaurant_dev \
CUSTOMER_BASE_URL=http://localhost:3003/restaurant_dev \
STAFF_BASE_URL=http://localhost:3002 \
scripts/audit/audit-ui.sh
```

Sem `TARGET_UDID`, o script escolhe o primeiro iPhone ligado (ou o primeiro disponível, e o liga).
Para cada rota do cliente e da equipe, ele abre a página, salva captura (`.png`) e árvore de
acessibilidade (`.ui.json`), toca nos cantos e na barra inferior e procura textos de erro na tela. A
saída, com um `summary.md`, vai para `output/idb/` (ignorado pelo Git; `OUT_DIR` sobrescreve). As telas
da equipe exigem login: entre uma vez no Safari do Simulator antes de rodar, porque ele mantém a sessão.
Se o alvo aparecer sem companion em `idb list-targets`, rode `idb companion --udid "$TARGET_UDID"` em
outro terminal.

Comandos avulsos:

```bash
idb open --udid "$TARGET_UDID" http://localhost:3003/restaurant_dev/assistente
idb ui tap --udid "$TARGET_UDID" 360 72
idb ui text --udid "$TARGET_UDID" "mesa para juntar"
idb screenshot --udid "$TARGET_UDID" output/idb/manual.png
idb ui describe-all --udid "$TARGET_UDID" --json > output/idb/manual.ui.json
```

Em cada tela, confira: o menu abre e navega sem estado antigo; voltar usa o histórico real; o sino
abre as notificações do papel certo; a barra inferior troca de aba sem perder estado; folhas inferiores
e modais respeitam `env(safe-area-inset-bottom)`.

## Fluxos prioritários

- QR, geolocalização, cadastro do cliente e retomada de sessão;
- home da mesa, cardápio, assistente e sugestões;
- rascunho, revisão, confirmação e acompanhamento do pedido;
- chamar garçom, mensagens e mesa compartilhada (pedido de entrada ao anfitrião);
- pagamento, divisão, Pix de demonstração, erro, avaliação e LGPD;
- teclado, foco, rolagem, folhas inferiores, safe areas e rotação.

## Armadilhas do Simulator

- **Localização.** O pedido de permissão por site do WebKit não pode ser concedido antes; é preciso
  tocar em "Permitir". Para dar uma posição ao Simulator:
  `xcrun simctl location <udid> set <lat>,<lng>` e
  `xcrun simctl privacy <udid> grant location com.apple.mobilesafari`.
- **`xcrun simctl openurl` abre uma aba nova** e perde o `sessionStorage` (a sessão da mesa). Depois do
  primeiro acesso, navegue dentro da mesma aba.
- **`idb ui describe-all` não lê o conteúdo de páginas web** do Safari; como evidência, use a captura.
- O cookie de reconhecimento do cliente fica preso ao host: abrir por `localhost` ou pelo IP da rede
  local conta como aparelhos diferentes.
- Em login da equipe, o campo de CPF tem máscara: automatize digitando tecla a tecla, não preenchendo o
  valor de uma vez.

## Problemas de Safari iOS já resolvidos

Ficam registrados porque são fáceis de reintroduzir:

| Problema                                                            | Solução no código                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `body { overflow: hidden }` ignorado; a gaveta "soltava" na rolagem | `position: fixed` no `body` e restauração do `scrollY` (`components/ui/MenuDrawer.tsx`)      |
| Campos com fonte < 16 px davam zoom ao focar                        | `font-size: max(16px, 1em)` em `@supports (-webkit-touch-callout: none)` (`app/globals.css`) |
| Barra superior colada no notch; `pb-safe` zerava sem notch          | `env(safe-area-inset-*)` com mínimo fixo (`.pb-safe` em `app/globals.css`)                   |
| Fundo de folha inferior interceptava o toque no botão               | ordem de camadas explícita (`fixed`/`z-index`) no contêiner da folha                         |
| iPhone real sem acesso à porta 3001 (firewall do Mac)               | o app do cliente repassa `/api/*` e `/socket.io/*` para a API (`next.config.js`)             |

## Limites

Use só dados de teste. O Simulator **não** prova desempenho, memória, câmera, sensores, notificações
nem outros comportamentos de hardware: confirme esses achados num iPhone físico.

## Evidência mínima por achado

Commit, ambiente, modelo/UDID e versão do iOS, dados de teste, passos de reprodução, esperado × obtido,
captura ou gravação curta, logs relevantes, severidade e impacto. Evidência pesada fica local, em
`output/`; no Git entram só resumos.
