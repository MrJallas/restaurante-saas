import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MongoService } from '../../infra/mongo/mongo.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { hashPin, timingSafeEqualHex } from '../staff/staff-pin.util';

const PREFS_COLLECTION = 'manager_preferences';
const SHIFT_LOGS_COLLECTION = 'manager_shift_logs';
const SESSIONS_COLLECTION = 'manager_sessions';

interface ManagerPreferencesDoc {
  tenantSlug: string;
  staffId: string;
  notifications: Record<string, boolean>;
  theme: 'light' | 'dark' | 'auto';
  twoFactorEnabled: boolean;
  updatedAt: Date;
}

interface ShiftLogDoc {
  id: string;
  tenantSlug: string;
  staffId: string;
  staffName: string;
  shiftLabel: string;
  startedAt: Date;
  endedAt: Date;
  salesCents: number;
  orders: number;
  tablesServed: number;
  criticalAlerts: number;
  avgTicketCents: number;
  waitersOnShift: string[];
  createdAt: Date;
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
    await db.collection<ManagerPreferencesDoc>(PREFS_COLLECTION).updateOne(
      { tenantSlug: slug, staffId },
      { $set: next },
      { upsert: true },
    );
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
    await db.collection(SESSIONS_COLLECTION).updateOne(
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
          doc.lastSeenAt instanceof Date
            ? doc.lastSeenAt.toISOString()
            : new Date().toISOString(),
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
    const db = this.dbOrThrow();
    await this.ensureShiftIndexes();
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
    const doc: ShiftLogDoc = {
      id: randomUUID(),
      tenantSlug: slug,
      staffId,
      staffName,
      shiftLabel: 'Turno atual',
      startedAt,
      endedAt: now,
      salesCents,
      orders,
      tablesServed: Number(tables ?? 0),
      criticalAlerts,
      avgTicketCents: orders > 0 ? Math.round(salesCents / orders) : 0,
      waitersOnShift,
      createdAt: now,
    };
    await db.collection<ShiftLogDoc>(SHIFT_LOGS_COLLECTION).insertOne(doc);
    return this.mapShiftLog(doc);
  }

  async listShiftLogs(
    slug: string,
    filters: { date?: string; staff?: string; shift?: string },
  ) {
    const db = this.dbOrThrow();
    await this.ensureShiftIndexes();
    const query: Record<string, unknown> = { tenantSlug: slug };
    if (filters.staff) {
      query.staffName = { $regex: filters.staff, $options: 'i' };
    }
    if (filters.shift) {
      query.shiftLabel = { $regex: filters.shift, $options: 'i' };
    }
    if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
      const start = new Date(`${filters.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      query.endedAt = { $gte: start, $lt: end };
    }
    const docs = await db
      .collection<ShiftLogDoc>(SHIFT_LOGS_COLLECTION)
      .find(query)
      .sort({ endedAt: -1 })
      .limit(80)
      .toArray();
    return { shifts: docs.map((doc) => this.mapShiftLog(doc)) };
  }

  private mapShiftLog(doc: ShiftLogDoc) {
    return {
      id: doc.id,
      staffId: doc.staffId,
      staffName: doc.staffName,
      shiftLabel: doc.shiftLabel,
      startedAt: doc.startedAt.toISOString(),
      endedAt: doc.endedAt.toISOString(),
      salesCents: doc.salesCents,
      orders: doc.orders,
      tablesServed: doc.tablesServed,
      criticalAlerts: doc.criticalAlerts,
      avgTicketCents: doc.avgTicketCents,
      waitersOnShift: doc.waitersOnShift,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private async ensurePreferenceIndexes() {
    const db = this.dbOrThrow();
    await db
      .collection<ManagerPreferencesDoc>(PREFS_COLLECTION)
      .createIndex({ tenantSlug: 1, staffId: 1 }, { unique: true });
  }

  private async ensureShiftIndexes() {
    const db = this.dbOrThrow();
    await db
      .collection<ShiftLogDoc>(SHIFT_LOGS_COLLECTION)
      .createIndex({ tenantSlug: 1, endedAt: -1 });
    await db.collection<ShiftLogDoc>(SHIFT_LOGS_COLLECTION).createIndex({
      tenantSlug: 1,
      staffName: 1,
      shiftLabel: 1,
    });
  }

  private async ensureSessionIndexes() {
    const db = this.dbOrThrow();
    await db
      .collection(SESSIONS_COLLECTION)
      .createIndex({ staffId: 1, sessionId: 1 }, { unique: true });
  }
}
