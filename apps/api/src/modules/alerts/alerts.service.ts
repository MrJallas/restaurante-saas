import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { authErrorResponse } from '../../common/guards/auth-error-response';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';

export type AlertSeverity = 'crítica' | 'atenção' | 'info';
export type AlertStatus = 'open' | 'dismissed' | 'resolved';

export interface AlertActionDescriptor {
  label: string;
  route?: string;
  kind?: 'primary' | 'ghost';
  [k: string]: unknown;
}

export interface AlertRow {
  id: string;
  sev: AlertSeverity;
  kind: string;
  title: string;
  sub: string | null;
  ttl_at: string | null;
  actions: AlertActionDescriptor[];
  dismissed_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const VALID_SEV: AlertSeverity[] = ['crítica', 'atenção', 'info'];
const MANAGEMENT_ROLES = new Set(['manager', 'owner']);
const ROLE_ALERT_PATTERNS: Record<string, string[]> = {
  host: [
    'host',
    'recepc',
    'waitlist',
    'lista',
    'late_arrival',
    'late-arrival',
    'scan',
    'qr',
    'table',
  ],
  waiter: [
    'waiter',
    'garcom',
    'garçom',
    'chamado',
    'call',
    'delivery',
    'entrega',
    'order',
    'table',
  ],
  cook: ['cook', 'cozinha', 'kitchen', 'pedido', 'order', 'priority', 'fila'],
  bartender: ['bar', 'drink', 'bebida', 'pedido', 'order'],
  cashier: ['cashier', 'caixa', 'payment', 'pagamento', 'conta', 'bill'],
};

export function alertVisibleForRole(
  alert: Pick<AlertRow, 'kind' | 'title' | 'sub'>,
  role: string,
): boolean {
  if (MANAGEMENT_ROLES.has(role)) return true;
  const patterns = ROLE_ALERT_PATTERNS[role] ?? [];
  if (!patterns.length) return false;
  const haystack = alert.kind.toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

/**
 * Round 18 (Onda 4 batch 2): persistencia de alertas operacionais
 * pra `ScreenManagerAlertsAll`. Migration 045 cria a tabela.
 *
 * `list` aceita filtros (sev/status). `dismiss`/`resolve` marcam
 * o alerta como tratado (mutualmente exclusivos — operador escolhe
 * um). `create` é o hook usado por outros modules (escalation,
 * zone-pause, qr-issues) pra emitir um alerta + disparar WS event
 * `alert.created`.
 */
@Injectable()
export class AlertsService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async list(
    filters: {
      sev?: AlertSeverity | 'all';
      status?: AlertStatus | 'all';
      limit?: number;
    } = {},
  ): Promise<AlertRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.sev && filters.sev !== 'all') {
      where.push(`sev = $${idx++}`);
      params.push(filters.sev);
    }

    const status = filters.status ?? 'open';
    if (status === 'open') {
      where.push(`dismissed_at IS NULL AND resolved_at IS NULL`);
      // TTL exclui rows que ja expiraram naturalmente (auto-cleanup
      // de info-level alerts). NULL ttl_at significa sem expiracao.
      where.push(`(ttl_at IS NULL OR ttl_at > now())`);
    } else if (status === 'dismissed') {
      where.push(`dismissed_at IS NOT NULL`);
    } else if (status === 'resolved') {
      where.push(`resolved_at IS NOT NULL`);
    }
    // status === 'all' não adiciona filtro.

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

