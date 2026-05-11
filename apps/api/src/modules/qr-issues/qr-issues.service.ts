import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';

export type QrIssueStatus = 'open' | 'in_progress' | 'resolved';

export interface QrIssueRow {
  id: string;
  table_number: number | null;
  description: string | null;
  photo_url: string | null;
  reported_by_staff_id: string | null;
  status: QrIssueStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by_staff_id: string | null;
}

const VALID_STATUS: QrIssueStatus[] = ['open', 'in_progress', 'resolved'];

@Injectable()
export class QrIssuesService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async list(
    status: QrIssueStatus | 'all' = 'open',
  ): Promise<QrIssueRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (status !== 'all') {
      where.push(`status = $1`);
      params.push(status);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = (await this.tenantConn.query(
      `SELECT id, table_number, description, photo_url,
              reported_by_staff_id, status, created_at,
              resolved_at, resolved_by_staff_id
         FROM qr_issues
         ${whereClause}
        ORDER BY created_at DESC
        LIMIT 200`,
      params,
    )) as QrIssueRow[];
    return rows;
  }

  async create(
    dto: { table_number?: number; description?: string; photo_url?: string },
    reporterStaffId: string | null,
  ): Promise<QrIssueRow> {
    if (dto.description && dto.description.length > 2000) {
      throw new BadRequestException('Descricao excede 2000 chars.');
    }

    const rows = unwrapRows<QrIssueRow>(
      await this.tenantConn.query(
        `INSERT INTO qr_issues
           (table_number, description, photo_url, reported_by_staff_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, table_number, description, photo_url,
                   reported_by_staff_id, status, created_at,
                   resolved_at, resolved_by_staff_id`,
        [
          dto.table_number ?? null,
          dto.description ?? null,
          dto.photo_url ?? null,
          reporterStaffId,
        ],
      ),
    );

    if (!rows.length) {
      throw new BadRequestException('Falha ao criar qr_issue.');
    }
    return rows[0];
  }

  /** Exposto pra testes / future endpoints. */
  static get VALID_STATUS() {
    return VALID_STATUS;
  }
}
