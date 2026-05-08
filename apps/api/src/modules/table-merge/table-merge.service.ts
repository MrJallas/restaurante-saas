import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

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
  cooldownExpiresAt: string;
  retryAfterSeconds: number;
  reason: string;
  message: string;
  pair: { a: string; b: string };
}

@Injectable()
export class TableMergeService {
  private readonly logger = new Logger(TableMergeService.name);

  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async createRequest(input: {
    sourceTableSessionId: string;
    targetTableSessionId: string;
    requestingCustomerId: string;
    targetCustomerId?: string | null;
    message?: string;
  }) {
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
        cooldownExpiresAt: expiresAt,
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

    return this.mapRow(rows[0]);
  }

  async approve(id: string, decidedByCustomerId?: string) {
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
    return this.mapRow(updated[0]);
  }

  async reject(id: string, decidedByCustomerId?: string, reason?: string) {
    return this.tenantConn.transaction(async (tx) => {
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

      await tx.query(
        `INSERT INTO table_merge_cooldowns
           (table_session_a_id, table_session_b_id, cooldown_expires_at,
            last_request_id, reason)
         VALUES ($1, $2, $3, $4, 'rejected')
         ON CONFLICT (table_session_a_id, table_session_b_id) DO UPDATE
           SET cooldown_expires_at = EXCLUDED.cooldown_expires_at,
               last_request_id = EXCLUDED.last_request_id,
               reason = EXCLUDED.reason,
               updated_at = now()`,
        [a, b, cooldownExpires, id],
      );

      return { ...this.mapRow(row), cooldownExpiresAt: cooldownExpires };
    });
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
      cooldownExpiresAt: (row.cooldown_expires_at as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }
}

/** Returns the same pair always in canonical order (smaller uuid first). */
function orderedPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}
