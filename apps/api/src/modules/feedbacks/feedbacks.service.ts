import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

@Injectable()
export class FeedbacksService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async submitFeedback(
    visitId: string,
    customerId: string | null,
    overallRating: number,
    foodRating?: number,
    serviceRating?: number,
    ambienceRating?: number,
    comment?: string,
  ) {
    // Check for existing feedback for this visit
    const existing = (await this.tenantConn.query(
      `SELECT id FROM feedbacks WHERE visit_id = $1`,
      [visitId],
    )) as { id: string }[];

    if (existing.length > 0) {
      throw new BadRequestException('Feedback ja enviado para esta visita.');
    }

    const rows = (await this.tenantConn.query(
      `INSERT INTO feedbacks (visit_id, customer_id, overall_rating, food_rating, service_rating, ambience_rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [visitId, customerId, overallRating, foodRating || null, serviceRating || null, ambienceRating || null, comment || null],
    )) as { id: string; created_at: string }[];

    return {
      feedbackId: rows[0].id,
      createdAt: rows[0].created_at,
    };
  }

  async getFeedbackByVisit(visitId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT * FROM feedbacks WHERE visit_id = $1`,
      [visitId],
    )) as unknown[];

    return rows[0] || null;
  }
}
