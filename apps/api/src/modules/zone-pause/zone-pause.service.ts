import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

/**
 * Zone pause · per docs/features/zone-pause.md (V13).
 *
 * Pause is **waiter-specific**: a manager pauses orders for the tables
 * attended by ONE waiter while the rest of the floor keeps flowing. The
 * `zone_pauses` table was refactored in migration 032 to:
 *
 *   waiter_id   uuid REFERENCES staff(id)   -- whose tables are paused
 *   started_at  timestamptz
 *   ends_at     timestamptz                 -- TTL (default 5min)
 *   started_by  uuid REFERENCES staff(id)   -- the manager who triggered
 *   ended_at    timestamptz                 -- NULL while active
 *   ended_by    uuid REFERENCES staff(id)
 *   reason      text
 */
@Injectable()
export class ZonePauseService {
  private readonly logger = new Logger(ZonePauseService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async create(
    input: {
      waiterId: string;
      durationMinutes?: number;
      reason?: string;
      startedBy?: string;
    },
    slug?: string,
  ) {
    const minutes = input.durationMinutes ?? 5;
    const endsAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    // started_by is NOT NULL in the schema; default to the waiter id when
    // the caller forgot to pass `startedBy` (legacy client). The DTO marks
    // it optional so the API doesn't 400 — we close the gap server-side.
    const startedBy = input.startedBy ?? input.waiterId;

    const rows = (await this.tenantConn.query(
      `INSERT INTO zone_pauses
         (waiter_id, ends_at, started_by, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.waiterId, endsAt, startedBy, input.reason ?? null],
    )) as Array<Record<string, unknown>>;

    const result = this.mapRow(rows[0]);

    if (slug && this.events) {
      // TODO(payload): waiterName needs a join with staff. We pass the id
      // and the FE re-fetches when expanding the banner.
      this.events.emitZonePauseStarted(slug, {
        id: result.id,
        waiterId: result.waiterId,
        waiterName: '',
        endsAt: result.endsAt,
        startedBy: result.startedBy,
        reason: result.reason,
      });
    }

    return result;
  }

  async end(
    id: string,
    by: { endedBy?: string; reason?: string },
    slug?: string,
  ) {
    const updated = (await this.tenantConn.query(
      `UPDATE zone_pauses
         SET ended_at = now(),
             ended_by = COALESCE($1, ended_by),
             reason = COALESCE($2, reason)
       WHERE id = $3 AND ended_at IS NULL
       RETURNING *`,
      [by.endedBy ?? null, by.reason ?? null, id],
    )) as Array<Record<string, unknown>>;
    if (!updated.length) {
      throw new HttpException(
        'Zone pause nao encontrada ou ja encerrada.',
        HttpStatus.NOT_FOUND,
      );
    }
    const result = this.mapRow(updated[0]);

    if (slug && this.events) {
      this.events.emitZonePauseEnded(slug, {
        id: result.id,
        waiterId: result.waiterId,
        endedAt: result.endedAt ?? new Date().toISOString(),
        endedBy: result.endedBy,
        autoExpired: false,
      });
    }

    return result;
  }

  /**
   * Alias for the wiring contract. Delegates to `end()` and forwards slug so
   * the WS event fires.
   */
  async endEarly(
    id: string,
    by: { endedBy?: string; reason?: string },
    slug?: string,
  ) {
    return this.end(id, by, slug);
  }

  async list(filters: { active?: boolean; waiterId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.waiterId) {
      where.push(`waiter_id = $${i++}`);
      params.push(filters.waiterId);
    }
    if (filters.active !== undefined) {
      if (filters.active) {
        where.push(`ended_at IS NULL AND ends_at > now()`);
      } else {
        where.push(`(ended_at IS NOT NULL OR ends_at <= now())`);
      }
    }
    const sql = `SELECT * FROM zone_pauses
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY started_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>) {
    const endedAt = (row.ended_at as string | null) ?? null;
    const endsAt = row.ends_at as string;
    const active =
      endedAt === null && (!endsAt || new Date(endsAt).getTime() > Date.now());
    return {
      id: row.id as string,
      waiterId: row.waiter_id as string,
      startedAt: row.started_at as string,
      endsAt,
      startedBy: row.started_by as string,
      endedAt,
      endedBy: (row.ended_by as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
      active,
    };
  }
}
