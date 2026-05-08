import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { EventsGateway } from '../websocket/events.gateway';

/**
 * Recurring sweeper for time-based domain transitions. Runs every 10s and,
 * for each active tenant schema, fans out to four independent passes:
 *
 *  1. late-arrival expirations    -> emit late_arrival.expired (+ optional
 *                                    escalation.advanced if the chain rolls)
 *  2. escalation chain advances   -> emit escalation.advanced or .completed
 *  3. zone-pause auto-end         -> emit zone_pause.ended (autoExpired=true)
 *  4. merge-cooldown notifications-> emit merge.cooldown_expired
 *
 * Each pass is wrapped in its own try/catch so a SQL failure in one pass
 * never blocks the others. We never use `TenantConnectionProvider` here
 * (request-scoped) — instead we acquire a fresh `QueryRunner` and SET
 * search_path manually, mirroring `TenantConnectionProvider` but in a
 * non-request context.
 *
 * Tenant iteration: we read every active row from `public.restaurants` on
 * each tick. A 200-tenant cluster polled every 10s is well under any DB
 * limit; if cardinality grows we can shard by tenant hash.
 */
@Injectable()
export class TtlTickService {
  private readonly logger = new Logger(TtlTickService.name);
  private isTicking = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: EventsGateway,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tickJob() {
    // Re-entrancy guard: if a previous tick is still running (slow network,
    // GC pause, very large fanout), skip this beat rather than stack jobs
    // on top of each other.
    if (this.isTicking) {
      this.logger.warn('Previous TTL tick still running, skipping');
      return;
    }
    this.isTicking = true;

    try {
      const tenants = await this.listTenants();
      for (const t of tenants) {
        await this.sweepTenant(t.slug, t.schema_name);
      }
    } catch (err) {
      this.logger.error('TTL tick top-level failure', err as Error);
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

  /**
   * Acquire a runner, SET search_path to the tenant schema, and run a block.
   * Always releases the runner. Mirrors the safety check in
   * `tenant.middleware.ts` — schema_name regex prevents injection in the
   * (already filtered) listTenants() but defensive in depth here too.
   */
  private async withTenant<T>(
    schemaName: string,
    work: (qr: import('typeorm').QueryRunner) => Promise<T>,
  ): Promise<T> {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      await qr.query(`SET search_path = '${schemaName}'`);
      return await work(qr);
    } finally {
      await qr.release();
    }
  }

  private async sweepTenant(slug: string, schemaName: string) {
    await Promise.allSettled([
      this.sweepLateArrivals(slug, schemaName).catch((e) =>
        this.logger.error(`[${slug}] sweepLateArrivals`, e as Error),
      ),
      this.sweepEscalations(slug, schemaName).catch((e) =>
        this.logger.error(`[${slug}] sweepEscalations`, e as Error),
      ),
      this.sweepZonePauses(slug, schemaName).catch((e) =>
        this.logger.error(`[${slug}] sweepZonePauses`, e as Error),
      ),
      this.sweepMergeCooldowns(slug, schemaName).catch((e) =>
        this.logger.error(`[${slug}] sweepMergeCooldowns`, e as Error),
      ),
    ]);
  }

  // ───────────── Late-arrival expirations ─────────────

  private async sweepLateArrivals(slug: string, schemaName: string) {
    const expired = await this.withTenant(schemaName, async (qr) => {
      // Atomically flip pending→expired so concurrent ticks don't double-fire.
      const rows = (await qr.query(
        `UPDATE late_arrival_requests
            SET status = 'expired',
                decided_at = now(),
                updated_at = now()
          WHERE status = 'pending'
            AND ttl_expires_at < now()
        RETURNING id, table_session_id, customer_id, escalation_chain_id`,
      )) as Array<{
        id: string;
        table_session_id: string;
        customer_id: string;
        escalation_chain_id: string | null;
      }>;
      return rows;
    });

    for (const row of expired) {
      this.gateway.emitLateArrivalExpired(slug, row.customer_id, {
        requestId: row.id,
        tableSessionId: row.table_session_id,
      });

      // Auto-advance any attached escalation chain — letting the host slot
      // expire is itself the trigger to roll up to the next role.
      if (row.escalation_chain_id) {
        try {
          await this.advanceChain(slug, schemaName, row.escalation_chain_id);
        } catch (e) {
          this.logger.error(
            `[${slug}] advanceChain after late_arrival expire failed`,
            e as Error,
          );
        }
      }
    }
  }

  // ───────────── Escalation chains ─────────────

  private async sweepEscalations(slug: string, schemaName: string) {
    const due = await this.withTenant(schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id, kind, source_id, level, current_assignee_role,
                current_assignee_staff_id, ttl_expires_at
           FROM escalation_chains
          WHERE completed_at IS NULL
            AND ttl_expires_at IS NOT NULL
            AND ttl_expires_at < now()
          FOR UPDATE SKIP LOCKED`,
      )) as Array<{
        id: string;
        kind: string;
        source_id: string;
        level: number;
        current_assignee_role: string | null;
        current_assignee_staff_id: string | null;
        ttl_expires_at: string;
      }>;
      return rows;
    });

    for (const chain of due) {
      try {
        await this.advanceChain(slug, schemaName, chain.id, chain);
      } catch (e) {
        this.logger.error(`[${slug}] advanceChain ${chain.id}`, e as Error);
      }
    }
  }

  /**
   * Advance an escalation chain by one level, or complete it with `timeout`
   * if it has run past the configured ladder. The ladder is implicit in
   * `level`: 0 (host) -> 1 (zone host) -> 2 (manager). After level 2 we
   * stop escalating and mark completed.
   *
   * Per-step TTL = 60s (matches docs/customer-host-model.md "Job a cada 5s
   * detecta `expires_at < now()` em pending → marca timeout"). We stretch to
   * 60s here because the cron tick is 10s; first level already had its
   * 60s window.
   */
  private async advanceChain(
    slug: string,
    schemaName: string,
    chainId: string,
    preloaded?: {
      level: number;
      current_assignee_staff_id: string | null;
    },
  ) {
    const result = await this.withTenant(schemaName, async (qr) => {
      const rows = preloaded
        ? [preloaded]
        : ((await qr.query(
            `SELECT level, current_assignee_staff_id
               FROM escalation_chains WHERE id = $1`,
            [chainId],
          )) as Array<{
            level: number;
            current_assignee_staff_id: string | null;
          }>);
      if (!rows.length) return null;

      const fromLevel = rows[0].level;
      const fromStaffId = rows[0].current_assignee_staff_id;
      const nextLevel = fromLevel + 1;
      const MAX_LEVEL = 2;

      if (nextLevel > MAX_LEVEL) {
        await qr.query(
          `UPDATE escalation_chains
              SET completed_at = now(),
                  resolution_notes = COALESCE(resolution_notes, 'auto-timeout'),
                  updated_at = now()
            WHERE id = $1`,
          [chainId],
        );
        return {
          mode: 'completed' as const,
          fromLevel,
          fromStaffId,
        };
      }

      // Pick next assignee role. We don't auto-resolve a specific staff id
      // here — the FE/REST side picks one on read. The role is enough.
      const nextRole = nextLevel === 1 ? 'zone_host' : 'manager';
      const ttl = new Date(Date.now() + 60 * 1000).toISOString();

      await qr.query(
        `UPDATE escalation_chains
            SET level = $2,
                current_assignee_role = $3,
                current_assignee_staff_id = NULL,
                ttl_expires_at = $4,
                updated_at = now()
          WHERE id = $1`,
        [chainId, nextLevel, nextRole, ttl],
      );
      return {
        mode: 'advanced' as const,
        fromLevel,
        toLevel: nextLevel,
        fromStaffId,
        deadline: ttl,
      };
    });

    if (!result) return;

    if (result.mode === 'completed') {
      this.gateway.emitEscalationCompleted(slug, null, {
        escalationId: chainId,
        outcome: 'timeout',
        resolvedBy: null,
      });
    } else {
      this.gateway.emitEscalationAdvanced(slug, result.fromStaffId, null, {
        escalationId: chainId,
        fromStep: result.fromLevel,
        toStep: result.toLevel,
        deadline: result.deadline,
      });
    }
  }

  // ───────────── Zone-pause auto-end ─────────────

  private async sweepZonePauses(slug: string, schemaName: string) {
    const ended = await this.withTenant(schemaName, async (qr) => {
      // Only end pauses that have not been ended manually. Use the system
      // sentinel NULL for ended_by_staff_id and rely on `cleared_at`-style
      // semantics: ends_at acts as the natural close marker, but we set
      // updated_at to record the auto-close moment (the schema has no
      // dedicated `ended_at`).
      const rows = (await qr.query(
        `UPDATE zone_pauses
            SET ended_by_staff_id = NULL,
                updated_at = now()
          WHERE ends_at IS NOT NULL
            AND ends_at < now()
            AND ended_by_staff_id IS NULL
            AND (updated_at < ends_at)
        RETURNING id, zone_id, zone_name, ends_at, created_by_staff_id`,
      )) as Array<{
        id: string;
        zone_id: string | null;
        zone_name: string | null;
        ends_at: string;
        created_by_staff_id: string | null;
      }>;
      return rows;
    });

    for (const row of ended) {
      // The current schema doesn't carry `waiterId` directly on zone_pauses;
      // the WS event uses `waiterId` semantically as "the staff scope this
      // pause targets" — we proxy with `created_by_staff_id`. FE treats
      // empty string as "tenant-wide" so we never emit an empty id (use
      // creator id when known; fall back to zone id).
      const waiterId = row.created_by_staff_id ?? row.zone_id ?? row.id;
      this.gateway.emitZonePauseEnded(slug, {
        id: row.id,
        waiterId,
        endedAt: new Date().toISOString(),
        endedBy: null,
        autoExpired: true,
      });
    }
  }

  // ───────────── Merge-cooldown expirations ─────────────

  private async sweepMergeCooldowns(slug: string, schemaName: string) {
    const expired = await this.withTenant(schemaName, async (qr) => {
      // The migration doesn't have a `notified_expired` column. To avoid
      // re-firing the same event every 10s for an expired cooldown, we
      // delete the row once it has expired (the cooldown row exists only
      // to gate retries; once expired its job is done).
      const rows = (await qr.query(
        `DELETE FROM table_merge_cooldowns
          WHERE cooldown_expires_at < now()
        RETURNING id,
                  table_session_a_id,
                  table_session_b_id`,
      )) as Array<{
        id: string;
        table_session_a_id: string;
        table_session_b_id: string;
      }>;
      return rows;
    });

    for (const row of expired) {
      // The WS payload wants table NUMBERS, not session ids. We don't have a
      // cheap join here without two extra queries per row, so we resolve in
      // a single batch: best effort — if lookup fails, fall back to 0.
      let originTable = 0;
      let targetTable = 0;
      try {
        const labels = (await this.withTenant(schemaName, async (qr) => {
          const r = await qr.query(
            `SELECT ts.id, t.label
               FROM table_sessions ts
               JOIN tables t ON t.id = ts.table_id
              WHERE ts.id = ANY($1::uuid[])`,
            [[row.table_session_a_id, row.table_session_b_id]],
          );
          return r as Array<{ id: string; label: string }>;
        })) as Array<{ id: string; label: string }>;
        for (const l of labels) {
          const n = Number.parseInt(l.label.replace(/\D/g, ''), 10) || 0;
          if (l.id === row.table_session_a_id) originTable = n;
          if (l.id === row.table_session_b_id) targetTable = n;
        }
      } catch (e) {
        this.logger.warn(
          `[${slug}] cooldown table label lookup failed: ${(e as Error).message}`,
        );
      }

      this.gateway.emitMergeCooldownExpired(slug, {
        cooldownId: row.id,
        originTable,
        targetTable,
      });
    }
  }
}
