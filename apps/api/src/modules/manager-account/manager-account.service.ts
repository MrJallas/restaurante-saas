import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  listStaffSessions,
  revokeStaffSessionById,
  verifyStaffSessionToken,
} from '../../common/auth/staff-session-token';
import { MongoService } from '../../infra/mongo/mongo.service';
import { RedisService } from '../../infra/redis/redis.service';
import {
  RESTAURANT_LOCAL_DAY_START_SQL,
  restaurantLocalDateOfSql,
} from '../../common/utils/restaurant-local-time';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

const PREFS_COLLECTION = 'manager_preferences';

interface ManagerPreferencesDoc {
  tenantSlug: string;
  staffId: string;
  theme: 'light' | 'dark' | 'auto';
  updatedAt: Date;
}

@Injectable()
export class ManagerAccountService {
  constructor(
    private readonly mongo: MongoService,
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  private dbOrThrow() {
    const db = this.mongo.tryDb();
    if (!db) {
      throw new ServiceUnavailableException({
        message_user: 'Histórico indisponível no momento. Tente novamente em instantes.',
        code: 'MONGO_UNAVAILABLE',
      });
    }
    return db;
  }

  async getPreferences(slug: string, staffId: string) {
    const db = this.dbOrThrow();
    await this.ensurePreferenceIndexes();
    const doc = await db.collection<ManagerPreferencesDoc>(PREFS_COLLECTION).findOne({
      tenantSlug: slug,
      staffId,
    });
    return {
      theme: doc?.theme ?? 'light',
      updatedAt: doc?.updatedAt?.toISOString() ?? null,
    };
  }

  async updatePreferences(
    slug: string,
    staffId: string,
    patch: {
      notifications?: Record<string, boolean>;
      theme?: 'light' | 'dark' | 'auto';
      twoFactorEnabled?: boolean;
    },
  ) {
    if (patch.notifications !== undefined || patch.twoFactorEnabled !== undefined) {
      throw new BadRequestException({
        message_user:
          'Preferências de notificação e autenticação em 2 fatores ainda não estão disponíveis.',
        code: 'FEATURE_NOT_AVAILABLE',
      });
    }
    const db = this.dbOrThrow();
    await this.ensurePreferenceIndexes();
    const current = await this.getPreferences(slug, staffId);
    const next: ManagerPreferencesDoc = {
      tenantSlug: slug,
      staffId,
      theme: patch.theme ?? current.theme,
      updatedAt: new Date(),
    };
    await db
      .collection<ManagerPreferencesDoc>(PREFS_COLLECTION)
      .updateOne({ tenantSlug: slug, staffId }, { $set: next }, { upsert: true });
    return {
      theme: next.theme,
      updatedAt: next.updatedAt.toISOString(),
    };
  }

  async listSessions(slug: string, staffId: string, token: string | undefined) {
    await this.requireCurrentStaffToken(slug, staffId, token);
    const sessions = await listStaffSessions(this.redis, {
      slug,
      staffId,
      currentToken: token!,
    });
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        label: session.current ? 'Este dispositivo' : 'Outra sessão',
        ip: session.ip,
        userAgent: session.userAgent,
        current: session.current,
        lastSeenAt: session.issuedAt,
        expiresAt: session.expiresAt,
      })),
    };
  }

  async revokeSession(slug: string, staffId: string, sessionId: string, token: string | undefined) {
    await this.requireCurrentStaffToken(slug, staffId, token);
    const result = await revokeStaffSessionById(this.redis, {
      slug,
      staffId,
      sessionId,
      currentToken: token!,
    });
    if (result === 'current') {
      throw new BadRequestException({
        message_user: 'Use Sair do app para encerrar esta sessão.',
        code: 'CURRENT_SESSION',
      });
    }
    if (result === 'not_found') {
      throw new NotFoundException({
        message_user: 'Sessão não encontrada ou já encerrada.',
        code: 'SESSION_NOT_FOUND',
      });
    }
    // A revogação Redis bloqueia HTTP, mas o gateway só valida no handshake.
    // Desconectar todas as conexões do staff é conservador; a sessão corrente
    // válida reconecta, enquanto a sessão revogada falha ao autenticar.
    this.events?.disconnectStaff(staffId);
    return { ok: true };
  }

  private async requireCurrentStaffToken(
    slug: string,
    staffId: string,
    token: string | undefined,
  ): Promise<void> {
    const payload = await verifyStaffSessionToken(this.redis, token, slug);
    if (!payload || payload.staffId !== staffId) {
      throw new UnauthorizedException({
        message_user: 'Sessão de equipe inválida. Faça login novamente.',
        code: 'AUTH_INVALID',
      });
    }
  }

  async endShift(slug: string, staffId: string) {
    const [staffRows, salesRows, tableRows, alertRows, waiterRows] = await Promise.all([
      this.tenantConn.query(`SELECT name FROM staff WHERE id = $1 LIMIT 1`, [staffId]),
      this.tenantConn.query(
        `SELECT COUNT(*)::int AS orders,
                COALESCE(SUM(total_cents), 0)::int AS sales_cents
           FROM orders
          WHERE created_at >= ${RESTAURANT_LOCAL_DAY_START_SQL}
            AND status != 'cancelled'`,
      ),
      this.tenantConn.query(
        `SELECT COUNT(*)::int AS tables_served
           FROM table_sessions
          WHERE closed_at >= ${RESTAURANT_LOCAL_DAY_START_SQL}`,
      ),
      this.tenantConn.query(
        `SELECT COUNT(*)::int AS critical_alerts
           FROM complaints
          WHERE submitted_at >= ${RESTAURANT_LOCAL_DAY_START_SQL}
            AND closed_at IS NULL`,
      ),
      this.tenantConn.query(
        `SELECT name
           FROM staff
          WHERE is_active = true
            AND role IN ('waiter', 'cook', 'host', 'bartender', 'cashier')
          ORDER BY name ASC
          LIMIT 30`,
      ),
    ]);
    const staffName = (staffRows as Array<{ name: string }>)[0]?.name ?? 'Gerência';
    const sales = (salesRows as Array<{ orders: number; sales_cents: number }>)[0] ?? {
      orders: 0,
      sales_cents: 0,
    };
    const tables = (tableRows as Array<{ tables_served: number }>)[0]?.tables_served ?? 0;
    const criticalAlerts =
      (alertRows as Array<{ critical_alerts: number }>)[0]?.critical_alerts ?? 0;
    const waitersOnShift = (waiterRows as Array<{ name: string }>).map((w) => w.name);
    const orders = Number(sales.orders ?? 0);
    const salesCents = Number(sales.sales_cents ?? 0);
    // FASE 3 (decisão Caleb 2026-07-04): shift log é dado FINANCEIRO —
    // mora no Postgres (migration 059), não mais no Mongo com $regex.
    const rows = (await this.tenantConn.query(
      `INSERT INTO manager_shift_logs
         (staff_id, staff_name, shift_label, started_at, ended_at,
          sales_cents, orders, tables_served, critical_alerts,
          avg_ticket_cents, waiters_on_shift)
       VALUES ($1, $2, 'Turno atual', ${RESTAURANT_LOCAL_DAY_START_SQL}, now(),
               $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        staffId,
        staffName,
        salesCents,
        orders,
        Number(tables ?? 0),
        criticalAlerts,
        orders > 0 ? Math.round(salesCents / orders) : 0,
        JSON.stringify(waitersOnShift),
      ],
    )) as Array<Record<string, unknown>>;
    return this.mapShiftRow(rows[0]);
  }

  async listShiftLogs(_slug: string, filters: { date?: string; staff?: string; shift?: string }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.staff) {
      params.push(`%${filters.staff}%`);
      conditions.push(`staff_name ILIKE $${params.length}`);
    }
    if (filters.shift) {
      params.push(`%${filters.shift}%`);
      conditions.push(`shift_label ILIKE $${params.length}`);
    }
    if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
      params.push(filters.date);
      conditions.push(`${restaurantLocalDateOfSql('ended_at')} = $${params.length}::date`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = (await this.tenantConn.query(
      `SELECT * FROM manager_shift_logs ${where} ORDER BY ended_at DESC LIMIT 80`,
      params,
    )) as Array<Record<string, unknown>>;
    return { shifts: rows.map((r) => this.mapShiftRow(r)) };
  }

  private mapShiftRow(r: Record<string, unknown>) {
    return {
      id: String(r.id),
      staffId: r.staff_id == null ? null : String(r.staff_id),
      staffName: String(r.staff_name),
      shiftLabel: String(r.shift_label),
      startedAt: new Date(String(r.started_at)).toISOString(),
      endedAt: new Date(String(r.ended_at)).toISOString(),
      salesCents: Number(r.sales_cents) || 0,
      orders: Number(r.orders) || 0,
      tablesServed: Number(r.tables_served) || 0,
      criticalAlerts: Number(r.critical_alerts) || 0,
      avgTicketCents: Number(r.avg_ticket_cents) || 0,
      waitersOnShift: Array.isArray(r.waiters_on_shift)
        ? (r.waiters_on_shift as string[])
        : JSON.parse(String(r.waiters_on_shift ?? '[]')),
      createdAt: new Date(String(r.created_at)).toISOString(),
    };
  }

  private async ensurePreferenceIndexes() {
    const db = this.dbOrThrow();
    await db
      .collection<ManagerPreferencesDoc>(PREFS_COLLECTION)
      .createIndex({ tenantSlug: 1, staffId: 1 }, { unique: true });
  }
}
