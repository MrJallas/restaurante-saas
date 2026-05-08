/**
 * Idempotent MongoDB initializer for the chat history collections.
 *
 * Cria o database `restaurant_chat`, as collections `chat_threads` e
 * `chat_messages`, e os indices documentados em
 * `packages/database/mongodb/chat-threads.md`. Pode rodar quantas vezes for
 * preciso — `createIndex` e no-op se o indice ja existe com mesmo spec.
 *
 * Uso:
 *   MONGODB_URI=mongodb://localhost:27017 ts-node scripts/mongo-init.ts
 */
import { MongoClient, IndexSpecification, CreateIndexesOptions } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB || 'restaurant_chat';

interface IndexDef {
  name: string;
  spec: IndexSpecification;
  options?: CreateIndexesOptions;
}

const THREAD_INDEXES: IndexDef[] = [
  {
    name: 'tenant_customer_lastmsg',
    spec: { tenant_id: 1, customer_id: 1, last_message_at: -1 },
  },
  {
    name: 'tenant_table_session',
    spec: { tenant_id: 1, table_session_id: 1 },
  },
  {
    // LGPD bulk-delete por customer (cross-tenant fallback).
    name: 'customer_id',
    spec: { customer_id: 1 },
  },
  {
    name: 'created_at',
    spec: { created_at: 1 },
  },
];

const MESSAGE_INDEXES: IndexDef[] = [
  {
    name: 'thread_created',
    spec: { thread_id: 1, created_at: 1 },
  },
  {
    // CRITICAL: LGPD instant erasure relies on this index.
    name: 'tenant_customer',
    spec: { tenant_id: 1, customer_id: 1 },
  },
  {
    name: 'tenant_customer_recent',
    spec: { tenant_id: 1, customer_id: 1, created_at: -1 },
  },
  {
    name: 'tenant_blocked_recent',
    spec: { tenant_id: 1, was_blocked: 1, created_at: -1 },
  },
  {
    name: 'created_at',
    spec: { created_at: 1 },
  },
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

async function main() {
  console.log(`Connecting to MongoDB at ${MONGODB_URI}`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    console.log(`Initializing database "${DB_NAME}"`);

    await ensureCollection(db, 'chat_threads');
    await ensureCollection(db, 'chat_messages');

    console.log('Ensuring indexes on chat_threads:');
    await ensureIndexes(db, 'chat_threads', THREAD_INDEXES);

    console.log('Ensuring indexes on chat_messages:');
    await ensureIndexes(db, 'chat_messages', MESSAGE_INDEXES);

    console.log('MongoDB init OK.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('MongoDB init failed:', err);
  process.exit(1);
});
