Subagent: customer-entry-flow
Status: PASS (8/8 cenários ✅)

Sim: iPhone 17 Pro Max (3F2238ED-C6EF-4CC1-86BE-DE819B14195F) via idb localhost:10882
Branch: fix/customer-tools-and-continuation
Web-customer: localhost:3003, tenant restaurant_dev, table M01

## Veredito 8/8 PASS

| Cenário | Resultado | Screenshot |
|---|---|---|
| (a) QR pristine → Welcome V20 | ✅ | 01-pristine.png |
| (b) QR expirado (TS-2000000) → erro | ✅ | 02-expired.png |
| (c) HMAC fake → erro | ✅ | 03-hmac-fake.png |
| (d) CPF inválido 12345678900 → inline error, CTA disabled | ✅ | 04-cpf-invalid.png |
| (e) CPF válido ***.***.***-** → Waiting screen V20 | ✅ | 05-after-submit.png |
| (f) Approve SQL → WS event → redirect /assistente em ~1.1s | ✅ | 06-after-approve.png |
| (g) Hard-reload Waiting → sessionStorage preserva | ✅ | 07-after-reload.png |
| (h) Recognize-path CPF 12345678909 → direto Home com greeting RETURNING_CUSTOMER | ✅ | 08-recognize.png |

## V20 canon validado

### WelcomeModal (apps/web-customer/src/components/welcome/WelcomeModal.tsx)
- ✅ grid place-items-center h-[100dvh]
- ✅ eyebrow mono 10/700 tracking-[1.5px] "MESA 01 · BEM-VINDO"
- ✅ title 26/700 "Pra começar, quem é você?"
- ✅ FieldShell border-soft idle / border-ink focused
- ✅ labels "Seu nome" / "Seu CPF" (NÃO "Seu primeiro nome")
- ✅ PillButton filled com seta →
- ✅ helper mono uppercase 10/700
- ✅ SEM card V13 com box-shadow

### ScreenCustomerWaitingApproval
- ✅ grid place-items-center (sem flex-1 spacer)
- ✅ bloco eyebrow→title→sub→Pulse→pill→CTA agrupado central
- ✅ eyebrow "AGUARDANDO HOST DA MESA" com bounce-dot
- ✅ pill "HOST" border-soft + bg-surface

### /assistente landing
- ✅ 2 PillButtons "Chamar garçom" + "Ver cardápio"
- ✅ HomeHero greeting da continuation API (RETURNING_CUSTOMER pra recognize, WAITER_INCOMING após approval)
- ✅ Header "Meu Restaurante" / "Mesa 01" + hamburger menu

## Observações menores (não-bloqueantes)

1. **Eyebrow display "MESA 01"** (não "MESA M01") — display label vem de tables.label do DB ("01"), não de tables.code ("M01"). Não é regressão, é o canon do banco. Mudança seria business logic.

2. **Tela erro QR fail** (02/03) usa copy genérica "Não foi possível iniciar a sessão. Tente novamente." — funcionalmente correto, mas não segue canon V20 (sem eyebrow mono, sem title 26/700). Mais minimalista. **CANDIDATO P3 a futura passada de design.**

3. **CheckMark verde do approved** não capturado em screenshot — redirect 1.1s era mais rápido que intervalo idb. Transição visual confirmada durante execução. Usaria `idb record-video` se necessário.

4. **Reclaim banner "CONTA RECONHECIDA"** (border-soft + bg-surface) não triggado — só dispara em sessão fechada recente reabrindo, fora do escopo a-h.

## DB cross-check

- 12345678909 (Caleb Teste) = approved host na table_sessions 4a19456c-91e3-469a-80b2-185db3950f06 (M01). Recognize → Home direto.
- ***.***.***-** (Caleb novo) = pending join nessa sessão (criado em e, aprovado em f, revertido em g pra teste reload, cleaned up).
- Cleanup do spec (DELETE WHERE name LIKE 'Teste%') não matchou (name='Caleb'). Removido manual: session_participants.id=19f3a501-...

## Notas técnicas (úteis pra outros subs iOS)

- **idb companion TCP localhost:10882** funcionou perfeitamente, sem cursor compartilhado, paralelo OK
- **Coords logical points 440×956** = 1320×2868 px (density 3)
- **Inputs Welcome** em y=439 (nome), y=535 (CPF), y=664 (CTA), x=220 centro
- **xcrun simctl openurl** abre Safari (private tab via menu More → Nova Aba Privada → openurl)
- **sessionStorage limpa** via Safari Nova Aba Privada (idb não tem comando direto pra WebKit storage)
- **HMAC QR**: `crypto.createHmac('sha256', qr_hmac_secret).update('M01:'+ts).digest('hex')` (tables.qr_hmac_secret no DB)
- **idb ui key-sequence**: keycode 42 = backspace (HID)

## Bugs novos descobertos

- 🆕 **P3 (design)**: Tela erro QR fail usa copy/layout minimalista não-canon V20 — candidato a design pass

## V20 canon drifts

- ⚠️ Eyebrow `MESA 01` vs spec audit `MESA M01` — é o canon do DB.label, não drift; documentar como esperado

Tempo: ~17min (124 tool uses, executado via idb stateless)
