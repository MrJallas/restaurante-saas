# Prompt 100 — Contexto do assistente, chips e regex sem LLM

Branch: `claude/compassionate-haslett-5b2f60` (base: `claude/condescending-moser-355f46` @ 929a744)
Data: 2026-06-12 · Ambiente: stack docker dev (repo base em detached checkout do commit da branch)

## Implementado por bloco

1. **Eyebrow de status do pedido** — `useActiveOrderStatus` + canon
   compartilhado `lib/orderStatus.ts` (labels/cores idênticos à tela Meu
   pedido); landing e bubbles mostram `Assistente · ● <estado> · <ETA>`
   com pedido ativo; WS `order:status`/`order:created` + poll 60s;
   entregue/cancelado volta ao padrão.
2. **Contexto consumível 1x por evento** — Redis
   `continuation_shown:<sessão>:<kind>:<eventId>` (TTL 4h); hierarquia
   pula consumidos; novo evento (id novo) re-libera; `clientKindHint` não
   fura; fallback do AI service NÃO consome; só `surface: 'assistente'`
   consome (home não queima o 1x).
3. **Chips contextuais** — pools `new/returning` ganharam chips coerentes;
   `abriu_pedido` trocou "Quanto tempo?" por "Chamar garçom" (ETA já está
   na eyebrow); DEFAULT_SUGGESTIONS do FE viraram comandos que resolvem no
   rule-layer.
4. **Rule-layer sem LLM** — novas regras: ver cardápio (+categorias),
   me indica (+categoria), chamar garçom, cortesias, falar com gerente
   (pede o texto e o turno seguinte cai no followup→tool), conta direta
   ("a conta, por favor", "quero finalizar", "dividir a conta"); guarda de
   frase direta (≤6 palavras, sem negação) protege frases de raciocínio;
   negação tira pagamento do rule-layer; glúten ganhou a mesma guarda.
5. **5.3 Privacidade** — `assistant.staff_message_received` emite só no
   room `customer:<toCustomerId>`; DTO exige `toCustomerId` (validado como
   participante aprovado); history filtra staff msgs por destinatário
   (legado NULL continua visível); Mongo só do destinatário; FE entra no
   room do customer via `useTableSocket(sessionId, cb, customerId)`.
   **5.4 Jest/Supertest** — `npm test --workspace @restaurant/api` (36
   testes); 3 specs ts-node migrados (round17-contract, qr-code.service,
   alerts.service); supertest template em
   `continuation.controller.test.ts`; padrão documentado em
   `apps/api/TESTING.md`.
   **5.5 Host UI** — `host.assist_requested` no `useHostEvents`; inbox
   `/host/notifications` lista alerts `host_assist_table` (kind novo
   `host_assist`) com beep + badge "AGORA" + botão real "Marcar resolvido"
   (POST /alerts/:id/resolve).
6. **Toast "1 error"** — causa-raiz: meta viewport `interactive-widget`
   (Chromium-only) gera `console.error` no WebKit em TODA página; o dev
   overlay do Next 14 conta console.error e mostra o badge vermelho
   "1 error". Removida a chave (teclado já é tratado via visualViewport).
   Bônus: WS fechado em pleno handshake no cleanup dos hooks também logava
   console.error a cada navegação — agora espera connect/erro.
7. **Testes da matriz** — unit/integration:
   `apps/api/src/modules/continuation/continuation.service.test.ts` (10
   casos da matriz) + `continuation.controller.test.ts` (contrato HTTP);
   ai-service: `tests/test_rule_layer_phrases.py` (40 positivas/negativas
   + followup do gerente); e2e: `e2e/specs/assistente-context.spec.ts`
   (eyebrow+consumo+WS+privacidade) — serial.

## Evidências (pequenas)

- `validations.md` — comandos de validação e resultados.
- `regex-manual-validation.md` — frases reais no stack e camada de roteamento.
- `toast-probe-before.txt` / `toast-probe-after.txt` — console da landing
  (iPhone 14/WebKit) antes e depois do fix.
- `landing-eyebrow.png` — print único da landing com eyebrow de status.

## Rodada 2 (2026-06-12, decisões do Caleb sobre os riscos da rodada 1)

1. **Identidade por participante no WS (1-b, aprovada)** — gateway resolve
   o cookie httpOnly `recognition_token` no handshake customer e define o
   customerId da conexão (fallback: payload compartilhado). De quebra
   caçamos uma CORRIDA PRÉ-EXISTENTE: o Socket.IO entrega `join:*` antes
   do handleConnection async terminar — `join:customer` era rejeitado
   lendo dados vazios e `join:session` entrava em room SEM auth (buraco
   de segurança). Fix: `client.data.authReady` aguardado em todos os
   joins + guard de authType. E2E agora cobre o caso forte: gerente
   responde o HOST (não é o último attach) e só ele recebe.
2. **Chips sem cache stale** — chave do pool com fingerprint dos DEFAULTS
   (continuation + smart-suggestions + seeds): mudou código, refletiu na
   hora.
3. **Validação de alergia com LM Studio (qwen3-coder-30b)** — ver
   `allergy-validation.md`: roteamento 100%; 2 fixes reais saíram dela
   (allergens faltando no seed; filtro determinístico de glúten passou a
   IGNORAR o texto do LLM — o modelo recomendou item com glúten declarado).
   Guarda nova `_DIETARY_RESTRICTION_RE`: restrição alimentar nunca cai
   no recommend genérico do rule-layer.
4. **Faixa de status fixa no chat** (`order-status-strip`, sticky, mono
   canon) — pedido do Caleb; ToolCallIndicator e eyebrow por bolha
   continuam.
5. **Sim iOS (parcial)** — geofence (2 prompts + retry) ✓, reconhecimento
   por cookie ("Ana Pereira") ✓, home com os chips contextuais novos ✓
   (`sim-ios-home-chips.png`). Varredura das demais telas interrompida
   por reboot da máquina — cobertas pelo Playwright WebKit (iphone-14).

## Riscos restantes / pendências

- **Vocabulário canônico de alérgenos** (allergy-validation.md): seed
  mistura `leite`/`lactose`, `egg`/`ovo`; filtro determinístico cobre só
  glúten. Estender quando houver enum canônico no cadastro do cardápio.
- **Alergia a crustáceo vs peixe**: LLM recomenda peixe com ressalva
  ("tem peixe, mas não camarão") — decidir se a regra de produto deve ser
  mais conservadora.
- **Eyebrow em modo chat**: bolhas de texto puro sem tool seguem sem
  eyebrow (a faixa fixa nova cobre o status o tempo todo).

