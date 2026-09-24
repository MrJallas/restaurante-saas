# Prompt para auditoria completa com Playwright no Chrome

Contexto: restaurante SaaS em teste manual via Cloudflare Tunnel. Usar MCP Playwright no Chrome, não browser genérico, porque as abas e sessões já estão no Chrome do usuário.

## Gap já observado

- Tela gerente `manager/table-menu/[sessionId]`: botão **Fechar mesa** mostra toast `Fechar mesa · em desenvolvimento (Onda 3 backend)` e não executa fechamento.
- Impacto: gerente não consegue encerrar sessão da mesa pela UI. Para liberar a Mesa 1 durante o teste foi necessário fechar manualmente no backend.
- Validar também se a recepcionista tem fluxo alternativo de liberar/fechar mesa e se ele cobre o caso real.

## URLs do ambiente

- Staff: `http://<IP-da-LAN>:3002`
- Cliente/QR: `http://<IP-da-LAN>:3003`
- API/Socket: `http://<IP-da-LAN>:3001`
- Tenant: `restaurant_dev`

## Identidades staff

- Recepcionista/Host: `a4c89ca7-86e6-4072-9432-449118a62fd4`
- Gerente: `8bd06156-1fe5-4c18-a82d-43d38287ed4a`
- Garçom: `320de62c-073f-4e50-9f68-f5e9064c8bab`
- Cozinha/Cook: `787b5fea-c128-4696-812d-d91c1e5aad12`

## Links de entrada

- Recepcionista: `http://<IP-da-LAN>:3002/host?tenant=restaurant_dev&hostId=a4c89ca7-86e6-4072-9432-449118a62fd4`
- Gerente: `http://<IP-da-LAN>:3002/manager?slug=restaurant_dev&managerId=8bd06156-1fe5-4c18-a82d-43d38287ed4a&staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a`
- Garçom: `http://<IP-da-LAN>:3002/waiter?tenant=restaurant_dev&waiterId=320de62c-073f-4e50-9f68-f5e9064c8bab`
- Cozinha: `http://<IP-da-LAN>:3002/cozinha?tenant=restaurant_dev&cookId=787b5fea-c128-4696-812d-d91c1e5aad12&staffId=787b5fea-c128-4696-812d-d91c1e5aad12`
- QR Mesa 1: `http://<IP-da-LAN>:3001/api/qr/8ad1f98e-09ba-43ae-9140-c18d562907bf`

## Tarefa

Use MCP Playwright no Chrome para testar literalmente todos os botões e fluxos clicáveis visíveis nas telas:

- Cliente: QR da Mesa 1, welcome, home, cardápio, carrinho, pedido, chamar garçom, pagamento, assistente, mensagens, reload/reconexão.
- Recepcionista: mapa de mesas, liberar mesa, espera, reservas, avisos/inbox, perfil, detalhes/pendências de QR físico e late arrival.
- Gerente: painel, ações agora, mesa ativa, menu da mesa, cortesias, mensagens, financeiro, equipe, operações, alertas, pausa de zona, reordenar cozinha, notificações.
- Garçom: minhas mesas, chamados, novo atendimento, scan/manual entry, detalhe de mesa, confirmar entrega, turno/eu, mensagens.
- Cozinha: KDS, preparar, pronto/avançar status, som, mensagens, perfil.

## Como validar

Para cada tela:

1. Abrir a URL correspondente no Chrome.
2. Aguardar carregamento real, não só `domcontentloaded`.
3. Capturar console errors e network failures.
4. Clicar em cada botão/ícone/tab/menu visível.
5. Validar se a ação:
   - muda a UI corretamente,
   - chama o backend esperado,
   - não gera 401/403/404/500,
   - não fica só em toast “em desenvolvimento”,
   - não quebra ao voltar/recarregar.
6. Registrar botões não implementados, rotas ausentes, botões sem efeito, erros HTTP, erros JS e dados inconsistentes.
7. Quando criar dados de teste, anotar exatamente o que foi criado e o estado final.

## Entregável esperado

Produzir relatório objetivo com:

- Resumo por persona: cliente, recepcionista, gerente, garçom, cozinha.
- Tabela de todos os botões testados: tela, botão, resultado, status.
- Bugs bloqueantes P0/P1 com URL, passos, erro observado, evidência de console/network.
- Lista de funcionalidades stub/em desenvolvimento.
- Lista de fluxos que passaram.
- Estado final do ambiente e qualquer mesa/sessão/pedido deixado aberto.

Observação: há um ajuste temporário no `web-staff` para aceitar `staffId/hostId/managerId/waiterId/cookId` pela URL durante o teste Cloudflare. Ao encerrar os testes, esse fallback deve ser removido.
