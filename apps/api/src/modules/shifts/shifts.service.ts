import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { StaffMessagesService } from '../staff-messages/staff-messages.service';
import { AlertsService } from '../alerts/alerts.service';
import { MongoService } from '../../infra/mongo/mongo.service';

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
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly staffMessages: StaffMessagesService,
    private readonly alerts: AlertsService,
    private readonly mongo: MongoService,
  ) {}

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

  async requestShiftEnd(data: {
    waiterId: string;
    reason?: string;
    slug?: string;
  }): Promise<{
    requestId: string;
    status: 'pending';
    threadId: string | null;
    managerId: string;
  }> {
    const waiterRows = (await this.tenantConn.query(
      `SELECT id, name, role FROM staff WHERE id = $1 AND is_active = true`,
      [data.waiterId],
    )) as Array<{ id: string; name: string; role: string }>;
    const waiter = waiterRows[0];
    if (!waiter) {
      throw new NotFoundException('Garçom não encontrado.');
    }
    if (waiter.role !== 'waiter') {
      throw new BadRequestException('Apenas garçom pode solicitar encerramento de turno.');
    }

    const existing = (await this.tenantConn.query(
      `SELECT id, thread_id FROM staff_shift_end_requests
        WHERE waiter_id = $1 AND status = 'pending'
        ORDER BY requested_at DESC
        LIMIT 1`,
      [data.waiterId],
    )) as Array<{ id: string; thread_id: string | null }>;
    if (existing[0]) {
      return {
        requestId: existing[0].id,
        status: 'pending',
        threadId: existing[0].thread_id,
        managerId: '',
      };
    }

    const managers = (await this.tenantConn.query(
      `SELECT id, name FROM staff
        WHERE role = 'manager' AND is_active = true
        ORDER BY name ASC
        LIMIT 1`,
      [],
    )) as Array<{ id: string; name: string }>;
    const manager = managers[0];
    if (!manager) {
      throw new BadRequestException('Nenhum gerente ativo disponível para aprovar.');
    }

    const requestRows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `INSERT INTO staff_shift_end_requests (waiter_id, manager_id, reason)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [data.waiterId, manager.id, data.reason ?? null],
      ),
    );
    const requestId = requestRows[0].id;
    await this.writeShiftLog({
      eventType: 'shift_end_requested',
      tenantSlug: data.slug,
      requestId,
      staffId: data.waiterId,
      target: {
        type: 'staff_shift_end_requests',
        id: requestId,
      },
      after: {
        status: 'pending',
        waiterId: data.waiterId,
        managerId: manager.id,
        reason: data.reason ?? null,
      },
    });

    const message = await this.staffMessages.send(
      {
        senderStaffId: data.waiterId,
        recipientStaffId: manager.id,
        subject: 'Encerramento de turno',
        body: this.shiftEndRequestBody(requestId, waiter.name, data.reason),
      },
      data.slug,
    );

    await this.tenantConn.query(
      `UPDATE staff_shift_end_requests
          SET thread_id = $1, updated_at = now()
        WHERE id = $2`,
      [message.threadId, requestId],
    );

    await this.alerts.create({
      sev: 'atenção',
      kind: 'shift_end_request_waiter',
      title: 'Garçom pediu encerramento de turno',
      sub: `${waiter.name}${data.reason ? ` · ${data.reason}` : ''}`,
      actions: [
        {
          label: 'Abrir conversa',
          route: `/manager/mensagens/${message.threadId}?slug=${data.slug ?? ''}`,
          kind: 'primary',
        },
      ],
    });

    return {
      requestId,
      status: 'pending',
      threadId: message.threadId,
      managerId: manager.id,
    };
  }

  async decideShiftEndRequest(data: {
    requestId: string;
    managerId: string;
    decision: 'approved' | 'rejected';
    responseMessage?: string;
    slug?: string;
  }): Promise<{
    requestId: string;
    status: 'approved' | 'rejected';
    threadId: string | null;
  }> {
    const rows = (await this.tenantConn.query(
      `SELECT r.id, r.status, r.thread_id, r.waiter_id, w.name AS waiter_name
         FROM staff_shift_end_requests r
         JOIN staff w ON w.id = r.waiter_id
        WHERE r.id = $1`,
      [data.requestId],
    )) as Array<{
      id: string;
      status: string;
      thread_id: string | null;
      waiter_id: string;
      waiter_name: string;
    }>;
    const request = rows[0];
    if (!request) {
      throw new NotFoundException('Pedido de encerramento não encontrado.');
    }
    if (request.status !== 'pending') {
      return {
        requestId: request.id,
        status: request.status as 'approved' | 'rejected',
        threadId: request.thread_id,
      };
    }

    const updated = unwrapRows<{ id: string; status: string }>(
      await this.tenantConn.query(
        `UPDATE staff_shift_end_requests
            SET status = $1,
                manager_id = $2,
                response_message = $3,
                decided_at = now(),
                updated_at = now()
          WHERE id = $4 AND status = 'pending'
          RETURNING id, status`,
        [data.decision, data.managerId, data.responseMessage ?? null, data.requestId],
      ),
    );
    const status = (updated[0]?.status ?? data.decision) as 'approved' | 'rejected';
    await this.writeShiftLog({
      eventType: 'shift_end_decided',
      tenantSlug: data.slug,
      requestId: request.id,
      staffId: data.managerId,
      target: {
        type: 'staff_shift_end_requests',
        id: request.id,
      },
      before: {
        status: request.status,
        waiterId: request.waiter_id,
      },
      after: {
        status,
        responseMessage: data.responseMessage ?? null,
      },
    });

    if (request.thread_id) {
      const responseBody =
        status === 'approved'
          ? `Encerramento aprovado. ${request.waiter_name} pode sair do turno.`
          : `Encerramento recusado.${data.responseMessage ? ` Motivo: ${data.responseMessage}` : ''}`;
      await this.staffMessages.send(
        {
          senderStaffId: data.managerId,
          threadId: request.thread_id,
          body: `${responseBody}\nSHIFT_END_REQUEST:${request.id}`,
        },
        data.slug,
      );
    }

    return {
      requestId: request.id,
      status,
      threadId: request.thread_id,
    };
  }

  private shiftEndRequestBody(requestId: string, waiterName: string, reason?: string): string {
    return [
      `Pedido de encerramento de turno de ${waiterName}.`,
      reason ? `Motivo: ${reason}` : 'Motivo não informado.',
      `SHIFT_END_REQUEST:${requestId}`,
    ].join('\n');
  }

  private async writeShiftLog(entry: {
    eventType: 'shift_end_requested' | 'shift_end_decided';
    tenantSlug?: string;
    requestId: string;
    staffId: string;
    target: Record<string, unknown>;
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
  }): Promise<void> {
    const db = this.mongo.tryDb();
    if (!db) return;
    await db
      .collection('shift_logs')
      .insertOne({
        tenantId: entry.tenantSlug ?? null,
        eventType: entry.eventType,
        requestId: entry.requestId,
        staffId: entry.staffId,
        target: entry.target,
        before: entry.before ?? null,
        after: entry.after,
        timestamp: new Date(),
      })
      .catch(() => undefined);
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
