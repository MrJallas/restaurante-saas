# Round 4 · Copy audit · "fale com gerente / recepcionista" (C17)

> Run: 2026-05-09 · escopo customer-side + ai-service.
> Trigger: usuário reportou ver warning "fazer login pra falar com gerente"
> em situação que não devia disparar. Texto exato não localizado — auditar
> todos os disparos de copy similar e cruzar com canon V16/V20 + LGPD.

## TL;DR

**Cobertura grep** (regex `peça ao garçom|chama a recepcionista|fale com.*gerente|peça ao gerente|procure.*gerente|fale com.*staff|Chamar recepcionista|Chamar gerente|fazer login`):

- 4 disparos canon esperados — alinhados com spec.
- 0 disparos divergentes nos cenários auditados (T.1 → T.4).
- 1 risco P3 identificado: copy LGPD anônimo "Faça login na próxima visita…"
  pode ser confundido com "fazer login pra falar com gerente" — texto não
  cita gerente, mas o usuário reportou impressão. Recomendação: revisar.

Conclusão: **nenhum disparo divergente** detectado nos 4 cenários T.1-T.4
da Subagent T. O reporte do usuário provavelmente referenciou o copy
LGPD anônimo (`LGPD_REQUIRES_LOGIN`).

---

## Inventário · todos os disparos relacionados

### A · Disparos legítimos (canon)

| # | Arquivo:linha | Trigger | Copy | Spec |
|---|---|---|---|---|
| A.1 | `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx:322` | Late-arrival REJECTED por host | "O host da mesa não autorizou sua entrada. Tente outra mesa ou peça ao garçom." | ✓ Canon `customer-host-model.md` |
| A.2 | `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx:208` | Late-arrival REJECTED, modo identify | "Era engano? Confere se escaneou o QR certo. Ou chama a recepcionista pra te ajudar." | ✓ Canon V16 — recepcionista é hub de identify |
| A.3 | `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx:203` | Late-arrival EXPIRED, modo late-arrival | "{hostName} não viu a notificação. Quer chamar a recepcionista presencialmente?" | ✓ Canon · spec line 261 |
| A.4 | `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx:289` | Late-arrival REJECTED, CTA | "Chamar recepcionista" → abre `CallWaiterSheet` (round 4 §C16) | ✓ Canon V16 |

### B · Disparos sem mention de gerente/recepcionista (spec-canon)

| # | Arquivo:linha | Trigger | Copy | Status |
|---|---|---|---|---|
| B.1 | `apps/web-customer/src/app/[slug]/page.tsx:87` | Customer SEM session abre `/restaurant_dev/` | "Escaneie o QR da mesa" | ✓ Canon |
| B.2 | `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx:535` | QR validation falha | "QR Code invalido. Escaneie novamente o codigo da mesa." | ✓ Canon (typo `invalido` sem acento — pré-existente) |
| B.3 | `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx:547` | Init fallback genérico | "Não foi possível iniciar a sessão. Tente novamente." | ✓ Genérico — não cita gerente |
| B.4 | `apps/web-customer/src/app/[slug]/assistente/page.tsx:611` | LM offline / 5xx (timeouts e validation removidos por checks separados) | "Desculpe, estou com dificuldade no momento. Tente novamente." | ✓ Canon — não cita gerente |
| B.5 | `services/ai-service/main.py:327` | Server-side error from LM | "Desculpe, estou com dificuldade no momento. Posso ajudar em breve." | ✓ Canon — não cita gerente |

### C · Disparos LGPD anônimo (potencial fonte do reporte)

| # | Arquivo:linha | Trigger | Copy | Risco |
|---|---|---|---|---|
| C.1 | `services/ai-service/services/lgpd_messages.py:42-43` | LGPD intent + `customer_id == None` | "Pra apagar suas conversas, preciso te identificar primeiro. Faça login na próxima visita pra ver e gerenciar seu histórico." | **P3** — não cita gerente, mas a frase "Faça login..." pode ter sido o que o usuário viu e parafraseou como "fazer login pra falar com gerente" |

---

## Cruzamento com cenários T.1 → T.4 da Subagent T

| # | Cenário | Copy esperado | Copy proibido | Resultado |
|---|---|---|---|---|
| T.1 | Customer SEM session abre `/restaurant_dev/` | "Escaneie o QR da mesa" | "fale com gerente" | ✅ B.1 confirmado · zero hits gerente |
| T.2 | Customer escaneia QR inválido | "QR Code inválido. Escaneie novamente" | "fale com gerente" | ✅ B.2 confirmado · sem mention gerente |
| T.3 | Late-arrival rejected | "O host não autorizou. Tente outra mesa ou peça ao garçom" | OK (esse é o canon) | ✅ A.1 = canon literal |
| T.4 | LM Studio offline | "Estou com dificuldades, tenta de novo" | "fale com gerente" (não aplicável aqui) | ✅ B.4/B.5 confirmados · sem mention gerente |

**Veredito**: nenhum dos 4 cenários dispara copy proibido. Audit pass.

---

## Findings detalhados

### F1 (P3) · LGPD anônimo · ambiguidade percebida

**Arquivo**: `services/ai-service/services/lgpd_messages.py:42-43`

**Copy atual**:
> "Pra apagar suas conversas, preciso te identificar primeiro. Faça login
> na próxima visita pra ver e gerenciar seu histórico."

**Por que aparece como suspect**: o usuário reportou ver warning sobre
"fazer login pra falar com gerente". Texto exato não localizado em
nenhum lugar do codebase. A combinação (a) "Faça login na próxima
visita" do LGPD anônimo + (b) o LGPD prompt cita "encaminhar solicitação
pra gerência" (LGPD_NOTICE) numa response prévia da mesma sessão pode
ter ficado misturado na percepção do usuário.

**Severidade**: P3 — texto está alinhado com canon LGPD. Sem fix
imediato. Recomendação se quiser eliminar a ambiguidade: trocar "Faça
login" por "Identifique-se via QR".

**Repro hipotético**:
1. Customer sem session faz "quero apagar meus dados" no /assistente
2. LLM dispara `lgpd_data_request`
3. tool retorna `LGPD_REQUIRES_LOGIN` → customer vê "Faça login na
   próxima visita..."

Cliente: "ué, login pra que? quero falar com gerente?"

### F2 (P3) · Typo `invalido` sem acento (pré-existente)

**Arquivo**: `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx:535,537`

**Copy**: "QR Code invalido. Escaneie novamente o codigo da mesa."

**Issue**: `invalido` deveria ser `inválido`, `codigo` deveria ser
`código`. Pré-existente — não regression do round 4. Severidade P3.

---

## Recomendação

- **Nenhum fix obrigatório no round 4** para C17 — todos os 4 cenários
  T.1-T.4 passam.
- **F1 (P3)**: deixar como follow-up, considerar tweak no copy LGPD
  anônimo se vier mais reporte.
- **F2 (P3)**: tag-along em PR de housekeeping.

---

## Cobertura de grep

```bash
$ grep -rEn "peça ao garçom|chama a recepcionista|fale com.*gerente|peça ao gerente|procure.*gerente|fale com.*staff|Chamar recepcionista|Chamar gerente" apps/web-customer/src apps/web-staff/src
apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx:322 → A.1
apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx:208 → A.2
apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx:289 → A.4
```

3 hits. Todos legítimos (canon V16 + V20 §F07).
