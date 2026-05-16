Subagent: ai-tools-dispatch
Status: PASS (0 FAIL, 23 WARN esperados via validation gate / apps/api endpoints TBD)

CustomerId: 21a81205-4adf-41e3-86b5-baa8d3e339fb (Caleb / CPF 12345678909)
Endpoint: POST http://localhost:8000/tools/dispatch (server-side via docker exec restaurant-ai)
Branch: fix/customer-tools-and-continuation

Registry sanity:
- GET /tools → count=39 ✅
- 30 customer + 9 staff (brief dizia 7; registry tem 2 extras: staff_unpause_zone, staff_unmark_vip)
- staff_tools_requiring_text: ['staff_broadcast', 'staff_pause_zone', 'staff_respond_complaint']
- requiresText global: 4 tools (3 staff + send_message_to_manager)

Dispatch outcomes (empty args):
- ✅ 16 OK · ⚠️ 23 WARN · ❌ 0 FAIL
- Customer audience: 16 OK · 14 WARN · 0 FAIL
- Staff audience: 0 OK · 9 WARN · 0 FAIL (todos esperados — args missing OU apps/api endpoint pendente)
- Shape canon 39/39 ✅ — todos retornam `result = { message, chips[], silent, actionPayload, routerTarget, error }`

WARN buckets:
- validation gate funcionando (rejeita arg ausente): search_dish, check_allergens, compare_dishes, request_table_merge, delete_chat, late_arrival_request, explain_dish, staff_resolve_call/complaint, add_to_order, change_order, remove_from_cart
- api_error 404 (endpoint TBD em apps/api): call_waiter, delete_all_chats, lgpd_data_request, request_check, staff_broadcast, staff_respond_complaint
- auth/ctx: staff_mark_vip, staff_unmark_vip → forbidden; staff_pause_zone → missing_waiter

Bugs novos descobertos:
- 🆕 `call_waiter` recebe api_error 404 em apps/api — endpoint missing SEPARADO do bug conhecido `/customer/cart/items` (worth flagging — não está no PR atual)
- 🆕 `staff_broadcast` → POST `/staff/broadcasts` 404 (apps/api endpoint missing)
- 🆕 `staff_respond_complaint` → POST `/staff/complaints/{id}/messages` 404 (apps/api endpoint missing)
- 🆕 `delete_all_chats`, `lgpd_data_request`, `request_check` → 404 (endpoints TBD)

Bugs conhecidos confirmados:
- add_to_order/view_order/remove_from_cart/change_order/cancel_order → 404 /customer/cart/items (já tracking PR fix/customer-tools-and-continuation; só aparece com args válidos pq validation gate intercepta empty)

requiresText contract (4 tools com text non-empty):
- send_message_to_manager → ✅ OK (canon shape, chips, actionPayload.messageSent=true)
- staff_broadcast → canon shape OK, runtime 404
- staff_pause_zone → canon shape OK, runtime missing_waiter
- staff_respond_complaint → canon shape OK, runtime 404

Tests: docker exec restaurant-ai pytest tests/test_tool_paths.py -v → 14/14 passed in 0.03s ✅

Artifacts:
- tools-registry.json — dump cru GET /tools
- dispatch-results.json — raw 39 dispatches
- dispatch-results-requirestext.json — retry dos 4 requiresText
- dispatch-results.md — tabela ✅/⚠️/❌ + shape canon
- staff-tools-7.md — request/response dos 7 staff
- test-tool-paths.log — pytest output (14/14)

Tempo: ~3.7min
