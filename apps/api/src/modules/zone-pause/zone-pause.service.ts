import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';

/**
 * Zone pause · per docs/produto/funcionalidades/pausa-de-zona.md (V13).
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

    const waiterRows = unwrapRows<{ id: string; name: string; role: string; is_active: boolean }>(
      await this.tenantConn.query(
        `SELECT id, name, role, is_active
           FROM staff
          WHERE id = $1
          LIMIT 1`,
        [input.waiterId],
      ),
    );
    const waiter = waiterRows[0];
    if (!waiter || waiter.role !== 'waiter' || waiter.is_active !== true) {
      throw new BadRequestException({
        message_user: 'Selecione um garçom em turno para pausar a zona.',
        code: 'ZONE_PAUSE_INVALID_WAITER',
      });
    }

    const activeRows = unwrapRows<{ id: string; ends_at: string }>(
      await this.tenantConn.query(
        `SELECT id, ends_at
           FROM zone_pauses
          WHERE waiter_id = $1
            AND ended_at IS NULL
            AND ends_at > now()
          LIMIT 1`,
        [input.waiterId],
      ),
    );
    if (activeRows.length) {
      throw new BadRequestException({
        message_user:
          'Esse garçom já tem uma pausa ativa. Encerre a pausa atual antes de iniciar outra.',
        code: 'ZONE_PAUSE_ALREADY_ACTIVE',
      });
    }

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
      const waiterName = await this.lookupStaffName(result.waiterId);
      this.events.emitZonePauseStarted(slug, {
        id: result.id,
        waiterId: result.waiterId,
        waiterName,
        endsAt: result.endsAt,
        startedBy: result.startedBy,
        reason: result.reason,
      });
    }

    return result;
  }

  private async lookupStaffName(staffId: string): Promise<string> {
    try {
      const rows = unwrapRows<{ name: string }>(
        await this.tenantConn.query(`SELECT name FROM staff WHERE id = $1`, [staffId]),
      );
      return rows[0]?.name ?? '';
    } catch (error) {
      this.logger.warn(
        `Unable to resolve zone-pause waiter name for staff ${staffId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return '';
    }
  }

  async end(id: string, by: { endedBy?: string; reason?: string }, slug?: string) {
    const updated = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE zone_pauses
           SET ended_at = now(),
               ended_by = COALESCE($1, ended_by),
               reason = COALESCE($2, reason)
         WHERE id = $3 AND ended_at IS NULL
         RETURNING *`,
        [by.endedBy ?? null, by.reason ?? null, id],
      ),
    );
    if (!updated.length) {
      throw new HttpException('Zone pause nao encontrada ou ja encerrada.', HttpStatus.NOT_FOUND);
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
  async endEarly(id: string, by: { endedBy?: string; reason?: string }, slug?: string) {
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
    const sql = `SELECT zone_pauses.*,
                        waiter.name AS waiter_name,
                        starter.name AS started_by_name
                   FROM zone_pauses
            LEFT JOIN staff waiter ON waiter.id = zone_pauses.waiter_id
            LEFT JOIN staff starter ON starter.id = zone_pauses.started_by
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY started_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * P1 IDOR-READ (re-scan de convergência #6): projeção enxuta pro caller
   * de SESSÃO (customer). O `list()` acima faz JOIN em `staff` e o `mapRow`
   * expõe `waiterName` / `startedByName` (nomes completos), `startedBy` /
   * `endedBy` (UUIDs de staff → vetor de escalação id→role→x-staff-id, mesmo
   * leak que staff.controller já bloqueia) e `reason` (nota interna do
   * manager). O FE customer (useZonePause.ts, interface ActiveZonePause) só
   * consome `{ id, waiterId, endsAt }` — então aqui NÃO fazemos o JOIN e
   * projetamos SÓ o que ele precisa (+ `active`, derivado). Nenhum campo de
   * staff pode existir nesta linha, nem por acidente.
   *
   * Mesma classe que a Wave 13 fechou em staff/performance (b51a8ef) e
   * continuation (ec01ea1): branch por actorType no controller. Staff continua
   * batendo no `list()` completo — o dashboard PRECISA dos nomes/reason.
   */
  async listPublic(filters: { active?: boolean; waiterId?: string }) {
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
    const sql = `SELECT id, waiter_id, ends_at, ended_at
                   FROM zone_pauses
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY started_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const endedAt = (row.ended_at as string | null) ?? null;
      const endsAt = row.ends_at as string;
      const active = endedAt === null && (!endsAt || new Date(endsAt).getTime() > Date.now());
      return {
        id: row.id as string,
        waiterId: row.waiter_id as string,
        endsAt,
        active,
      };
    });
  }

  private mapRow(row: Record<string, unknown>) {
    const endedAt = (row.ended_at as string | null) ?? null;
    const endsAt = row.ends_at as string;
    const active = endedAt === null && (!endsAt || new Date(endsAt).getTime() > Date.now());
    return {
      id: row.id as string,
      waiterId: row.waiter_id as string,
      waiterName: (row.waiter_name as string | null) ?? '',
      kind: 'orders',
      startedAt: row.started_at as string,
      endsAt,
      startedBy: row.started_by as string,
      startedByName: (row.started_by_name as string | null) ?? '',
      endedAt,
      endedBy: (row.ended_by as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
      active,
    };
  }
}
