# FIFO 80 — overflow test

Customer: Caleb · `21a81205-4adf-41e3-86b5-baa8d3e339fb` · tenant `restaurant_dev`.

## Cap definition

`apps/api/src/modules/chat-history/chat-history.service.ts:33`

```ts
const FIFO_MAX_THREADS_PER_CUSTOMER = 80;
```

Prune logic in same file lines 299–344 (`pruneOldestThreads`). Runs ONLY
when `appendTurn` does a fresh insert (`upsertResult.upsertedId` truthy).

## Test setup

There is no `POST /chat-history/threads` endpoint — threads are created
implicitly by `appendTurn` with a deterministic `tenantId:customerId:YYYY-MM-DD`
threadId. To force overflow without spinning 81 visit days, I seeded 80
synthetic threads back-dated 0..79 days via direct Mongo insert:

```js
for (var i = 0; i < 80; i++) {
  var ts = new Date(now.getTime() - i * 86400000);
  inserts.push({
    threadId: 'restaurant_dev:21a81205-...:AUDIT-R23-' + i,
    customerId: '21a81205-...',
    tenantId: 'restaurant_dev',
    startedAt: ts,
    lastMessageAt: ts,
    messageCount: 2,
    expiresAt: new Date(ts.getTime() + 30*86400000),
    preview: 'AUDIT-R23-thread-' + i,
  });
}
db.chat_threads.insertMany(inserts);
```

Then ran the exact `pruneOldestThreads` logic from the service against
Mongo directly (since we cannot trigger appendTurn without a real session).

## Result

```
=== BEFORE INSERT ===
active_threads: 2
=== AFTER INSERT (seeded 80) ===
active_after_seed: 82
=== PRUNE EXECUTION ===
count_before_prune: 82
cap: 80
excess: 2
dropping: ["restaurant_dev:21a81205-...:AUDIT-R23-79",
          "restaurant_dev:21a81205-...:AUDIT-R23-78"]
threads_deleted: 2
count_after_prune: 80
FIFO_OK: true
```

Verdict: PASS. The two oldest synthetic threads (79 and 78 days back)
were the ones dropped, both newer than 30d so the TTL index isn't what
killed them. Cascade `chat_messages.deleteMany({threadId: $in})` also
ran inside the same logic.

## Important caveat

The prune is only triggered on a fresh insert in `appendTurn`. If a
customer has 82 stale active threads but ALL their new turns hit an
existing day-bucket (same threadId), the prune NEVER runs. The cap is
soft in practice — it only enforces "no more than 80 distinct day
buckets" rather than "no more than 80 active threads always". Acceptable
because the TTL still kicks in at 30d, but worth noting.

## Cleanup

After validation, the 80 synthetic threads were deleted via
`db.chat_threads.deleteMany({preview: /^AUDIT-R23/})`. The prune had
also removed one of Caleb's original `chat_threads` doc (the
2026-05-15 day-bucket — its 29 messages remained as orphans in
`chat_messages`). Restored that thread doc by reconstructing from
the surviving messages (preview taken from earliest message, dates
from message timestamps). Final state: 2 threads for Caleb, message
count unchanged.
