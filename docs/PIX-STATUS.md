# Status do pagamento Pix — STUB INTENCIONAL (não é bug)

> **Para qualquer agente/dev auditando pagamentos:** o Pix deste projeto **não
> está implementado de verdade** — é um _stub de demonstração_ **de propósito**.
> Isso é uma **decisão de produto do Caleb (2026-07-04)**, não um defeito. **Não
> abra como bug, não "conserte" gerando um QR real ou auto-confirmando.** Se um
> scan/auditoria apontar "Pix não tem estado terminal de sucesso", "QR não é
> honrado pelo banco", ou "0 callers de webhook" — é isto aqui, esperado.

## Por que é stub agenda

O Caleb ainda **não tem um cliente (restaurante) fechado**. Integrar Pix de
verdade exige CNPJ + conta num PSP + credenciais reais + custo por transação —
não faz sentido antes de haver um cliente. **Depois que fechar o primeiro
cliente**, decide-se _qual_ PSP e implementa-se. Até lá, a tela do Pix continua
como está hoje (mostra o QR de demonstração) e o registro fica honesto: é demo.

## O que existe hoje (o encanamento, sem o cano de dinheiro)

| Camada                                                                                         | Estado                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Tabela `payments` + máquina de estados (`pending → awaiting_settlement → confirmed`)           | ✅ real                                                                                                                          |
| Tela `apps/web-customer/src/app/[slug]/pagamento/pix/page.tsx` (QR + copia-e-cola + countdown) | ⚠️ **demo** — `pixCopyPaste` é string gerada localmente, **não** um BR Code emitido por banco; o app de banco real **não** honra |
| `POST /:slug/payments/:id/confirm`                                                             | ⚠️ em prod grava só `awaiting_settlement` (nunca `confirmed`/`paid_at`) — ver `payments.service.ts` A04-PAY-01                   |
| `pspTransactionId` no `/confirm`                                                               | ⚠️ campo livre que o cliente manda; **não** validado contra ninguém                                                              |
| Webhook de PSP                                                                                 | ❌ **não existe**                                                                                                                |
| Integração com PSP (Efí/Mercado Pago/Asaas/banco)                                              | ❌ **não existe** (0 SDK/http no repo)                                                                                           |

A flag `PAYMENTS_ALLOW_CLIENT_CONFIRM` só liga auto-confirm em **dev/e2e/mock**.
Em produção fica **off** — de propósito, senão o cliente marcaria o próprio Pix
como pago sem pagar (a fraude que o fix de segurança A04-PAY-01 fechou).

## Como Pix funciona de verdade (mental model pro futuro)

Não existe "API do governo" que um comerciante chame direto. O Banco Central
**opera os trilhos** (SPI liquida, DICT resolve chaves) e **padroniza** uma API
Pix, mas o acesso é **intermediado por um participante** (um banco ou uma
fintech-PSP autorizada). O restaurante **nunca** fala direto com o BCB.

```
seu backend ──API Pix (mTLS+OAuth)──▶ PSP/banco (participante) ──▶ SPI/DICT (BCB)
     ▲                                       │
     └──────────── WEBHOOK ◀─────────────────┘   ← "o Pix chegou?" = ISTO
        (PSP avisa quando o dinheiro cai; é a ÚNICA verificação automática)
```

A **verificação real de que o Pix chegou** = o **webhook** que o PSP dispara
quando o crédito cai (com `endToEndId`, valor, txid). Sem integrar um PSP, a
única alternativa é humana: o dinheiro cai numa chave Pix estática real e o
gerente confere no app do banco e confirma manualmente.

## Dicas pro próximo agente (quando for implementar)

**Precisa do Caleb (mundo real, não dá pra codar):** CNPJ/MEI, conta no PSP
escolhido, credenciais (access token ou certificado), e uma URL HTTPS pública
pro webhook em produção.

**Engenharia (encaixa sem reescrever a máquina de estados):**

1. **`PixProvider`** (novo, `apps/api/src/modules/payments/providers/`): cria a
   cobrança real via API Pix do PSP (`PUT /v2/cob/{txid}`) e devolve o **BR Code
   de verdade** pra gravar em `pix_copy_paste`/`pix_qr_code`, no lugar da string
   local de hoje (`payments.service.ts:~285`).
2. **`webhook.controller`** (novo): recebe o POST do PSP, valida
   (`valor === amount_cents`, `txid`, `endToEndId`), e só então marca
   `confirmed`/`paid_at`. Vira o **confirmador autorizado** no lugar do cliente
   (que hoje só chega a `awaiting_settlement`). A regra A04-PAY-01 já reserva
   esse caminho — o webhook é exatamente o "webhook de PSP autenticado" que o
   comentário em `payments.service.ts:25` prevê.
3. **Baixa manual de staff** (opcional, interino): rota de confirm autorizada
   por `req.staffAuth` (Gate #34) pro caixa/gerente confirmar "recebi o Pix"
   olhando o banco — reusa a mesma transição pra `confirmed`.
4. **3º bucket no dashboard:** `awaiting_settlement` hoje é invisível no
   faturamento (só `confirmed`/`paid` contam). Ao ligar o PSP, decidir se
   "aguardando compensação" aparece como pendente no dashboard do gerente.

**Escolha de PSP (recomendação):** Mercado Pago é o de menor atrito pra começar
(Pix API + webhook só com access token, sem certificado mTLS, tem sandbox). Efí
(ex-Gerencianet) é mais barato/grátis em produção mas exige certificado. Bancos
(Inter/Itaú/BB) só se já houver conta PJ.

## Decisão registrada

- Vault/RAG: `brain/decisions/2026-07-04-pix-stub-ate-cliente.md`
- Memória do projeto: `MEMORY.md` (seção Pagamento/Pix)
- Data: 2026-07-04 · Decisor: Caleb
