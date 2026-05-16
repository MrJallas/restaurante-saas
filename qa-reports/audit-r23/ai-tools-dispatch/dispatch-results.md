# AI Tools Dispatch · Results (39 tools)

**Tenant**: `restaurant_dev` · **CustomerId**: `21a81205-4adf-41e3-86b5-baa8d3e339fb` (Caleb)
**Endpoint**: `POST http://localhost:8000/tools/dispatch` (X-AI-Service-Key auth, server-side only)

**Summary**: 16 OK · 23 WARN · 0 FAIL · total=39

Legend: ✅ ok · ⚠️ validation/missing-context/api 404 expected for empty args · ❌ unexpected failure
Shape canon: `result = { message, chips[], silent, actionPayload, routerTarget, error }`

| # | Tool | Aud | reqText | Silent | Router | Status | Chips | RT | Shape | Note |
|---|------|-----|---------|--------|--------|--------|-------|----|----|------|
| 1 | `view_menu` | C | N | N | Y | ✅ | 4 | ScreenCustomerMenu | ✅ |  |
| 2 | `search_dish` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_query |
| 3 | `check_allergens` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_items |
| 4 | `compare_dishes` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: need_two_items |
| 5 | `recommend_dish` | C | N | N | N | ✅ | 3 | — | ✅ |  |
| 6 | `add_to_order` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_item |
| 7 | `view_order` | C | N | N | Y | ✅ | 3 | ScreenCustomerOrderReview | ✅ |  |
| 8 | `confirm_order` | C | N | N | N | ✅ | 3 | — | ✅ |  |
| 9 | `split_bill` | C | N | N | Y | ✅ | 3 | ScreenCustomerSplitBill | ✅ |  |
| 10 | `pay_individual` | C | N | N | Y | ✅ | 3 | ScreenCustomerPayIndividual | ✅ |  |
| 11 | `pay_full` | C | N | N | Y | ✅ | 3 | ScreenCustomerPayFull | ✅ |  |
| 12 | `open_payment_screen` | C | N | N | Y | ✅ | 3 | ScreenCustomerPayment | ✅ |  |
| 13 | `call_waiter` | C | N | N | N | ⚠️ | 0 | — | ✅ | api_error: POST /waiter-calls → 401 |
| 14 | `send_message_to_manager` | C | Y | N | N | ✅ | 3 | — | ✅ |  |
| 15 | `send_complaint` | C | N | N | Y | ✅ | 2 | ScreenCustomerComplaintCompose | ✅ |  |
| 16 | `request_table_merge` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_target |
| 17 | `delete_chat` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_thread_id |
| 18 | `delete_all_chats` | C | N | N | N | ⚠️ | 0 | — | ✅ | api 404: DELETE /restaurant_dev/chat-history?customerId=21a81205-4adf |
| 19 | `lgpd_data_request` | C | N | Y | N | ⚠️ | 0 | — | ✅ | api 404: POST /customer/lgpd-requests → 404 |
| 20 | `show_lgpd_notice` | C | N | N | N | ✅ | 2 | — | ✅ |  |
| 21 | `view_courtesy` | C | N | N | N | ✅ | 2 | — | ✅ |  |
| 22 | `ask_about_restaurant` | C | N | Y | N | ✅ | 3 | — | ✅ |  |
| 23 | `rate_visit` | C | N | N | Y | ✅ | 0 | ScreenCustomerOrderRating | ✅ |  |
| 24 | `request_check` | C | N | N | N | ⚠️ | 0 | — | ✅ | api 404: POST /customer/check-requests → 404 |
| 25 | `late_arrival_request` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_target_table |
| 26 | `change_order` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: bad_args |
| 27 | `cancel_order` | C | N | N | N | ✅ | 3 | — | ✅ |  |
| 28 | `remove_from_cart` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_item |
| 29 | `view_chat_history` | C | N | N | Y | ✅ | 3 | ScreenCustomerChatHistory | ✅ |  |
| 30 | `explain_dish` | C | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_item |
| 31 | `staff_broadcast` | S | Y | N | N | ⚠️ | 0 | — | ✅ | api 404: POST /staff/broadcasts → 404 |
| 32 | `staff_assign_call` | S | N | Y | N | ⚠️ | 0 | — | ✅ | validation: bad_args |
| 33 | `staff_resolve_call` | S | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_call_id |
| 34 | `staff_pause_zone` | S | Y | N | N | ⚠️ | 0 | — | ✅ | ctx: missing_waiter (needs sessionFlags) |
| 35 | `staff_unpause_zone` | S | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_pause_id |
| 36 | `staff_mark_vip` | S | N | N | N | ⚠️ | 0 | — | ✅ | auth: forbidden |
| 37 | `staff_unmark_vip` | S | N | N | N | ⚠️ | 0 | — | ✅ | auth: forbidden |
| 38 | `staff_respond_complaint` | S | Y | N | N | ⚠️ | 0 | — | ✅ | api 404: POST /staff/complaints/00000000-0000-0000-0000-000000000000/ |
| 39 | `staff_resolve_complaint` | S | N | N | N | ⚠️ | 0 | — | ✅ | validation: missing_complaint_id |

## Shape Canon Compliance
All 39 tools return canon response shape (`message | chips | silent | actionPayload | routerTarget | error`).

## requiresText contract
Tools flagged `requiresText=true` reject empty `text` with HTTP 400 `ToolValidationError`. Retried with non-empty text:
  - `send_message_to_manager` → ✅ OK with text (canon shape, chips emitted)
  - `staff_broadcast` → ⚠️ canon shape OK; runtime error `api_error` (depends on apps/api endpoints / waiter session)
  - `staff_pause_zone` → ⚠️ canon shape OK; runtime error `missing_waiter` (depends on apps/api endpoints / waiter session)
  - `staff_respond_complaint` → ⚠️ canon shape OK; runtime error `api_error` (depends on apps/api endpoints / waiter session)

## Known Bugs (do not reopen)
Per task brief: `add_to_order / view_order / remove_from_cart / change_order / cancel_order` → 404 em `/customer/cart/items`.

  - `add_to_order` → validation: missing_item
  - `cancel_order` → 
  - `change_order` → validation: bad_args
  - `remove_from_cart` → validation: missing_item
  - `view_order` → 

## Customer tools (audience=customer) — 30 total
  16 OK · 14 WARN · 0 FAIL

## Staff tools (audience=staff) — 9 total
  0 OK · 9 WARN · 0 FAIL
