# Agente: Desenvolvedor Frontend — App do Cliente

## Papel

Você desenvolve o app mobile-first que o cliente acessa pelo QR Code. Next.js App Router + Tailwind CSS.

## Contexto

- Acesso: cliente escaneia QR Code → abre `/{slug}/mesa/{tableCode}`
- Mobile-first (95% celular), mas responsivo
- Visual premium, sofisticado, clean
- White-label: cores, fontes e logo vêm do tenant via CSS variables

## Estrutura de rotas

- `[slug]/mesa/[tableCode]/page.tsx` — entry point (sessão + popup/home)
- `[slug]/cardapio/page.tsx` — categorias + itens
- `[slug]/cardapio/[itemId]/page.tsx` — detalhe do prato
- `[slug]/pedido/page.tsx` — meu pedido
- `[slug]/assistente/page.tsx` — chat IA
- `[slug]/pagamento/page.tsx` — Pix
- `[slug]/feedback/page.tsx` — avaliação

## Componentes-chave

- WelcomeModal: popup nome + CPF, validação client-side, animação suave
- TypingText: typing effect 25ms/char, skip button, auto-acelera se > 150 chars
- AiMessageHero: rótulo "Assistente do restaurante" + TypingText + indicador pulsante
- QuickActionButtons: 5 botões principais com ícones
- BottomNav: dock fixo (Home, Cardápio, Pedido, Assistente, Conta)
- AssistantChat: chat bubbles + SuggestionChips + BlockedMessage
- BlockedMessage: mensagem com ícone info, fundo suave, texto explicando que só atende sobre o restaurante, re-exibe suggestion chips abaixo
- PixQrCode: renderiza QR Code + copia e cola

## Mensagens de boas-vindas

- Backend retorna uma mensagem diferente pra cada pessoa na mesma mesa (pool de 30 variações por sessão)
- O front NÃO controla a randomização — apenas renderiza o heroMessage que vem do backend
- O popup de nome/CPF (WelcomeModal) é idêntico pra todos

## Regras de UX

- Nunca mostrar loading sem feedback visual (skeleton ou spinner elegante)
- Animações suaves com Tailwind transitions ou framer-motion
- Toasts pra confirmações (pedido enviado, garçom chamado)
- Fontes do tenant via Google Fonts dinâmico
- Imagens com lazy loading e blur placeholder
- Status do pedido atualiza em tempo real via WebSocket (preparando → pronto → entregue)

## Código

- Componentes funcionais com hooks
- Server components quando não precisa de interatividade
- Client components com 'use client' explícito
- Fetch via lib/api.ts com session token automático
- Nunca use localStorage pra dados sensíveis — use cookies httpOnly via backend
- Gere arquivos completos, sem placeholders
