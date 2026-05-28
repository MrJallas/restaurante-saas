import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CustomerCourtesyDto,
  CustomerCourtesyHistoryDto,
} from '@restaurant/shared-types';
import { MongoService } from '../../infra/mongo/mongo.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';

export type CourtesyStatus = 'pendente' | 'aceita' | 'recusada';

export interface CourtesyRow {
  id: string;
  table_session_id: string | null;
  table_number: number | null;
  type: string;
  item: string;
  status: CourtesyStatus;
  manager_staff_id: string;
  manager_name: string;
  notes: string | null;
  created_at: string;
  responded_at: string | null;
  response_seconds: number | null;
}

const VALID_TYPES = ['Sobremesa', 'Drink', 'Desconto', 'Couvert', 'Mensagem', 'Outro'];
const VALID_STATUS: CourtesyStatus[] = ['pendente', 'aceita', 'recusada'];
const HISTORY_COLLECTION = 'customer_courtesy_history';
const HISTORY_TTL_DAYS = 30;

interface CourtesyHistoryDoc {
  tenantId: string;
  customerId: string;
  courtesyId: string;
  tableSessionId: string;
  tableNumber: number | null;
  type: string;
  item: string;
  status: CourtesyStatus;
  managerName: string | null;
  notes: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  receivedAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  validUntilSessionClose: boolean;
  currentSessionOnly: boolean;
}

