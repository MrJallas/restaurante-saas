---
status: aceita
date: 2026-06-09
decision-makers: Caleb Medeiros
---

# Deixar o cliente-anfitrião aprovar quem chega depois

## Contexto e problema

Quando alguém escaneia o QR de uma mesa já ocupada, alguém precisa decidir se essa pessoa entra na
conta da mesa. A decisão é social: quem está sentado sabe se conhece quem chegou. Uma versão anterior
do desenho escalava o pedido para a equipe (recepção, depois gerente), com prazo por nível.

## Opções consideradas

- escalar para a equipe quando o anfitrião não responde;
- deixar só o cliente-anfitrião decidir e avisar a equipe de forma passiva, depois da aprovação.

## Decisão

Escolhida: "o cliente-anfitrião é o único aprovador", porque tira da equipe uma decisão que é da mesa
(decisão de produto chamada "V16"). O cliente-anfitrião é o primeiro cliente aprovado da sessão.

- O scan chama `POST /:slug/customer/welcome` (ou `/recognize`), que grava o participante em
  `session_participants` com `status='pending'` e avisa a mesa (`participant:join_request`).
- O anfitrião decide em `POST /:slug/table/participants/decide`; o resultado volta pelo evento
  `participant:decision` e pelo poll de `GET /:slug/table/participants`. Quem pediu pode desistir em
  `POST /:slug/table/participants/cancel`. Não há prazo automático.
- O segundo sistema, que implementava a escalada para a equipe (tabela `late_arrival_requests`, rota
  `POST /:slug/late-arrival-requests` e telas da equipe), não tinha registros em nenhum restaurante e
  era inalcançável pelo app. Foi removido na migration 081.

### Consequências

- Boa, porque há um único fluxo e uma única fonte de verdade para quem está na mesa.
- Boa, porque "desistiu" (`cancelled`) e "foi recusado" (`rejected`) são estados diferentes
  (migration 080): quem desistiu pode escanear e pedir de novo; quem o anfitrião recusou fica barrado
  até a sessão da mesa fechar.
- Ruim, porque o aviso passivo à equipe previsto na decisão ainda não existe: os eventos só chegam à
  sala da mesa, e a recepção não fica sabendo que alguém entrou.
- Ruim, porque, sem prazo, o pedido fica pendente até o anfitrião decidir ou quem pediu desistir.
- `escalation_chains` continua em uso (junção de mesas, reclamações e verificação de scan). O valor
  `late_arrival` do enum ficou órfão, porque o PostgreSQL não remove valor de enum.
- Se um dia for preciso avisar a recepção, o caminho é uma notificação passiva depois da aprovação, não
  um aprovador novo.

## Mais informações

- Datas: decisão "V16" confirmada em 2026-06-09 (registro do projeto); remoção do segundo sistema
  decidida em 2026-08-31 e commitada em 2026-09-24 (`b327199`, migration 081); estado `cancelled` no
  commit `2b3eb5e` (2026-08-31, migration 080).
- `apps/api/src/modules/table-session/table.controller.ts` e `table-session.service.ts`
- [Cliente-anfitrião e mesa compartilhada](../produto/funcionalidades/cliente-host-e-mesa-compartilhada.md)
- Primeiro scan de mesa livre: [ADR 0004](0004-validar-o-primeiro-scan-do-qr-na-recepcao.md)
