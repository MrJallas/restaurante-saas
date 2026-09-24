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

// Nomes explícitos = os de scripts/mongo-init.ts e os que a API garante na
// primeira gravação (chat-history e courtesies). Sem nome, o MongoDB gerava o
// padrão (`expiresAt_1`) e o `npm run mongo:init` batia em IndexOptionsConflict
// (85) sobre o mesmo spec.

// TTL indexes: docs auto-deletam quando expiresAt < now(). Mongo roda o
// sweep a cada 60s (config interna). Per LGPD Art. 6 III (minimizacao).
for (const collection of ['chat_threads', 'chat_messages', 'customer_courtesy_history']) {
  db[collection].createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
}

// Listing rapido pra historico do cliente: tenantId + customerId
// + ordenacao por lastMessageAt desc (campo usado pelo service).
db.chat_threads.createIndex(
  { tenantId: 1, customerId: 1, lastMessageAt: -1 },
  { name: 'tenantId_customerId_lastMessageAt' },
);
db.customer_courtesy_history.createIndex(
  { tenantId: 1, customerId: 1, createdAt: -1 },
  { name: 'tenantId_customerId_createdAt' },
);
db.customer_courtesy_history.createIndex(
  { tenantId: 1, customerId: 1, courtesyId: 1 },
  { name: 'tenantId_customerId_courtesyId_unique', unique: true },
);
db.customer_courtesy_history.createIndex(
  { tenantId: 1, courtesyId: 1 },
  { name: 'tenantId_courtesyId' },
);

// Paginacao das mensagens dentro da thread.
db.chat_messages.createIndex({ threadId: 1, createdAt: 1 }, { name: 'threadId_createdAt' });

// LGPD: apagar tudo de um cliente (deleteMany por customerId) sem varrer a coleção.
db.chat_threads.createIndex({ customerId: 1 }, { name: 'customerId' });
db.chat_messages.createIndex({ customerId: 1 }, { name: 'customerId' });

// Logs operacionais novos ficam no Mongo. `shift_logs` cobre o round 24
// para encerramento de turno de garçom, com lookup por tenant/staff/request.
db.shift_logs.createIndex({ tenantId: 1, timestamp: -1 }, { name: 'tenantId_timestamp' });
db.shift_logs.createIndex({ staffId: 1, timestamp: -1 }, { name: 'staffId_timestamp' });
db.shift_logs.createIndex({ requestId: 1, timestamp: -1 }, { name: 'requestId_timestamp' });
db.shift_logs.createIndex({ eventType: 1, timestamp: -1 }, { name: 'eventType_timestamp' });

// Init log pra container output.
print('mongo-init.js: restaurant_chat TTL + lookup + shift_logs indexes ensured.');

db = db.getSiblingDB('restaurant_security');

// Nomes explícitos = os de SECURITY_EVENT_INDEXES em scripts/mongo-init.ts
// (e os que o E2E de auditoria confere). A API não cria índices nestas
// coleções.
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
