Subagent: manager-equipe
Status: PASS (8/8 rotas funcionam · KPIs perf mock Onda 4 TODO declarado · 3 bugs cosméticos)

Persona: Manager Erica (staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a)
Tenant: restaurant_dev

## Routes Tested · 8/8 ✅

| # | Rota | Render | Dados |
|---|---|---|---|
| 1 | /manager/equipe | OK | **Real** roster (6 staff) |
| 2 | /manager/equipe/em-campo | OK | **Real** (activeOnly=true) |
| 3 | /manager/equipe/sobrecarga | OK | Híbrido (nome real, mesas mock) |
| 4 | /manager/equipe/carga-media | OK | Híbrido (waiters real, números mock) |
| 5 | /manager/equipe/{erica-id} | OK | Perfil real, **KPIs todos mock** |
| 6 | /manager/equipe/novo | OK | Form vazio |
| 7 | /manager/equipe/{erica-id}/editar | OK | Prefill real |
| 8 | /manager/equipe/turnos | OK | **Real** shifts + assignments |

0 crashes, 0 links mortos.

## KPIs reais vs mock em /manager/equipe home

| KPI | Valor | Origem | Status |
|---|---|---|---|
| Em campo | "6/6 · todos OK" | team.filter(is_active).length | **REAL** |
| Sobrecarga | "1 · ↓ realocar" | team.filter(tables>=7) onde tables=Math.max(0, 7-i) | **MOCK** por índice |
| Carga média | "4,5 · DENTRO DA META" | totalTables/inField (mock tables) | **MOCK** |

3 tiles clicáveis com nav real (`ScreenManagerStaff.tsx:227,243,256`).

Por staff card: nome/role/avatar/is_active = reais. tables/callsAvg/sales/shift = derivados client-side por índice (`Math.max(0,7-i)`, `1.2 + (i%4)*0.3`, `1000+i*200`, hardcoded shift). TODO Onda 4 declarado.

## StaffDetail (Erica) — Onda 4 NÃO wired

KPIs hardcoded em JSX (`ScreenManagerStaffDetail.tsx:267-303`):
- Vendas turno: R$ 1.520 (+8% vs média)
- Mesas atendidas: 6 (média 5,2)
- Tempo de resposta: 1m 48s (meta 2 min)
- Chamados escalados: 1 (vs equipe 0,8)

UI marca explicitamente: "Métricas mock · backend de performance vem na Onda 4." + "mock · roadmap".

Onda 4 precisa agregar orders/calls/ratings por staff_id × período.

## Wiring botões — 18/18 ActionPills com onClick

Política Onda 2A documentada (`ScreenManagerStaff.tsx:114-119`): "Antes: 3 de 4 pills sem onClick (silencioso). Agora: toast curto."

- "Realocar mesas" / "Ver mesas" / "Mover mesa" → toast "X · em desenvolvimento (Onda 3 backend)." (não silencioso)
- "Mensagem direta" → abre MContactStaffSheet real + POST /staff-messages (verified)
- /em-campo, /sobrecarga, /carga-media → mistos (Substituir → /turnos real, maioria stub Onda 4)

## CRUD /staff backend (verified via curl)
- POST `/api/restaurant_dev/staff` → 201 com {id,name,role,is_active,...} ✅
- PATCH `/api/restaurant_dev/staff/:id` → 200 com updated_at novo ✅
- DELETE `/api/restaurant_dev/staff/:id` → 200 {deleted:true} ✅

Cleanup: criei e removi staff "AUDIT-R23 Funcionario Teste"; resetei phone de Erica de volta pra null.

## Cross-check Postgres

```sql
SELECT id, name, role, is_active FROM restaurant_dev.staff;
```
6 linhas (Ana Garcom waiter, Bruno Garcom waiter, Carlos Cozinha cook, Diana Cozinha cook, Erica Gerente manager, Renata Host host). Todos is_active=true. Bate com FE.

```sql
SELECT id, label, time_start, time_end FROM restaurant_dev.staff_shifts ORDER BY sort_order;
```
3 linhas (MANHÃ 06-12, TARDE 12-17, NOITE 17-23).

```sql
SELECT * FROM restaurant_dev.staff_shift_assignments;
```
1 linha (Ana → NOITE em 2026-05-11 histórico). /turnos hoje mostra "0 funcionários" em 3 turnos — **dado real, não bug**.

## Bugs novos / Achados (3 cosméticos)

### 🔵 P3 cosmético — Greeting hardcoded "Renata Albuquerque"
- `apps/web-staff/src/components/manager/primitives.tsx:651` — MAppHeader tem `greetingName='Renata Albuquerque'` como default prop
- ScreenManagerStaff não passa override → mesmo logado como Erica, header diz "Boa noite, Renata Albuquerque"
- Comentário no código reconhece gap (`primitives.tsx:17-18`)

### 🔵 P3 cosmético — ROLE_LABEL incompleto no card
- `ScreenManagerStaff.tsx:55-61` ROLE_LABEL só tem waiter/cook/bartender/caixa/recepcao
- Faltam **manager** e **host**
- Erica aparece "manager · 17:00 — 23:00" (role bruto), Renata "host · ..."
- StaffDetail tem map completo (`ScreenManagerStaffDetail.tsx:52-62`) — só home card incompleto

### 🟡 P2 — Heurística tables/overload por índice frágil
- `Math.max(0, 7-i)` por índice alfabético
- Quem está no 1º slot sempre "sobrecarregado" com 7 mesas
- Hoje é Ana Garcom; se cadastrar "Aaron", Aaron rouba overload
- TODO declarado (`ScreenManagerStaff.tsx:130-142`)

## Achado adicional
- Tabela canônica é `staff_shifts` (e `staff_shift_assignments`), **não `shifts`** como sugerido no briefing
- Controlador mapeia `/shifts/*` → `staff_shifts*` (evita colisão com wildcard de StaffController, `manager.ts:466-472`)

## Constraint operacional
- NEXT_PUBLIC_API_URL aponta pra LAN IP `192.168.43.12:3001` (build-time hardcoded — confirmado também pelo sub 14)
- Mitigado durante audit via `page.addInitScript` rewriting fetch URL → localhost:3001
- Concorrência com sub 14/15 no mesmo Chrome causou saltos de rota; screenshots em janelas curtas; wiring confirmado via source code

Tempo: ~21.8min
