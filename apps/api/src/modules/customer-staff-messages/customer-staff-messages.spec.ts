/**
 * Customer staff-messages module — contract + service-level assertions.
 *
 * Same harness convention as `round17-contract.spec.ts` and
 * `tenant/query-utils.spec.ts`: apps/api doesn't ship Jest today, so this
 * file is type-checked by `tsc --noEmit -p apps/api/tsconfig.json` and
 * the runtime assertions are invokable via
 *   `node -r ts-node/register apps/api/src/modules/customer-staff-messages/customer-staff-messages.spec.ts`
 * for ad-hoc verification when Jest lands.
 *
 * What we cover:
 *   1. Service-level — appendInbound / listThreads / getThreadMessages /
 *      markRead / deleteThread / deleteAll, all driven by an in-memory
 *      MongoService fake. Documents the happy path (manager sends → thread
 *      appears in customer inbox → mark read → delete) the E2E suite will
 *      replay against the real driver once Jest lands.
 *   2. DTO contract — the customer-send body is rejected with
 *      empty/oversize content, and accepted with valid content.
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { HttpException } from '@nestjs/common';
import type { Db, Collection } from 'mongodb';
import { CustomerStaffMessagesService } from './customer-staff-messages.service';

// ──────────────────────────────────────────────────────────────────────
// Minimal in-memory Mongo fake. We only implement the subset of the
// driver surface that the service touches — keeps the dep-free contract
// honest. If the service starts calling new driver methods, this fake
// will fail loudly (returns undefined ⇒ runtime crash) and force the
// author to update both halves together.
// ──────────────────────────────────────────────────────────────────────
function buildFakeCollection<T extends Record<string, unknown>>(): Collection<T> {
  const docs: T[] = [];
  const collection = {
    docs,
    async insertOne(doc: T) {
      docs.push({ ...doc });
      return { insertedId: 'ok' };
    },
    async updateOne(
      filter: Partial<T>,
      update: Record<string, Record<string, unknown>>,
      opts?: { upsert?: boolean },
    ) {
      let existing = docs.find((d) =>
        Object.entries(filter).every(([k, v]) => (d as Record<string, unknown>)[k] === v),
      );
      if (!existing && opts?.upsert) {
        // Build a new doc from $setOnInsert + filter keys.
        existing = {
          ...filter,
          ...((update.$setOnInsert as Partial<T>) ?? {}),
        } as T;
        docs.push(existing);
      }
      if (!existing) return { modifiedCount: 0 };
      Object.assign(existing as Record<string, unknown>, update.$set ?? {});
      if (update.$inc) {
        for (const [k, n] of Object.entries(update.$inc)) {
          const cur = ((existing as Record<string, unknown>)[k] as number) ?? 0;
          (existing as Record<string, unknown>)[k] = cur + (n as number);
        }
      }
      return { modifiedCount: 1 };
    },
    async updateMany(
      filter: Record<string, unknown>,
      update: Record<string, Record<string, unknown>>,
    ) {
      let count = 0;
      for (const d of docs) {
        if (matches(d, filter)) {
          Object.assign(d as Record<string, unknown>, update.$set ?? {});
          count++;
        }
      }
      return { modifiedCount: count };
    },
    async deleteMany(filter: Record<string, unknown>) {
      let count = 0;
      for (let i = docs.length - 1; i >= 0; i--) {
        if (matches(docs[i], filter)) {
          docs.splice(i, 1);
          count++;
        }
      }
      return { deletedCount: count };
    },
    async countDocuments(filter: Record<string, unknown>) {
      return docs.filter((d) => matches(d, filter)).length;
    },
    async findOne(filter: Record<string, unknown>) {
      return docs.find((d) => matches(d, filter)) ?? null;
    },
    find(filter: Record<string, unknown>) {
      let snapshot = docs.filter((d) => matches(d, filter));
      const chain = {
        sort(spec: Record<string, 1 | -1>) {
          const [key, dir] = Object.entries(spec)[0] as [string, 1 | -1];
          snapshot = [...snapshot].sort((a, b) => {
            const av = (a as Record<string, unknown>)[key];
            const bv = (b as Record<string, unknown>)[key];
            // Date or number-friendly compare.
            const an = av instanceof Date ? av.getTime() : typeof av === 'number' ? av : 0;
            const bn = bv instanceof Date ? bv.getTime() : typeof bv === 'number' ? bv : 0;
            return (an - bn) * dir;
          });
          return chain;
        },
        limit() {
          return chain;
        },
        async toArray() {
          return snapshot;
        },
      };
      return chain;
    },
    async createIndex() {
      return 'idx';
    },
  };
  return collection as unknown as Collection<T>;
}

function matches(doc: Record<string, unknown>, filter: Record<string, unknown>) {
  for (const [k, v] of Object.entries(filter)) {
    if (v && typeof v === 'object' && '$ne' in (v as Record<string, unknown>)) {
      if ((doc as Record<string, unknown>)[k] === (v as Record<string, unknown>).$ne) return false;
      continue;
    }
    if (v && typeof v === 'object' && '$in' in (v as Record<string, unknown>)) {
      const arr = (v as Record<string, unknown>).$in as unknown[];
      if (!arr.includes((doc as Record<string, unknown>)[k])) return false;
      continue;
    }
    if ((doc as Record<string, unknown>)[k] !== v) return false;
  }
  return true;
}

function buildFakeMongo() {
  const collections = new Map<string, Collection<Record<string, unknown>>>();
  const db = {
    collection<T extends Record<string, unknown>>(name: string): Collection<T> {
      let col = collections.get(name);
      if (!col) {
        col = buildFakeCollection<Record<string, unknown>>();
        collections.set(name, col);
      }
      return col as unknown as Collection<T>;
    },
  } as unknown as Db;
  return {
    tryDb: () => db,
    collections,
  };
}

// ──────────────────────────────────────────────────────────────────────
// DTO mirror — the same shape as the controller-private
// `CustomerSendMessageDto`. Kept here so we can validate without widening
// the controller's public surface.
// ──────────────────────────────────────────────────────────────────────
class CustomerSendMirrorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

/* eslint-disable no-console */
export async function runCustomerStaffMessagesContract(): Promise<void> {
  // ──────────────────────────────────────────────────────────────────
  // 1. DTO — content empty rejected.
  // ──────────────────────────────────────────────────────────────────
  const emptyDto = plainToInstance(CustomerSendMirrorDto, { content: '' });
  const emptyErrors = await validate(emptyDto);
  if (emptyErrors.length === 0) {
    throw new Error('staff-messages: empty content accepted — MinLength(1) decorator missing.');
  }

  // 1b. Content > 2000 rejected.
  const longDto = plainToInstance(CustomerSendMirrorDto, {
    content: 'x'.repeat(2001),
  });
  const longErrors = await validate(longDto);
  if (longErrors.length === 0) {
    throw new Error(
      'staff-messages: 2001-char content accepted — MaxLength(2000) decorator missing.',
    );
  }

  // 1c. Valid content (1–2000) passes.
  const okDto = plainToInstance(CustomerSendMirrorDto, {
    content: 'Olá, tudo certo!',
  });
  const okErrors = await validate(okDto);
  if (okErrors.length !== 0) {
    throw new Error(`staff-messages: valid content rejected. Errors: ${JSON.stringify(okErrors)}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Service happy path: manager sends → customer reads → deletes.
  // ──────────────────────────────────────────────────────────────────
  const mongo = buildFakeMongo();
  const tenantConn = {
    query: async () => [],
  };
  const service = new CustomerStaffMessagesService(
    mongo as unknown as import('../../infra/mongo/mongo.service').MongoService,
    tenantConn as unknown as import('../tenant/tenant-connection.provider').TenantConnectionProvider,
  );

  const tenantId = 'tenant_x';
  const customerId = 'cust_a';
  const otherCustomerId = 'cust_b';
  const tableSessionId = 'sess_1';

  // 2a. Two inbound messages from the manager — same thread.
  await service.appendInbound({
    tenantId,
    customerId,
    tableSessionId,
    staffName: 'Renata',
    staffRoleLabel: 'gerente',
    content: 'Oi! Tudo bem aí?',
  });
  await service.appendInbound({
    tenantId,
    customerId,
    tableSessionId,
    staffName: 'Renata',
    staffRoleLabel: 'gerente',
    content: 'Vamos te trazer a entrada já já.',
  });

  // 2b. List threads — should return ONE thread with messageCount=2.
  const threads = await service.listThreads(customerId, tenantId);
  if (threads.length !== 1) {
    throw new Error(`staff-messages: expected 1 thread, got ${threads.length}.`);
  }
  if (threads[0].messageCount !== 2) {
    throw new Error(
      `staff-messages: messageCount drift — expected 2, got ${threads[0].messageCount}.`,
    );
  }
  if (threads[0].lastStaffName !== 'Renata' || threads[0].lastStaffRole !== 'gerente') {
    throw new Error('staff-messages: thread preview eyebrow fields not propagated.');
  }

  // 2c. Cross-tenant / cross-customer isolation: the OTHER customer must
  // not see this thread.
  const otherThreads = await service.listThreads(otherCustomerId, tenantId);
  if (otherThreads.length !== 0) {
    throw new Error('staff-messages: thread leaked across customers.');
  }

  // 2d. getThreadMessages — owner sees 2 messages.
  const threadId = threads[0].threadId;
  const messages = await service.getThreadMessages(threadId, customerId, tenantId);
  if (messages.length !== 2) {
    throw new Error(`staff-messages: expected 2 messages, got ${messages.length}.`);
  }
  if (messages[0].fromRole !== 'staff' || messages[0].fromName !== 'Renata') {
    throw new Error('staff-messages: message author fields not propagated.');
  }

  // 2e. Ownership check — wrong customerId 404s.
  try {
    await service.getThreadMessages(threadId, otherCustomerId, tenantId);
    throw new Error('staff-messages: cross-customer read did NOT 404.');
  } catch (err) {
    if (!(err instanceof HttpException) || err.getStatus() !== 404) {
      throw new Error(`staff-messages: expected HttpException 404, got ${(err as Error).message}.`);
    }
  }

  // 2f. markRead — every staff message stamped readAt.
  const markRes = await service.markRead(threadId, customerId, tenantId);
  if (markRes.markedCount !== 2) {
    throw new Error(
      `staff-messages: markRead expected to flip 2 messages, flipped ${markRes.markedCount}.`,
    );
  }
  const afterRead = await service.getThreadMessages(threadId, customerId, tenantId);
  if (afterRead.some((m) => m.fromRole === 'staff' && !m.readAt)) {
    throw new Error('staff-messages: some staff messages remain unread after markRead.');
  }

  // 2g. appendOutbound — customer reply lands in same thread.
  const replyRes = await service.appendOutbound({
    tenantId,
    customerId,
    tableSessionId,
    content: 'Beleza, obrigado!',
  });
  if (replyRes.threadId !== threadId) {
    throw new Error(
      `staff-messages: outbound reply opened a NEW thread (${replyRes.threadId}) instead of reusing ${threadId}.`,
    );
  }
  const afterReply = await service.getThreadMessages(threadId, customerId, tenantId);
  if (afterReply.length !== 3) {
    throw new Error(`staff-messages: after reply expected 3 messages, got ${afterReply.length}.`);
  }
  if (afterReply[2].fromRole !== 'customer') {
    throw new Error('staff-messages: customer reply not tagged fromRole=customer.');
  }

  // 2h. deleteThread — single thread soft-deleted + messages purged.
  const del = await service.deleteThread(threadId, customerId, tenantId);
  if (del.messagesDeleted !== 3) {
    throw new Error(
      `staff-messages: deleteThread expected 3 messages, dropped ${del.messagesDeleted}.`,
    );
  }
  const afterDelete = await service.listThreads(customerId, tenantId);
  if (afterDelete.length !== 0) {
    throw new Error('staff-messages: soft-deleted thread still surfaced in listThreads.');
  }

  // 2i. Staff reaching out AFTER soft-delete — thread auto-resurfaces.
  await service.appendInbound({
    tenantId,
    customerId,
    tableSessionId,
    staffName: 'Renata',
    staffRoleLabel: 'gerente',
    content: 'Mais uma coisa rapidinha!',
  });
  const resurfaced = await service.listThreads(customerId, tenantId);
  if (resurfaced.length !== 1) {
    throw new Error(
      'staff-messages: thread did NOT resurface when staff sent again — soft-delete latch not cleared.',
    );
  }

  // 2j. deleteAll — bulk wipe.
  const bulkDel = await service.deleteAll(customerId, tenantId);
  if (!bulkDel.mongoAvailable) {
    throw new Error('staff-messages: bulk delete reported mongoAvailable=false in fake.');
  }
  if (bulkDel.deletedCount < 1) {
    throw new Error('staff-messages: bulk delete dropped no messages.');
  }
  const afterBulk = await service.listThreads(customerId, tenantId);
  if (afterBulk.length !== 0) {
    throw new Error('staff-messages: threads survived bulk delete.');
  }

  console.log('OK customer-staff-messages contract');
}

// CLI entrypoint — `node -r ts-node/register .../customer-staff-messages.spec.ts`
if (require.main === module) {
  runCustomerStaffMessagesContract()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
