import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import type { ReservationEntryDto, ReservationStatus } from '@restaurant/shared-types';
import {
  RESTAURANT_LOCAL_DATE_SQL,
  RESTAURANT_TIMEZONE_SQL,
  restaurantLocalDateOfSql,
  restaurantLocalDateTimeToInstantSql,
} from '../../common/utils/restaurant-local-time';

interface ReservationRow {
  id: string;
  name: string;
  party: number;
  phone: string | null;
  scheduled_at: string;
  local_time: string;
  table_id: string | null;
  table_number: number | null;
  status: ReservationStatus;
  arrived_at: string | null;
  cancelled_at: string | null;
  note: string | null;
}

/**
 * Reservas do host — extraídas do host.service (decomposição do god
 * service). CRUD do dia: listar as reservas de hoje + as ainda em aberto,
 * criar (when='HH:MM' → hoje às HH:MM no fuso configurado do restaurante, ou
 * ISO 8601) e atualizar status/mesa/nota. O HostService mantém delegates de
 * 1 linha pra preservar a facade usada pelo host.controller.
 *
 * findTableByNumber: o helper compartilhado PERMANECEU no host.service
 * (usado por liberate/swap/vip/meta). Aqui duplicamos a lookup mínima —
 * mesma query — em vez de mover o helper, pra manter os corpos das reservas
 * verbatim (`this.findTableByNumber`) sem acoplar os dois serviços.
 */
