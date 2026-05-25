/**
 * Contract assertions for best-effort Mongo security logging.
 *
 * The operational Postgres flow must not fail when the security/audit Mongo
 * database is unavailable or insertions fail.
 */

import { ObjectId, type Collection, type Db } from 'mongodb';
import { SecurityAuditService } from './security-audit.service';

type InsertedDoc = Record<string, unknown>;

function buildFakeDb(options?: { throwOnInsert?: boolean }) {
  const inserted: InsertedDoc[] = [];
  const db = {
    collection(_name: string): Partial<Collection<InsertedDoc>> {
      return {
        async insertOne(doc: InsertedDoc) {
          if (options?.throwOnInsert) {
            throw new Error('insert failed');
          }
          inserted.push(doc);
          return { acknowledged: true, insertedId: new ObjectId() };
        },
      };
    },
  } as Db;
  return { db, inserted };
}

/* eslint-disable no-console */
export async function runSecurityAuditAssertions(): Promise<void> {
  const available = buildFakeDb();
  const service = new SecurityAuditService({
    tryDb: () => available.db,
  } as import('../../infra/mongo/mongo.service').MongoService);

  const createdAt = new Date('2026-05-18T12:00:00.000Z');
  await service.log('qr_scan_events', {
    tenantId: 'restaurant_dev',
    tableId: 'table-1',
    customerId: 'customer-1',
    eventType: 'qr_resolved',
    createdAt,
  });

  if (available.inserted.length !== 1) {
    throw new Error('Security audit event was not inserted.');
  }

  const inserted = available.inserted[0];
  if (inserted.eventType !== 'qr_resolved') {
    throw new Error('Security audit eventType was not preserved.');
  }
  if (!(inserted.expiresAt instanceof Date)) {
    throw new Error('Security audit event did not receive retention expiresAt.');
  }
  if ((inserted.expiresAt as Date).getTime() <= createdAt.getTime()) {
    throw new Error('Security audit retention expiresAt is not after createdAt.');
  }

  const unavailable = new SecurityAuditService({
    tryDb: () => null,
  } as import('../../infra/mongo/mongo.service').MongoService);
  await unavailable.log('scan_verification_events', {
    eventType: 'scan_verification_created',
  });

  const failing = buildFakeDb({ throwOnInsert: true });
  const failingService = new SecurityAuditService({
    tryDb: () => failing.db,
  } as import('../../infra/mongo/mongo.service').MongoService);
  await failingService.log('security_audit_events', {
    eventType: 'insert_failure_should_not_block',
  });

  console.log('security-audit.service assertions OK');
}

if (require.main === module) {
  runSecurityAuditAssertions();
}
