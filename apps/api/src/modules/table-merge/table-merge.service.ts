import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

/** Default merge request TTL: 60s (host has to react). */
const REQUEST_TTL_SECONDS = 60;

/**
 * Cooldown applied after a rejection or timeout to throttle the requester so
 * the target table is not spammed. 10 min keeps things calm without locking
 * the requester out of the whole night.
 */
const COOLDOWN_MINUTES = 10;

interface CooldownRow {
  id: string;
  table_session_a_id: string;
  table_session_b_id: string;
  cooldown_expires_at: string;
  reason: string | null;
}

/**
 * 429-shaped exception body the controller hands back to the client. Matches
 * `MergeCooldownDto` from @restaurant/shared-types.
 */
export interface MergeCooldownPayload {
  cooldownEndsAt: string;
  retryAfterSeconds: number;
  reason: string;
  message: string;
  pair: { a: string; b: string };
}

@Injectable()
export class TableMergeService {
  private readonly logger = new Logger(TableMergeService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async createRequest(
    input: {
      sourceTableSessionId: string;
      targetTableSessionId: string;
      requestingCustomerId: string;
      targetCustomerId?: string | null;
      message?: string;
    },
    slug?: string,
  ) {
    if (input.sourceTableSessionId === input.targetTableSessionId) {
      throw new HttpException(
        'Nao da pra juntar a mesa com ela mesma.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const [a, b] = orderedPair(
      input.sourceTableSessionId,
      input.targetTableSessionId,
    );

    // Check active cooldown — block before allocating a row.
    const cooldown = (await this.tenantConn.query(
      `SELECT id, table_session_a_id, table_session_b_id, cooldown_expires_at, reason
       FROM table_merge_cooldowns
       WHERE table_session_a_id = $1 AND table_session_b_id = $2
         AND cooldown_expires_at > now()
       LIMIT 1`,
      [a, b],
    )) as CooldownRow[];
    if (cooldown.length) {
      const c = cooldown[0];
      const expiresAt = c.cooldown_expires_at;
      const retryAfter = Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      const payload: MergeCooldownPayload = {
        cooldownEndsAt: expiresAt,
        retryAfterSeconds: retryAfter,
        reason: c.reason ?? 'rejected',
        message: 'Voce pode tentar de novo em alguns minutos.',
        pair: { a, b },
      };
      throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS);
    }

    const ttl = new Date(
      Date.now() + REQUEST_TTL_SECONDS * 1000,
    ).toISOString();

    const rows = (await this.tenantConn.query(
      `INSERT INTO table_merge_requests
         (source_table_session_id, target_table_session_id,
          requesting_customer_id, target_customer_id,
          status, message, ttl_expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       RETURNING *`,
      [
        input.sourceTableSessionId,
        input.targetTableSessionId,
        input.requestingCustomerId,
        input.targetCustomerId ?? null,
        input.message ?? null,
        ttl,
      ],
    )) as Array<Record<string, unknown>>;

    const result = this.mapRow(rows[0]);

    if (slug && this.events) {
      // TODO(payload): tableNumber + host names + party sizes require joins
      // with table_sessions/visits/customers. Defaulting to 0 / '' so the
      // contract is satisfied; FE re-fetches via REST for full data.
      this.events.emitTableMergeCreated(
        slug,
        result.requestingCustomerId,
        result.targetCustomerId,
        {
          requestId: result.id,
          originSessionId: result.sourceTableSessionId,
          targetSessionId: result.targetTableSessionId,
          originTableNumber: 0,
          targetTableNumber: 0,
          originHostName: '',
          targetHostName: null,
          originPartySize: 0,
          targetPartySize: 0,
          expiresAt: result.ttlExpiresAt,
        },
      );
    }

    return result;
  }

  async approve(id: string, decidedByCustomerId?: string, slug?: string) {
    const updated = (await this.tenantConn.query(
      `UPDATE table_merge_requests
         SET status = 'approved',
             decided_at = now(),
             decided_by_customer_id = COALESCE($1, decided_by_customer_id),
             updated_at = now()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [decidedByCustomerId ?? null, id],
    )) as Array<Record<string, unknown>>;
    if (!updated.length) {
      throw new HttpException(
        'Pedido de juncao nao encontrado ou ja decidido.',
        HttpStatus.NOT_FOUND,
      );
    }
    const result = this.mapRow(updated[0]);

    if (slug && this.events) {
      // `side: 'both'` because the V1 service accepts either side via the
      // same endpoint without distinguishing — FE infers the originator.
      this.events.emitTableMergeApproved(
        slug,
        result.sourceTableSessionId,
        result.targetTableSessionId,
        {
          requestId: result.id,
          side: 'both',
          status: 'approved',
        },
      );
    }

    return result;
  }

  async reject(
    id: string,
    decidedByCustomerId?: string,
    reason?: string,
    slug?: string,
  ) {
    const result = await this.tenantConn.transaction(async (tx) => {
      const updated = (await tx.query(
        `UPDATE table_merge_requests
           SET status = 'rejected',
               decided_at = now(),
               decided_by_customer_id = COALESCE($1, decided_by_customer_id),
               message = COALESCE($2, message),
               updated_at = now()
         WHERE id = $3 AND status = 'pending'
         RETURNING *`,
        [decidedByCustomerId ?? null, reason ?? null, id],
      )) as Array<Record<string, unknown>>;
      if (!updated.length) {
        throw new HttpException(
          'Pedido de juncao nao encontrado ou ja decidido.',
          HttpStatus.NOT_FOUND,
        );
      }

      const row = updated[0];
      const [a, b] = orderedPair(
        row.source_table_session_id as string,
        row.target_table_session_id as string,
      );
      const cooldownExpires = new Date(
        Date.now() + COOLDOWN_MINUTES * 60 * 1000,
      ).toISOString();

      const cooldownRows = (await tx.query(
        `INSERT INTO table_merge_cooldowns
           (table_session_a_id, table_session_b_id, cooldown_expires_at,
            last_request_id, reason)
         VALUES ($1, $2, $3, $4, 'rejected')
         ON CONFLICT (table_session_a_id, table_session_b_id) DO UPDATE
           SET cooldown_expires_at = EXCLUDED.cooldown_expires_at,
               last_request_id = EXCLUDED.last_request_id,
               reason = EXCLUDED.reason,
               updated_at = now()
         RETURNING id`,
        [a, b, cooldownExpires, id],
      )) as Array<{ id: string }>;

      return {
        mapped: this.mapRow(row),
        cooldownEndsAt: cooldownExpires,
        cooldownId: cooldownRows[0]?.id ?? id,
        pair: { a, b },
      };
    });

    if (slug && this.events) {
      this.events.emitTableMergeRejected(
        slug,
        result.mapped.sourceTableSessionId,
        result.mapped.targetTableSessionId,
        {
          requestId: result.mapped.id,
          rejectedBy: 'b',
        },
      );
      // TODO(payload): originTable / targetTable need a join to resolve
      // table numbers. Using 0 placeholders — subscribers can re-fetch.
      this.events.emitMergeCooldownStarted(
        slug,
        result.mapped.sourceTableSessionId,
        result.mapped.targetTableSessionId,
        {
          cooldownId: result.cooldownId,
          tenantId: slug,
          originTable: 0,
          targetTable: 0,
          reason: 'rejected',
          expiresAt: result.cooldownEndsAt,
        },
      );
    }

    return { ...result.mapped, cooldownEndsAt: result.cooldownEndsAt };
  }

  async list(filters: { status?: string; tableSessionId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.tableSessionId) {
      where.push(
        `(source_table_session_id = $${i} OR target_table_session_id = $${i})`,
      );
      params.push(filters.tableSessionId);
      i++;
    }
    const sql = `SELECT * FROM table_merge_requests
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      sourceTableSessionId: row.source_table_session_id as string,
      targetTableSessionId: row.target_table_session_id as string,
      requestingCustomerId: row.requesting_customer_id as string,
      targetCustomerId: (row.target_customer_id as string | null) ?? null,
      decidedByCustomerId:
        (row.decided_by_customer_id as string | null) ?? null,
      status: row.status as string,
      message: (row.message as string | null) ?? null,
      ttlExpiresAt: row.ttl_expires_at as string,
      cooldownEndsAt: (row.cooldown_expires_at as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }
}

/** Returns the same pair always in canonical order (smaller uuid first). */
function orderedPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}
