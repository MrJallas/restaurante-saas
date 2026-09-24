import { ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantConnectionProvider, TenantTx } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { CustomerStaffMessagesService } from '../customer-staff-messages/customer-staff-messages.service';
import { EventsGateway } from '../websocket/events.gateway';
import { RedisService } from '../../infra/redis/redis.service';

interface CreateLgpdRequestInput {
  customerId?: string | null;
  customerCpf?: string | null;
  customerEmail?: string | null;
  kind: 'erasure' | 'export';
  notes?: string;
  protocolNumber?: string;
}

type CustomerLgpdRequestInput = Omit<CreateLgpdRequestInput, 'customerCpf' | 'customerEmail'> & {
  customerId: string;
};

interface MongoErasureResult {
  mongoAvailable: boolean;
  confirmed: boolean;
  deletedCount: number;
  messagesRemaining: number | null;
  threadsRemaining: number | null;
}

const DEFAULT_ERASURE_LEASE_SECONDS = 5 * 60;

function erasureLeaseSeconds(): number {
  const configured = Number(process.env.LGPD_ERASURE_LEASE_SECONDS);
  return Number.isSafeInteger(configured) && configured >= 30
    ? configured
    : DEFAULT_ERASURE_LEASE_SECONDS;
}

/**
 * Referências operacionais/fiscais cujo FK é obrigatório continuam ligadas ao
 * customer UUID, mas o cadastro apontado é anonimizado. Conteúdo livre dessas
 * rows é limpo quando identificável. Remover esses FKs exige uma política de
 * retenção e migrations próprias, não uma deleção ad-hoc no request HTTP.
 */
const RETAINED_PSEUDONYMOUS_STORES = [
  'session_participants.customer_id',
  'table_merge_requests.requesting_customer_id',
  'scan_verification_requests.customer_id',
  'bill_split_notifications.created_by_customer_id',
  'payments.split_allocations',
];

/**
 * LGPD erasure orchestration.
 *
 * A request is inserted and committed as `pending` before any external side
 * effect. Mongo stores are hard-deleted and verified first; Postgres is then
 * anonymized transactionally and verified. Only after every reachable store
 * confirms completion is the protocol changed to `fulfilled` and the WS event
 * emitted. Any offline/partial/error path stays `pending` and can be retried.
 */
