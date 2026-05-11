import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';

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

const VALID_TYPES = [
  'Sobremesa',
  'Drink',
  'Desconto',
  'Couvert',
  'Mensagem',
  'Outro',
];
const VALID_STATUS: CourtesyStatus[] = ['pendente', 'aceita', 'recusada'];

@Injectable()
export class CourtesiesService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async list(filters: {
    today?: boolean;
    status?: CourtesyStatus;
    limit?: number;
  } = {}): Promise<CourtesyRow[]> {
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
  }): Promise<CourtesyRow> {
    if (!VALID_TYPES.includes(data.type)) {
      throw new BadRequestException(
        `Tipo de cortesia invalido. Use: ${VALID_TYPES.join(', ')}.`,
      );
    }
    if (!data.item || data.item.length > 500) {
      throw new BadRequestException('Item da cortesia obrigatorio (max 500 chars).');
    }

    const rows = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `INSERT INTO courtesies (
           table_session_id, table_number, type, item,
           status, manager_staff_id, notes
         )
         VALUES ($1, $2, $3, $4, 'pendente', $5, $6)
         RETURNING id`,
        [
          data.tableSessionId ?? null,
          data.tableNumber ?? null,
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

    const created = await this.list({ limit: 1 });
    return created.find((c) => c.id === rows[0].id)!;
  }

  async respond(
    id: string,
    status: CourtesyStatus,
  ): Promise<CourtesyRow> {
    if (!VALID_STATUS.includes(status) || status === 'pendente') {
      throw new BadRequestException(
        'Status invalido para resposta. Use aceita ou recusada.',
      );
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
    const after = await this.list({ limit: 1 });
    const found = after.find((c) => c.id === rows[0].id);
    if (!found) throw new NotFoundException('Cortesia nao encontrada.');
    return found;
  }
}
