/**
 * Idempotent MongoDB initializer for the chat history collections.
 *
 * Cria o database `restaurant_chat`, as collections `chat_threads` e
 * `chat_messages`, e os indices documentados em
 * `docs/arquitetura/dados-e-armazenamento.md`. Pode rodar quantas vezes for
 * preciso — `createIndex` e no-op se o indice ja existe com mesmo spec.
 *
 * Uso:
 *   MONGODB_URI=mongodb://localhost:27017 ts-node scripts/mongo-init.ts
 */
import { MongoClient, IndexSpecification, CreateIndexesOptions } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB || 'restaurant_chat';
const SECURITY_DB_NAME = process.env.MONGODB_SECURITY_DB || 'restaurant_security';

interface IndexDef {
  name: string;
  spec: IndexSpecification;
  options?: CreateIndexesOptions;
}

// Round 9 (B-NEW-40): TODOS os indexes em camelCase, alinhados com os
// campos que `chat-history.service.ts` realmente armazena. Antes os
// indexes em snake_case eram inúteis (Mongo schemaless: campos snake_case
// não existem nos docs), e LGPD instant erasure caía em collection scan.
// Agora alinhado com `mongo-init.js` (Docker first-boot).
const THREAD_INDEXES: IndexDef[] = [
  {
    // Listing rapido pra historico do cliente: tenant + customer +
    // ordenacao por lastMessageAt desc.
    name: 'tenantId_customerId_lastMessageAt',
    spec: { tenantId: 1, customerId: 1, lastMessageAt: -1 },
  },
  {
    // LGPD bulk-delete por customer (cross-tenant via service.deleteAllForCustomer).
    name: 'customerId',
    spec: { customerId: 1 },
  },
  {
    // TTL — auto-deleta thread quando expiresAt < now() (per LGPD spec
    // Art. 6 III: minimizacao). Mongo roda o sweep a cada 60s.
    name: 'expiresAt_ttl',
    spec: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
  },
];

const MESSAGE_INDEXES: IndexDef[] = [
  {
    // Paginacao das mensagens dentro da thread (canon mongo-init.js).
    name: 'threadId_createdAt',
    spec: { threadId: 1, createdAt: 1 },
  },
  {
    // LGPD instant erasure: deleteMany({ customerId }) usa este index.
    name: 'customerId',
    spec: { customerId: 1 },
  },
  {
    // TTL — mensagem expira junto com a thread (campo herdado).
    name: 'expiresAt_ttl',
    spec: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
  },
];

const CUSTOMER_COURTESY_HISTORY_INDEXES: IndexDef[] = [
  {
    name: 'tenantId_customerId_createdAt',
    spec: { tenantId: 1, customerId: 1, createdAt: -1 },
  },
  {
    name: 'tenantId_customerId_courtesyId_unique',
    spec: { tenantId: 1, customerId: 1, courtesyId: 1 },
    options: { unique: true },
  },
  {
    name: 'tenantId_courtesyId',
    spec: { tenantId: 1, courtesyId: 1 },
  },
  {
    name: 'expiresAt_ttl',
    spec: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
  },
];

const SECURITY_EVENT_INDEXES: IndexDef[] = [
  {
    name: 'tenantId_createdAt',
    spec: { tenantId: 1, createdAt: -1 },
  },
  {
    name: 'tenantId_tableId_createdAt',
    spec: { tenantId: 1, tableId: 1, createdAt: -1 },
  },
  {
    name: 'tenantId_customerId_createdAt',
    spec: { tenantId: 1, customerId: 1, createdAt: -1 },
  },
  {
    name: 'eventType_createdAt',
    spec: { eventType: 1, createdAt: -1 },
  },
  {
    name: 'expiresAt_ttl',
    spec: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
  },
];

