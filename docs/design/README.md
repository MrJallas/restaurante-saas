# Design

Esta pasta guarda o protótipo navegável das telas (`canvas/`): páginas HTML que desenham os apps do
cliente, da equipe e das TVs em React, lado a lado, como um quadro de design. O protótipo é referência
visual. O comportamento do sistema é o do código; onde os dois divergem, vale o código.

Capturas antigas do protótipo, o deck de apresentação e rascunhos estão em
[`../archive/design/`](../archive/design/).

## Canon V20

A linguagem visual **V20** é a fonte de verdade das telas do cliente
([ADR 0012](../decisoes/0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md)).

- Entrada: [`canvas/app-cliente-canvas-v20.html`](canvas/app-cliente-canvas-v20.html).
- Telas: [`canvas/handoff/cliente/cliente-journey-v20.jsx`](canvas/handoff/cliente/cliente-journey-v20.jsx)
  e [`canvas/handoff/cliente/cliente-late-arrival.jsx`](canvas/handoff/cliente/cliente-late-arrival.jsx).
- O V20 também carrega `cliente-tokens.jsx` (tokens e primitivos), `cliente-menu-drawer-v20.jsx`,
  `cliente-table-merge.jsx` e `cliente-screens-v14.jsx`. Esses arquivos de versões anteriores não são
  legado enquanto o V20 os usar.

Do lado da equipe, a referência é
[`canvas/app-garcom-canvas-v11.html`](canvas/app-garcom-canvas-v11.html): o app completo de garçom,
gerente e recepção, montado a partir de `canvas/handoff/garcom/`. Vários comentários do código de
`apps/web-staff` citam esses arquivos.

## Como abrir

As páginas carregam scripts por caminho relativo, então precisam de um servidor estático:

```bash
cd docs/design/canvas
python3 -m http.server 8765
# abra http://localhost:8765/app-cliente-canvas-v20.html
```

- É preciso internet: React, ReactDOM e Babel vêm do unpkg, e as telas do cliente usam Google Fonts.
- Um 404 de `.design-canvas.state.json` é esperado: é um arquivo opcional onde o quadro guardaria a
  ordem e os títulos das telas.
- Use o mesmo servidor para as outras entradas (`app-garcom-canvas-v11.html`,
  `handoff/tv-cozinha-bar.html` e assim por diante).
- `canvas/` fica fora do prettier: comentários do código citam `arquivo.jsx:linha` e uma reformatação
  deslocaria essas linhas.

## Canon × legado

| Entrada em `canvas/`                             | O que mostra                                                     | Situação                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `app-cliente-canvas-v20.html`                    | app do cliente, V20, alinhado ao código                          | **canon do cliente**                                            |
| `app-garcom-canvas-v11.html`                     | app da equipe completo (garçom, gerente, recepção)               | **canon da equipe**                                             |
| `app-garcom-canvas-v12.html`                     | reclamação como chamado novo                                     | rodada focada                                                   |
| `app-garcom-canvas-v15.html`                     | cliente-anfitrião e QR ilegível, lado da equipe                  | rodada focada                                                   |
| `app-garcom-canvas-v16.html`                     | chegada tardia: aviso passivo à equipe                           | rodada focada; o aviso não existe no código                     |
| `app-garcom-canvas-v17.html`                     | junção de mesas: aviso passivo à equipe                          | rodada focada, a mais recente da equipe                         |
| `handoff/tv-cozinha-bar.html`                    | TVs da cozinha e do bar (KDS em 1920×1080)                       | referência do KDS; o `handoff/README.md` descreve essas TVs     |
| `handoff/Entrada e Identidade.html`              | entrada e identificação                                          | referência                                                      |
| `esboco.html`                                    | primeiro esboço do produto, com o KDS original                   | histórico                                                       |
| `app-cliente-canvas.html`, `-v2`, `-v13`, `-v14` | versões anteriores do cliente (4.2–4.5, avaliação V12, V13, V14) | legado                                                          |
| `app-cliente-canvas-v15-patched.html`            | chegada tardia pelo cliente-anfitrião (V15)                      | legado; o texto cita a tabela `late_arrival_requests`, removida |
| `app-cliente-canvas-v16.html`, `-v16-2.html`     | junção de mesas com consentimento duplo (V16)                    | legado                                                          |
| `prototypes/seguranca-qr/index.html`             | telas de segurança do gerente, isoladas                          | não renderiza (ver abaixo)                                      |

Os `README.md` de `canvas/handoff/cliente/` e `canvas/handoff/garcom/` são as especificações de design
de cada app, com o histórico das rodadas; os `server-notes.md` ao lado são notas de backend escritas
junto com o desenho. A seção "Como visualizar" do handoff do cliente ainda manda abrir
`app-cliente-canvas.html`; para o estado atual, abra o V20.

`canvas/docs/features/` guarda a versão do designer de quatro especificações, histórica. A versão
vigente de cada funcionalidade está em `docs/produto/funcionalidades/`:

