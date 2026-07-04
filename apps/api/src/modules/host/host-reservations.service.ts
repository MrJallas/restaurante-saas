import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import type { ReservationEntryDto, ReservationStatus } from '@restaurant/shared-types';

interface ReservationRow {
  id: string;
  name: string;
  party: number;
  phone: string | null;
  scheduled_at: string;
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
 * criar (parsing de when='HH:MM' → hoje às HH:MM no fuso do servidor, ou
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
              r.scheduled_at, r.table_id,
              CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
              r.status, r.arrived_at, r.cancelled_at, r.note
         FROM reservations r
         LEFT JOIN tables t ON t.id = r.table_id
        WHERE r.scheduled_at::date = CURRENT_DATE
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
    let scheduledAt: string;
    if (/^\d{2}:\d{2}$/.test(body.when)) {
      // "HH:MM" -> hoje as HH:MM no fuso do servidor.
      const [hh, mm] = body.when.split(':').map((n) => parseInt(n, 10));
      const today = new Date();
      today.setHours(hh, mm, 0, 0);
      scheduledAt = today.toISOString();
    } else {
      const parsed = new Date(body.when);
      if (Number.isNaN(parsed.getTime())) {
        throw new HttpException('when invalido (use HH:MM ou ISO 8601).', HttpStatus.BAD_REQUEST);
      }
      scheduledAt = parsed.toISOString();
    }

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
        `SELECT r.id, r.name, r.party, r.phone, r.scheduled_at, r.table_id,
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

  private async findTableByNumber(number: number): Promise<{ id: string } | null> {
    // O FE conversa em "table number" (int), o DB persiste `code` (text). O
    // padrao convencionado pelo seed eh `code = "<number>"` (ex: "12") ou
    // "M12" — extraimos so os digitos pra comparar.
    const rows = (await this.tenantConn.query(
      `SELECT id
         FROM tables
        WHERE CAST(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '') AS INT) = $1
        LIMIT 1`,
      [number],
    )) as Array<{ id: string }>;
    return rows[0] ?? null;
  }

  private mapReservationRow(row: ReservationRow): ReservationEntryDto {
    const d = new Date(row.scheduled_at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      id: row.id,
      name: row.name,
      party: row.party,
      phone: row.phone ?? undefined,
      when: `${hh}:${mm}`,
      table: row.table_number,
      status: row.status,
      note: row.note,
    };
  }
}
