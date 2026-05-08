// MongoDB init script · runs once on first container boot.
//
// Mounted into the official mongo:7 image at:
//   /docker-entrypoint-initdb.d/mongo-init.js
// Mongo executes this only when the data directory is empty (i.e. first
// boot of a fresh volume). For idempotent re-runs against an existing
// MongoDB instance, use `npm run mongo:init` (TypeScript variant in
// scripts/mongo-init.ts) — it has richer logging and ensure-style logic.
//
// References:
//   - docs/features/chat-history-lgpd.md
//   - packages/database/mongodb/chat-threads.md

db = db.getSiblingDB('chat_history');

// TTL indexes: docs auto-deletam quando expiresAt < now(). Mongo roda o
// sweep a cada 60s (config interna). Per LGPD Art. 6 III (minimizacao).
db.chat_threads.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.chat_messages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Listing rapido pra historico do cliente: customerId + restaurantId
// (multi-tenant cross-restaurant) + ordenacao por createdAt desc.
db.chat_threads.createIndex({ customerId: 1, restaurantId: 1, createdAt: -1 });

// Paginacao das mensagens dentro da thread.
db.chat_messages.createIndex({ threadId: 1, createdAt: 1 });

// Init log pra container output.
print('mongo-init.js: chat_history TTL + lookup indexes ensured.');
