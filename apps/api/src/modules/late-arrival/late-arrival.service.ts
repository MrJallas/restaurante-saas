import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

/**
 * Default TTL for a late-arrival request — host has 60s to approve before the
 * row is auto-marked `expired` by the cron job (B2 will own that runner). The
 * service still surfaces `expired` synthetically on read if the DB row is
 * still pending past `ttl_expires_at`, so the FE never sees stale `pending`.
 */
const DEFAULT_TTL_SECONDS = 60;

interface LateArrivalRow {
  id: string;
  visit_id: string | null;
  table_session_id: string | null;
  customer_id: string;
  requested_at: string;
  expected_arrival_at: string;
  status: string;
  approved_by_staff_id: string | null;
  approved_by_customer_id: string | null;
  decided_at: string | null;
  escalation_level: number;
  ttl_expires_at: string;
  message: string | null;
  created_at: string;
}

@Injectable()
export class LateArrivalService {
  private readonly logger = new Logger(LateArrivalService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async create(
    input: {
      customerId: string;
      visitId?: string | null;
      tableSessionId?: string | null;
      expectedArrivalAt?: string;
      message?: string;
    },
    slug?: string,
  ) {
    const ttlExpiresAt = new Date(
      Date.now() + DEFAULT_TTL_SECONDS * 1000,
    ).toISOString();
    const expectedArrivalAt =
      input.expectedArrivalAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const rows = (await this.tenantConn.query(
      `INSERT INTO late_arrival_requests
         (visit_id, table_session_id, customer_id, expected_arrival_at,
          status, ttl_expires_at, message)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       RETURNING *`,
      [
        input.visitId ?? null,
        input.tableSessionId ?? null,
        input.customerId,
        expectedArrivalAt,
        ttlExpiresAt,
        input.message ?? null,
      ],
    )) as LateArrivalRow[];

    const result = this.mapRow(rows[0]);

    if (slug && this.events && result.tableSessionId) {
      // TODO(payload): tableNumber + requesterName + visitContext are not
      // joined here yet — passing 0 / row-derived placeholders so subscribers
      // still get a valid event shape. A subsequent enrichment query can fill
      // these in if the FE needs them before subscribers query the REST API.
      this.events.emitLateArrivalCreated(slug, null, {
        requestId: result.id,
        tableSessionId: result.tableSessionId,
        tableNumber: 0,
        requesterCustomerId: result.customerId,
        requesterName: '',
        expiresAt: result.ttlExpiresAt,
      });
    }

    return result;
  }

  async approve(
    id: string,
    by: { staffId?: string; customerId?: string },
    slug?: string,
  ) {
    return this.respond(id, 'approved', by, undefined, slug);
  }

  async reject(
    id: string,
    by: { staffId?: string; customerId?: string },
    reason?: string,
    slug?: string,
  ) {
    return this.respond(id, 'rejected', by, reason, slug);
  }

  private async respond(
    id: string,
    status: 'approved' | 'rejected',
    by: { staffId?: string; customerId?: string },
    reason?: string,
    slug?: string,
  ) {
    const existing = (await this.tenantConn.query(
      `SELECT * FROM late_arrival_requests WHERE id = $1`,
      [id],
    )) as LateArrivalRow[];
    if (!existing.length) {
      throw new HttpException(
        'Late-arrival request nao encontrado.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (existing[0].status !== 'pending') {
      throw new HttpException(
        `Pedido ja decidido (status=${existing[0].status}).`,
        HttpStatus.CONFLICT,
      );
    }

    const updated = (await this.tenantConn.query(
      `UPDATE late_arrival_requests
         SET status = $1,
             approved_by_staff_id = COALESCE($2, approved_by_staff_id),
             approved_by_customer_id = COALESCE($3, approved_by_customer_id),
             decided_at = now(),
             message = COALESCE($4, message),
             updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [
        status,
        by.staffId ?? null,
        by.customerId ?? null,
        reason ?? null,
        id,
      ],
    )) as LateArrivalRow[];
    const result = this.mapRow(updated[0]);

    if (slug && this.events && result.tableSessionId) {
      if (status === 'approved') {
        // TODO(payload): tableNumber, requesterName and partySize would
        // require joins with visits / customers / participants. Defaulting
        // to 0 / empty so the WS contract is satisfied; FE re-fetches via
        // REST when it needs the full data.
        this.events.emitLateArrivalApproved(slug, {
          requestId: result.id,
          tableSessionId: result.tableSessionId,
          tableNumber: 0,
          requesterCustomerId: result.customerId,
          requesterName: '',
          partySize: 0,
        });
      } else {
        this.events.emitLateArrivalRejected(slug, {
          requestId: result.id,
          tableSessionId: result.tableSessionId,
          requesterCustomerId: result.customerId,
          reason: by.staffId ? 'host_rejected' : 'host_rejected',
        });
      }
    }

    return result;
  }

  async list(filters: { status?: string; visitId?: string; tableSessionId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.visitId) {
      where.push(`visit_id = $${i++}`);
      params.push(filters.visitId);
    }
    if (filters.tableSessionId) {
      where.push(`table_session_id = $${i++}`);
      params.push(filters.tableSessionId);
    }
    const sql = `SELECT * FROM late_arrival_requests
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as LateArrivalRow[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Synthesize `expired` for pending rows past their TTL — surfaces the right
   * status to clients even when the cron job (B2) hasn't run yet.
   */
  private mapRow(row: LateArrivalRow) {
    const now = Date.now();
    const ttlMs = new Date(row.ttl_expires_at).getTime();
    const effectiveStatus =
      row.status === 'pending' && ttlMs < now ? 'expired' : row.status;

    return {
      id: row.id,
      visitId: row.visit_id,
      tableSessionId: row.table_session_id,
      customerId: row.customer_id,
      status: effectiveStatus,
      expectedArrivalAt: row.expected_arrival_at,
      ttlExpiresAt: row.ttl_expires_at,
      decidedAt: row.decided_at,
      message: row.message,
      escalationLevel: row.escalation_level,
      createdAt: row.created_at,
    };
  }
}
