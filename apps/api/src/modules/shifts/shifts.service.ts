import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';

export interface ShiftDefinitionRow {
  id: string;
  label: string;
  range_label: string;
  time_start: string;
  time_end: string;
  sort_order: number;
}

export interface ShiftMemberRow {
  assignment_id: string;
  staff_id: string;
  staff_name: string;
  staff_role: string;
  work_date: string;
  overtime_minutes: number;
}

export interface ShiftWithMembersRow extends ShiftDefinitionRow {
  members: ShiftMemberRow[];
}

@Injectable()
export class ShiftsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async listForDate(workDate: string): Promise<ShiftWithMembersRow[]> {
    const shifts = (await this.tenantConn.query(
      `SELECT id, label, range_label, time_start::text AS time_start,
              time_end::text AS time_end, sort_order
         FROM staff_shifts
         ORDER BY sort_order ASC, time_start ASC`,
      [],
    )) as ShiftDefinitionRow[];

    const members = (await this.tenantConn.query(
      `SELECT a.id   AS assignment_id,
              a.shift_id,
              a.staff_id,
              s.name AS staff_name,
              s.role AS staff_role,
              a.work_date::text AS work_date,
              a.overtime_minutes
         FROM staff_shift_assignments a
         JOIN staff s ON s.id = a.staff_id
        WHERE a.work_date = $1
          AND a.removed_at IS NULL
        ORDER BY s.name ASC`,
      [workDate],
    )) as Array<ShiftMemberRow & { shift_id: string }>;

    return shifts.map((sh) => ({
      ...sh,
      members: members
        .filter((m) => m.shift_id === sh.id)
        .map((m) => ({
          assignment_id: m.assignment_id,
          staff_id: m.staff_id,
          staff_name: m.staff_name,
          staff_role: m.staff_role,
          work_date: m.work_date,
          overtime_minutes: m.overtime_minutes,
        })),
    }));
  }

  async addMember(data: {
    shiftId: string;
    staffId: string;
    workDate: string;
  }): Promise<ShiftMemberRow & { shift_id: string }> {
    // Conflict check: staff já escalado nesse turno+data
    const existing = (await this.tenantConn.query(
      `SELECT id FROM staff_shift_assignments
        WHERE shift_id = $1 AND staff_id = $2 AND work_date = $3 AND removed_at IS NULL`,
      [data.shiftId, data.staffId, data.workDate],
    )) as Array<{ id: string }>;
    if (existing.length) {
      throw new BadRequestException(
        'Funcionário já escalado nesse turno nessa data.',
      );
    }
    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `INSERT INTO staff_shift_assignments (shift_id, staff_id, work_date)
         VALUES ($1, $2, $3) RETURNING id`,
        [data.shiftId, data.staffId, data.workDate],
      ),
    );
    if (!rows.length) throw new BadRequestException('Falha ao adicionar.');
    return this.getMember(rows[0].id);
  }

  async moveMember(assignmentId: string, toShiftId: string): Promise<ShiftMemberRow & { shift_id: string }> {
    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE staff_shift_assignments
            SET shift_id = $1
          WHERE id = $2 AND removed_at IS NULL
          RETURNING id`,
        [toShiftId, assignmentId],
      ),
    );
    if (!rows.length) throw new NotFoundException('Escala não encontrada.');
    return this.getMember(rows[0].id);
  }

  async setOvertime(assignmentId: string, minutes: number): Promise<ShiftMemberRow & { shift_id: string }> {
    if (minutes < 0 || minutes > 600) {
      throw new BadRequestException('Hora extra fora do limite (0-600 min).');
    }
    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE staff_shift_assignments
            SET overtime_minutes = $1
          WHERE id = $2 AND removed_at IS NULL
          RETURNING id`,
        [minutes, assignmentId],
      ),
    );
    if (!rows.length) throw new NotFoundException('Escala não encontrada.');
    return this.getMember(rows[0].id);
  }

  async removeMember(assignmentId: string): Promise<{ removed: true }> {
    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE staff_shift_assignments
            SET removed_at = now()
          WHERE id = $1 AND removed_at IS NULL
          RETURNING id`,
        [assignmentId],
      ),
    );
    if (!rows.length) throw new NotFoundException('Escala não encontrada.');
    return { removed: true };
  }

  async duplicateWeek(fromDate: string, toDate: string): Promise<{ duplicated: number }> {
    // Copy todas as assignments do fromDate pra toDate (skip se ja existir
    // pra mesmo staff+shift+toDate).
    const rows = (await this.tenantConn.query(
      `INSERT INTO staff_shift_assignments (shift_id, staff_id, work_date)
       SELECT shift_id, staff_id, $2::date
         FROM staff_shift_assignments
        WHERE work_date = $1 AND removed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM staff_shift_assignments b
             WHERE b.shift_id = staff_shift_assignments.shift_id
               AND b.staff_id = staff_shift_assignments.staff_id
               AND b.work_date = $2::date
               AND b.removed_at IS NULL
          )
       RETURNING id`,
      [fromDate, toDate],
    )) as Array<{ id: string }>;
    return { duplicated: rows.length };
  }

  private async getMember(assignmentId: string): Promise<ShiftMemberRow & { shift_id: string }> {
    const rows = (await this.tenantConn.query(
      `SELECT a.id AS assignment_id, a.shift_id, a.staff_id,
              s.name AS staff_name, s.role AS staff_role,
              a.work_date::text AS work_date,
              a.overtime_minutes
         FROM staff_shift_assignments a
         JOIN staff s ON s.id = a.staff_id
        WHERE a.id = $1`,
      [assignmentId],
    )) as Array<ShiftMemberRow & { shift_id: string }>;
    if (!rows.length) throw new NotFoundException('Escala não encontrada.');
    return rows[0];
  }
}
