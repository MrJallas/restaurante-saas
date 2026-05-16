# LGPD erasure — dual-side delete confirmation

Brief: "Erasure real apaga DOIS lados (Mongo `chat_messages` + Postgres
`assistant_messages`)."

Status: **FAIL** on both halves.

## Half 1 — tool dispatch never reaches the API

Tool `services/ai-service/services/tools/lgpd_data_request.py:47`:

```py
res = ctx.api_client("POST", "/customer/lgpd-requests", { ... })
```

Real route registered in
`apps/api/src/modules/lgpd/lgpd.controller.ts:61`:

```ts
@Controller(':slug/lgpd-requests')
@Post()
@UseGuards(SessionGuard)
```

Live dispatch (against running stack, customerId Caleb):

```bash
$ docker exec restaurant-ai python3 -c "
  import urllib.request, json
  body = json.dumps({
    'name':'lgpd_data_request',
    'args':{'type':'erasure','chipLabel':'Sim, quero excluir'},
    'tenantId':'restaurant_dev',
    'customerId':'21a81205-4adf-41e3-86b5-baa8d3e339fb',
    'isStaff':False
  }).encode()
  req = urllib.request.Request('http://localhost:8000/tools/dispatch',
    headers={'X-AI-Service-Key':'dev-ai-service-key-change-in-prod',
             'Content-Type':'application/json'},
    data=body, method='POST')
  print(urllib.request.urlopen(req,timeout=15).read().decode())
"

{"name":"lgpd_data_request","silent":true,"requiresText":false,"router":false,
 "result":{"message":null,"chips":[],"silent":false,"actionPayload":null,
           "routerTarget":null,
           "error":{"code":"api_error",
                    "message":"POST /customer/lgpd-requests → 404"}}}
```

Postgres `lgpd_requests` count for Caleb stays at 0:

```sql
SELECT count(*) FROM restaurant_dev.lgpd_requests
 WHERE customer_id='21a81205-4adf-41e3-86b5-baa8d3e339fb';
 -- 0
```

Even with the path fixed, `_api_client` sends no `recognition_token`
cookie, so `LgpdController.resolveCallerCustomerId` throws 401 (unless
the AI service is granted a different auth path or `customerId` can be
trusted from the body for AI-service callers).

## Half 2 — Postgres erasure is not implemented

`apps/api/src/modules/lgpd/lgpd.service.ts:59-74`:

```ts
if (input.kind === 'erasure' && input.customerId) {
  const result = await this.chatHistory.deleteAllForCustomer(input.customerId);
  // ... only updates lgpd_requests.status
}
```

`ChatHistoryService.deleteAllForCustomer` (lines 272-296) wipes Mongo
`chat_messages` and soft-marks `chat_threads`. **No Postgres delete.**

Grep across `apps/api/src` for `DELETE FROM assistant_messages` /
`deleteAssistantMessages` / similar: **zero matches**.

`restaurant_dev.assistant_messages` columns include `user_message` and
`assistant_response` (both TEXT) which carry the full conversation. After
an "erasure" today, that text survives forever (until customer drop or
manual purge). 19 rows exist for Caleb right now:

```
SELECT count(*) FROM restaurant_dev.assistant_messages
 WHERE customer_id='21a81205-4adf-41e3-86b5-baa8d3e339fb';
 -- 19
```

## Recommendation

1. Fix tool path: `POST /{ctx.tenant_id}/lgpd-requests` and use `kind` not
   `type` in the body (controller DTO uses `kind`).
2. Add `customerId` body field support gated by `X-AI-Service-Key` so the
   AI-service dispatcher can act without a customer cookie (mirror of the
   pattern already in place for some staff endpoints).
3. Extend `LgpdService.createRequest` for `kind='erasure'` to also delete
   `assistant_messages WHERE customer_id = $1` and, if appropriate, scrub
   `feedbacks`, `complaints.body`, etc. The LGPD doc claims a 30d window
   for chat history — but PG `assistant_messages` has no TTL today, so
   without explicit erasure it never goes away.

These three fixes need to ship together; partial fixes leave a hole.