@Injectable()
export class HostReservationsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async listReservations(): Promise<ReservationEntryDto[]> {
    const rows = (await this.tenantConn.query(
      `SELECT r.id, r.name, r.party, r.phone,
              r.scheduled_at,
              to_char(r.scheduled_at AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL}, 'HH24:MI') AS local_time,
              r.table_id,
              CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
              r.status, r.arrived_at, r.cancelled_at, r.note
         FROM reservations r
         LEFT JOIN tables t ON t.id = r.table_id
        WHERE ${restaurantLocalDateOfSql('r.scheduled_at')} = ${RESTAURANT_LOCAL_DATE_SQL}
           OR r.status IN ('awaited', 'arrived')
        ORDER BY r.scheduled_at ASC`,
    )) as ReservationRow[];
    return rows.map((r) => this.mapReservationRow(r));
  }

  async createReservation(body: {
    name: string;
    party: number;
    phone?: string;
    when: string;
    table?: number;
    note?: string;
    staffId?: string;
  }): Promise<ReservationEntryDto> {
    const scheduledAt = await this.resolveScheduledAt(body.when);

    let tableId: string | null = null;
    if (body.table != null) {
      const t = await this.findTableByNumber(body.table);
      if (!t) {
        throw new NotFoundException(`Mesa ${body.table} nao encontrada.`);
      }
      tableId = t.id;
    }

    const inserted = unwrapRows<ReservationRow>(
      await this.tenantConn.query(
        `INSERT INTO reservations
           (name, party, phone, scheduled_at, table_id, note, created_by_staff_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, party, phone, scheduled_at, table_id, status,
                   arrived_at, cancelled_at, note,
                   to_char(scheduled_at AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL}, 'HH24:MI') AS local_time,
                   (SELECT CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT)
                      FROM tables WHERE id = table_id) AS table_number`,
        [
          body.name,
          body.party,
          body.phone ?? null,
          scheduledAt,
          tableId,
          body.note ?? null,
          body.staffId ?? null,
        ],
      ),
    )[0];

    return this.mapReservationRow(inserted);
  }

  async updateReservation(
    id: string,
    body: {
      status?: 'arrived' | 'cancelled' | 'no_show';
      table?: number;
      note?: string;
    },
  ): Promise<ReservationEntryDto> {
    const existing = unwrapRows<{ id: string }>(
      await this.tenantConn.query(`SELECT id FROM reservations WHERE id = $1`, [id]),
    )[0];
    if (!existing) {
      throw new NotFoundException('Reserva nao encontrada.');
    }

    const setClause: string[] = ['updated_at = now()'];
    const params: unknown[] = [id];
    if (body.status) {
      setClause.push(`status = $${params.length + 1}`);
      params.push(body.status);
      if (body.status === 'arrived') setClause.push('arrived_at = now()');
      if (body.status === 'cancelled') setClause.push('cancelled_at = now()');
    }
    if (body.note != null) {
      setClause.push(`note = $${params.length + 1}`);
      params.push(body.note);
    }
    if (body.table != null) {
      const t = await this.findTableByNumber(body.table);
      if (!t) {
        throw new NotFoundException(`Mesa ${body.table} nao encontrada.`);
      }
      setClause.push(`table_id = $${params.length + 1}`);
      params.push(t.id);
    }

    await this.tenantConn.query(
      `UPDATE reservations SET ${setClause.join(', ')} WHERE id = $1`,
      params,
    );

    const refreshed = unwrapRows<ReservationRow>(
      await this.tenantConn.query(
        `SELECT r.id, r.name, r.party, r.phone, r.scheduled_at,
                to_char(r.scheduled_at AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL}, 'HH24:MI') AS local_time,
                r.table_id,
                CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
                r.status, r.arrived_at, r.cancelled_at, r.note
           FROM reservations r
           LEFT JOIN tables t ON t.id = r.table_id
          WHERE r.id = $1`,
        [id],
      ),
    )[0];
    return this.mapReservationRow(refreshed);
  }

  // ─── helpers privados ───

  private async resolveScheduledAt(when: string): Promise<string> {
    if (/^\d{2}:\d{2}$/.test(when)) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(when)) {
        throw new HttpException('when invalido (use HH:MM ou ISO 8601).', HttpStatus.BAD_REQUEST);
      }
      const rows = (await this.tenantConn.query(
        `SELECT ${restaurantLocalDateTimeToInstantSql(
          RESTAURANT_LOCAL_DATE_SQL,
          '$1::time',
        )} AS scheduled_at`,
        [when],
      )) as Array<{ scheduled_at: string | Date }>;
      const raw = rows[0]?.scheduled_at;
      const parsed = raw instanceof Date ? raw : new Date(raw ?? Number.NaN);
      if (Number.isNaN(parsed.getTime())) {
        throw new HttpException('when invalido (use HH:MM ou ISO 8601).', HttpStatus.BAD_REQUEST);
      }
      return parsed.toISOString();
    }

    const parsed = new Date(when);
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpException('when invalido (use HH:MM ou ISO 8601).', HttpStatus.BAD_REQUEST);
    }
    return parsed.toISOString();
  }

  private async findTableByNumber(number: number): Promise<{ id: string } | null> {
    // Mesma resolução determinística do host.service (P1-P do re-scan): code
    // EXATO vence; colisão de dígitos (>1 candidato sem exato, ex.: 'M01'/'D1'
    // → 1) é REJEITADA como ambígua em vez de escolher mesa arbitrária via
    // LIMIT 1 sem ORDER BY. Aqui a reserva agiria na mesa errada.
    const rows = (await this.tenantConn.query(
      `SELECT id, code
         FROM tables
        WHERE code = $2
           OR CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT) = $1
        ORDER BY id ASC`,
      [number, String(number)],
    )) as Array<{ id: string; code: string }>;
    if (rows.length === 0) return null;
    const exact = rows.find((r) => r.code === String(number));
    if (exact) return { id: exact.id };
    if (rows.length > 1) {
      throw new BadRequestException(
        `Codigo de mesa ambiguo para o numero ${number}: ${rows
          .map((r) => r.code)
          .join(', ')}. Use o codigo exato da mesa.`,
      );
    }
    return { id: rows[0].id };
  }

  private mapReservationRow(row: ReservationRow): ReservationEntryDto {
    return {
      id: row.id,
      name: row.name,
      party: row.party,
      phone: row.phone ?? undefined,
      when: row.local_time,
      table: row.table_number,
      status: row.status,
      note: row.note,
    };
  }
}
