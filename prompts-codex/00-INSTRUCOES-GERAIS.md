# Round 24 — Bugs e pendências de teste manual

> **Este arquivo é referência sua (Caleb), não mande pro chat.** Cada `0X-*.md` vai num chat separado.

## Sessão de teste

Em 25/05/2026 rodei teste manual no app inteiro (cliente, recepcionista, garçom, cozinha, gerente) com restaurante populado. ~47 bugs/pendências catalogados nesta pasta.

## Como usar

1. Abre um chat de codex novo pra cada arquivo
2. Cola o conteúdo do arquivo inteiro como primeira mensagem
3. Cada arquivo é **auto-contido** — codex não vê os outros

## Ordem sugerida de paralelização

| Chat | Arquivo                                     | Risco/Bloqueio                                                                    |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| 1    | `06-api-transversais.md`                    | **Primeiro** — bugs de auth (`x-staff-id`, `manager-only`) destravam várias telas |
| 2    | `01-cliente.md`                             | Independente                                                                      |
| 3    | `02-recepcionista.md`                       | Bloqueia parcialmente cliente (geolocalização)                                    |
| 4    | `03-garcom.md`                              | Independente                                                                      |
| 5    | `04-cozinha.md`                             | Depende parcialmente do 06 (Chamar garçom endpoint)                               |
| 6    | `05-gerente.md`                             | Depende do 06 (xstaff id em várias telas)                                         |
| 7    | `07-infra-auditoria.md`                     | Auditoria + MongoDB — paralelo aos outros                                         |
| 8    | `08-cliente-table-merge-salao.md`           | Continuação feature incompleta — cliente escolhe mesa para junção                 |
| 9    | `09-gerente-timeline-real.md`               | Feature incompleta — timeline real de pedido/mesa no gerente                      |
| 10   | `10-cliente-staffbubble-historico.md`       | Assistente cliente — StaffBubble deve sobreviver a reload                         |
| 11   | `11-cliente-courtesy-arrival.md`            | Cliente recebe/aceita/recusa cortesia real                                        |
| 12   | `12-cliente-home-chips-dinamicos.md`        | Home da mesa renderiza chips da continuation API                                  |
| 13   | `13-cliente-join-table-ai-typewriter.md`    | Host cliente decide entrada de participante por chat IA                           |
| 14   | `14-cliente-table-merge-pos-confirmacao.md` | Estados finais de junção: aprovado, recusado, cooldown                            |
| 15   | `15-staff-login-superusers.md`              | Login funcional de staff/superusers para acessar interfaces                       |

**Diretriz**: o `06-api-transversais.md` resolve bugs que aparecem em vários frontends. Idealmente roda primeiro ou em paralelo com os frontends, pra os chats frontend não terem que mockar workaround.

**Diretriz de dependência das continuações 09-15**:

- `13` e `14` mexem nos mesmos fluxos de host/customer/table-merge. Rodar `13` antes do `14`, ou coordenar merge.
- `08` deve vir antes ou junto do `14`, porque a seleção da mesa alvo alimenta os estados finais.
- `10`, `11` e `12` mexem em `apps/web-customer/src/app/[slug]/assistente/page.tsx` e/ou home customer; evitar rodar três agentes no mesmo arquivo sem combinar.
- `15` deve respeitar o resultado do `06` para não reintroduzir bypass de `x-staff-id`/role.

## Validação automatizada obrigatória

Cada chat deve validar a feature que implementou com teste automatizado ou semi-automatizado usando as ferramentas certas, não só build.

### Cliente / iOS

Para prompts que tocam `apps/web-customer` (`01`, `08`, `10`, `11`, `12`, `13`, `14`):

- Usar simulador iOS com **idb do Facebook** para E2E real sempre que a mudança afetar UX mobile, chat, sheet, overlay, QR, teclado, safe-area ou WebSocket.
- Usar `idb list-targets --json` para descobrir device/companion e `idb open`, `idb ui tap`, `idb ui text`, `idb ui swipe`, `idb screenshot`, `idb ui describe-all` para dirigir e registrar o fluxo.
- Se o MCP `xcodebuildmcp` estiver disponível, usar para inventário, screenshot e UI tree; para interação direta preferir idb.
- Salvar evidências em `qa-reports/<slug-do-prompt>/` ou caminho equivalente: screenshots, resumo dos passos, IDs de sessão/mesa usados e queries DB relevantes.

### Staff / Playwright

Para prompts que tocam `apps/web-staff` (`02`, `03`, `04`, `05`, `09`, `15`):

- Usar MCP Playwright/browser para abrir as telas staff, clicar fluxos reais, capturar screenshot e validar rede/DOM.
- Validar cada role com identidade real: depois do prompt `15`, usar login de superuser; antes dele, se necessário, semear `localStorage`/query params como está documentado no prompt, mas não considerar isso solução final de auth.
- Para bugs de botões, provar que o clique mudou estado real: response HTTP, WebSocket, DB ou tela de destino.

### LLM / Assistente

Para prompts com assistente ou tools (`01`, `08`, `10`, `11`, `13`, `14`):

- Quando o LLM local estiver rodando, testar pelo chat real do app. Não mockar o LLM para critério final de aceite.
- Nesta rodada, o LM Studio foi visto rodando em `http://192.168.0.56:1234` com modelo `qwen/qwen3-coder-30b`; confirmar o endpoint atual antes de testar porque IP local pode mudar.
- Verificar `assistant_messages.tool_calls`, chips retornados e efeito real no backend.
- Se o LLM não estiver disponível, registrar o bloqueio no relatório e deixar claro quais asserts ficaram pendentes.

### API / Cross-app

Para `06` e APIs compartilhadas:

- Além de testes unitários/integração, rodar ao menos um fluxo frontend consumidor via Playwright/idb para provar que o contrato novo funciona fora do curl.
- Specs Playwright E2E compartilhadas devem rodar em série quando usam QRTEST91/92 ou fixtures globais.

## Convenções dos prompts

Cada arquivo segue:

- **Contexto** — projeto + role + regras V20
- **Bugs** numerados com:
  - Descrição (na minha voz)
  - Cenário reproduzido
  - Comportamento atual
  - Comportamento esperado
  - Referências ao canvas
  - Critério de aceitação

## Notas importantes

- `14099 min` na lista de espera é dado antigo de teste, **NÃO** é bug
- Logs/históricos novos: armazenar em **MongoDB**, não Postgres
- "Em desenvolvimento (Onda X backend)" toasts: ou implementar real ou esconder o botão — não vazar pro usuário final
- Erros técnicos (`xstaff id inválido`, `manager-only endpoint`, `Thread não encontrada`): tratar e mostrar mensagem amigável ou ocultar
