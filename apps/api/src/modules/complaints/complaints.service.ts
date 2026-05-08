import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async create(input: {
    customerId?: string | null;
    visitId?: string | null;
    orderId?: string | null;
    orderRatingId?: string | null;
    rating?: number | null;
    text: string;
    attachedImageUrl?: string | null;
    autoFromRating?: boolean;
  }) {
    const rows = (await this.tenantConn.query(
      `INSERT INTO complaints
         (customer_id, visit_id, order_id, order_rating_id, rating,
          text, attached_image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review')
       RETURNING *`,
      [
        input.customerId ?? null,
        input.visitId ?? null,
        input.orderId ?? null,
        input.orderRatingId ?? null,
        input.rating ?? null,
        input.text,
        input.attachedImageUrl ?? null,
      ],
    )) as Array<Record<string, unknown>>;

    return this.mapRow(rows[0]);
  }

  /**
   * Helper called by the order-ratings service when a low rating (1-2) is
   * submitted with comment text — auto-creates a complaint so the manager
   * sees it in their queue.
   */
  async createFromRating(input: {
    customerId: string;
    visitId?: string | null;
    orderId: string;
    orderRatingId: string;
    rating: number;
    comment: string;
  }) {
    return this.create({
      customerId: input.customerId,
      visitId: input.visitId,
      orderId: input.orderId,
      orderRatingId: input.orderRatingId,
      rating: input.rating,
      text: input.comment,
      autoFromRating: true,
    });
  }

  async respond(
    id: string,
    by: { staffId?: string },
    body: { content: string; chipAction?: string },
  ) {
    const updated = (await this.tenantConn.query(
      `UPDATE complaints
         SET status = 'responded',
             response_text = $1,
             response_at = now(),
             assigned_manager_id = COALESCE($2, assigned_manager_id),
             updated_at = now()
       WHERE id = $3 AND status IN ('pending_review','in_progress')
       RETURNING *`,
      [body.content, by.staffId ?? null, id],
    )) as Array<Record<string, unknown>>;
    if (!updated.length) {
      throw new HttpException(
        'Reclamacao nao encontrada ou ja respondida.',
        HttpStatus.NOT_FOUND,
      );
    }
    return { ...this.mapRow(updated[0]), chipAction: body.chipAction ?? null };
  }

  async resolve(id: string, by: { staffId?: string }) {
    const updated = (await this.tenantConn.query(
      `UPDATE complaints
         SET status = 'closed',
             closed_at = now(),
             assigned_manager_id = COALESCE($1, assigned_manager_id),
             updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [by.staffId ?? null, id],
    )) as Array<Record<string, unknown>>;
    if (!updated.length) {
      throw new HttpException(
        'Reclamacao nao encontrada.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.mapRow(updated[0]);
  }

  async forward(id: string, toStaffId: string, notes?: string) {
    const updated = (await this.tenantConn.query(
      `UPDATE complaints
         SET assigned_manager_id = $1,
             status = 'in_progress',
             response_text = COALESCE($2, response_text),
             updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [toStaffId, notes ?? null, id],
    )) as Array<Record<string, unknown>>;
    if (!updated.length) {
      throw new HttpException(
        'Reclamacao nao encontrada.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.mapRow(updated[0]);
  }

  async list(filters: { status?: string; assignedManagerId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.assignedManagerId) {
      where.push(`assigned_manager_id = $${i++}`);
      params.push(filters.assignedManagerId);
    }
    const sql = `SELECT * FROM complaints
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY submitted_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      orderId: (row.order_id as string | null) ?? null,
      orderRatingId: (row.order_rating_id as string | null) ?? null,
      customerId: (row.customer_id as string | null) ?? null,
      visitId: (row.visit_id as string | null) ?? null,
      rating: (row.rating as number | null) ?? null,
      text: row.text as string,
      attachedImageUrl: (row.attached_image_url as string | null) ?? null,
      status: row.status as string,
      assignedManagerId: (row.assigned_manager_id as string | null) ?? null,
      responseText: (row.response_text as string | null) ?? null,
      responseAt: (row.response_at as string | null) ?? null,
      submittedAt: row.submitted_at as string,
      closedAt: (row.closed_at as string | null) ?? null,
    };
  }
}