    const rows = (await this.tenantConn.query(
      `
      SELECT id, sev, kind, title, sub, ttl_at, actions,
             dismissed_at, resolved_at, created_at
        FROM alerts
        ${whereClause}
        ORDER BY
          CASE sev
            WHEN 'crítica' THEN 0
            WHEN 'atenção' THEN 1
            ELSE 2
          END,
          created_at DESC
        LIMIT ${limit}
      `,
      params,
    )) as AlertRow[];
    return rows;
  }

  async resolveActiveStaffRole(staffId: string): Promise<string | null> {
    const rows = (await this.tenantConn.query(
      `SELECT role FROM staff WHERE id = $1 AND is_active = true`,
      [staffId],
    )) as { role: string }[];
    return rows[0]?.role ?? null;
  }

  async listForRole(
    role: string,
    filters: {
      sev?: AlertSeverity | 'all';
      status?: AlertStatus | 'all';
      limit?: number;
    } = {},
  ): Promise<AlertRow[]> {
    if (MANAGEMENT_ROLES.has(role)) return this.list(filters);

    const requestedLimit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const rows = await this.list({
      ...filters,
      // Fetch a wider window before role filtering so staff roles do not get
      // an empty page just because manager-only alerts were newer.
      limit: 500,
    });
    return rows.filter((alert) => alertVisibleForRole(alert, role)).slice(0, requestedLimit);
  }

  async create(data: {
    sev: AlertSeverity;
    kind: string;
    title: string;
    sub?: string;
    ttlAt?: Date | string;
    actions?: AlertActionDescriptor[];
    /**
     * Vincula o alerta a uma sessão de mesa. Hoje só o kind
     * `host_assist_table` passa este valor — ele habilita a dedup por sessão
     * (índice único parcial da migration 069 + ON CONFLICT abaixo) pra que um
     * double-tap / retry do `POST /:slug/host/assist` reuse o alerta ativo em
     * vez de spammar o inbox da recepção. Demais kinds omitem → coluna NULL →
     * fora do índice parcial → comportamento inalterado (N inserts livres).
     */
    tableSessionId?: string;
  }): Promise<AlertRow> {
    if (!VALID_SEV.includes(data.sev)) {
      throw new BadRequestException(`Severidade invalida. Use: ${VALID_SEV.join(', ')}.`);
    }
    if (!data.title || data.title.length > 500) {
      throw new BadRequestException('Title obrigatorio (max 500 chars).');
    }

    // Dedup por sessão SÓ quando há tableSessionId. O `ON CONFLICT` usa como
    // árbitro o índice parcial `alerts_host_assist_one_active_per_session`
    // (mig 069), cujo predicado exige kind='host_assist_table' +
    // table_session_id NOT NULL + não-resolvido/dispensado. Como só o
    // host_assist passa a sessão, nenhum outro kind casa o árbitro — eles nunca
    // conflitam e seguem inserindo N linhas. Em conflito, DO NOTHING não
    // devolve linha; caímos no re-fetch abaixo pra reusar o alerta ativo.
    const conflictClause = data.tableSessionId
      ? `ON CONFLICT (table_session_id)
           WHERE kind = 'host_assist_table'
             AND table_session_id IS NOT NULL
             AND dismissed_at IS NULL
             AND resolved_at IS NULL
         DO NOTHING`
      : '';

    const rows = unwrapRows<AlertRow>(
      await this.tenantConn.query(
        `INSERT INTO alerts (sev, kind, title, sub, ttl_at, actions, table_session_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ${conflictClause}
         RETURNING id, sev, kind, title, sub, ttl_at, actions,
                   dismissed_at, resolved_at, created_at`,
        [
          data.sev,
          data.kind,
          data.title,
          data.sub ?? null,
          data.ttlAt ?? null,
          JSON.stringify(data.actions ?? []),
          data.tableSessionId ?? null,
        ],
      ),
    );

    // Conflito de dedup (host_assist já ativo pra esta sessão): o INSERT não
    // devolveu linha. Reusa o alerta ativo existente sem criar duplicata nem
    // reemitir o WS `alert.created` (idempotência do retry).
    if (!rows.length && data.tableSessionId) {
      const existing = (await this.tenantConn.query(
        `SELECT id, sev, kind, title, sub, ttl_at, actions,
                dismissed_at, resolved_at, created_at
           FROM alerts
          WHERE kind = 'host_assist_table'
            AND table_session_id = $1
            AND dismissed_at IS NULL
            AND resolved_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1`,
        [data.tableSessionId],
      )) as AlertRow[];
      if (existing.length) {
        return existing[0];
      }
    }

    if (!rows.length) {
      throw new BadRequestException('Falha ao criar alerta.');
    }

    const alert = rows[0];

    // Emit only to the current tenant room. A global `server.emit` leaks
    // alert metadata to other tenants and even customer sockets.
    const tenantSlug = this.tenantConn.getTenantSlug();
    if (this.events && tenantSlug) {
      this.events.emitAlertCreated(tenantSlug, alert as unknown as Record<string, unknown>);
    }

    return alert;
  }

  async dismiss(id: string): Promise<AlertRow> {
    const rows = unwrapRows<AlertRow>(
      await this.tenantConn.query(
        `UPDATE alerts
            SET dismissed_at = now()
          WHERE id = $1
            AND dismissed_at IS NULL
            AND resolved_at IS NULL
          RETURNING id, sev, kind, title, sub, ttl_at, actions,
                    dismissed_at, resolved_at, created_at`,
        [id],
      ),
    );
    if (!rows.length) {
      throw new NotFoundException('Alerta nao encontrado ou ja tratado.');
    }
    return rows[0];
  }

  async dismissForRole(id: string, role: string): Promise<AlertRow> {
    await this.ensureRoleCanActOnAlert(id, role);
    return this.dismiss(id);
  }

  async resolve(id: string): Promise<AlertRow> {
    const rows = unwrapRows<AlertRow>(
      await this.tenantConn.query(
        `UPDATE alerts
            SET resolved_at = now()
          WHERE id = $1
            AND dismissed_at IS NULL
            AND resolved_at IS NULL
          RETURNING id, sev, kind, title, sub, ttl_at, actions,
                    dismissed_at, resolved_at, created_at`,
        [id],
      ),
    );
    if (!rows.length) {
      throw new NotFoundException('Alerta nao encontrado ou ja tratado.');
    }
    return rows[0];
  }

  async resolveForRole(id: string, role: string): Promise<AlertRow> {
    await this.ensureRoleCanActOnAlert(id, role);
    return this.resolve(id);
  }

  private async ensureRoleCanActOnAlert(id: string, role: string): Promise<void> {
    if (MANAGEMENT_ROLES.has(role)) return;

    const rows = (await this.tenantConn.query(
      `SELECT id, kind, title, sub
         FROM alerts
        WHERE id = $1
          AND dismissed_at IS NULL
          AND resolved_at IS NULL`,
      [id],
    )) as Pick<AlertRow, 'id' | 'kind' | 'title' | 'sub'>[];
    if (!rows.length) {
      throw new NotFoundException('Alerta nao encontrado ou ja tratado.');
    }
    if (!alertVisibleForRole(rows[0], role)) {
      throw new ForbiddenException(
        authErrorResponse('AUTH_FORBIDDEN', 'Acesso não permitido para este perfil'),
      );
    }
  }
}
