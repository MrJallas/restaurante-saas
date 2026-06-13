# Agente: Desenvolvedor Frontend — Staff (Garçom, Cozinha, Dashboard)

## Papel

Você desenvolve o painel de garçom (mobile), KDS cozinha (TV), e dashboard do dono (desktop).

## 3 interfaces no mesmo Next.js app

### /garcom (mobile/tablet)

- Home: mesas ativas com status visual (verde=livre, vermelho=ocupada, amarelo=pedido pronto)
- Pedidos: lançar pedido por mesa (seleciona itens, notes, confirma) — createdBy: 'waiter'
- Entregas: cards de pedidos prontos com botão "Eu levo" (claim system)
  - Ao clicar "Eu levo" → POST /delivery/claim → card some dos outros garçons via WebSocket
  - Mostra destino: "Levar para Mesa 12" com itens
  - Botão "Entregue" após levar → POST /delivery/:id/delivered
  - Se ninguém claimar em 3 min, re-notifica com destaque de urgência
- Chamadas: alertas de mesa chamando garçom com botão "Estou indo"
- WebSocket obrigatório: receber order:ready, order:claimed, waiter:call em tempo real
- Notificação sonora ao receber alerta

### /cozinha (TV fullscreen 1920x1080+)

- Layout: 3 colunas — Novos | Preparando | Prontos
- KdsOrderCard: mesa em destaque, itens com observações em FONTE GRANDE e BOLD
- Cores: amarelo pra novo, laranja pra preparando, verde pra pronto
- Timer desde a entrada do pedido em cada card
- Touch/click no card avança status (novo → preparando → pronto)
- Ao marcar "Pronto" → backend emite order:ready pra todos os garçons
- Som/beep ao receber pedido novo
- Auto-reconnect WebSocket + fallback polling 10s
- Sem scroll: se muitos pedidos, cards ficam menores ou paginam
- Observações do cliente em destaque máximo (ex: "SEM CEBOLA" em fundo vermelho, fonte grande)

### /dashboard (desktop)

- Layout com sidebar de navegação
- Overview: MetricCards (pedidos hoje, receita, ticket médio, nota média, uso IA)
- Charts: receita por dia, uso IA (mensagens + custo + bloqueios), feedbacks
- CRUD: cardápio (categorias + itens com upload de foto), mesas (gerar QR Code), equipe (staff com PIN)
- DataTables: pedidos, pagamentos, clientes, logs IA (com coluna de provider/model)
- Configurações: branding (cores, fontes, logo), prompt IA, chave PSP, limites de IA por sessão
- Clientes: lista com drill-down no histórico de consumo, visitas, feedback

## Regras

- KDS nunca pode travar — se WebSocket cair, polling como fallback
- Dashboard usa DataTable reutilizável com sort, filter, pagination
- Garçom: interface touch-friendly com botões grandes
- Todas as 3 interfaces usam o mesmo api.ts e websocket.ts
- Gere arquivos completos, sem placeholders
