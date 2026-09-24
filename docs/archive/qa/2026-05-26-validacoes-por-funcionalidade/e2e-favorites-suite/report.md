# E2E Favorites Suite — QA Report

**Date:** 2026-06-13
**Branch:** feat/favorites-cumulative-e2e
**Tested by:** Claude Code (automated)

## Part A: Cumulative Favorites Feature

### A1: `computeFavoriteItems` in orders.service.ts
- ✅ Aggregates top-5 items by distinct order count, tiebreak by quantity
- ✅ Stored as JSONB in `customer_consumption_summary.favorite_items`
- ✅ Updated on order delivery (status → delivered)

### A2: `rankCandidatesByHistory` extended
- ✅ 4-tier ranking: repeat → favorite (orderCount≥2) → similar category → rest
- ✅ Copy: "Você costuma pedir {item} — gostaria de pedir novamente?"
- ✅ Personalization only on generic path (alreadySpecific===false)

### A3: Backfill migration 058
- ✅ `058_backfill_favorite_items.sql` applied and tracked in `__migrations__`
- ✅ Idempotent (only updates rows where `favorite_items = '[]'::jsonb`)

### A4: Tests
- ✅ 11 recommendation-history tests pass (6 original + 5 new favorites)
- ✅ 47/47 API tests total

---

## Part B: E2E Scenarios (iOS Simulator + Playwright)

### B1: Order Lifecycle — ✅ PASS
- SIM A (iPhone 16 Pro): QR scan → welcome → assistant → "quero ver o cardápio"
- Rule-layer `view_menu` triggered correctly
- Added Picanha (QA Fixture) R$79,00 to "minha comanda"
- Order review → "Enviar para cozinha" → 15s countdown → "Confirmar agora"
- KDS (Playwright): order appeared as "Novo pedido" on Mesa 04
- KDS: "Iniciar preparo" → "Em preparo" → "Marcar pronto" → "Pronto p/ garçom" → "Chamar garçom"
- Customer progress tracker: all 5 steps updated in real-time via WebSocket
  1. Recebido pela cozinha ✅
  2. Em preparo ✅
  3. Pronto para servir ✅
  4. A caminho da mesa ✅
  5. Na sua mesa ✅
- ETA dynamically updated (14-23 min → 5-8 min)
- API PATCH delivered → consumption_summary updated with favorite_items

### B2: Call Waiter — ✅ PASS
- Customer typed "chamar garcom" → rule-layer triggered `call_waiter` tool
- CallWaiterSheet appeared with V20 motives (Trazer cardápio, Fazer pedido, Servir bebida, Pedir a conta)
- Selected "Pedir a conta" → confirmed
- "Aguardando garçom" modal with live timer (7s → 1min 09s)

### B6: AI Recommendation with Favorites — ✅ PASS (KEY FEATURE)
- Customer with favorite_items `[Picanha (QA Fixture), orderCount=3]`
- Typed "me indica algo" → `RECOMMEND_DISH` tool triggered
- Response: **"Você costuma pedir Picanha (QA Fixture) — gostaria de pedir novamente? Também separei estas:"**
- Ranking: 1) Picanha (repeat+favorite), 2) Bruschetta de Tomate (same category), 3) Bolinho de Bacalhau (same category)
- Card carousel rendered with "Pedir" buttons

---

## Part C+D: Regression + Contracts

### Contract Tests
- ✅ 73/73 AI service tests (pytest) — includes chips coverage ≥9/10
- ✅ 47/47 API tests (jest) — includes round17 contracts
- ✅ Migration 058 tracked in `__migrations__`

### Pre-existing Issue (not from our changes)
- ⚠️ `test_tools_dispatch_endpoint_injects_api_client` fails (401 Unauthorized) — test doesn't include X-AI-Service-Key header. Pre-existing since Round 7 auth middleware addition.

### V20 Customer UI
- ✅ No locked files modified (WelcomeModal, CpfInput, CallWaiterSheet, etc.)
- ✅ Visual tokens preserved (text-ink, bg-surface, font-mono eyebrows)

### Allergen Safety
- ✅ `rankCandidatesByHistory` receives candidates already filtered by dietary restrictions
- ✅ Favorite with allergen declared never enters recommendation (by construction)

---

## Environment
- API: node:20-alpine, Docker, NODE_OPTIONS=--max-old-space-size=4096
- Postgres: 16, port 5434
- Redis: 7, port 6379
- MongoDB: 7, port 27017
- iOS Simulator: iPhone 16 Pro (9FE65F17)
- Playwright: Chromium (KDS/staff pages)
- Geofence: -23.561, -46.655, radius 500m
