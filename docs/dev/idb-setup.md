# IDB Setup para Auditoria UI

Este repo usa o IDB do Facebook para validar Safari iOS em simulador durante
auditorias mobile. O fluxo cobre cliente, recepcionista, garçom, cozinha e
gerente com screenshots e árvore de acessibilidade por tela.

## Pré-requisitos

- Xcode instalado com simuladores iOS.
- `idb` no PATH. Neste ambiente foi encontrado em `/Users/calebmedeiros/.local/bin/idb`.
- `idb_companion` no PATH. Neste ambiente foi encontrado em `/opt/homebrew/bin/idb_companion`.
- Apps dev rodando:
  - customer: `http://localhost:3003`
  - staff: `http://localhost:3002`
  - API: `http://localhost:3001`

## Inventário

```bash
idb list-targets --json
```

Escolha um iPhone. Se nenhum estiver bootado, o script tenta inicializar o
target com `idb boot --udid`.

## Auditoria automatizada

```bash
TARGET_UDID=<udid-do-iphone> \
TENANT_SLUG=restaurant_dev \
CUSTOMER_BASE_URL=http://localhost:3003/restaurant_dev \
STAFF_BASE_URL=http://localhost:3002 \
scripts/audit-ui.sh
```

Sem `TARGET_UDID`, o script escolhe o primeiro iPhone bootado; se não houver,
escolhe o primeiro iPhone disponível. As evidências saem em
`qa-reports/infra-auditoria/idb/`.

## O que validar em cada tela

- Menu hambúrguer ou menu lateral abre e navega sem contexto stale.
- Botão voltar usa histórico real; fallback deve voltar para a aba de origem.
- Sininho abre a tela de notificações do role correto.
- Bottom nav troca de abas sem perder o estado atual.
- Bottom sheets e modais deixam espaço para `env(safe-area-inset-bottom)`.

## Comandos úteis

```bash
idb open --udid "$TARGET_UDID" http://localhost:3003/restaurant_dev/assistente
idb ui tap --udid "$TARGET_UDID" 360 72
idb ui text --udid "$TARGET_UDID" "mesa para juntar"
idb screenshot --udid "$TARGET_UDID" qa-reports/infra-auditoria/idb/manual.png
idb ui describe-all --udid "$TARGET_UDID" --json > qa-reports/infra-auditoria/idb/manual.ui.json
```

## Bloqueios comuns

- Se Safari mostra erro de conexão, confirme que o dev server está aceitando
  conexões no host e que o simulador consegue resolver `localhost`.
- Se o target aparece sem companion em `idb list-targets --json`, rode
  `idb companion --udid "$TARGET_UDID"` em outro terminal e repita.
- Se a auditoria precisa de fluxo autenticado, faça login uma vez no simulador
  antes de rodar o script; o Safari mantém a sessão.
