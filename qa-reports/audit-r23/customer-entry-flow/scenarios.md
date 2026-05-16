# Customer Entry Flow — Scenarios (a–h)

Executed on iPhone 17 Pro Max simulator (UDID `3F2238ED-C6EF-4CC1-86BE-DE819B14195F`), Safari + WKWebView, web-customer at `http://localhost:3003`, tenant `restaurant_dev`, table `M01`, branch `fix/customer-tools-and-continuation`.

| ID | Scenario | Result | Screenshot |
|---|---|---|---|
| a | QR pristine (HMAC valid + TS recente) → Welcome V20 | PASS | `screenshots/01-pristine.png` |
| b | QR expirado (TS − 2 000 000 ms) → erro "Não foi possível iniciar a sessão" + Tentar novamente | PASS (copy generic, não literal "QR Code inválido") | `screenshots/02-expired.png` |
| c | QR HMAC fake (`hmac=fake1234`) → mesmo erro | PASS | `screenshots/03-hmac-fake.png` |
| d | CPF inválido (`12345678900`) → inline error vermelho "CPF INVÁLIDO. CONFIRA OS NÚMEROS." + CTA desabilitado, não navega | PASS | `screenshots/04-cpf-invalid.png` |
| e | CPF válido novo `***.***.***-**` (Caleb) → POST `/customer/welcome` → Waiting screen V20 "Esperando aprovação" (host Caleb Teste) | PASS | `screenshots/05-after-submit.png` |
| f | Approve via SQL (`UPDATE session_participants SET status='approved'`) → WS event → CheckMark verde "Aprovado!" → redireciona a Home/Assistente em ~1,1 s | PASS | `screenshots/06-after-approve.png` |
| g | Revert participant para pending + hard-reload (Safari reload) → re-rendera Waiting (sessionStorage preserva customer, API retorna pending) | PASS | `screenshots/07-after-reload.png` |
| h | Private tab fresh + CPF `12345678909` (Caleb Teste, host existente) → recognize-path → DIRETO Home com greeting "ASSISTENTE · DE VOLTA / Bem-vindo de volta, Caleb Teste" | PASS | `screenshots/08-recognize.png` |

## Observações

- **(a)** Eyebrow renderiza como `MESA 01 · BEM-VINDO` (table label vem do DB; o code interno é `M01` mas o display label é `01`). Spec audit chamava `MESA M01` no canon — o atual visualmente está `MESA 01`. Continua dentro do canon V20 (mono 10/700 tracking 1,5px), só diferença de label resolvido por table_label vs code.
- **(b)/(c)** Mesma mensagem para QR expirado e HMAC fake — a API consolida ambos em "session_start_failed". Funcionalmente seguro (bloqueia), copy pode ser mais específica.
- **(d)** Helper mono uppercase ("SÓ PRA MESA SABER QUEM É · CPF NOS AJUDA…") continua presente e abaixo aparece a mensagem inline vermelha mono caps "CPF INVÁLIDO. CONFIRA OS NÚMEROS." — bom feedback hierárquico.
- **(e)** Waiting screen exibe `AGUARDANDO HOST DA MESA · Xs` com contador (não capturado no screenshot porque expiresAt veio null → fallback sem countdown).
- **(f)** Após approve via SQL, o WS event `late_arrival.approved` flippou o state para `approved` no client; o setTimeout 1,1s já tinha disparado quando tirei a screenshot, então capturei direto a tela `/assistente` (home). Não vi o frame intermediário do CheckMark verde.
- **(g)** Após hard-reload, sessionStorage manteve `session:bundle` → `useSession` re-hidrata customer; `/mesa/M01` page detecta participant pending via API → renderiza `ScreenCustomerWaitingApproval` direto, sem flash de Welcome.
- **(h)** Recognize-path retornou `isReturning=true`, customer host está approved → direto a `/assistente`. Greeting `RETURNING_CUSTOMER` da continuation API aparece como primeiro bubble. Como Caleb (`***.***.***-**`) ainda estava pending nesta sessão, a UI host também mostrou o banner "1 PESSOA QUER ENTRAR NA MESA / Caleb / Aprovar/Rejeitar" — o que comprova que esta sessão `4a19456c-91e3-469a-80b2-185db3950f06` é hospedada por Caleb Teste.
