import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * Zone pause · per docs/features/zone-pause.md.
 *
 * Naming caveat: the spec talks about "waiter zones" but the table is keyed
 * by `zone_id` (the spatial zone). For the MVP we expose both `waiterId`
 * (legacy spec) and `zoneId` (DB column) and let the caller choose. Day-2
 * cleanup decision is on the architect side.
 */
@Injectable()
export class ZonePauseService {
  private readonly logger = new Logger(ZonePauseService.name);

  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async create(input: {
    zoneId?: string | null;
    zoneName?: string | null;
    kind?: 'orders' | 'all';
    durationMinutes?: number;
    reason?: string;
    createdByStaffId?: string;
  }) {
    const endsAt = input.durationMinutes
      ? new Date(Date.now() + input.durationMinutes * 60 * 1000).toISOString()
      : null;

    const rows = (await this.tenantConn.query(
      `INSERT INTO zone_pauses
         (zone_id, zone_name, kind, reason, ends_at, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.zoneId ?? null,
        input.zoneName ?? null,
        input.kind ?? 'orders',
        input.reason ?? null,
        endsAt,
        input.createdByStaffId ?? null,
      ],
    )) as Array<Record<string, unknown>>;

    return this.mapRow(rows[0]);
  }

  async end(id: string, by: { staffId?: string; reason?: string }) {
    const updated = (await this.tenantConn.query(
      `UPDATE zone_pauses
         SET ends_at = LEAST(COALESCE(ends_at, now()), now()),
             ended_by_staff_id = COALESCE($1, ended_by_staff_id),
             reason = COALESCE($2, reason),
             updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [by.staffId ?? null, by.reason ?? null, id],
    )) as Array<Record<string, unknown>>;
    if (!updated.length) {
      throw new HttpException(
        'Zone pause nao encontrada.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.mapRow(updated[0]);
  }

  async list(filters: { active?: boolean; zoneId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.zoneId) {
      where.push(`zone_id = $${i++}`);
      params.push(filters.zoneId);
    }
    if (filters.active !== undefined) {
      if (filters.active) {
        where.push(`(ends_at IS NULL OR ends_at > now())`);
      } else {
        where.push(`ends_at <= now()`);
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
    const endsAt = row.ends_at as string | null;
    const active = !endsAt || new Date(endsAt).getTime() > Date.now();
    return {
      id: row.id as string,
      zoneId: (row.zone_id as string | null) ?? null,
      zoneName: (row.zone_name as string | null) ?? null,
      kind: row.kind as string,
      reason: (row.reason as string | null) ?? null,
      startedAt: row.started_at as string,
      endsAt,
      endedByStaffId: (row.ended_by_staff_id as string | null) ?? null,
      createdByStaffId: (row.created_by_staff_id as string | null) ?? null,
      active,
    };
  }
}