const SHIFT_LOG_INDEXES: IndexDef[] = [
  {
    name: 'tenantId_timestamp',
    spec: { tenantId: 1, timestamp: -1 },
  },
  {
    name: 'staffId_timestamp',
    spec: { staffId: 1, timestamp: -1 },
  },
  {
    name: 'requestId_timestamp',
    spec: { requestId: 1, timestamp: -1 },
  },
  {
    name: 'eventType_timestamp',
    spec: { eventType: 1, timestamp: -1 },
  },
];

// Indexes legacy (snake_case) que escapam pro Mongo se este script já
// rodou em uma versão anterior. Drop em start pra cleanup.
const LEGACY_THREAD_INDEXES = [
  'tenant_customer_lastmsg',
  'tenant_table_session',
  'customer_id',
  'customer_restaurant_created',
  'created_at',
  'expires_at_ttl',
];

const LEGACY_MESSAGE_INDEXES = [
  'thread_created',
  'tenant_customer',
  'tenant_customer_recent',
  'tenant_blocked_recent',
  'created_at',
  'expires_at_ttl',
];

async function ensureCollection(db: ReturnType<MongoClient['db']>, name: string) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name);
    console.log(`  + created collection ${name}`);
  } else {
    console.log(`  = collection ${name} already exists`);
  }
}

async function ensureIndexes(
  db: ReturnType<MongoClient['db']>,
  collection: string,
  indexes: IndexDef[],
) {
  const coll = db.collection(collection);
  for (const ix of indexes) {
    const opts: CreateIndexesOptions = { name: ix.name, ...(ix.options ?? {}) };
    await coll.createIndex(ix.spec, opts);
    console.log(`    -> index ${collection}.${ix.name}`);
  }
}

async function dropLegacyIndexes(
  db: ReturnType<MongoClient['db']>,
  collection: string,
  legacyNames: string[],
) {
  const coll = db.collection(collection);
  for (const name of legacyNames) {
    try {
      await coll.dropIndex(name);
      console.log(`    - dropped legacy index ${collection}.${name}`);
    } catch {
      // Index não existe — OK.
    }
  }
}

async function main() {
  console.log(`Connecting to MongoDB at ${MONGODB_URI}`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    console.log(`Initializing database "${DB_NAME}"`);

    await ensureCollection(db, 'chat_threads');
    await ensureCollection(db, 'chat_messages');
    await ensureCollection(db, 'customer_courtesy_history');
    await ensureCollection(db, 'shift_logs');

    // Round 9 (B-NEW-40): cleanup snake_case legacy indexes before
    // re-creating camelCase. Idempotente — dropIndex falha gracefully
    // se index não existe.
    console.log('Dropping legacy snake_case indexes:');
    await dropLegacyIndexes(db, 'chat_threads', LEGACY_THREAD_INDEXES);
    await dropLegacyIndexes(db, 'chat_messages', LEGACY_MESSAGE_INDEXES);

    console.log('Ensuring indexes on chat_threads:');
    await ensureIndexes(db, 'chat_threads', THREAD_INDEXES);

    console.log('Ensuring indexes on chat_messages:');
    await ensureIndexes(db, 'chat_messages', MESSAGE_INDEXES);

    console.log('Ensuring indexes on customer_courtesy_history:');
    await ensureIndexes(db, 'customer_courtesy_history', CUSTOMER_COURTESY_HISTORY_INDEXES);

    console.log('Ensuring indexes on shift_logs:');
    await ensureIndexes(db, 'shift_logs', SHIFT_LOG_INDEXES);

    const securityDb = client.db(SECURITY_DB_NAME);
    console.log(`Initializing database "${SECURITY_DB_NAME}"`);
    for (const collection of [
      'qr_scan_events',
      'scan_verification_events',
      'security_audit_events',
    ]) {
      await ensureCollection(securityDb, collection);
      await ensureIndexes(securityDb, collection, SECURITY_EVENT_INDEXES);
    }

    console.log('MongoDB init OK.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('MongoDB init failed:', err);
  process.exit(1);
});
