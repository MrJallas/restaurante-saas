import { Injectable, Logger } from '@nestjs/common';
import { MongoService } from '../../infra/mongo/mongo.service';

type SecurityCollection =
  | 'qr_scan_events'
  | 'scan_verification_events'
  | 'security_audit_events';

export interface SecurityAuditEvent {
  tenantId?: string | null;
  tableId?: string | null;
  tableCode?: string | null;
  tableSessionId?: string | null;
  customerId?: string | null;
  staffId?: string | null;
  eventType: string;
  createdAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

const RETENTION_MS = 395 * 24 * 60 * 60 * 1000;

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  constructor(private readonly mongo: MongoService) {}

  async log(
    collection: SecurityCollection,
    event: SecurityAuditEvent,
  ): Promise<void> {
    const dbName = process.env.MONGODB_SECURITY_DB ?? 'restaurant_security';
    const db = this.mongo.tryDb(dbName);
    if (!db) {
      this.logger.warn(
        `Mongo security log skipped: db unavailable collection=${collection} event=${event.eventType}`,
      );
      return;
    }

    const createdAt = event.createdAt ?? new Date();
    const expiresAt =
      event.expiresAt ?? new Date(createdAt.getTime() + RETENTION_MS);

    try {
      await db.collection(collection).insertOne({
        ...event,
        createdAt,
        expiresAt,
      });
    } catch (err) {
      this.logger.warn(
        `Mongo security log failed collection=${collection} event=${event.eventType}: ${
          (err as Error).message
        }`,
      );
    }
  }

  async logAudit(event: SecurityAuditEvent): Promise<void> {
    await this.log('security_audit_events', event);
  }
}
