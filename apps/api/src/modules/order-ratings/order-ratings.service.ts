import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { ComplaintsService } from '../complaints/complaints.service';

@Injectable()
export class OrderRatingsService {
  private readonly logger = new Logger(OrderRatingsService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly complaints: ComplaintsService,
  ) {}

  async submit(input: {
    orderId: string;
    customerId: string;
    sessionId: string;
    visitId?: string | null;
    rating: number;
    comment?: string;
  }) {
    // IDOR write-path (re-scan de convergência): o customerId vem do cookie
    // (round 8 B-NEW-27), mas o orderId ainda era confiado cru. Sem este
    // guard, um cliente na mesa X com um orderId da mesa Y podia (a) gravar
    // rating na conta de Y, (b) SEQUESTRAR o slot do prompt (o guard
    // `submitted_at IS NULL` flipa → vítima vê alreadyRated) e (c) fabricar
    // um complaint sobre o pedido de Y. Espelha o guard de ownership do
    // read-path (getByOrderIdForSession) e do sibling feedbacks: o pedido
    // tem que pertencer à sessão de mesa do caller (vinda do SessionGuard).
    const owner = (await this.tenantConn.query(
      `SELECT 1 FROM orders WHERE id = $1 AND table_session_id = $2`,
      [input.orderId, input.sessionId],
    )) as Array<Record<string, unknown>>;
    if (!owner.length) {
      throw new ForbiddenException('Pedido nao pertence a esta sessao.');
    }

    // A UNIQUE(order_id) é compartilhada com a row do PROMPT que o
    // `delivered` cria (rating NULL, submitted_at NULL) — então a resposta
    // real do cliente é uma TRANSIÇÃO DE ESTADO (completar o prompt), não
    // uma duplicata. O guard `submitted_at IS NULL` dentro do DO UPDATE é
    // o que mantém a idempotência: re-avaliação não sobrescreve.
    const inserted = (await this.tenantConn.query(
      `INSERT INTO order_ratings (order_id, customer_id, visit_id, rating,
                                  prompted_at, submitted_at, comment)
       VALUES ($1, $2, $3, $4, now(), now(), $5)
       ON CONFLICT (order_id) DO UPDATE
          SET rating = EXCLUDED.rating,
              comment = EXCLUDED.comment,
              customer_id = COALESCE(order_ratings.customer_id, EXCLUDED.customer_id),
              visit_id = COALESCE(order_ratings.visit_id, EXCLUDED.visit_id),
              submitted_at = now()
        WHERE order_ratings.submitted_at IS NULL
       RETURNING *`,
      [input.orderId, input.customerId, input.visitId ?? null, input.rating, input.comment ?? null],
    )) as Array<Record<string, unknown>>;

    let alreadyRated = false;
    let row: Record<string, unknown>;
    if (!inserted.length) {
      alreadyRated = true;
      const existing = (await this.tenantConn.query(
        `SELECT * FROM order_ratings WHERE order_id = $1`,
        [input.orderId],
      )) as Array<Record<string, unknown>>;
      if (!existing.length) {
        throw new HttpException('Falha ao gravar rating.', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      row = existing[0];
    } else {
      row = inserted[0];
    }

    let redirectTo: string | null = null;
    let complaintId: string | null = null;

    // Auto-complaint when rating is low + comment populated.
    if (!alreadyRated && input.rating <= 2 && input.comment && input.comment.trim().length > 0) {
      const complaint = await this.complaints.createFromRating({
        customerId: input.customerId,
        visitId: input.visitId ?? null,
        orderId: input.orderId,
        orderRatingId: row.id as string,
        rating: input.rating,
        comment: input.comment,
      });
      complaintId = complaint.id;
      redirectTo = `/complaint/${complaint.id}`;
    } else if (input.rating <= 3) {
      redirectTo = `/complaint/compose?orderId=${input.orderId}`;
    }

    return {
      id: row.id as string,
      orderId: row.order_id as string,
      rating: row.rating as number,
      comment: (row.comment as string | null) ?? null,
      savedAt: row.submitted_at as string,
      alreadyRated,
      redirectTo,
      complaintId,
    };
  }

  async getByOrderId(orderId: string) {
    const rows = (await this.tenantConn.query(`SELECT * FROM order_ratings WHERE order_id = $1`, [
      orderId,
    ])) as Array<Record<string, unknown>>;
    if (!rows.length) {
      throw new HttpException('Rating nao encontrado.', HttpStatus.NOT_FOUND);
    }
    const r = rows[0];
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      rating: r.rating as number,
      comment: (r.comment as string | null) ?? null,
      promptedAt: r.prompted_at as string,
      submittedAt: (r.submitted_at as string | null) ?? null,
    };
  }

  /**
   * Round 10 (B-NEW-47): IDOR fix — JOIN com orders.table_session_id
   * filtra por mesa do caller. 404 sem distinguir "não existe" de
   * "não é seu" (não vaza ownership info).
   */
  async getByOrderIdForSession(orderId: string, tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT or2.*
         FROM order_ratings or2
         JOIN orders o ON o.id = or2.order_id
        WHERE or2.order_id = $1
          AND o.table_session_id = $2`,
      [orderId, tableSessionId],
    )) as Array<Record<string, unknown>>;
    if (!rows.length) {
      throw new HttpException('Rating nao encontrado.', HttpStatus.NOT_FOUND);
    }
    const r = rows[0];
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      rating: r.rating as number,
      comment: (r.comment as string | null) ?? null,
      promptedAt: r.prompted_at as string,
      submittedAt: (r.submitted_at as string | null) ?? null,
    };
  }

  /**
   * Called by the orders module when an order transitions to `delivered`.
   * Inserts a `prompted_at` row so B2's job runner can later push the rating
   * prompt at ~13min. Idempotent (UNIQUE on order_id).
   *
   * Note: the prompt push delivery itself lives in B2 (cron), this hook only
   * marks the order as eligible for the prompt.
   */
  async schedulePromptForDelivered(input: {
    orderId: string;
    customerId?: string | null;
    visitId?: string | null;
  }) {
    await this.tenantConn.query(
      `INSERT INTO order_ratings (order_id, customer_id, visit_id, prompted_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (order_id) DO NOTHING`,
      [input.orderId, input.customerId ?? null, input.visitId ?? null],
    );
    return { orderId: input.orderId, scheduled: true };
  }
}
