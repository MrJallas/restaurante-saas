# Round 24 — Bugs e pendências de teste manual

> **Este arquivo é referência sua (Caleb), não mande pro chat.** Cada `0X-*.md` vai num chat separado.

## Sessão de teste

Em 25/05/2026 rodei teste manual no app inteiro (cliente, recepcionista, garçom, cozinha, gerente) com restaurante populado. ~47 bugs/pendências catalogados nesta pasta.

## Como usar

1. Abre um chat de codex novo pra cada arquivo
2. Cola o conteúdo do arquivo inteiro como primeira mensagem
3. Cada arquivo é **auto-contido** — codex não vê os outros

## Ordem sugerida de paralelização

| Chat | Arquivo | Risco/Bloqueio |
|---|---|---|
| 1 | `06-api-transversais.md` | **Primeiro** — bugs de auth (`x-staff-id`, `manager-only`) destravam várias telas |
| 2 | `01-cliente.md` | Independente |
| 3 | `02-recepcionista.md` | Bloqueia parcialmente cliente (geolocalização) |
| 4 | `03-garcom.md` | Independente |
| 5 | `04-cozinha.md` | Depende parcialmente do 06 (Chamar garçom endpoint) |
| 6 | `05-gerente.md` | Depende do 06 (xstaff id em várias telas) |
| 7 | `07-infra-auditoria.md` | Auditoria + MongoDB — paralelo aos outros |
| 8 | `08-cliente-table-merge-salao.md` | Continuação feature incompleta — cliente escolhe mesa para junção |

**Diretriz**: o `06-api-transversais.md` resolve bugs que aparecem em vários frontends. Idealmente roda primeiro ou em paralelo com os frontends, pra os chats frontend não terem que mockar workaround.

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
