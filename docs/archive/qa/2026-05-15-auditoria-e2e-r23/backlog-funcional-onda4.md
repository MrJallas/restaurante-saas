# R23 Onda 4 Status

Itens da auditoria R23 que estavam rebaixados para backlog funcional e foram
tratados na segunda leva da Onda 4.

- QR decoder real no fluxo de scan do garcom via camera + BarcodeDetector.
- `/waiter/table/[id]` com dados reais de mesa, pedidos e pagamentos.
- KDS com sincronizacao via WebSocket alem do polling atual.
- Reorder real de cozinha em `/manager/kitchen-reorder`.
- Acoes de alertas do manager navegando para fluxo real ou resolvendo alerta.
- Rota customer `/conta` dedicada.
- Bubbles typewriter para join/merge seguindo o canvas customer-host.

Pendencias residuais para QA/producao:

- Testar QR em Safari/iOS real. Quando BarcodeDetector nao existir, a tela
  cai para entrada manual sem quebrar o fluxo.
- Validar migration 047 em tenants existentes antes do deploy.
- Alert actions sem `route` explicito usam roteamento por kind/label ou
  resolvem o alerta; se o produto precisar side effects especificos por kind,
  adicionar contratos dedicados.
