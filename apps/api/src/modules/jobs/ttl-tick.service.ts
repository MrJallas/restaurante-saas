import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { EventsGateway } from '../websocket/events.gateway';
import { unwrapRows, unwrapAffected } from '../tenant/query-utils';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { RedisService } from '../../infra/redis/redis.service';
import { invalidateSessionAuthById } from '../../common/auth/session-auth-token';

/**
 * Recurring sweeper for time-based domain transitions. Runs every 10s and,
 * for each active tenant schema, fans out to independent passes:
 *
 *  1. late-arrival expirations    -> emit late_arrival.expired (+ optional
 *                                    escalation.advanced if the chain rolls)
 *  2. escalation chain advances   -> emit escalation.advanced or .completed
 *  3. zone-pause auto-end         -> emit zone_pause.ended (autoExpired=true)
 *  4. table-merge expirations    -> emit table_merge.rejected(timeout)
 *  5. merge-cooldown notifications-> emit merge.cooldown_expired
 *  6. scan-verification cascade -> host -> manager -> waiter -> timeout
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
    private readonly audit: SecurityAuditService,
    private readonly redis: RedisService,
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

  /**
   * Same as `withTenant` but wraps `work` in an explicit BEGIN…COMMIT so any
   * `FOR UPDATE`/`FOR UPDATE SKIP LOCKED` row lock taken inside survives until
   * the block finishes. Without this the runner runs in autocommit and the
   * lock is dropped the instant the SELECT statement returns (P1-S) — a
   * concurrent tick then re-selects the same "due" row and double-processes.
   * The single runner is reused for the whole block so the lock and the
   * follow-up UPDATE share one transaction. Rolls back on error.
   */
  private async withTenantTx<T>(
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
      await qr.startTransaction();
      try {
        const result = await work(qr);
        await qr.commitTransaction();
        return result;
      } catch (err) {
        await qr.rollbackTransaction();
        throw err;
      }
    } finally {
      await qr.release();
    }
  }

  private async sweepTenant(slug: string, schemaName: string) {
    const tables = await this.existingTables(schemaName, [
      'alerts',
      'table_sessions',
      'late_arrival_requests',
      'escalation_chains',
      'zone_pauses',
      'table_merge_requests',
      'table_merge_cooldowns',
    ]);
    const jobs: Array<Promise<void>> = [];
    if (tables.has('alerts')) {
      jobs.push(
        this.sweepStaleAlerts(slug, schemaName).catch((e) =>
          this.logger.error(`[${slug}] sweepStaleAlerts`, e as Error),
        ),
      );
    }
    if (tables.has('table_sessions')) {
      jobs.push(
        this.sweepStaleSessions(slug, schemaName).catch((e) =>
          this.logger.error(`[${slug}] sweepStaleSessions`, e as Error),
        ),
      );
    }
    if (tables.has('late_arrival_requests')) {
      jobs.push(
        this.sweepLateArrivals(slug, schemaName).catch((e) =>
          this.logger.error(`[${slug}] sweepLateArrivals`, e as Error),
        ),
      );
    }
    if (tables.has('escalation_chains')) {
      jobs.push(
        this.sweepEscalations(slug, schemaName).catch((e) =>
          this.logger.error(`[${slug}] sweepEscalations`, e as Error),
        ),
      );
    }
    if (tables.has('zone_pauses')) {
      jobs.push(
        this.sweepZonePauses(slug, schemaName).catch((e) =>
          this.logger.error(`[${slug}] sweepZonePauses`, e as Error),
        ),
      );
    }
    if (tables.has('table_merge_requests')) {
      jobs.push(
        this.sweepTableMergeRequests(slug, schemaName).catch((e) =>
          this.logger.error(`[${slug}] sweepTableMergeRequests`, e as Error),
        ),
      );
    }
    if (tables.has('table_merge_cooldowns')) {
      jobs.push(
        this.sweepMergeCooldowns(slug, schemaName).catch((e) =>
          this.logger.error(`[${slug}] sweepMergeCooldowns`, e as Error),
        ),
      );
    }
    await Promise.allSettled(jobs);
  }

  // ───────────── Table-merge expirations ─────────────

  private async sweepTableMergeRequests(slug: string, schemaName: string) {
    const expired = await this.withTenant(schemaName, async (qr) =>
      unwrapRows<{
        id: string;
        source_table_session_id: string;
        target_table_session_id: string;
        decided_at: string;
      }>(
        await qr.query(
          `UPDATE table_merge_requests
              SET status = 'expired',
                  decided_at = now(),
                  updated_at = now()
              WHERE status = 'pending'
                AND ttl_expires_at < now()
          RETURNING id, source_table_session_id, target_table_session_id, decided_at`,
        ),
      ),
    );

    for (const row of expired) {
      this.gateway.emitTableMergeRejected(
        slug,
        row.source_table_session_id,
        row.target_table_session_id,
        {
          requestId: row.id,
          rejectedBy: 'timeout',
          // M2 (timeline): timestamp do ato (decided_at do sweep). Timeout
          // não tem decisor humano — sem decidedByCustomerId.
          decidedAt: row.decided_at,
        },
      );
    }
  }

  private async existingTables(schemaName: string, tableNames: string[]): Promise<Set<string>> {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }
    const rows = (await this.dataSource.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = ANY($2::text[])`,
      [schemaName, tableNames],
    )) as Array<{ table_name: string }>;
    return new Set(rows.map((row) => row.table_name));
  }

  // ───────────── Late-arrival expirations ─────────────

  /**
   * Decisão Caleb 2026-07-04: alerta aberto há >24h auto-resolve — o
   * painel do gerente mostra o turno relevante, não arqueologia ("HÁ 928H").
   */
  private async sweepStaleAlerts(slug: string, schemaName: string) {
    const expired = await this.withTenant(schemaName, async (qr) =>
      unwrapRows<{ id: string }>(
        await qr.query(
          `UPDATE alerts
              SET resolved_at = now()
            WHERE dismissed_at IS NULL
              AND resolved_at IS NULL
              AND created_at < now() - interval '24 hours'
          RETURNING id`,
        ),
      ),
    );
    if (expired.length) {
      this.logger.log(`[${slug}] ${expired.length} alerta(s) auto-resolvidos (24h)`);
    }
  }

  /**
   * Decisão Caleb 2026-07-04: sessão ativa SEM atividade (pedido, chamado
   * ou pagamento) há 4h fecha sozinha e libera a mesa — mata as sessões
   * zumbis que prendiam mesa no mapa. CAS por status='active' (mesmo
   * fechamento do host liberate). WS do mapa fica pro read-model da FASE 3;
   * o mapa atual poll/refresh pega a mudança.
   */
  private async sweepStaleSessions(slug: string, schemaName: string) {
    const closed = await this.withTenant(schemaName, async (qr) =>
      unwrapRows<{ id: string }>(
        await qr.query(
          `UPDATE table_sessions ts
              SET status = 'closed',
                  closed_at = now(),
                  closed_by = 'system:ttl-4h',
                  updated_at = now()
            WHERE ts.status = 'active'
              AND GREATEST(
                    ts.created_at,
                    COALESCE((SELECT MAX(o.created_at) FROM orders o
                               WHERE o.table_session_id = ts.id), ts.created_at),
                    COALESCE((SELECT MAX(wc.created_at) FROM waiter_calls wc
                               WHERE wc.table_session_id = ts.id), ts.created_at),
                    COALESCE((SELECT MAX(p.created_at) FROM payments p
                               WHERE p.table_session_id = ts.id), ts.created_at)
                  ) < now() - interval '4 hours'
          RETURNING ts.id`,
        ),
      ),
    );
    if (closed.length) {
      this.logger.log(`[${slug}] ${closed.length} sessão(ões) zumbi fechadas (4h sem atividade)`);
      // A04: invalida as chaves Redis das sessões recém-fechadas — o
      // SessionGuard revalida `status` no banco, mas apagar aqui mata o
      // cookie/x-session-token na hora (não espera a próxima request).
      await Promise.all(
        closed.map((s) =>
          invalidateSessionAuthById(this.redis, s.id).catch((err) => {
            this.logger.warn(
              `[${slug}] falha ao invalidar chave Redis da sessão zumbi ${s.id}: ${(err as Error).message}`,
            );
          }),
        ),
      );
    }
  }

  private async sweepLateArrivals(slug: string, schemaName: string) {
    const expired = await this.withTenant(schemaName, async (qr) => {
      // Atomically flip pending→expired so concurrent ticks don't double-fire.
      // UPDATE…RETURNING under pg returns `[rows[], rowCount]`; unwrapRows
      // normalises that tuple back to the row array.
      const rows = unwrapRows<{
        id: string;
        table_session_id: string;
        customer_id: string;
        escalation_chain_id: string | null;
        decided_at: string;
      }>(
        await qr.query(
          `UPDATE late_arrival_requests
              SET status = 'expired',
                  decided_at = now(),
                  updated_at = now()
            WHERE status = 'pending'
              AND ttl_expires_at < now()
          RETURNING id, table_session_id, customer_id, escalation_chain_id, decided_at`,
        ),
      );
      return rows;
    });

    for (const row of expired) {
      this.gateway.emitLateArrivalExpired(slug, row.customer_id, {
        requestId: row.id,
        tableSessionId: row.table_session_id,
        // M2 (timeline): timestamp do ato (decided_at do sweep).
        occurredAt: row.decided_at,
      });

      // Auto-advance any attached escalation chain — letting the host slot
      // expire is itself the trigger to roll up to the next role.
      if (row.escalation_chain_id) {
        try {
          await this.advanceChain(slug, schemaName, row.escalation_chain_id);
        } catch (e) {
          this.logger.error(`[${slug}] advanceChain after late_arrival expire failed`, e as Error);
        }
      }
    }
  }

  // ───────────── Escalation chains ─────────────

  private async sweepEscalations(slug: string, schemaName: string) {
    // P1-S: the SELECT FOR UPDATE SKIP LOCKED and the advance/UPDATE MUST run
    // in one transaction on the SAME runner, so the row lock is held until we
    // commit. Previously the SELECT ran under `withTenant` (autocommit) and
    // then `advanceChain` opened a *fresh* runner — the lock was long gone, so
    // two concurrent ticks both grabbed the same due chain and double-emitted
    // the escalation. Holding the tx serialises them: the loser's SKIP LOCKED
    // finds the rows locked and returns [], processing nothing.
    await this.withTenantTx(schemaName, async (qr) => {
      const due = (await qr.query(
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

      for (const chain of due) {
        try {
          await this.advanceChain(slug, schemaName, chain.id, chain, qr);
        } catch (e) {
          // Swallow per-chain so one bad row doesn't roll back the locks on
          // the siblings we already advanced in this tick.
          this.logger.error(`[${slug}] advanceChain ${chain.id}`, e as Error);
        }
      }
    });
  }

  /**
   * Advance an escalation chain by one level, or complete it with `timeout`
   * if it has run past the configured ladder. The ladder is implicit in
   * `level`: default chains use 0 (host) -> 1 (zone host) -> 2 (manager);
   * scan verification uses 0 (host) -> 1 (manager) -> 2 (waiter). After
   * level 2 we stop escalating and mark completed.
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
      kind?: string;
      source_id?: string;
      level: number;
      current_assignee_staff_id: string | null;
    },
    // P1-S: when the caller already holds a locked transaction (sweepEscalations
    // grabbed this chain under FOR UPDATE), reuse ITS runner so the advance runs
    // inside the same tx and the row lock keeps holding. Callers without a
    // locked context (sweepLateArrivals) pass no runner and get the old
    // per-call `withTenant`.
    runner?: import('typeorm').QueryRunner,
  ) {
    const run = <T>(work: (qr: import('typeorm').QueryRunner) => Promise<T>): Promise<T> =>
      runner ? work(runner) : this.withTenant(schemaName, work);

    const result = await run(async (qr) => {
      const rows = preloaded
        ? [preloaded]
        : ((await qr.query(
            `SELECT kind, source_id, level, current_assignee_staff_id
               FROM escalation_chains WHERE id = $1`,
            [chainId],
          )) as Array<{
            kind: string;
            source_id: string;
            level: number;
            current_assignee_staff_id: string | null;
          }>);
      if (!rows.length) return null;

      const kind = rows[0].kind ?? 'other';
      const sourceId = rows[0].source_id ?? null;
      const fromLevel = rows[0].level;
      const fromStaffId = rows[0].current_assignee_staff_id;
      const nextLevel = fromLevel + 1;
      const MAX_LEVEL = 2;

      if (nextLevel > MAX_LEVEL) {
        // Level-CAS (resíduo 1): só completa se a chain ainda estiver aberta
        // NO nível que lemos (`level = $2` = fromLevel). Se um caminho
        // concorrente (o outro sweep no mesmo tick) já mexeu na chain, este
        // UPDATE casa 0 linhas e abortamos SEM emitir — o vencedor já emitiu.
        const completedAffected = unwrapAffected(
          await qr.query(
            `UPDATE escalation_chains
                SET completed_at = now(),
                    resolution_notes = COALESCE(resolution_notes, 'auto-timeout'),
                    updated_at = now()
              WHERE id = $1
                AND completed_at IS NULL
                AND level = $2`,
            [chainId, fromLevel],
          ),
        );
        if (completedAffected === 0) return null;
        let scanResolution: { tableSessionId: string; tableId: string; customerId: string } | null =
          null;
        if (kind === 'scan_verification' && sourceId) {
          const expired = unwrapRows<{
            table_session_id: string;
            table_id: string;
            customer_id: string;
          }>(
            await qr.query(
              `UPDATE scan_verification_requests
                  SET status = 'expired',
                      decided_at = now(),
                      rejection_reason = COALESCE(rejection_reason, 'auto-timeout'),
                      updated_at = now()
                WHERE id = $1
                  AND status = 'pending'
              RETURNING table_session_id, table_id, customer_id`,
              [sourceId],
            ),
          )[0];
          if (expired) {
            await qr.query(
              `UPDATE session_participants
                  SET status = 'rejected',
                      rejected_at = now()
                WHERE table_session_id = $1
                  AND customer_id = $2
                  AND left_at IS NULL`,
              [expired.table_session_id, expired.customer_id],
            );
            await qr.query(
              `UPDATE table_sessions
                  SET status = 'closed',
                      closed_at = COALESCE(closed_at, now()),
                      closed_by = 'scan_verification:expired',
                      updated_at = now()
                WHERE id = $1
                  AND status = 'active'
                  AND host_customer_id IS NULL`,
              [expired.table_session_id],
            );
            scanResolution = {
              tableSessionId: expired.table_session_id,
              tableId: expired.table_id,
              customerId: expired.customer_id,
            };
          }
        }
        return {
          mode: 'completed' as const,
          kind,
          sourceId,
          fromLevel,
          fromStaffId,
          scanResolution,
        };
      }

      // Pick next assignee role. We don't auto-resolve a specific staff id
      // here — the FE/REST side picks one on read. The role is enough.
      const nextRole =
        kind === 'scan_verification'
          ? nextLevel === 1
            ? 'manager'
            : 'waiter'
          : nextLevel === 1
            ? 'zone_host'
            : 'manager';
      const ttl = new Date(Date.now() + 60 * 1000).toISOString();

      // Level-CAS (resíduo 1): avança SÓ se a chain ainda está no nível que
      // lemos (`level = $5` = fromLevel). Os DOIS sweeps de um mesmo tick
      // (sweepEscalations sob FOR UPDATE e sweepLateArrivals em autocommit,
      // sem lock) podem casar a MESMA chain vencida; o FOR UPDATE não serializa
      // o caminho autocommit. O Postgres serializa os dois UPDATEs na row: o
      // primeiro casa `level = fromLevel` e sobe pra nextLevel; o segundo vê o
      // nível já avançado, casa 0 linhas e abortamos SEM re-emitir advance.
      const advanceAffected = unwrapAffected(
        await qr.query(
          `UPDATE escalation_chains
              SET level = $2,
                  current_assignee_role = $3,
                  current_assignee_staff_id = NULL,
                  ttl_expires_at = $4,
                  updated_at = now()
            WHERE id = $1
              AND completed_at IS NULL
              AND level = $5`,
          [chainId, nextLevel, nextRole, ttl, fromLevel],
        ),
      );
      if (advanceAffected === 0) return null;
      let scan: { tableSessionId: string; tableId: string; customerId: string } | null = null;
      if (kind === 'scan_verification' && sourceId) {
        const updatedScan = unwrapRows<{
          table_session_id: string;
          table_id: string;
          customer_id: string;
        }>(
          await qr.query(
            `UPDATE scan_verification_requests
                SET escalation_level = $2,
                    ttl_expires_at = $3,
                    updated_at = now()
              WHERE id = $1
                AND status = 'pending'
            RETURNING table_session_id, table_id, customer_id`,
            [sourceId, nextLevel, ttl],
          ),
        )[0];
        scan = updatedScan
          ? {
              tableSessionId: updatedScan.table_session_id,
              tableId: updatedScan.table_id,
              customerId: updatedScan.customer_id,
            }
          : null;
      }
      return {
        mode: 'advanced' as const,
        kind,
        sourceId,
        scan,
        fromLevel,
        toLevel: nextLevel,
        nextRole,
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
      if (result.kind === 'scan_verification' && result.sourceId && result.scanResolution) {
        const decidedAt = new Date().toISOString();
        this.gateway.emitScanVerificationResolved(slug, {
          requestId: result.sourceId,
          tableSessionId: result.scanResolution.tableSessionId,
          requesterCustomerId: result.scanResolution.customerId,
          status: 'expired',
          decidedAt,
          decidedByStaffId: null,
          reason: 'auto-timeout',
        });
        this.gateway.emitToSession(result.scanResolution.tableSessionId, 'participant:decision', {
          customerId: result.scanResolution.customerId,
          status: 'rejected',
          decidedAt,
        });
        await this.logScanVerificationTtlEvent(slug, 'scan_verification_timeout', {
          requestId: result.sourceId,
          escalationId: chainId,
          tableSessionId: result.scanResolution.tableSessionId,
          tableId: result.scanResolution.tableId,
          customerId: result.scanResolution.customerId,
          fromLevel: result.fromLevel,
          outcome: 'timeout',
        });
      }
    } else {
      this.gateway.emitEscalationAdvanced(slug, result.fromStaffId, null, {
        escalationId: chainId,
        fromStep: result.fromLevel,
        toStep: result.toLevel,
        deadline: result.deadline,
      });
      if (
        result.kind === 'scan_verification' &&
        result.sourceId &&
        (result.nextRole === 'host' ||
          result.nextRole === 'manager' ||
          result.nextRole === 'waiter')
      ) {
        this.gateway.emitScanVerificationEscalated(slug, result.nextRole, {
          requestId: result.sourceId,
          tableSessionId: result.scan?.tableSessionId ?? '',
          escalationId: chainId,
          fromStep: result.fromLevel,
          toStep: result.toLevel,
          assigneeRole: result.nextRole,
          expiresAt: result.deadline,
        });
        if (result.scan) {
          await this.logScanVerificationTtlEvent(slug, 'scan_verification_escalated', {
            requestId: result.sourceId,
            escalationId: chainId,
            tableSessionId: result.scan.tableSessionId,
            tableId: result.scan.tableId,
            customerId: result.scan.customerId,
            fromLevel: result.fromLevel,
            toLevel: result.toLevel,
            assigneeRole: result.nextRole,
            expiresAt: result.deadline,
          });
        }
      }
    }
  }

  private async logScanVerificationTtlEvent(
    slug: string,
    eventType: string,
    input: {
      requestId: string;
      escalationId: string;
      tableSessionId: string;
      tableId: string;
      customerId: string;
      fromLevel: number;
      toLevel?: number;
      assigneeRole?: string;
      expiresAt?: string;
      outcome?: string;
    },
  ) {
    const event = {
      tenantId: slug,
      tableId: input.tableId,
      tableSessionId: input.tableSessionId,
      customerId: input.customerId,
      eventType,
      metadata: {
        requestId: input.requestId,
        escalationId: input.escalationId,
        fromLevel: input.fromLevel,
        toLevel: input.toLevel ?? null,
        assigneeRole: input.assigneeRole ?? null,
        expiresAt: input.expiresAt ?? null,
        outcome: input.outcome ?? null,
      },
    };
    await Promise.all([
      this.audit.log('scan_verification_events', event),
      this.audit.logAudit(event),
    ]).catch((err) =>
      this.logger.warn(`[${slug}] scan verification ttl log failed: ${(err as Error).message}`),
    );
  }

  // ───────────── Zone-pause auto-end ─────────────

  private async sweepZonePauses(slug: string, schemaName: string) {
    const ended = await this.withTenant(schemaName, async (qr) => {
      // Per migration 032 the schema is waiter-specific:
      //   ended_at IS NULL  -> still active
      //   ends_at < now()   -> TTL elapsed
      // Auto-end populates ended_at (system close — ended_by stays NULL).
      const rows = unwrapRows<{
        id: string;
        waiter_id: string;
        ends_at: string;
        started_by: string;
      }>(
        await qr.query(
          `UPDATE zone_pauses
              SET ended_at = now()
            WHERE ended_at IS NULL
              AND ends_at < now()
          RETURNING id, waiter_id, ends_at, started_by`,
        ),
      );
      return rows;
    });

    for (const row of ended) {
      this.gateway.emitZonePauseEnded(slug, {
        id: row.id,
        waiterId: row.waiter_id,
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
      // to gate retries; once expired its job is done). DELETE…RETURNING
      // returns `[rows[], rowCount]` under pg; unwrapRows normalises.
      const rows = unwrapRows<{
        id: string;
        origin_session_id: string;
        target_session_id: string;
        origin_table: number | null;
        target_table: number | null;
      }>(
        await qr.query(
          `WITH deleted AS (
             DELETE FROM table_merge_cooldowns
              WHERE cooldown_expires_at < now()
          RETURNING id,
                    COALESCE(source_table_session_id, table_session_a_id) AS origin_session_id,
                    COALESCE(target_table_session_id, table_session_b_id) AS target_session_id
           )
           SELECT d.id,
                  d.origin_session_id,
                  d.target_session_id,
                  CAST(NULLIF(regexp_replace(src_t.code, '[^0-9]', '', 'g'), '') AS INT) AS origin_table,
                  CAST(NULLIF(regexp_replace(tgt_t.code, '[^0-9]', '', 'g'), '') AS INT) AS target_table
             FROM deleted d
        LEFT JOIN table_sessions src_ts ON src_ts.id = d.origin_session_id
        LEFT JOIN table_sessions tgt_ts ON tgt_ts.id = d.target_session_id
        LEFT JOIN tables src_t ON src_t.id = src_ts.table_id
        LEFT JOIN tables tgt_t ON tgt_t.id = tgt_ts.table_id`,
        ),
      );
      return rows;
    });

    for (const row of expired) {
      const originTable = Number(row.origin_table ?? 0);
      const targetTable = Number(row.target_table ?? 0);
      if (originTable <= 0 || targetTable <= 0) {
        this.logger.warn(
          `[${slug}] cooldown expired without table numbers; event skipped for ${row.id}`,
        );
        continue;
      }

      this.gateway.emitMergeCooldownExpired(slug, {
        cooldownId: row.id,
        originTable,
        targetTable,
      });
    }
  }
}
