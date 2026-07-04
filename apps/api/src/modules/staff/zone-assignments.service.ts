import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * Atribuição explícita garçom→zona por dia (decisão Caleb 2026-07-04,
 * migration 060). É a fonte REAL da carga por garçom: o gerente atribui,
 * as mesas ocupadas da zona contam pro garçom — nada de carga inventada.
 * O roteamento de entregas NÃO muda (doutrina 2026-06-10: alvo continua
 * último-que-atendeu → turno → round-robin).
 */
@Injectable()
export class ZoneAssignmentsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  /** Zonas do dia com garçons atribuídos + carga real (mesas ocupadas). */
  async listToday() {
    const rows = (await this.tenantConn.query(
      `SELECT z.id AS zone_id, z.name AS zone_name,
              a.id AS assignment_id, s.id AS staff_id, s.name AS staff_name,
              (SELECT COUNT(*) FROM tables t
                JOIN table_sessions ts ON ts.table_id = t.id AND ts.status = 'active'
               WHERE t.zone_id = z.id)::int AS occupied_tables,
              (SELECT COUNT(*) FROM tables t WHERE t.zone_id = z.id)::int AS total_tables
         FROM zones z
         LEFT JOIN waiter_zone_assignments a
                ON a.zone_id = z.id
               AND a.work_date = current_date
               AND a.removed_at IS NULL
         LEFT JOIN staff s ON s.id = a.staff_id AND s.is_active = true
        WHERE z.is_active = true
        ORDER BY z.sort_order, z.name, s.name`,
    )) as Array<{
      zone_id: string;
      zone_name: string;
      assignment_id: string | null;
      staff_id: string | null;
      staff_name: string | null;
      occupied_tables: unknown;
      total_tables: unknown;
    }>;

    const zones = new Map<
      string,
      {
        zoneId: string;
        zoneName: string;
        occupiedTables: number;
        totalTables: number;
        waiters: Array<{ assignmentId: string; staffId: string; name: string }>;
      }
    >();
    for (const r of rows) {
      if (!zones.has(r.zone_id)) {
        zones.set(r.zone_id, {
          zoneId: r.zone_id,
          zoneName: r.zone_name,
          occupiedTables: Number(r.occupied_tables) || 0,
          totalTables: Number(r.total_tables) || 0,
          waiters: [],
        });
      }
      if (r.assignment_id && r.staff_id && r.staff_name) {
        zones.get(r.zone_id)!.waiters.push({
          assignmentId: r.assignment_id,
          staffId: r.staff_id,
          name: r.staff_name,
        });
      }
    }
    return { zones: Array.from(zones.values()) };
  }

  /** Atribui garçom à zona HOJE (idempotente via unique parcial). */
  async assign(staffId: string, zoneId: string, assignedBy: string) {
    const staffRows = (await this.tenantConn.query(
      `SELECT id FROM staff WHERE id = $1 AND is_active = true`,
      [staffId],
    )) as Array<{ id: string }>;
    if (!staffRows.length) {
      throw new BadRequestException('Funcionário inválido ou inativo.');
    }
    const rows = (await this.tenantConn.query(
      `INSERT INTO waiter_zone_assignments (staff_id, zone_id, work_date, assigned_by)
       VALUES ($1, $2, current_date, $3)
       ON CONFLICT (staff_id, zone_id, work_date) WHERE removed_at IS NULL
       DO UPDATE SET assigned_by = EXCLUDED.assigned_by
       RETURNING id`,
      [staffId, zoneId, assignedBy],
    )) as Array<{ id: string }>;
    return { assignmentId: rows[0].id };
  }

  /** Remove a atribuição (preserva o histórico do dia via removed_at). */
  async remove(assignmentId: string) {
    const rows = (await this.tenantConn.query(
      `UPDATE waiter_zone_assignments
          SET removed_at = now()
        WHERE id = $1 AND removed_at IS NULL
      RETURNING id`,
      [assignmentId],
    )) as Array<{ id: string }>;
    if (!rows.length) {
      throw new NotFoundException('Atribuição não encontrada ou já removida.');
    }
    return { ok: true };
  }
}