| No protótipo             | Documento vigente                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `chat-history-lgpd.md`   | [Histórico de chat e LGPD](../produto/funcionalidades/historico-de-chat-e-lgpd.md)                        |
| `complaint-flow-v12.md`  | [Avaliação e reclamação](../produto/funcionalidades/avaliacao-e-reclamacao.md)                            |
| `customer-host-model.md` | [Cliente-anfitrião e mesa compartilhada](../produto/funcionalidades/cliente-host-e-mesa-compartilhada.md) |
| `zone-pause.md`          | [Pausa de zona](../produto/funcionalidades/pausa-de-zona.md)                                              |

## O código vence o canvas

O protótipo registra o desenho de cada rodada e não foi atualizado quando o código mudou. Exemplos de
divergência conhecidos:

- O handoff do cliente descreve o cliente-anfitrião aprovando "antes do staff", com uma cascata de 60 s
  por etapa. No código, o anfitrião é o único aprovador de quem chega depois, sem prazo e sem escalada
  para a equipe
  ([ADR 0005](../decisoes/0005-deixar-o-cliente-anfitriao-aprovar-quem-chega-depois.md)).
- `app-cliente-canvas-v15-patched.html` e `canvas/docs/features/customer-host-model.md` descrevem
  pedidos de chegada tardia gravados em `late_arrival_requests`, com prazo de 60 s. Essa tabela foi
  removida na migration 081; o fluxo real usa `session_participants` e não tem prazo.
- `app-garcom-canvas-v16.html` desenha um aviso passivo à equipe depois que o anfitrião aprova alguém.
  Esse aviso não existe: os eventos de entrada na mesa só chegam à própria mesa.
- A spec de VIP citada no handoff da equipe não existe dentro do protótipo; a vigente é
  [Cliente VIP](../produto/funcionalidades/cliente-vip.md).

## Telas do cliente com visual congelado

O autor desenhou à mão e conferiu lado a lado com o V20 sete superfícies do app do cliente. O visual
delas (layout, tipografia, tokens de cor e texto) só muda por decisão explícita do autor; correção
funcional que não altera a aparência é permitida
([ADR 0012](../decisoes/0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md)).

| Superfície (em `apps/web-customer/src/`)                            | O que é                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `components/welcome/WelcomeModal.tsx`                               | boas-vindas na mesa: rótulo "MESA N · BEM-VINDO", título "Pra começar, quem é você?", "Seu nome" e "Seu CPF" |
| `components/welcome/CpfInput.tsx`                                   | campo de CPF sem borda própria; a moldura é do componente pai                                                |
| `screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx`  | pedido de CPF para cliente já sentado que ainda não se identificou                                           |
| `screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx`     | espera pela aprovação, na junção de mesas e na chegada tardia                                                |
| `components/ui/CallWaiterSheet.tsx`                                 | painel "chamar garçom" com cinco motivos; arrasta para fechar                                                |
| `app/[slug]/mesa/[tableCode]/page.tsx` (aviso de conta reconhecida) | aviso discreto "CONTA RECONHECIDA"                                                                           |
| `app/[slug]/assistente/page.tsx` (antes da primeira mensagem)       | entrada do assistente com "Chamar garçom" e "Ver cardápio" e a saudação                                      |

Por causa dessas telas, os dois apps web usam Next.js 16 com React 18: no upgrade do Next.js, o
motor de renderização ficou o mesmo para não alterar nenhum pixel delas.

## Protótipo `seguranca-qr`

`canvas/prototypes/seguranca-qr/index.html` não renderiza: as telas usam o componente `IOSFrame`, e
nenhum script carregado por essa página o define (ele existe em `handoff/cliente/cliente-tokens.jsx` e
em alguns JSX de `handoff/garcom/`). A quebra é anterior à organização atual das pastas.

## Arquivos removidos na reorganização de setembro de 2026

Alguns HTML do protótipo foram apagados por serem cópias; o texto do protótipo não foi editado, então
ainda há citações a eles:

- `app-garcom-canvas.html` e `app-garcom-canvas-v3` a `-v10`: carregavam os JSX atuais do v11 (do v3
  ao v7, sem `garcom-screens-e.jsx`) e mudavam só no título e no CSS. O `handoff/garcom/README.md`
  ainda cita v4, v6, v9 e v10: abra `app-garcom-canvas-v11.html`.
- `app-cliente-canvas-v15.html`: substituído pelo `app-cliente-canvas-v15-patched.html`, que carrega os
  mesmos scripts. O `app-garcom-canvas-v16.html` ainda cita o nome antigo.
- Cópias idênticas (`cliente-journey-v20.html`, `cliente-canvas-latest.html`,
  `garcom-canvas-latest.html`, `app-cliente-canvas-v15-patched-2.html`, `app-garcom-canvas-v3-2.html`,
  `app-garcom-v6.html`) e dois JSX de moldura que nenhuma página carregava.

As versões apagadas continuam no histórico do Git, no caminho antigo:
`git show 25bd9be^:docs/design-canvas/app-garcom-canvas-v10.html`.

## Arquivo

- [`../archive/design/capturas-canvas/`](../archive/design/capturas-canvas/): 55 capturas de
  verificação das rodadas V4 a V16.
- [`../archive/design/pitch/`](../archive/design/pitch/): o deck "Mesa" (`pitch-mesa.html`, 11 slides)
  e os slides exportados.
- [`../archive/design/rascunhos/`](../archive/design/rascunhos/): o primeiro rascunho da home do
  cliente (2026-04-23).
