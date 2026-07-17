import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

export interface SubmitFeedbackInput {
  visitId: string;
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

  /**
   * Round 16 (B-NEW-51): idempotency atômica via UNIQUE INDEX em
   * `feedbacks(visit_id) WHERE visit_id IS NOT NULL` (migration 040).
   * Antes fazia SELECT-then-INSERT — 2 requests concorrentes com mesmo
   * visit_id ambos viam empty SELECT, ambos INSERTavam. Agora PG
   * rejeita o segundo com 23505 e traduzimos pra BadRequest amigável.
   */
  async submitFeedback(input: SubmitFeedbackInput, tableSessionId: string) {
    if (!input.customerId) {
      throw new ForbiddenException('Identificação obrigatória para avaliar esta visita.');
    }
    // Round 5 (P0-X7-1): IDOR — antes qualquer sessão postava feedback com
    // o visitId de OUTRA sessão (só sabendo o UUID). Agora exige que a visit
    // pertença à sessão de mesa do caller (vem do SessionGuard); senão 403.
    const visitOwner = (await this.tenantConn.query(
      `SELECT v.id FROM visits v
        WHERE v.id = $1
          AND v.table_session_id = $2
          AND v.customer_id = $3`,
      [input.visitId, tableSessionId, input.customerId],
    )) as { id: string }[];
    if (!visitOwner.length) {
      throw new ForbiddenException('Visit nao pertence a esta sessao.');
    }

    let rows: { id: string; created_at: string }[];
    try {
      rows = (await this.tenantConn.query(
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
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
        throw new BadRequestException('Feedback ja enviado para esta visita.');
      }
      throw err;
    }

    return {
      feedbackId: rows[0].id,
      createdAt: rows[0].created_at,
    };
  }

  /**
   * Round 5 (B-NEW-17): IDOR fix — antes retornava feedback de qualquer
   * visitId conhecendo só o UUID. Agora exige `tableSessionId` do caller
   * (vem do SessionGuard) e JOIN com visits filtra por mesa atual. Se
   * a visit não pertence à sessão de mesa atual, retorna null (não vaza
   * existência).
   */
  async getFeedbackByVisit(
    visitId: string,
    tableSessionId: string,
    callerCustomerId: string | null,
  ) {
    if (!callerCustomerId) {
      throw new ForbiddenException('Identificação obrigatória para consultar esta avaliação.');
    }
    const rows = (await this.tenantConn.query(
      `SELECT f.*
         FROM feedbacks f
         JOIN visits v ON v.id = f.visit_id
        WHERE f.visit_id = $1
          AND v.table_session_id = $2
          AND v.customer_id = $3`,
      [visitId, tableSessionId, callerCustomerId],
    )) as unknown[];

    return rows[0] || null;
  }
}
