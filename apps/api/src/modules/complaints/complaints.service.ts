import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';
import type { ComplaintProblemType } from '@restaurant/shared-types';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async create(
    input: {
      customerId?: string | null;
      visitId?: string | null;
      orderId?: string | null;
      orderRatingId?: string | null;
      rating?: number | null;
      /**
       * Per docs/features/complaint-flow-v12.md — one of:
       * 'demora' | 'item-errado' | 'item-faltando' | 'comida-fria' | 'outro'.
       * Persisted in the `problem_type` column (migration 033).
       */
      problemType?: string | null;
      text: string;
      attachedImageUrl?: string | null;
      autoFromRating?: boolean;
      tableSessionId?: string | null;
    },
    slug?: string,
  ) {
    let visitId = input.visitId ?? null;
    if (!visitId && input.tableSessionId && input.customerId) {
      const participantRows = (await this.tenantConn.query(
        `SELECT visit_id
           FROM session_participants
          WHERE table_session_id = $1
            AND customer_id = $2
            AND visit_id IS NOT NULL
          ORDER BY joined_at DESC
          LIMIT 1`,
        [input.tableSessionId, input.customerId],
      )) as Array<{ visit_id: string | null }>;
      visitId = participantRows[0]?.visit_id ?? null;
    }

    // P1 IDOR (write-path): o endpoint público POST /:slug/complaints roda sob
    // SessionGuard e passa tableSessionId = session.sessionId. Antes gravávamos
    // input.orderId / input.visitId VERBATIM do body — um atacante fornecia o
    // UUID de um pedido/visita de OUTRA mesa e a reclamação era anexada àquele
    // pedido, poluindo a linkagem complaint→order/visit que o manager vê.
    // Agora, quando o caller vem de uma sessão (tableSessionId presente), só
    // aceitamos orderId/visitId que PERTENÇAM a essa sessão — espelhando o
    // guard de feedbacks.service (visits.table_session_id === tableSessionId) e
    // courtesies (Forbidden se table_session_id !== sessionId).
    //
    // Importante: só validamos o que veio do BODY. O visitId resolvido
    // server-side (via session_participants, acima) já é confiável, então
    // guardamos o valor ORIGINAL do body antes de resolver. O caminho interno
    // createFromRating NÃO passa tableSessionId — permanece isento (não é um
    // caller de sessão; roda depois do order-ratings já ter validado o pedido).
    if (input.tableSessionId) {
      if (input.orderId) {
        const orderOwner = (await this.tenantConn.query(
          `SELECT id FROM orders WHERE id = $1 AND table_session_id = $2`,
          [input.orderId, input.tableSessionId],
        )) as Array<{ id: string }>;
        if (!orderOwner.length) {
          throw new ForbiddenException('Pedido nao pertence a esta sessao.');
        }
      }
      if (input.visitId) {
        const visitOwner = (await this.tenantConn.query(
          `SELECT id FROM visits WHERE id = $1 AND table_session_id = $2`,
          [input.visitId, input.tableSessionId],
        )) as Array<{ id: string }>;
        if (!visitOwner.length) {
          throw new ForbiddenException('Visita nao pertence a esta sessao.');
        }
      }
    }

    const rows = (await this.tenantConn.query(
      `INSERT INTO complaints
         (customer_id, visit_id, order_id, order_rating_id, rating,
          problem_type, text, attached_image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_review')
       RETURNING *`,
      [
        input.customerId ?? null,
        visitId,
        input.orderId ?? null,
        input.orderRatingId ?? null,
        input.rating ?? null,
        input.problemType ?? null,
        input.text,
        input.attachedImageUrl ?? null,
      ],
    )) as Array<Record<string, unknown>>;

    let enriched = await this.getEnrichedRow(rows[0].id as string);
    if ((!enriched?.table_session_id || !enriched?.table_number) && input.tableSessionId) {
      enriched = await this.getEnrichedRowForSession(rows[0].id as string, input.tableSessionId);
    }
    const result = this.mapRow(enriched ?? rows[0]);

    if (slug && this.events && result.customerId) {
      this.events.emitComplaintReceived(slug, result.assignedManagerId, {
        complaintId: result.id,
        tableSessionId: result.tableSessionId,
        tableNumber: result.tableNumber,
        customerId: result.customerId,
        customerName: result.customerName,
        problemType: (result.problemType ?? 'outro') as ComplaintProblemType,
        rating: result.rating,
        description: result.text,
        createdAt: result.submittedAt,
      });
    }

    return result;
  }

  /**
   * Helper called by the order-ratings service when a low rating (1-2) is
   * submitted with comment text — auto-creates a complaint so the manager
   * sees it in their queue.
   */
  async createFromRating(
    input: {
      customerId: string;
      visitId?: string | null;
      orderId: string;
      orderRatingId: string;
      rating: number;
      comment: string;
      problemType?: string | null;
    },
    slug?: string,
  ) {
    return this.create(
      {
        customerId: input.customerId,
        visitId: input.visitId,
        orderId: input.orderId,
        orderRatingId: input.orderRatingId,
        rating: input.rating,
        problemType: input.problemType ?? null,
        text: input.comment,
        autoFromRating: true,
      },
      slug,
    );
  }

  async respond(
    id: string,
    by: { staffId?: string },
    body: { content: string; chipAction?: string },
    slug?: string,
  ) {
    // Round 5 (B-NEW-1 round 3): hardened CAS — só pode responder quem
    // não foi assigned ainda OU é o próprio assignee. Evita o caso onde
    // 2 managers clicam "Responder" em janela ms-distance: o segundo
    // pega assigned_manager_id != null e diferente do seu staffId, a
    // WHERE rejeita, throw "ja respondida". Antes só `status IN (...)`
    // protegia, mas se ambos managers iniciassem antes do commit do
    // primeiro, ambos passavam.
    const updated = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE complaints
           SET status = 'responded',
               response_text = $1,
               response_at = now(),
               assigned_manager_id = COALESCE($2, assigned_manager_id),
               updated_at = now()
         WHERE id = $3
           AND status IN ('pending_review','in_progress')
           AND ($2::uuid IS NULL OR assigned_manager_id IS NULL OR assigned_manager_id = $2)
         RETURNING *`,
        [body.content, by.staffId ?? null, id],
      ),
    );
    if (!updated.length) {
      throw new HttpException('Reclamacao nao encontrada ou ja respondida.', HttpStatus.NOT_FOUND);
    }
    const enriched = await this.getEnrichedRow(updated[0].id as string);
    const mapped = this.mapRow(enriched ?? updated[0]);
    const result = { ...mapped, chipAction: body.chipAction ?? null };

    if (slug && this.events && mapped.customerId) {
      const chipAction = body.chipAction as
        | 'on-the-way'
        | 'kitchen-check'
        | 'courtesy'
        | 'custom'
        | undefined;
      // TODO(payload): messageId is the complaint's own id here because the
      // V1 complaint flow stores the response inline (response_text) rather
      // than minting a separate staff_messages row. The dedicated
      // staff_messages row is created via POST /staff-messages.
      this.events.emitComplaintResponded(slug, mapped.customerId, {
        complaintId: mapped.id,
        messageId: mapped.id,
        content: body.content,
        chipAction,
        staffName: '',
      });
    }

    return result;
  }

  async resolve(id: string, by: { staffId?: string }, slug?: string) {
    // Round 5 (B-NEW-1 round 3 cont.): CAS guard pra evitar double-resolve
    // em race entre 2 managers. WHERE excluindo closed/resolved garante
    // idempotência — segundo writer 0 rows, throw 404 (cliente não recebe
    // duplo emitComplaintResolved nem audit log dupe).
    const updated = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE complaints
           SET status = 'closed',
               closed_at = now(),
               resolved_at = now(),
               assigned_manager_id = COALESCE($1, assigned_manager_id),
               updated_at = now()
         WHERE id = $2
           AND status != 'closed'
         RETURNING *`,
        [by.staffId ?? null, id],
      ),
    );
    if (!updated.length) {
      throw new HttpException('Reclamacao nao encontrada ou ja resolvida.', HttpStatus.NOT_FOUND);
    }
    const enriched = await this.getEnrichedRow(updated[0].id as string);
    const result = this.mapRow(enriched ?? updated[0]);

    if (slug && this.events) {
      this.events.emitComplaintResolved(slug, result.customerId, {
        complaintId: result.id,
        resolvedAt: result.closedAt ?? new Date().toISOString(),
        resolvedBy: by.staffId ?? '',
      });
    }

    return result;
  }

  /**
   * Forward a complaint to a different manager. Per docs/features/
   * complaint-flow-v12.md the action lives in the MoreSheet ("Encaminhar
   * pra outro gerente"). The forward IS an escalation — the original
   * manager couldn't (or wouldn't) resolve it, so it climbs the chain.
   *
   * P1 #29 — Until now `emitEscalationCreated` was orphan: declared in the
   * gateway but never called, so dashboards never showed forwarded
   * complaints in the "in escalation" lane. We now create (or look up) an
   * escalation_chains row for the complaint, link it via
   * `complaints.escalation_chain_id`, then fire the event so the assignee's
   * inbox lights up immediately.
   *
   * The chain is created lazily on first forward (level=1, since level=0
   * is the original assignee who is being bypassed) and re-used on
   * subsequent forwards by bumping level.
   */
  async forward(id: string, toStaffId: string, notes?: string, slug?: string) {
    const result = await this.tenantConn.transaction(async (tx) => {
      const existingRows = (await tx.query(
        `SELECT id, assigned_manager_id, escalation_chain_id, customer_id
           FROM complaints WHERE id = $1`,
        [id],
      )) as Array<{
        id: string;
        assigned_manager_id: string | null;
        escalation_chain_id: string | null;
        customer_id: string | null;
      }>;
      if (!existingRows.length) {
        throw new HttpException('Reclamacao nao encontrada.', HttpStatus.NOT_FOUND);
      }
      const existing = existingRows[0];

      let chainId = existing.escalation_chain_id;
      let chainLevel = 1;
      const ttlExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      if (!chainId) {
        const inserted = (await tx.query(
          `INSERT INTO escalation_chains
             (kind, source_id, level, current_assignee_role,
              current_assignee_staff_id, ttl_expires_at)
           VALUES ('complaint', $1::uuid, 1, 'manager', $2::uuid, $3)
           RETURNING id`,
          [id, toStaffId, ttlExpiresAt],
        )) as Array<{ id: string }>;
        chainId = inserted[0].id;
      } else {
        // unwrapRows: UPDATE…RETURNING chega como [rows, count] — o cast
        // cru fazia bumped[0]?.level ser undefined e o nível cair pra 1.
        const bumped = unwrapRows<{ level: number }>(
          await tx.query(
            `UPDATE escalation_chains
                SET level = level + 1,
                    current_assignee_role = 'manager',
                    current_assignee_staff_id = $2,
                    ttl_expires_at = $3,
                    updated_at = now()
              WHERE id = $1
              RETURNING level`,
            [chainId, toStaffId, ttlExpiresAt],
          ),
        );
        chainLevel = bumped[0]?.level ?? 1;
      }

      const updated = unwrapRows<Record<string, unknown>>(
        await tx.query(
          `UPDATE complaints
             SET assigned_manager_id = $1,
                 status = 'in_progress',
                 response_text = COALESCE($2, response_text),
                 escalation_chain_id = $4,
                 updated_at = now()
           WHERE id = $3
           RETURNING *`,
          [toStaffId, notes ?? null, id, chainId],
        ),
      );
      if (!updated.length) {
        throw new HttpException('Reclamacao nao encontrada.', HttpStatus.NOT_FOUND);
      }

      return {
        row: updated[0],
        chainId,
        chainLevel,
        deadline: ttlExpiresAt,
        prevAssignee: existing.assigned_manager_id,
      };
    });

    const enriched = await this.getEnrichedRow(result.row.id as string);
    const mapped = this.mapRow(enriched ?? result.row);
    if (slug && this.events && result.chainId) {
      this.events.emitEscalationCreated(slug, toStaffId, {
        escalationId: result.chainId,
        type: 'complaint',
        tenantId: slug,
        context: {
          complaintId: mapped.id,
          customerId: mapped.customerId,
          fromManagerId: result.prevAssignee,
          toManagerId: toStaffId,
          level: result.chainLevel,
          notes: notes ?? null,
        },
        deadline: result.deadline,
      });
    }
    return mapped;
  }

  async list(filters: { status?: string; assignedManagerId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`c.status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.assignedManagerId) {
      where.push(`c.assigned_manager_id = $${i++}`);
      params.push(filters.assignedManagerId);
    }
    const sql = `SELECT c.*,
                        COALESCE(o.table_session_id, v.table_session_id) AS table_session_id,
                        COALESCE(
                          CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT),
                          CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT)
                        ) AS table_number,
                        cust.name AS customer_name
                   FROM complaints c
              LEFT JOIN orders o ON o.id = c.order_id
              LEFT JOIN visits v ON v.id = COALESCE(c.visit_id, o.visit_id)
              LEFT JOIN table_sessions ts ON ts.id = COALESCE(o.table_session_id, v.table_session_id)
              LEFT JOIN tables t ON t.id = ts.table_id
              LEFT JOIN customers cust ON cust.id = c.customer_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY c.submitted_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  async listForCustomer(customerId: string) {
    const rows = (await this.tenantConn.query(
      `${this.customerVisibleSelect()}
        WHERE c.customer_id = $1
        ORDER BY c.submitted_at DESC
        LIMIT 100`,
      [customerId],
    )) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  async getForCustomer(id: string, customerId: string) {
    const rows = (await this.tenantConn.query(
      `${this.customerVisibleSelect()}
        WHERE c.id = $1
          AND c.customer_id = $2
        LIMIT 1`,
      [id, customerId],
    )) as Array<Record<string, unknown>>;
    if (!rows.length) {
      throw new HttpException('Reclamação não encontrada ou já removida.', HttpStatus.NOT_FOUND);
    }
    return this.mapRow(rows[0]);
  }

  private customerVisibleSelect(): string {
    return `SELECT c.*,
                   COALESCE(o.table_session_id, v.table_session_id) AS table_session_id,
                   COALESCE(
                     CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT),
                     CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT)
                   ) AS table_number,
                   cust.name AS customer_name
              FROM complaints c
         LEFT JOIN orders o ON o.id = c.order_id
         LEFT JOIN visits v ON v.id = COALESCE(c.visit_id, o.visit_id)
         LEFT JOIN table_sessions ts ON ts.id = COALESCE(o.table_session_id, v.table_session_id)
         LEFT JOIN tables t ON t.id = ts.table_id
         LEFT JOIN customers cust ON cust.id = c.customer_id`;
  }

  private async getEnrichedRow(id: string): Promise<Record<string, unknown> | null> {
    const rows = (await this.tenantConn.query(
      `SELECT c.*,
              COALESCE(o.table_session_id, v.table_session_id) AS table_session_id,
              COALESCE(
                CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT),
                CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT)
              ) AS table_number,
              cust.name AS customer_name
         FROM complaints c
    LEFT JOIN orders o ON o.id = c.order_id
    LEFT JOIN visits v ON v.id = COALESCE(c.visit_id, o.visit_id)
    LEFT JOIN table_sessions ts ON ts.id = COALESCE(o.table_session_id, v.table_session_id)
    LEFT JOIN tables t ON t.id = ts.table_id
    LEFT JOIN customers cust ON cust.id = c.customer_id
        WHERE c.id = $1
        LIMIT 1`,
      [id],
    )) as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  }

  private async getEnrichedRowForSession(
    id: string,
    tableSessionId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = (await this.tenantConn.query(
      `SELECT c.*,
              ts.id AS table_session_id,
              COALESCE(
                CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT),
                CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT)
              ) AS table_number,
              cust.name AS customer_name
         FROM complaints c
    LEFT JOIN table_sessions ts ON ts.id = $2
    LEFT JOIN tables t ON t.id = ts.table_id
    LEFT JOIN customers cust ON cust.id = c.customer_id
        WHERE c.id = $1
        LIMIT 1`,
      [id, tableSessionId],
    )) as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  }

  private mapRow(row: Record<string, unknown>) {
    const rawStatus = row.status as string;
    const dtoStatus =
      rawStatus === 'closed' || rawStatus === 'resolved'
        ? 'resolved'
        : rawStatus === 'responded'
          ? 'responded'
          : 'created';
    return {
      id: row.id as string,
      tableSessionId: (row.table_session_id as string | null) ?? '',
      tableNumber: Number(row.table_number ?? 0),
      orderId: (row.order_id as string | null) ?? null,
      orderRatingId: (row.order_rating_id as string | null) ?? null,
      customerId: (row.customer_id as string | null) ?? null,
      customerName: (row.customer_name as string | null) ?? 'Cliente',
      visitId: (row.visit_id as string | null) ?? null,
      rating: (row.rating as number | null) ?? null,
      problemType: (row.problem_type as string | null) ?? 'outro',
      text: row.text as string,
      description: row.text as string,
      attachedImageUrl: (row.attached_image_url as string | null) ?? null,
      status: dtoStatus,
      rawStatus,
      assignedManagerId: (row.assigned_manager_id as string | null) ?? null,
      responseText: (row.response_text as string | null) ?? null,
      responseAt: (row.response_at as string | null) ?? null,
      submittedAt: row.submitted_at as string,
      createdAt: row.submitted_at as string,
      respondedAt: (row.response_at as string | null) ?? null,
      respondedBy: (row.assigned_manager_id as string | null) ?? null,
      closedAt: (row.closed_at as string | null) ?? null,
      resolvedAt: (row.resolved_at as string | null) ?? null,
      resolvedBy:
        rawStatus === 'closed' || rawStatus === 'resolved'
          ? ((row.assigned_manager_id as string | null) ?? null)
          : null,
    };
  }
}
