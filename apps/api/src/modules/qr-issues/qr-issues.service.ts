import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { AlertsService } from '../alerts/alerts.service';

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
  private readonly logger = new Logger(QrIssuesService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    // @Optional: o INSERT do qr_issue é a ação primária. Alertar o gerente é
    // best-effort — se o AlertsService não estiver montado (ou falhar), o
    // problema no QR ainda fica registrado. Mesma postura de host.service /
    // customer-staff-messages.
    @Optional() private readonly alerts?: AlertsService,
  ) {}

  async list(status: QrIssueStatus | 'all' = 'open'): Promise<QrIssueRow[]> {
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
        [dto.table_number ?? null, dto.description ?? null, dto.photo_url ?? null, reporterStaffId],
      ),
    );

    if (!rows.length) {
      throw new BadRequestException('Falha ao criar qr_issue.');
    }

    const issue = rows[0];

    // P1-U: a feature era morta ponta-a-ponta — o garçom reportava e o gerente
    // NUNCA era notificado (o docstring do AlertsModule já listava `qr-issues`
    // como caller). Agora todo QR-issue vira um alerta operacional. O kind
    // contém `qr` → roteado pro sino do gerente (sempre vê tudo) e pros perfis
    // host/waiter via ROLE_ALERT_PATTERNS. `AlertsService.create` já emite o
    // WS `alert.created` internamente (room tenant:<slug>:manager) que o
    // `useManagerEvents`/`ScreenManagerNotifications` escuta e re-fetcha.
    await this.emitManagerAlert(issue);

    return issue;
  }

  /**
   * Best-effort: cria o alerta pro gerente com o contexto do QR-issue (mesa,
   * problema, garçom). Envolto em try/catch pra que uma falha no módulo de
   * alertas NUNCA derrube a criação do QR-issue (o registro do problema é o
   * que importa). Igual padrão de customer-staff-messages.service.
   */
  private async emitManagerAlert(issue: QrIssueRow): Promise<void> {
    if (!this.alerts) return;

    const mesaLabel = issue.table_number != null ? `Mesa ${issue.table_number}` : 'Mesa';
    const problema = issue.description?.trim() || 'Problema reportado no QR da mesa.';

    try {
      await this.alerts.create({
        sev: 'atenção',
        kind: 'qr-issue',
        title: `${mesaLabel} · problema no QR`,
        sub: problema,
      });
    } catch (err) {
      this.logger.warn(`Falha ao criar alerta de qr-issue: ${(err as Error).message}`);
    }
  }

  /** Exposto pra testes / future endpoints. */
  static get VALID_STATUS() {
    return VALID_STATUS;
  }
}
