import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MongoService } from '../../infra/mongo/mongo.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { hashPin, timingSafeEqualHex } from '../staff/staff-pin.util';

const PREFS_COLLECTION = 'manager_preferences';
const SESSIONS_COLLECTION = 'manager_sessions';

interface ManagerPreferencesDoc {
  tenantSlug: string;
  staffId: string;
  notifications: Record<string, boolean>;
  theme: 'light' | 'dark' | 'auto';
  twoFactorEnabled: boolean;
  updatedAt: Date;
}

const DEFAULT_NOTIFICATIONS: Record<string, boolean> = {
  'turn.alerts': true,
  'turn.push': true,
  'turn.sound': true,
  'turn.lockScreen': false,
  'critical.complaints': true,
};

@Injectable()
export class ManagerAccountService {
  constructor(
    private readonly mongo: MongoService,
    private readonly tenantConn: TenantConnectionProvider,
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
      notifications: { ...DEFAULT_NOTIFICATIONS, ...(doc?.notifications ?? {}) },
      theme: doc?.theme ?? 'light',
      twoFactorEnabled: doc?.twoFactorEnabled ?? false,
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
    const db = this.dbOrThrow();
    await this.ensurePreferenceIndexes();
    const current = await this.getPreferences(slug, staffId);
    const next: ManagerPreferencesDoc = {
      tenantSlug: slug,
      staffId,
      notifications: {
        ...current.notifications,
        ...(patch.notifications ?? {}),
      },
      theme: patch.theme ?? current.theme,
      twoFactorEnabled: patch.twoFactorEnabled ?? current.twoFactorEnabled,
      updatedAt: new Date(),
    };
    await db
      .collection<ManagerPreferencesDoc>(PREFS_COLLECTION)
      .updateOne({ tenantSlug: slug, staffId }, { $set: next }, { upsert: true });
    return {
      notifications: next.notifications,
      theme: next.theme,
      twoFactorEnabled: next.twoFactorEnabled,
      updatedAt: next.updatedAt.toISOString(),
    };
  }

  async changePin(staffId: string, input: { currentPin: string; nextPin: string }) {
    if (!/^\d{4,6}$/.test(input.currentPin) || !/^\d{4,6}$/.test(input.nextPin)) {
      throw new BadRequestException({
        message_user: 'O PIN precisa ter 4 a 6 dígitos.',
        code: 'INVALID_PIN',
      });
    }
    const rows = (await this.tenantConn.query(
      `SELECT pin_hash FROM staff WHERE id = $1 AND is_active = true LIMIT 1`,
      [staffId],
    )) as Array<{ pin_hash: string }>;
    const currentHash = rows[0]?.pin_hash;
    if (!currentHash || !timingSafeEqualHex(currentHash, hashPin(input.currentPin))) {
      throw new BadRequestException({
        message_user: 'PIN atual não confere.',
        code: 'PIN_MISMATCH',
      });
    }
    await this.tenantConn.query(
      `UPDATE staff SET pin_hash = $1, updated_at = now() WHERE id = $2`,
      [hashPin(input.nextPin), staffId],
    );
    return {
      message_user: 'PIN atualizado.',
      code: 'PIN_CHANGED',
    };
  }

  async listSessions(staffId: string, req: { headers: Record<string, unknown>; ip?: string }) {
    const db = this.dbOrThrow();
    await this.ensureSessionIndexes();
    const currentSession = {
      sessionId: `current:${staffId}`,
      staffId,
      label: 'Este dispositivo',
      ip: req.ip ?? 'local',
      userAgent: String(req.headers['user-agent'] ?? 'Navegador'),
      current: true,
      lastSeenAt: new Date(),
    };
    await db
      .collection(SESSIONS_COLLECTION)
      .updateOne(
        { sessionId: currentSession.sessionId, staffId },
        { $set: currentSession },
        { upsert: true },
      );
    const docs = await db
      .collection(SESSIONS_COLLECTION)
      .find({ staffId, revokedAt: { $exists: false } })
      .sort({ lastSeenAt: -1 })
      .limit(20)
      .toArray();
    return {
      sessions: docs.map((doc) => ({
        id: String(doc.sessionId),
        label: String(doc.label ?? 'Dispositivo'),
        ip: String(doc.ip ?? 'local'),
        userAgent: String(doc.userAgent ?? ''),
        current: doc.sessionId === currentSession.sessionId,
        lastSeenAt:
          doc.lastSeenAt instanceof Date ? doc.lastSeenAt.toISOString() : new Date().toISOString(),
      })),
    };
  }

  async revokeSession(staffId: string, sessionId: string) {
    if (sessionId === `current:${staffId}`) {
      throw new BadRequestException({
        message_user: 'Use Sair do app para encerrar esta sessão.',
        code: 'CURRENT_SESSION',
      });
    }
    const db = this.dbOrThrow();
    await this.ensureSessionIndexes();
    await db
      .collection(SESSIONS_COLLECTION)
      .updateOne({ staffId, sessionId }, { $set: { revokedAt: new Date() } });
    return { ok: true };
  }

  async endShift(slug: string, staffId: string) {
    const [staffRows, salesRows, tableRows, alertRows, waiterRows] = await Promise.all([
      this.tenantConn.query(`SELECT name FROM staff WHERE id = $1 LIMIT 1`, [staffId]),
      this.tenantConn.query(
        `SELECT COUNT(*)::int AS orders,
                COALESCE(SUM(total_cents), 0)::int AS sales_cents
           FROM orders
          WHERE created_at >= CURRENT_DATE
            AND status != 'cancelled'`,
      ),
      this.tenantConn.query(
        `SELECT COUNT(*)::int AS tables_served
           FROM table_sessions
          WHERE closed_at >= CURRENT_DATE`,
      ),
      this.tenantConn.query(
        `SELECT COUNT(*)::int AS critical_alerts
           FROM complaints
          WHERE submitted_at >= CURRENT_DATE
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
    const now = new Date();
    const startedAt = new Date(now);
    startedAt.setHours(0, 0, 0, 0);
    const orders = Number(sales.orders ?? 0);
    const salesCents = Number(sales.sales_cents ?? 0);
    // FASE 3 (decisão Caleb 2026-07-04): shift log é dado FINANCEIRO —
    // mora no Postgres (migration 059), não mais no Mongo com $regex.
    const rows = (await this.tenantConn.query(
      `INSERT INTO manager_shift_logs
         (staff_id, staff_name, shift_label, started_at, ended_at,
          sales_cents, orders, tables_served, critical_alerts,
          avg_ticket_cents, waiters_on_shift)
       VALUES ($1, $2, 'Turno atual', $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING *`,
      [
        staffId,
        staffName,
        startedAt.toISOString(),
        now.toISOString(),
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
      conditions.push(
        `ended_at >= $${params.length}::date AND ended_at < $${params.length}::date + interval '1 day'`,
      );
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

  private async ensureSessionIndexes() {
    const db = this.dbOrThrow();
    await db
      .collection(SESSIONS_COLLECTION)
      .createIndex({ staffId: 1, sessionId: 1 }, { unique: true });
  }
}
