# Auditoria customer · fechamento da noite

Data: 2026-07-11  
Escopo: conta da mesa, comandas individuais, rateio, Pix demonstrativo, feedback, avaliação, reclamação, histórico, LGPD, logout e reentrada por QR.  
Ambiente: API `restaurant_dev`, QR física `QRTEST92`, WebKit com emulação de iPhone 14.

## Resultado

O recorte terminou limpo: sete falhas foram reproduzidas, corrigidas e revalidadas. Não ficou finding funcional aberto neste escopo. O Pix continua intencionalmente demonstrativo e a UI informa isso antes de qualquer ação.

| Severidade | Falha reproduzida | Correção e evidência |
| --- | --- | --- |
| P1 | A tela de rateio misturava itens de comandas individuais com a conta da mesa, embora o backend cobrasse apenas `billing_mode=table`. | O escopo visual agora replica a cerca financeira do backend e avisa quantos itens individuais ficam em “Minha comanda”. |
| P1 | Depois de o staff fechar a mesa, reescanear o mesmo QR reutilizava bundle local revogado e mostrava uma home falsa apesar dos `401`. | O primeiro `401` autoritativo limpa somente a sessão da mesa, preserva reconhecimento e reinicia o bootstrap físico. Reentrada real criou nova sessão e reconheceu a mesma pessoa. |
| P1 | Abrir `/pagamento/feedback` diretamente registrava continuação de “pagou” e mostrava “Pagamento confirmado” sem pagamento confirmado. | A rota exige `paymentId`, consulta o pagamento e valida status pago/confirmado e visita. Acesso direto volta para pagamento; pagamento confirmado de staff libera feedback. |
| P1 | IDs de thread com `:` eram codificados duas vezes; abrir histórico ou recarregar a conversa terminava em `404`. | O parâmetro da rota é normalizado uma vez e a chamada da API codifica uma vez. Clique e hard reload exibiram as duas mensagens reais. |
| P1 | Exclusão LGPD limpava o backend, mas nome, sessão, rascunho, reclamação em cache e cookies HttpOnly continuavam na aba. | Exclusão `fulfilled` dispara limpeza global; bundle, token, hints e caches pessoais são removidos, logout expira `recognition_token` e `session_token`, e `/eu` volta ao estado não identificado. |
| P1 financeiro | No rateio por item, taxa arredondada por pessoa produzia `9.114 + 2.514 = 11.628` para uma conta de `11.627`; o último pagador era limitado a outro valor pelo saldo restante. | Drift dentro da tolerância agora é reconciliado na ordem canônica, sem allocation negativa. Resumo, notificação, payload e cobrança passaram a usar `9.113 + 2.514 = 11.627`. |
| P2 segurança | Depois do QR, `hmac`, `ts` e `accessToken` permaneciam na URL e no histórico. | Após a sessão estar persistida/revalidada, `history.replaceState` remove somente os três segredos. Reload, navegação e Back retornaram a `/mesa/QRTEST92` sem query e com sessão válida. |

## Evidência financeira live

- Conta compartilhada: subtotal `10.570`, taxa de serviço `1.057`, total canônico `11.627` centavos.
- Rateio por item após correção: pessoa host `9.113`, convidada `2.514`; soma `11.627`.
- Tela Pix demonstrativa: `R$ 91,13` para a pessoa host.
- PostgreSQL: pagamento `pending` de `9.113`, `split_mode=by_item`.
- `bill_split_notifications.allocations` e `payments.split_allocations` ficaram idênticos e somaram exatamente `11.627`.
- Duas solicitações concorrentes idênticas reutilizaram o mesmo pagamento e deixaram uma única linha.
- Corrida conta inteira versus split terminou com uma criação e uma resposta `400 Pagamento sendo processado`, sem dupla reserva.
- Duas tentativas de confirmar Pix pelo cliente permaneceram `awaiting_settlement`, com `paid_at=null`.

## Feedback, histórico e privacidade

- Feedback geral com nota 5, tags e comentário foi persistido somente após pagamento confirmado.
- Avaliação de pedido nota 1 criou a reclamação correspondente; o histórico sobreviveu a navegação e hard reload.
- Pedido LGPD de exclusão retornou protocolo `fulfilled` e removeu/anomizou PII em customer, feedback, rating, complaint, visits e Mongo chat.
- Depois da exclusão: zero threads/mensagens do fixture, zero cookies de autenticação, zero caches pessoais; `/eu` mostrou “Você ainda não se identificou nesta visita”.

## Verificação em dois ciclos limpos

1. Ciclo focado: 6 suites financeiras / 51 testes passaram, incluindo delta positivo, negativo e zero, canonical split e concorrência; prova Playwright confirmou resumo igual à cobrança.
2. Ciclo de convergência: 15 suites API / 79 testes e 7 suites web / 20 testes passaram. `tsc --noEmit` passou em API e web-customer; Prettier e `git diff --check` passaram.

Console Playwright final: zero erros. Nenhuma captura, vídeo ou trace novo foi produzido para este recorte.

## Limpeza e limites

- Fixtures exatos removidos de PostgreSQL, Redis e Mongo; `QRTEST92` terminou com `0` sessões ativas e `0` liberações abertas.
- Tokens opacos reais foram usados, mas valores brutos não foram registrados no relatório.
- Uma primeira sessão foi encerrada por outra suíte concorrente; essa execução foi descartada e os fluxos afetados foram repetidos em sessão isolada.
- WebKit com emulação móvel valida comportamento de navegador, não desempenho, sensores ou características de um iPhone físico. Uma passada em aparelho real continua sendo o gate para afirmações de hardware.

## Arquivos deste recorte

- Rateio: `payments.service.ts`, `split-allocation-reconciliation.ts`, `tableSplitScope.ts` e testes.
- QR/reentrada: `mesa/[tableCode]/page.tsx`, `qr-session-recovery.ts` e testes.
- Pagamento/feedback: páginas `pagamento`, `pix`, `feedback`, `feedbackPaymentAccess.ts` e testes.
- Histórico: página de thread, `chat-thread-id.ts` e testes.
- LGPD/logout: `feedback.ts`, `customer-erasure.ts`, `SessionProvider.tsx`, `customers.controller.ts` e testes.
