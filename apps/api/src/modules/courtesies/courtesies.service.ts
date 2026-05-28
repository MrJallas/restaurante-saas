import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { CustomerCourtesyDto } from '@restaurant/shared-types';
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

@Injectable()
export class CourtesiesService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
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
    this.emitUpdated(slug, found);
    return found;
  }

  async listForSession(tableSessionId: string): Promise<CustomerCourtesyDto[]> {
    await this.attachTableNumberCourtesiesToActiveSession(tableSessionId);
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
        WHERE c.table_session_id = $1
        ORDER BY c.created_at DESC
        LIMIT 50
        `,
        [tableSessionId],
      ),
    );
    return rows.map((row) => this.toCustomerDto(row));
  }

  async respondForSession(
    id: string,
    status: CourtesyStatus,
    tableSessionId: string,
    slug?: string,
  ): Promise<CustomerCourtesyDto> {
    if (!VALID_STATUS.includes(status) || status === 'pendente') {
      throw new BadRequestException({
        message_user: 'Escolha aceitar ou recusar a cortesia.',
        code: 'COURTESY_INVALID_STATUS',
      });
    }

    await this.attachTableNumberCourtesiesToActiveSession(tableSessionId);
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
    return this.toCustomerDto(updated);
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

  private emitCreated(slug: string | undefined, row: CourtesyRow): void {
    if (!slug || !row.table_session_id) return;
    this.events?.emitCourtesyCreated(slug, this.toCustomerDto(row));
  }

  private emitUpdated(slug: string | undefined, row: CourtesyRow): void {
    if (!slug || !row.table_session_id) return;
    this.events?.emitCourtesyUpdated(slug, this.toCustomerDto(row));
  }
}
