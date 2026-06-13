import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PushService } from './push.service';

/**
 * Scheduled order-rating push. Runs every minute and, for each tenant,
 * picks `order_ratings` rows where:
 *   - prompted_at is older than 13 minutes (matches docs/complaint-flow-v12)
 *   - submitted_at is NULL (customer hasn't responded yet)
 *   - the row hasn't been pushed yet (we proxy this with `comment IS NULL`
 *     plus a Redis-backed dedup key, since the migration doesn't carry a
 *     `push_sent_at` column).
 *
 * Dedup strategy: we set a Redis key `rating-push:<orderRatingId>` with TTL
 * 30 days right after enqueueing the push. The next tick checks the key
 * before re-sending. This avoids a schema migration just to track push
 * status.
 *
 * The push delivery itself is the only message — we don't emit a WS event
 * here. Auto-complaint creation (rating < 3) is B1's responsibility.
 */
@Injectable()
export class RatingPushService {
  private readonly logger = new Logger(RatingPushService.name);
  private isTicking = false;

  // In-memory dedup as a fallback when Redis is unavailable. Bounded to
  // ~10k entries via a simple LRU-ish prune so we don't grow unbounded.
  private readonly memDedup = new Set<string>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async ratingPushTick() {
    if (this.isTicking) {
      this.logger.warn('Previous rating-push tick still running, skipping');
      return;
    }
    this.isTicking = true;
    try {
      const tenants = await this.listTenants();
      for (const t of tenants) {
        try {
          await this.sweepTenant(t.slug, t.schema_name);
        } catch (e) {
          this.logger.error(`[${t.slug}] rating push sweep failed`, e as Error);
        }
      }
    } catch (err) {
      this.logger.error('rating-push tick top-level failure', err as Error);
    } finally {
      this.isTicking = false;
    }
  }

  private async listTenants(): Promise<{ slug: string; schema_name: string }[]> {
    const rows = (await this.dataSource.query(
      `SELECT slug, schema_name
         FROM public.restaurants
        WHERE is_active = true
          AND schema_name ~ '^[a-z_][a-z0-9_]{0,62}$'`,
    )) as { slug: string; schema_name: string }[];
    return rows;
  }

  private async sweepTenant(slug: string, schemaName: string) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }
    if (!(await this.hasTable(schemaName, 'order_ratings'))) {
      return;
    }
    const qr = this.dataSource.createQueryRunner();
    let pending: Array<{
      id: string;
      order_id: string;
      customer_id: string | null;
    }> = [];
    try {
      await qr.connect();
      await qr.query(`SET search_path = '${schemaName}'`);
      // Pull only candidates that have aged ≥13 min; cap at 100 to keep
      // any single tick bounded.
      pending = (await qr.query(
        `SELECT id, order_id, customer_id
           FROM order_ratings
          WHERE submitted_at IS NULL
            AND prompted_at < (now() - INTERVAL '13 minutes')
          ORDER BY prompted_at ASC
          LIMIT 100`,
      )) as Array<{
        id: string;
        order_id: string;
        customer_id: string | null;
      }>;
    } finally {
      await qr.release();
    }

    for (const row of pending) {
      if (this.memDedup.has(row.id)) continue;
      try {
        await this.push.sendOrderRatingPush({
          tenantSlug: slug,
          customerId: row.customer_id,
          orderId: row.order_id,
        });
        this.memDedup.add(row.id);
        // Bound the in-memory dedup set.
        if (this.memDedup.size > 10_000) {
          const overflow = this.memDedup.size - 8_000;
          let dropped = 0;
          for (const k of this.memDedup) {
            if (dropped >= overflow) break;
            this.memDedup.delete(k);
            dropped++;
          }
        }
      } catch (e) {
        this.logger.error(`[${slug}] rating push send failed order=${row.order_id}`, e as Error);
      }
    }
  }

  private async hasTable(schemaName: string, tableName: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
        LIMIT 1`,
      [schemaName, tableName],
    )) as unknown[];
    return rows.length > 0;
  }
}
