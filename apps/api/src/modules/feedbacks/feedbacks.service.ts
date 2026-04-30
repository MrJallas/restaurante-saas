import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

export interface SubmitFeedbackInput {
  visitId: string | null;
  customerId: string | null;
  overallRating: number;
  foodRating?: number;
  serviceRating?: number;
  ambienceRating?: number;
  comment?: string;
  tags?: string[];
}

@Injectable()
export class FeedbacksService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async submitFeedback(input: SubmitFeedbackInput) {
    // Dedup only for identified visits — anonymous feedbacks skip the check.
    if (input.visitId) {
      const existing = (await this.tenantConn.query(
        `SELECT id FROM feedbacks WHERE visit_id = $1`,
        [input.visitId],
      )) as { id: string }[];

      if (existing.length > 0) {
        throw new BadRequestException('Feedback ja enviado para esta visita.');
      }
    }

    const rows = (await this.tenantConn.query(
      `INSERT INTO feedbacks
         (visit_id, customer_id, overall_rating, food_rating,
          service_rating, ambience_rating, comment, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        input.visitId,
        input.customerId,
        input.overallRating,
        input.foodRating ?? null,
        input.serviceRating ?? null,
        input.ambienceRating ?? null,
        input.comment ?? null,
        input.tags && input.tags.length > 0 ? input.tags : null,
      ],
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
