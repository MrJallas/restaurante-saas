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
//   - docs/produto/funcionalidades/historico-de-chat-e-lgpd.md
//   - docs/arquitetura/dados-e-armazenamento.md

// Round 5 (B-NEW-10) fix: era `chat_history`, mas a API conecta em
// `restaurant_chat` (env MONGODB_DB do docker-compose:74). Init rodava
// em DB errado em fresh boot → API escrevia em `restaurant_chat.*` que
// nunca tinha TTL/indexes aplicados. chat_messages crescia infinitamente,
// violando LGPD 30d (B-NEW-15). Field names também alinhados pro padrão
// camelCase usado pelo backend Node (tenantId, customerId, threadId).
db = db.getSiblingDB('restaurant_chat');

// TTL indexes: docs auto-deletam quando expiresAt < now(). Mongo roda o
// sweep a cada 60s (config interna). Per LGPD Art. 6 III (minimizacao).
db.chat_threads.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.chat_messages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.customer_courtesy_history.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Listing rapido pra historico do cliente: tenantId + customerId
// + ordenacao por lastMessageAt desc (campo usado pelo service).
db.chat_threads.createIndex({ tenantId: 1, customerId: 1, lastMessageAt: -1 });
db.customer_courtesy_history.createIndex({ tenantId: 1, customerId: 1, createdAt: -1 });
db.customer_courtesy_history.createIndex(
  { tenantId: 1, customerId: 1, courtesyId: 1 },
  { unique: true },
);
db.customer_courtesy_history.createIndex({ tenantId: 1, courtesyId: 1 });

// Paginacao das mensagens dentro da thread.
db.chat_messages.createIndex({ threadId: 1, createdAt: 1 });

// Logs operacionais novos ficam no Mongo. `shift_logs` cobre o round 24
// para encerramento de turno de garçom, com lookup por tenant/staff/request.
db.shift_logs.createIndex({ tenantId: 1, timestamp: -1 });
db.shift_logs.createIndex({ staffId: 1, timestamp: -1 });
db.shift_logs.createIndex({ requestId: 1, timestamp: -1 });
db.shift_logs.createIndex({ eventType: 1, timestamp: -1 });

// Init log pra container output.
print('mongo-init.js: restaurant_chat TTL + lookup + shift_logs indexes ensured.');

db = db.getSiblingDB('restaurant_security');

// Nomes explícitos = os de SECURITY_EVENT_INDEXES em scripts/mongo-init.ts
// (e os que o E2E de auditoria confere). Sem eles o Mongo gerava o nome padrão
// (`tenantId_1_createdAt_-1`) e o `npm run mongo:init` batia em
// IndexOptionsConflict (85) sobre o mesmo spec. A API não cria índices nestas
// coleções, então nomear aqui não conflita com nada em runtime.
for (const collection of ['qr_scan_events', 'scan_verification_events', 'security_audit_events']) {
  db[collection].createIndex({ tenantId: 1, createdAt: -1 }, { name: 'tenantId_createdAt' });
  db[collection].createIndex(
    { tenantId: 1, tableId: 1, createdAt: -1 },
    { name: 'tenantId_tableId_createdAt' },
  );
  db[collection].createIndex(
    { tenantId: 1, customerId: 1, createdAt: -1 },
    { name: 'tenantId_customerId_createdAt' },
  );
  db[collection].createIndex({ eventType: 1, createdAt: -1 }, { name: 'eventType_createdAt' });
  db[collection].createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
}

print('mongo-init.js: restaurant_security audit indexes ensured.');
