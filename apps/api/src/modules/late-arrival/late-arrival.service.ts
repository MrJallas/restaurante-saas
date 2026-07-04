import { Injectable, HttpException, HttpStatus, Logger, Optional } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';
import { PARTICIPANT_COLORS } from '../table-session/table-session.service';

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
  table_number?: number | null;
  requester_name?: string | null;
  total_visits?: number | null;
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
    const ttlExpiresAt = new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000).toISOString();
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

    const result = await this.getById(rows[0].id);

    if (slug && this.events && result.tableSessionId) {
      this.events.emitLateArrivalCreated(slug, null, {
        requestId: result.id,
        tableSessionId: result.tableSessionId,
        tableNumber: result.tableNumber,
        requesterCustomerId: result.customerId,
        requesterName: result.requesterName,
        visitContext: result.visitContext,
        expiresAt: result.ttlExpiresAt,
        // M2 (timeline): timestamp do ato (row created_at).
        occurredAt: result.createdAt,
      });
    }

    return result;
  }

  /**
   * Round 6 (B-NEW-12): valida se o `callerCustomerId` é host da
   * `table_session` referida no `requestId`. Usado pelo controller
   * pra impedir que customer em outra mesa approve/reject pedido
   * alheio passando `dto.customerId` arbitrário.
   *
   * Retorna `false` quando: (a) request não existe; (b) table_session
   * sem host carimbado; (c) host_customer_id != callerCustomerId.
   * Distinção 404/403 fica a cargo do controller.
   */
  async isCallerHostOfRequest(requestId: string, callerCustomerId: string): Promise<boolean> {
    const rows = (await this.tenantConn.query(
      `SELECT ts.host_customer_id
         FROM late_arrival_requests lar
         JOIN table_sessions ts ON ts.id = lar.table_session_id
        WHERE lar.id = $1`,
      [requestId],
    )) as { host_customer_id: string | null }[];
    if (!rows.length) return false;
    const hostId = rows[0].host_customer_id;
    return !!hostId && hostId === callerCustomerId;
  }

  async approve(id: string, by: { staffId?: string; customerId?: string }, slug?: string) {
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
      throw new HttpException('Late-arrival request nao encontrado.', HttpStatus.NOT_FOUND);
    }
    if (existing[0].status !== 'pending') {
      throw new HttpException(
        `Pedido ja decidido (status=${existing[0].status}).`,
        HttpStatus.CONFLICT,
      );
    }

    // P1 #26 — single transaction so the request status flip and the
    // session_participants promotion are atomic. Without this the previous
    // implementation marked the request approved but never inserted the
    // participant row, leaving the late-arriver in limbo (the only path that
    // promoted them was the unrelated `/table/participants/decide` endpoint).
    const updated = await this.tenantConn.transaction(async (tx) => {
      const updatedRows = unwrapRows<LateArrivalRow>(
        await tx.query(
          `UPDATE late_arrival_requests
             SET status = $1,
                 approved_by_staff_id = COALESCE($2, approved_by_staff_id),
                 approved_by_customer_id = COALESCE($3, approved_by_customer_id),
                 decided_at = now(),
                 message = COALESCE($4, message),
                 updated_at = now()
           WHERE id = $5
           RETURNING *`,
          [status, by.staffId ?? null, by.customerId ?? null, reason ?? null, id],
        ),
      );
      if (!updatedRows.length) {
        throw new HttpException('Late-arrival request nao encontrado.', HttpStatus.NOT_FOUND);
      }

      // Only on approval: ensure the requesting customer is a session
      // participant so they can place orders, see the chat, etc. Idempotent —
      // if a `pending` row already exists (because they scanned the QR before
      // the host approved their late-arrival request) we promote it instead
      // of inserting a duplicate. ON CONFLICT keys on the partial unique
      // index `session_participants_active_unique` (table_session_id,
      // customer_id) WHERE left_at IS NULL.
      if (status === 'approved') {
        const row = updatedRows[0];
        const tableSessionId = row.table_session_id;
        const customerId = row.customer_id;
        const approver = by.customerId ?? null;
        if (tableSessionId && customerId) {
          await tx.query(
            `INSERT INTO session_participants
               (table_session_id, customer_id, visit_id, color_index,
                status, approved_at, approved_by)
             SELECT $1::uuid, $2::uuid, $3::uuid,
                    (SELECT COUNT(*)::int FROM session_participants
                       WHERE table_session_id = $1::uuid) % $5::int,
                    'approved', now(), $4::uuid
             ON CONFLICT (table_session_id, customer_id) WHERE left_at IS NULL
             DO UPDATE SET status = 'approved',
                           approved_at = now(),
                           approved_by = COALESCE(EXCLUDED.approved_by,
                                                  session_participants.approved_by),
                           left_at = NULL`,
            [tableSessionId, customerId, row.visit_id, approver, PARTICIPANT_COLORS.length],
          );
        }
      }

      return updatedRows;
    });

    const result = this.mapRow(updated[0]);

    if (slug && this.events && result.tableSessionId) {
      // M2 (timeline): occurredAt = decided_at carimbado pelo UPDATE;
      // decidedByCustomerId = host validado pelo controller
      // (isCallerHostOfRequest) — null quando quem decidiu foi staff.
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
          occurredAt: result.decidedAt ?? new Date().toISOString(),
          decidedByCustomerId: by.customerId ?? null,
        });
      } else {
        this.events.emitLateArrivalRejected(slug, {
          requestId: result.id,
          tableSessionId: result.tableSessionId,
          requesterCustomerId: result.customerId,
          reason: by.staffId ? 'host_rejected' : 'host_rejected',
          occurredAt: result.decidedAt ?? new Date().toISOString(),
          decidedByCustomerId: by.customerId ?? null,
          // tableNumber só entra quando REAL — o RETURNING * do UPDATE não
          // tem o join de tables, então o mapRow devolve o default 0 e
          // mandar 0 mentiria "mesa 0" pro FE/event-store.
          ...(result.tableNumber > 0 ? { tableNumber: result.tableNumber } : {}),
        });
      }
    }

    return result;
  }

  /**
   * P1 #23 — single-resource read used by deep-links such as
   * `/manager/stat/late-arrival/:id` and `/host/late-arrival/[id]`.
   * Uses the same row → DTO mapper as `list()` so the synthesized
   * `expired` status remains consistent.
   */
  async getById(id: string) {
    const rows = (await this.tenantConn.query(
      `SELECT lar.*,
              CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
              c.name AS requester_name,
              c.total_visits
         FROM late_arrival_requests lar
    LEFT JOIN table_sessions ts ON ts.id = lar.table_session_id
    LEFT JOIN tables t ON t.id = ts.table_id
    LEFT JOIN customers c ON c.id = lar.customer_id
        WHERE lar.id = $1`,
      [id],
    )) as LateArrivalRow[];
    if (!rows.length) {
      throw new HttpException('Late-arrival request nao encontrado.', HttpStatus.NOT_FOUND);
    }
    return this.mapRow(rows[0]);
  }

  async list(filters: { status?: string; visitId?: string; tableSessionId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`lar.status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.visitId) {
      where.push(`lar.visit_id = $${i++}`);
      params.push(filters.visitId);
    }
    if (filters.tableSessionId) {
      where.push(`lar.table_session_id = $${i++}`);
      params.push(filters.tableSessionId);
    }
    const sql = `SELECT lar.*,
                        CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
                        c.name AS requester_name,
                        c.total_visits
                   FROM late_arrival_requests lar
              LEFT JOIN table_sessions ts ON ts.id = lar.table_session_id
              LEFT JOIN tables t ON t.id = ts.table_id
              LEFT JOIN customers c ON c.id = lar.customer_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY lar.created_at DESC LIMIT 100`;
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
    const effectiveStatus = row.status === 'pending' && ttlMs < now ? 'expired' : row.status;

    return {
      id: row.id,
      visitId: row.visit_id,
      tableSessionId: row.table_session_id,
      customerId: row.customer_id,
      requestingCustomerId: row.customer_id,
      tableNumber: Number(row.table_number ?? 0),
      requesterName: row.requester_name ?? 'Cliente',
      visitContext:
        typeof row.total_visits === 'number' && row.total_visits > 1
          ? `${row.total_visits}a visita`
          : 'primeira visita',
      status: effectiveStatus,
      expectedArrivalAt: row.expected_arrival_at,
      ttlExpiresAt: row.ttl_expires_at,
      expiresAt: row.ttl_expires_at,
      decidedAt: row.decided_at,
      respondedAt: row.decided_at,
      message: row.message,
      escalationLevel: row.escalation_level,
      createdAt: row.created_at,
    };
  }
}