@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly chatHistory: ChatHistoryService,
    private readonly customerStaffMessages: CustomerStaffMessagesService,
    @Optional() private readonly events?: EventsGateway,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /**
   * Customer-facing entrypoint. Identity supplied by the HTTP body is never
   * trusted: the authenticated customer UUID is resolved by the controller,
   * and the only canonical secondary identifier that exists in `customers`
   * today (CPF) is loaded from Postgres. There is no canonical customer email
   * column, so customer-originated requests deliberately persist it as null.
   *
   * `createRequest` remains available for trusted internal/manager workflows
   * that may need to create export requests with an explicitly verified
   * delivery address.
   */
  async createCustomerRequest(
    input: CustomerLgpdRequestInput,
    tenantId: string,
    eventSlug?: string,
  ) {
    const customers = (await this.tenantConn.query(
      `SELECT id, cpf
         FROM customers
        WHERE id = $1
        LIMIT 1`,
      [input.customerId],
    )) as Array<{ id: string; cpf: string | null }>;
    const customer = customers[0];
    if (!customer) {
      throw new NotFoundException('Cliente autenticado não encontrado.');
    }

    return this.createRequest(
      {
        ...input,
        customerCpf: customer.cpf ?? null,
        customerEmail: null,
      },
      tenantId,
      eventSlug,
    );
  }

  async createRequest(input: CreateLgpdRequestInput, tenantId: string, eventSlug?: string) {
    const protocolNumber = input.protocolNumber ?? generateProtocolNumber();
    const inserted = await this.tenantConn.transaction(async (tx) => {
      const rows = (await tx.query(
        `INSERT INTO lgpd_requests
           (customer_id, customer_cpf, customer_email, kind, status,
            protocol_number, notes)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)
         RETURNING *`,
        [
          input.customerId ?? null,
          input.customerCpf ?? null,
          input.customerEmail ?? null,
          input.kind,
          protocolNumber,
          input.notes ?? null,
        ],
      )) as Array<Record<string, unknown>>;
      return rows[0];
    });

    if (input.kind !== 'erasure' || !input.customerId) {
      return this.toProtocolDto(inserted);
    }

    const claimed = await this.claimPendingRequest(inserted.id as string);
    if (!claimed) {
      // The row was committed before side effects by design. If a concurrent
      // worker claimed it in the tiny interval above, never start a second
      // erasure pipeline with a stale `pending` snapshot.
      throw new ConflictException('Solicitação LGPD já está em processamento.');
    }

    return this.executeErasure({
      requestRow: claimed,
      customerId: input.customerId,
      tenantId,
      eventSlug: eventSlug ?? tenantId,
    });
  }

  /** Manager/manual retry entrypoint until a durable retry worker exists. */
  async retryRequest(requestId: string, tenantId: string, eventSlug?: string) {
    const row = await this.claimPendingRequest(requestId);
    if (!row) return this.retryClaimFailure(requestId);
    const customerId = (row.customer_id as string | null) ?? null;
    if (!customerId) {
      await this.markRetryRequired(row, 'IDENTITY_MISSING', {});
      throw new ConflictException('Solicitação sem identidade recuperável para retry.');
    }
    return this.executeErasure({
      requestRow: row,
      customerId,
      tenantId,
      eventSlug: eventSlug ?? tenantId,
    });
  }

  /**
   * Atomic claim with a durable lease.
   *
   * A fresh pending row can be claimed immediately. An in-progress row may be
   * reclaimed only after its lease expires, which is what makes a process
   * crash recoverable. `processing_attempt_token` is carried through every
   * terminal transition as a CAS fence: an older execution can no longer
   * fulfill or requeue a row after a newer attempt took ownership.
   */
  private async claimPendingRequest(requestId: string): Promise<Record<string, unknown> | null> {
    const attemptToken = randomUUID();
    const rows = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `/* lgpd:claim */
         UPDATE lgpd_requests
            SET status = 'in_progress',
                processing_attempt_token = $2,
                processing_lease_expires_at = now() + ($3 || ' seconds')::interval,
                updated_at = now()
          WHERE id = $1
            AND kind = 'erasure'
            AND (
              status = 'pending'
              OR (
                status = 'in_progress'
                AND (
                  processing_lease_expires_at IS NULL
                  OR processing_lease_expires_at <= now()
                )
              )
            )
          RETURNING *`,
        [requestId, attemptToken, String(erasureLeaseSeconds())],
      ),
    );
    return rows[0] ?? null;
  }

  private async retryClaimFailure(requestId: string): Promise<never> {
    const rows = (await this.tenantConn.query(
      `SELECT id, kind, status, processing_lease_expires_at
         FROM lgpd_requests
        WHERE id = $1
        LIMIT 1`,
      [requestId],
    )) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (row?.kind === 'erasure' && row.status === 'in_progress') {
      throw new ConflictException('Solicitação LGPD já está em processamento.');
    }
    if (row?.kind === 'erasure' && row.status === 'fulfilled') {
      throw new ConflictException('Solicitação LGPD já foi concluída.');
    }
    throw new NotFoundException('Solicitação LGPD pendente não encontrada.');
  }

  private async executeErasure(input: {
    requestRow: Record<string, unknown>;
    customerId: string;
    tenantId: string;
    eventSlug: string;
  }) {
    const attemptToken = input.requestRow.processing_attempt_token;
    if (typeof attemptToken !== 'string' || attemptToken.length === 0) {
      throw new ConflictException('Tentativa LGPD sem lease válida. Solicite um novo retry.');
    }

    const [chatSettled, staffSettled] = await Promise.allSettled([
      this.chatHistory.deleteAllForCustomer(input.customerId, input.tenantId),
      this.customerStaffMessages.deleteAll(input.customerId, input.tenantId),
    ]);
    const chat = this.mongoResult(chatSettled);
    const staff = this.mongoResult(staffSettled);

    if (!chat.confirmed || !staff.confirmed) {
      const pending = await this.markRetryRequired(input.requestRow, 'MONGO_ERASURE_INCOMPLETE', {
        chat,
        staff,
      });
      return this.toProtocolDto(pending);
    }

    let committed:
      | {
          row: Record<string, unknown>;
          counts: Record<string, number>;
          revokedRecognitionToken: string | null;
        }
      | undefined;
    try {
      committed = await this.tenantConn.transaction(async (tx) => {
        const erasure = await this.erasePostgresPii(tx, input.customerId);
        const counts = erasure.counts;
        await this.verifyPostgresErasure(tx, input.customerId, erasure.canonicalCpf);

        const notes = [
          'erasure_fulfilled_v2',
          `mongo_chat_deleted=${chat.deletedCount}`,
          `mongo_staff_deleted=${staff.deletedCount}`,
          `postgres=${JSON.stringify(counts)}`,
          `retained_pseudonymous=${RETAINED_PSEUDONYMOUS_STORES.join(',')}`,
        ].join(' · ');
        const refreshed = unwrapRows<Record<string, unknown>>(
          await tx.query(
            `/* lgpd:lgpd_requests */
             UPDATE lgpd_requests
                SET status = 'fulfilled',
                    fulfilled_at = now(),
                    customer_id = NULL,
                    customer_cpf = NULL,
                    customer_email = NULL,
                    notes = $1,
                    processing_attempt_token = NULL,
                    processing_lease_expires_at = NULL,
                    updated_at = now()
              WHERE id = $2
                AND kind = 'erasure'
                AND status = 'in_progress'
                AND processing_attempt_token = $3
              RETURNING *`,
            [notes, input.requestRow.id, attemptToken],
          ),
        );
        if (!refreshed[0]) {
          throw new ConflictException(
            'A lease LGPD foi assumida por outra tentativa antes do fulfillment.',
          );
        }
        return {
          row: refreshed[0],
          counts,
          revokedRecognitionToken: erasure.recognitionToken,
        };
      });
    } catch (error) {
      const pending = await this.markRetryRequired(
        input.requestRow,
        'POSTGRES_ERASURE_INCOMPLETE',
        { chat, staff, error: this.safeError(error) },
      );
      return this.toProtocolDto(pending);
    }

    const { row, counts, revokedRecognitionToken } = committed;

    try {
      this.events?.emitLgpdFulfilled(
        input.eventSlug,
        input.customerId,
        row.protocol_number as string,
        row.id as string,
      );
    } catch (error) {
      // Notification is not part of erasure correctness. At this point all
      // stores and the protocol are already committed as fulfilled.
      this.logger.warn(`Falha ao emitir LGPD fulfilled: ${this.safeError(error)}`);
    }

    // O evento é enfileirado primeiro para que a aba autora possa mostrar o
    // protocolo. Em seguida revogamos imediatamente tanto novos handshakes
    // quanto sockets já autenticados. O banco já rotacionou o bearer dentro
    // da mesma transação que marcou o pedido fulfilled.
    if (revokedRecognitionToken) {
      try {
        const schemaName = this.tenantConn.getTenantSchemaName?.() ?? input.tenantId;
        await this.redis?.del(`recognition_customer:${schemaName}:${revokedRecognitionToken}`);
      } catch (error) {
        // O gateway nunca confia no cache sem revalidar no PostgreSQL; uma
        // indisponibilidade do Redis não ressuscita o token já rotacionado.
        this.logger.warn(`Falha ao invalidar cache LGPD: ${this.safeError(error)}`);
      }
    }

    try {
      this.events?.disconnectCustomer(input.customerId);
    } catch (error) {
      this.logger.warn(`Falha ao desconectar socket LGPD: ${this.safeError(error)}`);
    }

    return {
      ...this.toProtocolDto(row),
      retryable: false,
      erasureSummary: counts,
    };
  }

  private mongoResult(settled: PromiseSettledResult<unknown>): MongoErasureResult {
    if (settled.status === 'rejected') {
      return {
        mongoAvailable: false,
        confirmed: false,
        deletedCount: 0,
        messagesRemaining: null,
        threadsRemaining: null,
      };
    }
    const value = settled.value as Partial<MongoErasureResult>;
    return {
      mongoAvailable: value.mongoAvailable === true,
      confirmed: value.confirmed === true,
      deletedCount: Number(value.deletedCount ?? 0),
      messagesRemaining:
        typeof value.messagesRemaining === 'number' ? value.messagesRemaining : null,
      threadsRemaining: typeof value.threadsRemaining === 'number' ? value.threadsRemaining : null,
    };
  }

  private async erasePostgresPii(
    tx: TenantTx,
    customerId: string,
  ): Promise<{
    counts: Record<string, number>;
    canonicalCpf: string | null;
    recognitionToken: string | null;
  }> {
    const counts: Record<string, number> = {};
    // Resolve inside the same transaction and before anonymizing `customers`.
    // Even trusted/internal callers cannot broaden a scrub with a mismatched
    // CPF stored in an old or malformed request.
    const identityRows = (await tx.query(
      `/* lgpd:canonical_identity */
       SELECT cpf, recognition_token
         FROM customers
        WHERE id = $1
        FOR UPDATE`,
      [customerId],
    )) as Array<{ cpf: string | null; recognition_token: string | null }>;
    const canonicalCpf = identityRows[0]?.cpf ?? null;
    const recognitionToken = identityRows[0]?.recognition_token ?? null;
    const mutate = async (store: string, mutation: string, params: unknown[] = [customerId]) => {
      const rows = (await tx.query(
        `/* lgpd:${store} */
         WITH changed AS (
           ${mutation}
           RETURNING 1
         )
         SELECT COUNT(*)::int AS count FROM changed`,
        params,
      )) as Array<{ count: number }>;
      counts[store] = Number(rows[0]?.count ?? 0);
    };

    await mutate('assistant_messages', `DELETE FROM assistant_messages WHERE customer_id = $1`);
    await mutate(
      'customer_consumption_summary',
      `DELETE FROM customer_consumption_summary WHERE customer_id = $1`,
    );
    await mutate(
      'escalation_chains',
      `UPDATE escalation_chains
          SET resolution_notes = NULL, updated_at = now()
        WHERE id IN (
          SELECT escalation_chain_id FROM complaints
           WHERE customer_id = $1 AND escalation_chain_id IS NOT NULL
          UNION
          SELECT escalation_chain_id FROM table_merge_requests
           WHERE (requesting_customer_id = $1 OR target_customer_id = $1)
             AND escalation_chain_id IS NOT NULL
          UNION
          SELECT escalation_chain_id FROM scan_verification_requests
           WHERE customer_id = $1 AND escalation_chain_id IS NOT NULL
        )`,
    );
    await mutate(
      'feedbacks',
      `UPDATE feedbacks
          SET customer_id = NULL, comment = NULL, tags = NULL
        WHERE customer_id = $1`,
    );
    await mutate(
      'order_ratings',
      `UPDATE order_ratings
          SET customer_id = NULL, comment = NULL, updated_at = now()
        WHERE customer_id = $1`,
    );
    await mutate(
      'complaints',
      `UPDATE complaints
          SET customer_id = NULL,
              text = '[dados removidos por solicitacao LGPD]',
              attached_image_url = NULL,
              response_text = NULL,
              updated_at = now()
        WHERE customer_id = $1`,
    );
    await mutate(
      'customer_events',
      `UPDATE customer_events SET customer_id = NULL, metadata = '{}'::jsonb
        WHERE customer_id = $1`,
    );
    await mutate('order_items', `UPDATE order_items SET customer_id = NULL WHERE customer_id = $1`);
    await mutate(
      'waiter_calls',
      `UPDATE waiter_calls SET customer_id = NULL WHERE customer_id = $1`,
    );
    await mutate('visits', `UPDATE visits SET customer_id = NULL WHERE customer_id = $1`);
    await mutate(
      'table_sessions',
      `UPDATE table_sessions SET host_customer_id = NULL, updated_at = now()
        WHERE host_customer_id = $1`,
    );
    await mutate(
      'session_flags',
      `UPDATE session_flags
          SET set_by_customer_id = NULL, metadata = '{}'::jsonb, updated_at = now()
        WHERE set_by_customer_id = $1`,
    );
    await mutate(
      'session_participants',
      `UPDATE session_participants SET approved_by = NULL WHERE approved_by = $1`,
    );
    await mutate(
      'table_merge_requests',
      `UPDATE table_merge_requests
          SET target_customer_id = CASE WHEN target_customer_id = $1 THEN NULL ELSE target_customer_id END,
              decided_by_customer_id = CASE WHEN decided_by_customer_id = $1 THEN NULL ELSE decided_by_customer_id END,
              message = NULL,
              updated_at = now()
        WHERE requesting_customer_id = $1
           OR target_customer_id = $1
           OR decided_by_customer_id = $1`,
    );
    await mutate(
      'table_qr_releases',
      `UPDATE table_qr_releases SET consumed_by_customer_id = NULL, updated_at = now()
        WHERE consumed_by_customer_id = $1`,
    );
    await mutate(
      'scan_verification_requests',
      `UPDATE scan_verification_requests
          SET latitude = NULL,
              longitude = NULL,
              accuracy_meters = NULL,
              distance_meters = NULL,
              rejection_reason = NULL,
              updated_at = now()
        WHERE customer_id = $1`,
    );
    await mutate(
      'customers',
      `UPDATE customers
          SET name = 'Cliente removido',
              cpf = NULL,
              recognition_token = gen_random_uuid(),
              preferences = '{}'::jsonb,
              is_vip = false,
              updated_at = now()
        WHERE id = $1`,
    );
    await mutate(
      'lgpd_requests_scrub',
      `UPDATE lgpd_requests
          SET customer_id = NULL,
              customer_cpf = NULL,
              customer_email = NULL,
              notes = NULL,
              updated_at = now()
        WHERE customer_id = $1
           OR (
             customer_id IS NULL
             AND $2::text IS NOT NULL
             AND customer_cpf = $2
           )`,
      [customerId, canonicalCpf],
    );
    return { counts, canonicalCpf, recognitionToken };
  }

  private async verifyPostgresErasure(
    tx: TenantTx,
    customerId: string,
    canonicalCpf: string | null,
  ): Promise<void> {
    const rows = (await tx.query(
      `/* lgpd:verify */
       SELECT
         (SELECT COUNT(*) FROM assistant_messages WHERE customer_id = $1)::int
           AS assistant_messages_remaining,
         (
           (SELECT COUNT(*) FROM feedbacks WHERE customer_id = $1) +
           (SELECT COUNT(*) FROM order_ratings WHERE customer_id = $1) +
           (SELECT COUNT(*) FROM complaints WHERE customer_id = $1) +
           (SELECT COUNT(*) FROM customer_events WHERE customer_id = $1) +
           (SELECT COUNT(*) FROM order_items WHERE customer_id = $1) +
           (SELECT COUNT(*) FROM waiter_calls WHERE customer_id = $1) +
           (SELECT COUNT(*) FROM visits WHERE customer_id = $1) +
           (SELECT COUNT(*) FROM table_sessions WHERE host_customer_id = $1) +
           (SELECT COUNT(*) FROM session_flags WHERE set_by_customer_id = $1) +
           (SELECT COUNT(*) FROM session_participants WHERE approved_by = $1) +
           (SELECT COUNT(*) FROM table_merge_requests
             WHERE target_customer_id = $1 OR decided_by_customer_id = $1) +
           (SELECT COUNT(*) FROM table_qr_releases WHERE consumed_by_customer_id = $1) +
           (SELECT COUNT(*) FROM lgpd_requests WHERE customer_id = $1)
         )::int AS customer_links_remaining,
         (SELECT COUNT(*) FROM lgpd_requests
           WHERE $2::text IS NOT NULL
             AND customer_cpf = $2)::int AS lgpd_cpf_remaining,
         (SELECT COUNT(*) FROM customers
           WHERE id = $1
             AND (
               name <> 'Cliente removido'
               OR cpf IS NOT NULL
               OR preferences <> '{}'::jsonb
               OR is_vip = true
             ))::int AS customer_pii_remaining`,
      [customerId, canonicalCpf],
    )) as Array<{
      assistant_messages_remaining: number;
      customer_links_remaining: number;
      lgpd_cpf_remaining: number;
      customer_pii_remaining: number;
    }>;
    const result = rows[0];
    if (
      !result ||
      Number(result.assistant_messages_remaining) !== 0 ||
      Number(result.customer_links_remaining) !== 0 ||
      Number(result.lgpd_cpf_remaining) !== 0 ||
      Number(result.customer_pii_remaining) !== 0
    ) {
      throw new Error('Postgres LGPD verification found residual direct PII.');
    }
  }

  private async markRetryRequired(
    originalRow: Record<string, unknown>,
    code: string,
    details: unknown,
  ): Promise<Record<string, unknown>> {
    const note = `erasure_retry_required code=${code} details=${JSON.stringify(details)}`;
    const attemptToken = originalRow.processing_attempt_token;
    try {
      const rows = unwrapRows<Record<string, unknown>>(
        await this.tenantConn.query(
          `/* erasure_retry_required */
           UPDATE lgpd_requests
              SET status = 'pending',
                  fulfilled_at = NULL,
                  notes = $1,
                  processing_attempt_token = NULL,
                  processing_lease_expires_at = NULL,
                  updated_at = now()
            WHERE id = $2
              AND status = 'in_progress'
              AND processing_attempt_token = $3
            RETURNING *`,
          [note, originalRow.id, attemptToken],
        ),
      );
      if (rows[0]) return rows[0];

      // A stale execution may finish after another execution already moved
      // the request forward. Return the authoritative row; never fabricate a
      // pending snapshot that could report or reintroduce fulfilled->pending.
      const current = (await this.tenantConn.query(
        `SELECT * FROM lgpd_requests WHERE id = $1 LIMIT 1`,
        [originalRow.id],
      )) as Array<Record<string, unknown>>;
      return current[0] ?? originalRow;
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar retry LGPD request=${String(originalRow.id)}: ${this.safeError(error)}`,
      );
      return originalRow;
    }
  }

  async list(filters: { status?: string; kind?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.kind) {
      where.push(`kind = $${i++}`);
      params.push(filters.kind);
    }
    const sql = `SELECT * FROM lgpd_requests
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY requested_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<Record<string, unknown>>;
    return rows.map((r) => this.toFullDto(r));
  }

  private toProtocolDto(row: Record<string, unknown>) {
    const requestedAt = row.requested_at as string;
    const expires = new Date(
      new Date(requestedAt).getTime() + 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const status = row.status as string;
    return {
      protocolNumber: row.protocol_number as string,
      status,
      requestedAt,
      executedAt: (row.fulfilled_at as string | null) ?? null,
      expiresAt: expires,
      retryable: row.kind === 'erasure' && status === 'pending',
    };
  }

  private toFullDto(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      kind: row.kind as string,
      status: row.status as string,
      protocolNumber: row.protocol_number as string,
      customerId: (row.customer_id as string | null) ?? null,
      customerCpf: (row.customer_cpf as string | null) ?? null,
      requestedAt: row.requested_at as string,
      fulfilledAt: (row.fulfilled_at as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      retryRequired: row.kind === 'erasure' && row.status === 'pending',
    };
  }

  private safeError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw.replace(/[\r\n]+/g, ' ').slice(0, 240);
  }
}

/** Format: `LGPD-AAAA-MM-DD-XXXX`. */
function generateProtocolNumber(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
  return `LGPD-${yyyy}-${mm}-${dd}-${rand}`;
}
