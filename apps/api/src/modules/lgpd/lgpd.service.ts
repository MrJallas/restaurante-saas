import { Injectable, Logger, Optional } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { EventsGateway } from '../websocket/events.gateway';

/**
 * LGPD requests · per docs/features/chat-history-lgpd.md.
 *
 * `erasure` is the only kind we fulfill synchronously today (MVP) — the
 * caller is told the action is `fulfilled` immediately. We chose synchronous
 * over a queued job because the only target store (MongoDB) is reachable
 * from the API process and erasures are typically small. If a queue is
 * desired later, the service can be split into `request` + `worker`.
 *
 * `export` (data portability) stays as `pending` for manager handling.
 */
@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly chatHistory: ChatHistoryService,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async createRequest(
    input: {
      customerId?: string | null;
      customerCpf?: string | null;
      customerEmail?: string | null;
      kind: 'erasure' | 'export';
      notes?: string;
    },
    slug?: string,
  ) {
    const protocolNumber = generateProtocolNumber();

    const fulfilled = await this.tenantConn.transaction(async (tx) => {
      const inserted = (await tx.query(
        `INSERT INTO lgpd_requests
           (customer_id, customer_cpf, customer_email, kind, status,
            protocol_number, notes)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)
         RETURNING *`,
        [
          input.customerId ?? null,
          input.customerCpf ?? null,
          input.customerEmail ?? null,
          input.kind,
          protocolNumber,
          input.notes ?? null,
        ],
      )) as Array<Record<string, unknown>>;

      const row = inserted[0];

      // Erasure: fulfill immediately (delete chat history in Mongo).
      if (input.kind === 'erasure' && input.customerId) {
        const result = await this.chatHistory.deleteAllForCustomer(
          input.customerId,
        );
        await tx.query(
          `UPDATE lgpd_requests
             SET status = 'fulfilled',
                 fulfilled_at = now(),
                 notes = COALESCE(notes, '') || $1,
                 updated_at = now()
           WHERE id = $2`,
          [
            ` · erasure executed: deletedCount=${result.deletedCount} mongoAvailable=${result.mongoAvailable}`,
            row.id,
          ],
        );
        const refreshed = (await tx.query(
          `SELECT * FROM lgpd_requests WHERE id = $1`,
          [row.id],
        )) as Array<Record<string, unknown>>;
        return {
          dto: this.toProtocolDto(refreshed[0]),
          row: refreshed[0],
          wasFulfilled: true,
        };
      }

      return {
        dto: this.toProtocolDto(row),
        row,
        wasFulfilled: false,
      };
    });

    if (
      fulfilled.wasFulfilled &&
      slug &&
      this.events &&
      input.customerId
    ) {
      this.events.emitLgpdFulfilled(
        slug,
        input.customerId,
        protocolNumber,
        fulfilled.row.id as string,
      );
    }

    return fulfilled.dto;
  }

  async list(filters: { status?: string; kind?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.kind) {
      where.push(`kind = $${i++}`);
      params.push(filters.kind);
    }
    const sql = `SELECT * FROM lgpd_requests
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY requested_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.toFullDto(r));
  }

  private toProtocolDto(row: Record<string, unknown>) {
    const expires = new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
    return {
      protocolNumber: row.protocol_number as string,
      status: row.status as string,
      executedAt: ((row.fulfilled_at as string | null) ??
        (row.requested_at as string)) as string,
      expiresAt: expires,
    };
  }

  private toFullDto(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      kind: row.kind as string,
      status: row.status as string,
      protocolNumber: row.protocol_number as string,
      customerId: (row.customer_id as string | null) ?? null,
      customerCpf: (row.customer_cpf as string | null) ?? null,
      requestedAt: row.requested_at as string,
      fulfilledAt: (row.fulfilled_at as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
    };
  }
}

/**
 * Format: `LGPD-AAAA-MM-DD-XXXX` (per shared-types). XXXX is a random 4-digit
 * number — collisions are protected by the UNIQUE column on the table; on
 * the rare retry, the caller would just get a 500 (acceptable for V1).
 */
function generateProtocolNumber(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
  return `LGPD-${yyyy}-${mm}-${dd}-${rand}`;
}