@Injectable()
export class CourtesiesService {
  private readonly logger = new Logger(CourtesiesService.name);
  private historyIndexesEnsured = false;

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly mongo: MongoService,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async list(
    filters: {
      today?: boolean;
      status?: CourtesyStatus;
      limit?: number;
    } = {},
  ): Promise<CourtesyRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.today) {
      where.push(`c.created_at >= date_trunc('day', now())`);
    }
    if (filters.status) {
      where.push(`c.status = $${idx++}`);
      params.push(filters.status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

    const rows = (await this.tenantConn.query(
      `
      SELECT
        c.id,
        c.table_session_id,
        c.table_number,
        c.type,
        c.item,
        c.status,
        c.manager_staff_id,
        s.name AS manager_name,
        c.notes,
        c.created_at,
        c.responded_at,
        c.response_seconds
      FROM courtesies c
      JOIN staff s ON s.id = c.manager_staff_id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ${limit}
      `,
      params,
    )) as CourtesyRow[];
    return rows;
  }

  async create(data: {
    type: string;
    item: string;
    managerStaffId: string;
    tableSessionId?: string;
    tableNumber?: number;
    notes?: string;
    slug?: string;
  }): Promise<CourtesyRow> {
    if (!VALID_TYPES.includes(data.type)) {
      throw new BadRequestException(`Tipo de cortesia invalido. Use: ${VALID_TYPES.join(', ')}.`);
    }
    if (!data.item || data.item.length > 500) {
      throw new BadRequestException('Item da cortesia obrigatorio (max 500 chars).');
    }

    const resolvedSessionId =
      data.tableSessionId ?? (await this.resolveActiveSessionForTableNumber(data.tableNumber));
    const resolvedTableNumber =
      data.tableNumber ??
      (resolvedSessionId ? await this.resolveTableNumberForSession(resolvedSessionId) : null);

    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `INSERT INTO courtesies (
           table_session_id, table_number, type, item,
           status, manager_staff_id, notes
         )
         VALUES ($1, $2, $3, $4, 'pendente', $5, $6)
         RETURNING id`,
        [
          resolvedSessionId,
          resolvedTableNumber,
          data.type,
          data.item,
          data.managerStaffId,
          data.notes ?? null,
        ],
      ),
    );

    if (!rows.length) {
      throw new BadRequestException('Falha ao criar cortesia.');
    }

    const created = await this.findById(rows[0].id);
    if (!created) {
      throw new BadRequestException('Falha ao recuperar cortesia criada.');
    }
    await this.recordCourtesyHistoryForActiveParticipants(created);
    this.emitCreated(data.slug, created);
    return created;
  }

  async respond(id: string, status: CourtesyStatus, slug?: string): Promise<CourtesyRow> {
    if (!VALID_STATUS.includes(status) || status === 'pendente') {
      throw new BadRequestException('Status invalido para resposta. Use aceita ou recusada.');
    }
    const rows = unwrapRows<CourtesyRow>(
      await this.tenantConn.query(
        `UPDATE courtesies
            SET status = $1,
                responded_at = now(),
                response_seconds = EXTRACT(EPOCH FROM (now() - created_at))::int
          WHERE id = $2 AND status = 'pendente'
          RETURNING id`,
        [status, id],
      ),
    );
    if (!rows.length) {
      throw new NotFoundException('Cortesia nao encontrada ou ja respondida.');
    }
    const found = await this.findById(rows[0].id);
    if (!found) throw new NotFoundException('Cortesia nao encontrada.');
    await this.updateCourtesyHistoryStatus(found);
    this.emitUpdated(slug, found);
    return found;
  }

  async listForSession(
    tableSessionId: string,
    customerId?: string,
  ): Promise<CustomerCourtesyDto[]> {
    await this.attachTableNumberCourtesiesToActiveSession(tableSessionId);
    const rows = await this.listRowsForOpenSession(tableSessionId);
    if (customerId) {
      await this.upsertCourtesyHistoryForCustomerRows(customerId, rows);
    }
    return rows.map((row) => this.toCustomerDto(row));
  }

  async listHistoryForCustomer(
    customerId: string | undefined,
    tableSessionId: string,
  ): Promise<CustomerCourtesyHistoryDto[]> {
    if (!customerId) return [];

    await this.attachTableNumberCourtesiesToActiveSession(tableSessionId);
    await this.upsertCourtesyHistoryForCustomerRows(
      customerId,
      await this.listRowsForOpenSession(tableSessionId),
    );

    const db = this.mongo.tryDb();
    if (!db) {
      throw new ServiceUnavailableException({
        message_user: 'Histórico de cortesias indisponível agora.',
        code: 'COURTESY_HISTORY_MONGO_UNAVAILABLE',
      });
    }
    await this.ensureHistoryIndexes();

    const docs = await db
      .collection<CourtesyHistoryDoc>(HISTORY_COLLECTION)
      .find({
        tenantId: this.historyTenantId(),
        customerId,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return docs.map((doc) => this.toHistoryDto(doc, tableSessionId));
  }

  async respondForSession(
    id: string,
    status: CourtesyStatus,
    tableSessionId: string,
    slug?: string,
    customerId?: string,
  ): Promise<CustomerCourtesyDto> {
    if (!VALID_STATUS.includes(status) || status === 'pendente') {
      throw new BadRequestException({
        message_user: 'Escolha aceitar ou recusar a cortesia.',
        code: 'COURTESY_INVALID_STATUS',
      });
    }

    await this.attachTableNumberCourtesiesToActiveSession(tableSessionId);
    await this.ensureSessionOpen(tableSessionId);
    const current = await this.findById(id);
    if (!current || current.table_session_id !== tableSessionId) {
      throw new ForbiddenException({
        message_user: 'Essa cortesia nao pertence a esta mesa.',
        code: 'COURTESY_NOT_OWNED',
      });
    }
    if (current.status !== 'pendente') {
      throw new BadRequestException({
        message_user: 'Essa cortesia ja foi respondida.',
        code: 'COURTESY_ALREADY_RESPONDED',
      });
    }

    const updated = await this.respond(id, status, slug);
    if (customerId) {
      await this.upsertCourtesyHistoryForCustomerRows(customerId, [updated]);
    }
    return this.toCustomerDto(updated);
  }

  private async listRowsForOpenSession(tableSessionId: string): Promise<CourtesyRow[]> {
    return unwrapRows<CourtesyRow>(
      await this.tenantConn.query(
        `
        SELECT
          c.id,
          c.table_session_id,
          c.table_number,
          c.type,
          c.item,
          c.status,
          c.manager_staff_id,
          s.name AS manager_name,
          c.notes,
          c.created_at,
          c.responded_at,
          c.response_seconds
        FROM courtesies c
        JOIN staff s ON s.id = c.manager_staff_id
        JOIN table_sessions ts ON ts.id = c.table_session_id
        WHERE c.table_session_id = $1
          AND ts.status = 'active'
          AND ts.closed_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT 50
        `,
        [tableSessionId],
      ),
    );
  }

  private async findById(id: string): Promise<CourtesyRow | null> {
    const rows = unwrapRows<CourtesyRow>(
      await this.tenantConn.query(
        `
        SELECT
          c.id,
          c.table_session_id,
          c.table_number,
          c.type,
          c.item,
          c.status,
          c.manager_staff_id,
          s.name AS manager_name,
          c.notes,
          c.created_at,
          c.responded_at,
          c.response_seconds
        FROM courtesies c
        JOIN staff s ON s.id = c.manager_staff_id
        WHERE c.id = $1
        LIMIT 1
        `,
        [id],
      ),
    );
    return rows[0] ?? null;
  }

  private async resolveActiveSessionForTableNumber(
    tableNumber?: number | null,
  ): Promise<string | null> {
    if (!tableNumber) return null;
    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `
        SELECT ts.id
        FROM table_sessions ts
        JOIN tables t ON t.id = ts.table_id
        WHERE ts.status = 'active'
          AND CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) = $1
        ORDER BY ts.created_at DESC
        LIMIT 1
        `,
        [tableNumber],
      ),
    );
    return rows[0]?.id ?? null;
  }

  private async resolveTableNumberForSession(tableSessionId: string): Promise<number | null> {
    const rows = unwrapRows<{ table_number: number | null }>(
      await this.tenantConn.query(
        `
        SELECT CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number
        FROM table_sessions ts
        JOIN tables t ON t.id = ts.table_id
        WHERE ts.id = $1
        LIMIT 1
        `,
        [tableSessionId],
      ),
    );
    return rows[0]?.table_number ?? null;
  }

  private async attachTableNumberCourtesiesToActiveSession(tableSessionId: string): Promise<void> {
    await this.tenantConn.query(
      `
      UPDATE courtesies c
         SET table_session_id = ts.id
        FROM table_sessions ts
        JOIN tables t ON t.id = ts.table_id
       WHERE ts.id = $1
         AND ts.status = 'active'
         AND c.table_session_id IS NULL
         AND c.status = 'pendente'
         AND c.table_number = CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT)
         AND c.created_at >= ts.created_at
      `,
      [tableSessionId],
    );
  }

  private async ensureSessionOpen(tableSessionId: string): Promise<void> {
    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `
        SELECT id
        FROM table_sessions
        WHERE id = $1
          AND status = 'active'
          AND closed_at IS NULL
        LIMIT 1
        `,
        [tableSessionId],
      ),
    );
    if (rows.length > 0) return;
    throw new BadRequestException({
      message_user: 'Essa cortesia vale só até o fechamento da conta atual.',
      code: 'COURTESY_SESSION_CLOSED',
    });
  }

  private async recordCourtesyHistoryForActiveParticipants(row: CourtesyRow): Promise<void> {
    if (!row.table_session_id) return;
    const participants = unwrapRows<{ customer_id: string }>(
      await this.tenantConn.query(
        `
        SELECT sp.customer_id
        FROM session_participants sp
        JOIN table_sessions ts ON ts.id = sp.table_session_id
        WHERE sp.table_session_id = $1
          AND sp.left_at IS NULL
          AND sp.status = 'approved'
          AND ts.status = 'active'
          AND ts.closed_at IS NULL
        `,
        [row.table_session_id],
      ),
    );
    for (const participant of participants) {
      await this.upsertCourtesyHistoryForCustomerRows(participant.customer_id, [row]);
    }
  }

  private async ensureHistoryIndexes(): Promise<void> {
    if (this.historyIndexesEnsured) return;
    const db = this.mongo.tryDb();
    if (!db) return;
    try {
      const collection = db.collection<CourtesyHistoryDoc>(HISTORY_COLLECTION);
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await collection.createIndex({ tenantId: 1, customerId: 1, createdAt: -1 });
      await collection.createIndex(
        { tenantId: 1, customerId: 1, courtesyId: 1 },
        { unique: true },
      );
      await collection.createIndex({ tenantId: 1, courtesyId: 1 });
      this.historyIndexesEnsured = true;
    } catch (err) {
      this.logger.warn(
        `Falha ao garantir indexes em ${HISTORY_COLLECTION}: ${(err as Error).message}`,
      );
    }
  }

  private async upsertCourtesyHistoryForCustomerRows(
    customerId: string,
    rows: CourtesyRow[],
  ): Promise<void> {
    if (!rows.length) return;
    const db = this.mongo.tryDb();
    if (!db) {
      this.logger.warn(`Mongo offline · skipping courtesy history for customer ${customerId}`);
      return;
    }
    await this.ensureHistoryIndexes();

    const tenantId = this.historyTenantId();
    const now = new Date();
    const collection = db.collection<CourtesyHistoryDoc>(HISTORY_COLLECTION);

    for (const row of rows) {
      if (!row.table_session_id) continue;
      const createdAt = this.toDate(row.created_at, now);
      const expiresAt = new Date(
        createdAt.getTime() + HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000,
      );
      try {
        await collection.updateOne(
          { tenantId, customerId, courtesyId: row.id },
          {
            $setOnInsert: {
              tenantId,
              customerId,
              courtesyId: row.id,
              receivedAt: createdAt,
              validUntilSessionClose: true,
              currentSessionOnly: true,
            },
            $set: {
              tableSessionId: row.table_session_id,
              tableNumber: row.table_number,
              type: row.type,
              item: row.item,
              status: row.status,
              managerName: row.manager_name ?? null,
              notes: row.notes,
              createdAt,
              respondedAt: row.responded_at ? this.toDate(row.responded_at, now) : null,
              updatedAt: now,
              expiresAt,
            },
          },
          { upsert: true },
        );
      } catch (err) {
        this.logger.warn(
          `Falha ao persistir courtesy history ${row.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async updateCourtesyHistoryStatus(row: CourtesyRow): Promise<void> {
    const db = this.mongo.tryDb();
    if (!db) {
      this.logger.warn(`Mongo offline · skipping courtesy history status for ${row.id}`);
      return;
    }
    await this.ensureHistoryIndexes();
    try {
      await db.collection<CourtesyHistoryDoc>(HISTORY_COLLECTION).updateMany(
        { tenantId: this.historyTenantId(), courtesyId: row.id },
        {
          $set: {
            status: row.status,
            respondedAt: row.responded_at ? this.toDate(row.responded_at, new Date()) : null,
            updatedAt: new Date(),
          },
        },
      );
    } catch (err) {
      this.logger.warn(
        `Falha ao atualizar courtesy history ${row.id}: ${(err as Error).message}`,
      );
    }
  }

  private historyTenantId(): string {
    return this.tenantConn.getTenantSlug() ?? 'unknown';
  }

  private toDate(value: string | Date, fallback: Date): Date {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  private toCustomerDto(row: CourtesyRow): CustomerCourtesyDto {
    return {
      id: row.id,
      tableSessionId: row.table_session_id ?? '',
      tableNumber: row.table_number,
      type: row.type,
      item: row.item,
      status: row.status,
      managerName: row.manager_name ?? null,
      notes: row.notes,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
    };
  }

  private toHistoryDto(
    doc: CourtesyHistoryDoc,
    currentTableSessionId: string,
  ): CustomerCourtesyHistoryDto {
    return {
      id: doc.courtesyId,
      tableSessionId: doc.tableSessionId,
      tableNumber: doc.tableNumber,
      type: doc.type,
      item: doc.item,
      status: doc.status,
      managerName: doc.managerName,
      notes: doc.notes,
      createdAt: doc.createdAt.toISOString(),
      respondedAt: doc.respondedAt ? doc.respondedAt.toISOString() : null,
      receivedAt: doc.receivedAt.toISOString(),
      expiresAt: doc.expiresAt.toISOString(),
      validInCurrentSession:
        doc.tableSessionId === currentTableSessionId && doc.status === 'pendente',
      validUntilSessionClose: doc.validUntilSessionClose !== false,
    };
  }

  private emitCreated(slug: string | undefined, row: CourtesyRow): void {
    if (!slug || !row.table_session_id) return;
    this.events?.emitCourtesyCreated(slug, this.toCustomerDto(row));
  }

  private emitUpdated(slug: string | undefined, row: CourtesyRow): void {
    if (!slug || !row.table_session_id) return;
    this.events?.emitCourtesyUpdated(slug, this.toCustomerDto(row));
  }
}
