# Protótipo · Segurança QR (watcher)

**Status:** isolado · não está plugado em nenhum app de produção.

## Por que mora aqui

As telas `ScreenManagerSecurity` (visão geral + deep-dive de mesa) e
`ScreenManagerSecurityAudit` (90 dias de `session_audit_logs` com
cursor-pagination) faziam parte do app do **gerente** numa versão
anterior. A decisão de produto sobre **onde elas vivem** ainda não foi
tomada — pode ser:

- Aba dedicada do gerente (com gating de role · só admin)
- App separado (`apps/web-admin`)
- Console do dono / proprietário (não-mobile)

Enquanto a decisão não vem, os componentes ficam isolados aqui pra
não poluir a árvore de telas do app do gerente nem confundir o time
sobre a hierarquia de informação dele.

## Estrutura

```
prototypes/seguranca-qr/
├── README.md             ← este arquivo
├── security-screens.jsx  ← os 2 componentes (Security + Audit)
└── index.html            ← canvas isolado pra revisar visualmente
```

## Como abrir

Subir um servidor estático na **raiz do projeto** (não dentro deste
folder — porque o canvas precisa carregar `handoff/garcom/garcom-tokens.jsx`
e companhia que vivem fora) e abrir `prototypes/seguranca-qr/index.html`.

```bash
python3 -m http.server 8765
# ou
npx serve .
```

Depois: `http://localhost:8765/prototypes/seguranca-qr/index.html`.

## O que tem cada tela

### `ScreenManagerSecurity`

- **Estado `overview`** (default):
  - Hero com 3 KPIs do dia (mesas abertas / aguardando você / bloqueadas auto)
  - Lista de **pending review** — sessões escaladas pela recepcionista
    com risco alto, ações Aprovar / Rejeitar / Investigar inline
  - **IPs bloqueados auto** pelo rate-limit ou watcher (Desbloquear /
    Bloquear permanente)
  - **Eventos suspeitos das últimas 24 h** filtráveis por severidade
    (Todos / Críticos / Atenção / Info), ações Investigar e Marcar
    como seguro
  - Link pro audit log de 90 dias
- **Estado `investigate`**: deep-dive de uma mesa específica. Hero
  vermelho com explicação do padrão suspeito + histórico das últimas
  24 h + 4 ações poderosas (Bloquear IP, Regenerar QR, Marcar mesa
  como inativa, Ver auditoria completa).

### `ScreenManagerSecurityAudit`

- Lista paginada cursor-based de **TODAS** as aberturas dos últimos
  90 dias.
- Filtros por decisão (Todas / Aprovadas / Rejeitadas / Bloqueadas /
  Escaladas) + filtro por mesa quando vem do investigate.
- Endpoint sugerido:
  `GET /admin/security/audit?cursor=<id>&limit=20&decision=<filter>&table_id=<id>`

## Dependências

Os componentes esperam estarem no contexto do design system do garçom:

- `useG`, `G_FONT`, `Icon`, `MPill` — vêm de `handoff/garcom/garcom-tokens.jsx`
- `MTopBar`, `MBottomNav`, `GButton`, `GIconBtn` — vêm de `handoff/garcom/garcom-screens-a/c/d.jsx`

Por isso o `index.html` carrega o stack completo do garçom — só plugando
um shell que renderiza esses dois screens isolados.

## O que NÃO está aqui

- `MBottomNav` aparece com aba `ops` ativa pra herdar o frame visual,
  mas se o produto decidir mover pra outro app (admin), substituir.
- Nenhum link in-app aponta pra essas telas. Pra reativá-las no app do
  gerente, o passo é (1) adicionar nav entry, (2) re-exportar do
  `garcom-screens-d.jsx`, (3) plugar no router.
