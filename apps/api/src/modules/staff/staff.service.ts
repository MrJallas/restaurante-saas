import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { RedisService } from '../../infra/redis/redis.service';

// Round 18 (Onda 1 wiring): inclui host/bartender/cashier — canvas
// StaffForm permite todos os 6 roles. host ja existia em registros
// seedados mas o VALID_ROLES legacy bloqueava update/create.
const VALID_ROLES = ['waiter', 'cook', 'manager', 'host', 'bartender', 'cashier'];
const VALID_SHIFTS = ['Manhã', 'Tarde', 'Noite'];

// Limite de tentativas falhas em verifyPin antes de bloquear o
// staff_id por LOCKOUT_SECONDS. Sem isso o PIN de 4 digitos
// (10^4 combinacoes) era brute-forcavel em segundos. P1 do bug-hunt.
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60; // 5 minutos

function hashPin(pin: string): string {
  // SHA-256 sem salt e fraco contra rainbow tables, mas migrar pra
  // bcrypt requer rehash de PINs existentes. Foi spawnado em task
  // separada — aqui mantemos SHA-256 + throttling agressivo no
  // verifyPin como mitigacao imediata.
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

@Injectable()
export class StaffService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  async list(role?: string, activeOnly = false) {
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (role) {
      where.push(`role = $${idx++}`);
      params.push(role);
    }
    if (activeOnly) {
      where.push('is_active = true');
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.tenantConn.query(
      `SELECT id, name, role, is_active, cpf, phone, email, default_shift,
              created_at, updated_at
         FROM staff ${whereClause} ORDER BY name ASC`,
      params,
    );
  }

  /**
   * P1 #16 — `/staff/my-tables`. Returns the active tables the waiter
   * sees on their home screen (the FE reads `ActiveTableSummary[]`).
   *
   * Background: the previous route returned 500 because it didn't exist
   * — Nest fell through to the `:id` handler, hit `getById('my-tables')`
   * and threw on the UUID validator. This service method backs a real
   * controller route now.
   *
   * Until per-waiter zone assignments land, every staff caller sees all
   * currently active tables in the tenant. The filter is enforced by
   * the route guard (StaffOrSession), not by this query.
   */
  /**
   * Round 9 (B-NEW-44): aceita `callerSessionId` opcional. Quando
   * presente (path session do StaffOrSessionGuard), filtra rows por
   * `ts.id = callerSessionId` — customer só vê a própria mesa, não
   * todas as mesas ativas + tickets + flags VIP do tenant. Path staff
   * passa `null` e mantém comportamento legacy (waiter precisa do
   * mapa todo).
   */
  async listActiveTables(callerSessionId?: string | null): Promise<unknown[]> {
    const sessionFilter = callerSessionId
      ? `AND ts.id = $1`
      : '';
    const params = callerSessionId ? [callerSessionId] : [];
    return this.tenantConn.query(
      `
      SELECT
        ts.id                                         AS id,
        t.label                                       AS label,
        t.code                                        AS table_code,
        COALESCE(participant_count.cnt, 0)::int       AS party_size,
        t.capacity                                    AS capacity,
        CASE
          WHEN open_orders.cnt > 0 THEN 'em-andamento'
          WHEN ready_orders.cnt   > 0 THEN 'aguardando-prato'
          WHEN ts.created_at > now() - interval '5 min' THEN 'novo'
          ELSE 'em-andamento'
        END                                           AS status,
        COALESCE(orders_total.total_cents, 0)::int    AS ticket_total_cents,
        EXTRACT(EPOCH FROM (now() - ts.created_at))::int / 60 AS opened_min,
        last_event.last_event                         AS last_event,
        ('vip' = ANY(COALESCE(ts.flags, '{}'::text[])))  AS is_vip
      FROM table_sessions ts
      JOIN tables t ON t.id = ts.table_id
      LEFT JOIN (
        SELECT table_session_id, COUNT(*)::int AS cnt
        FROM session_participants
        WHERE left_at IS NULL
        GROUP BY table_session_id
      ) participant_count ON participant_count.table_session_id = ts.id
      LEFT JOIN (
        SELECT table_session_id, COUNT(*)::int AS cnt
        FROM orders
        WHERE status IN ('open', 'preparing')
        GROUP BY table_session_id
      ) open_orders ON open_orders.table_session_id = ts.id
      LEFT JOIN (
        SELECT table_session_id, COUNT(*)::int AS cnt
        FROM orders
        WHERE status = 'ready'
        GROUP BY table_session_id
      ) ready_orders ON ready_orders.table_session_id = ts.id
      LEFT JOIN (
        SELECT table_session_id, SUM(total_cents)::int AS total_cents
        FROM orders
        WHERE status NOT IN ('canceled', 'cancelled')
        GROUP BY table_session_id
      ) orders_total ON orders_total.table_session_id = ts.id
      LEFT JOIN (
        SELECT DISTINCT ON (table_session_id) table_session_id,
               to_status AS last_event
        FROM order_status_history osh
        JOIN orders o ON o.id = osh.order_id
        ORDER BY table_session_id, osh.created_at DESC
      ) last_event ON last_event.table_session_id = ts.id
      WHERE ts.status = 'active'
        AND ts.closed_at IS NULL
        ${sessionFilter}
      ORDER BY ts.created_at DESC
      LIMIT 50
      `,
      params,
    );
  }

  async getTableDetail(tableRef: string) {
    const ref = tableRef.trim();
    if (!ref) {
      throw new BadRequestException('Mesa obrigatoria.');
    }
    const isUuid = /^[0-9a-f-]{36}$/i.test(ref);
    const numeric = /^\d+$/.test(ref) ? Number(ref) : null;

    const params: unknown[] = [ref];
    let where = `ts.id::text = $1 OR t.code = $1 OR t.label = $1`;
    if (isUuid) {
      where = `ts.id = $1::uuid OR t.id = $1::uuid OR t.code = $1::text OR t.label = $1::text`;
    }
    if (numeric !== null) {
      params.push(numeric);
      where += ` OR CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) = $2
                 OR CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT) = $2`;
    }

    const sessions = (await this.tenantConn.query(
      `
      SELECT ts.id, ts.status, ts.created_at, ts.closed_at,
             t.id AS table_id, t.code AS table_code, t.label AS table_label,
             t.capacity,
             COALESCE(participants.cnt, 0)::int AS party_size,
             COALESCE(orders_total.total_cents, 0)::int AS total_cents,
             COALESCE(payments_total.paid_cents, 0)::int AS paid_cents,
             COALESCE(payments_total.processing_cents, 0)::int AS processing_cents,
             COALESCE(payments_total.paid_count, 0)::int AS paid_count,
             COALESCE(payments_total.processing_count, 0)::int AS processing_count
        FROM table_sessions ts
        JOIN tables t ON t.id = ts.table_id
        LEFT JOIN (
          SELECT table_session_id, COUNT(*) AS cnt
            FROM session_participants
           WHERE left_at IS NULL AND status = 'approved'
           GROUP BY table_session_id
        ) participants ON participants.table_session_id = ts.id
        LEFT JOIN (
          SELECT table_session_id, SUM(total_cents)::int AS total_cents
            FROM orders
           WHERE status NOT IN ('cancelled', 'pending_confirmation')
           GROUP BY table_session_id
        ) orders_total ON orders_total.table_session_id = ts.id
        LEFT JOIN (
          SELECT table_session_id,
                 SUM(CASE WHEN status IN ('confirmed', 'paid') THEN amount_cents ELSE 0 END)::int AS paid_cents,
                 SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END)::int AS processing_cents,
                 COUNT(*) FILTER (WHERE status IN ('confirmed', 'paid'))::int AS paid_count,
                 COUNT(*) FILTER (WHERE status = 'pending')::int AS processing_count
            FROM payments
           GROUP BY table_session_id
        ) payments_total ON payments_total.table_session_id = ts.id
       WHERE (${where})
         AND ts.status = 'active'
         AND ts.closed_at IS NULL
       ORDER BY ts.created_at DESC
       LIMIT 1
      `,
      params,
    )) as Array<{
      id: string;
      status: string;
      created_at: string;
      closed_at: string | null;
      table_id: string;
      table_code: string;
      table_label: string;
      capacity: number;
      party_size: number;
      total_cents: number;
      paid_cents: number;
      processing_cents: number;
      paid_count: number;
      processing_count: number;
    }>;

    if (!sessions.length) {
      throw new NotFoundException('Mesa ativa nao encontrada.');
    }
    const session = sessions[0];

    const orders = (await this.tenantConn.query(
      `
      SELECT o.id, o.status, o.billing_mode, o.total_cents, o.notes,
             o.created_at, o.updated_at,
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'name', mi.name,
                 'quantity', oi.quantity,
                 'notes', oi.notes,
                 'subtotalCents', oi.subtotal_cents,
                 'createdAt', oi.created_at
               )
               ORDER BY oi.created_at ASC
             ) AS items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.table_session_id = $1
         AND o.status NOT IN ('cancelled', 'pending_confirmation')
       GROUP BY o.id
       ORDER BY o.created_at DESC
      `,
      [session.id],
    )) as unknown[];

    return {
      session,
      orders,
    };
  }

  async getById(id: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, name, role, is_active, cpf, phone, email, default_shift,
              created_at, updated_at
         FROM staff WHERE id = $1`,
      [id],
    )) as unknown[];
    if (!rows.length) throw new NotFoundException('Funcionario nao encontrado.');
    return rows[0];
  }

  /**
   * Round 18 (Onda 4 batch 2): KPIs agregados pra
   * `ScreenManagerStaffDetail` (canvas /manager/equipe/[id]).
   *
   * Sources:
   *  • ordersServed → orders cujos rows em `order_status_history` tem
   *    `to_status='delivered'` e `changed_by = staff_id`. Distinct
   *    order_id pra contar pedidos servidos (não eventos).
   *  • totalRevenue → SUM(orders.total_cents) dos mesmos ordersServed.
   *  • avgResponseSec → AVG(EXTRACT(EPOCH FROM acknowledged_at - created_at))
   *    em waiter_calls.acknowledged_by = $1.
   *  • sessionsHandled → table_sessions onde `closed_by = staff_id::text`
   *    (closed_by é VARCHAR(50) legacy; alguns paths stampam o UUID).
   *  • callsAnswered → COUNT(*) em waiter_calls.acknowledged_by = $1.
   *
   * Period: today (since 00:00) | 7d (since now-7d) | 30d (since now-30d).
   * Window aplicado a `created_at` da tabela source pra que "served" use
   * a transition timestamp, "session" use o closed_at, etc.
   */
  async getPerformance(
    staffId: string,
    period: 'today' | '7d' | '30d',
  ): Promise<{
    staffId: string;
    period: string;
    kpis: {
      ordersServed: number;
      totalRevenue: number;
      avgResponseSec: number;
      sessionsHandled: number;
      callsAnswered: number;
    };
    salesByDay: Array<{
      date: string;
      ordersServed: number;
      totalRevenue: number;
    }>;
    teamComparison: Array<{
      metric: 'avgResponseSec' | 'avgTicketCents' | 'callsAnswered' | 'sessionsHandled';
      mine: number;
      team: number;
      lowerIsBetter?: boolean;
    }>;
  }> {
    // Confirma staff existe (404 limpo).
    const sRows = (await this.tenantConn.query(
      `SELECT id, role FROM staff WHERE id = $1`,
      [staffId],
    )) as Array<{ id: string; role: string }>;
    if (!sRows.length) {
      throw new NotFoundException('Funcionario nao encontrado.');
    }
    const staffRole = sRows[0].role;

    // SQL `since` expression. `date_trunc('day', now())` = 00:00 today.
    const sinceExpr =
      period === 'today'
        ? `date_trunc('day', now())`
        : period === '7d'
          ? `now() - interval '7 days'`
          : `now() - interval '30 days'`;

    // 1. ordersServed + totalRevenue (DISTINCT order_id pra não
    // duplicar quando ha multiplas transitions). Junta orders pra
    // somar total_cents.
    const ordersAggRows = (await this.tenantConn.query(
      `
      WITH served AS (
        SELECT DISTINCT osh.order_id
          FROM order_status_history osh
          WHERE osh.to_status = 'delivered'
            AND osh.changed_by = $1
            AND osh.created_at >= ${sinceExpr}
      )
      SELECT
        COUNT(s.order_id)::int AS orders_served,
        COALESCE(SUM(o.total_cents), 0)::int AS total_revenue
      FROM served s
      JOIN orders o ON o.id = s.order_id
      `,
      [staffId],
    )) as Array<{ orders_served: number; total_revenue: number }>;
    const ordersAgg = ordersAggRows[0] ?? { orders_served: 0, total_revenue: 0 };

    // 2. callsAnswered + avgResponseSec.
    const callsAggRows = (await this.tenantConn.query(
      `
      SELECT
        COUNT(*)::int AS calls_answered,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))),
          0
        )::int AS avg_response_sec
      FROM waiter_calls
      WHERE acknowledged_by = $1
        AND acknowledged_at IS NOT NULL
        AND created_at >= ${sinceExpr}
      `,
      [staffId],
    )) as Array<{ calls_answered: number; avg_response_sec: number }>;
    const callsAgg = callsAggRows[0] ?? { calls_answered: 0, avg_response_sec: 0 };

    // 3. sessionsHandled — closed_by é VARCHAR(50), comparacao textual.
    const sessionsRows = (await this.tenantConn.query(
      `
      SELECT COUNT(*)::int AS sessions_handled
      FROM table_sessions
      WHERE closed_by = $1::text
        AND closed_at IS NOT NULL
        AND closed_at >= ${sinceExpr}
      `,
      [staffId],
    )) as Array<{ sessions_handled: number }>;
    const sessionsHandled = sessionsRows[0]?.sessions_handled ?? 0;

    const salesByDay = (await this.tenantConn.query(
      `
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${sinceExpr}),
          date_trunc('day', now()),
          interval '1 day'
        )::date AS day
      ),
      served AS (
        SELECT DISTINCT osh.order_id, date_trunc('day', osh.created_at)::date AS day
          FROM order_status_history osh
         WHERE osh.to_status = 'delivered'
           AND osh.changed_by = $1
           AND osh.created_at >= ${sinceExpr}
      )
      SELECT
        days.day::text AS date,
        COUNT(served.order_id)::int AS orders_served,
        COALESCE(SUM(o.total_cents), 0)::int AS total_revenue
      FROM days
      LEFT JOIN served ON served.day = days.day
      LEFT JOIN orders o ON o.id = served.order_id
      GROUP BY days.day
      ORDER BY days.day ASC
      `,
      [staffId],
    )) as Array<{ date: string; orders_served: number; total_revenue: number }>;

    const teamRows = (await this.tenantConn.query(
      `
      WITH team AS (
        SELECT id FROM staff WHERE role = $1 AND is_active = true
      ),
      served AS (
        SELECT DISTINCT osh.changed_by AS staff_id, osh.order_id
          FROM order_status_history osh
          JOIN team t ON t.id = osh.changed_by
         WHERE osh.to_status = 'delivered'
           AND osh.created_at >= ${sinceExpr}
      ),
      staff_orders AS (
        SELECT t.id AS staff_id,
               COUNT(served.order_id)::int AS orders_served,
               COALESCE(SUM(o.total_cents), 0)::int AS total_revenue
          FROM team t
          LEFT JOIN served ON served.staff_id = t.id
          LEFT JOIN orders o ON o.id = served.order_id
         GROUP BY t.id
      ),
      staff_calls AS (
        SELECT t.id AS staff_id,
               COUNT(wc.id)::int AS calls_answered,
               COALESCE(
                 AVG(EXTRACT(EPOCH FROM (wc.acknowledged_at - wc.created_at))),
                 0
               )::int AS avg_response_sec
          FROM team t
          LEFT JOIN waiter_calls wc
            ON wc.acknowledged_by = t.id
           AND wc.acknowledged_at IS NOT NULL
           AND wc.created_at >= ${sinceExpr}
         GROUP BY t.id
      ),
      staff_sessions AS (
        SELECT t.id AS staff_id,
               COUNT(ts.id)::int AS sessions_handled
          FROM team t
          LEFT JOIN table_sessions ts
            ON ts.closed_by = t.id::text
           AND ts.closed_at IS NOT NULL
           AND ts.closed_at >= ${sinceExpr}
         GROUP BY t.id
      )
      SELECT
        COALESCE(ROUND(AVG(staff_orders.total_revenue)), 0)::int AS avg_revenue,
        COALESCE(ROUND(AVG(
          CASE WHEN staff_orders.orders_served > 0
            THEN staff_orders.total_revenue::numeric / staff_orders.orders_served
            ELSE 0
          END
        )), 0)::int AS avg_ticket_cents,
        COALESCE(ROUND(AVG(staff_calls.avg_response_sec)), 0)::int AS avg_response_sec,
        COALESCE(ROUND(AVG(staff_calls.calls_answered)), 0)::int AS avg_calls_answered,
        COALESCE(ROUND(AVG(staff_sessions.sessions_handled)), 0)::int AS avg_sessions_handled
      FROM team
      LEFT JOIN staff_orders ON staff_orders.staff_id = team.id
      LEFT JOIN staff_calls ON staff_calls.staff_id = team.id
      LEFT JOIN staff_sessions ON staff_sessions.staff_id = team.id
      `,
      [staffRole],
    )) as Array<{
      avg_revenue: number;
      avg_ticket_cents: number;
      avg_response_sec: number;
      avg_calls_answered: number;
      avg_sessions_handled: number;
    }>;
    const team = teamRows[0] ?? {
      avg_revenue: 0,
      avg_ticket_cents: 0,
      avg_response_sec: 0,
      avg_calls_answered: 0,
      avg_sessions_handled: 0,
    };
    const avgTicketCents =
      ordersAgg.orders_served > 0
        ? Math.round(ordersAgg.total_revenue / ordersAgg.orders_served)
        : 0;

    return {
      staffId,
      period,
      kpis: {
        ordersServed: ordersAgg.orders_served,
        totalRevenue: ordersAgg.total_revenue,
        avgResponseSec: callsAgg.avg_response_sec,
        sessionsHandled,
        callsAnswered: callsAgg.calls_answered,
      },
      salesByDay: salesByDay.map((row) => ({
        date: row.date,
        ordersServed: row.orders_served,
        totalRevenue: row.total_revenue,
      })),
      teamComparison: [
        {
          metric: 'avgResponseSec',
          mine: callsAgg.avg_response_sec,
          team: team.avg_response_sec,
          lowerIsBetter: true,
        },
        {
          metric: 'avgTicketCents',
          mine: avgTicketCents,
          team: team.avg_ticket_cents,
        },
        {
          metric: 'callsAnswered',
          mine: callsAgg.calls_answered,
          team: team.avg_calls_answered,
        },
        {
          metric: 'sessionsHandled',
          mine: sessionsHandled,
          team: team.avg_sessions_handled,
        },
      ],
    };
  }

  async create(data: {
    name: string;
    role: string;
    pin: string;
    cpf?: string;
    phone?: string;
    email?: string;
    default_shift?: string;
  }) {
    if (!VALID_ROLES.includes(data.role)) {
      throw new BadRequestException('Cargo invalido.');
    }
    if (!/^\d{4,6}$/.test(data.pin)) {
      throw new BadRequestException('PIN deve ter 4-6 digitos.');
    }
    if (data.default_shift && !VALID_SHIFTS.includes(data.default_shift)) {
      throw new BadRequestException('Turno padrao invalido.');
    }
    try {
      const rows = (await this.tenantConn.query(
        `INSERT INTO staff (name, role, pin_hash, cpf, phone, email, default_shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, role, is_active, cpf, phone, email, default_shift,
                   created_at, updated_at`,
        [
          data.name,
          data.role,
          hashPin(data.pin),
          data.cpf ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.default_shift ?? null,
        ],
      )) as unknown[];
      return rows[0];
    } catch (e) {
      // Round 18: traduz unique_violation do CPF (idx staff_cpf_unique
      // da migration 041) pra erro amigavel. PG codigo 23505.
      const err = e as { code?: string; constraint?: string };
      if (err.code === '23505' && err.constraint === 'staff_cpf_unique') {
        throw new BadRequestException(
          'Ja existe um funcionario com esse CPF.',
        );
      }
      throw e;
    }
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      role: string;
      pin: string;
      isActive: boolean;
      cpf: string;
      phone: string;
      email: string;
      default_shift: string;
    }>,
  ) {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.role !== undefined) {
      if (!VALID_ROLES.includes(data.role)) {
        throw new BadRequestException('Cargo invalido.');
      }
      setClauses.push(`role = $${idx++}`);
      params.push(data.role);
    }
    if (data.pin !== undefined) {
      if (!/^\d{4,6}$/.test(data.pin)) {
        throw new BadRequestException('PIN deve ter 4-6 digitos.');
      }
      setClauses.push(`pin_hash = $${idx++}`);
      params.push(hashPin(data.pin));
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${idx++}`);
      params.push(data.isActive);
    }
    if (data.cpf !== undefined) {
      setClauses.push(`cpf = $${idx++}`);
      params.push(data.cpf || null);
    }
    if (data.phone !== undefined) {
      setClauses.push(`phone = $${idx++}`);
      params.push(data.phone || null);
    }
    if (data.email !== undefined) {
      setClauses.push(`email = $${idx++}`);
      params.push(data.email || null);
    }
    if (data.default_shift !== undefined) {
      if (data.default_shift && !VALID_SHIFTS.includes(data.default_shift)) {
        throw new BadRequestException('Turno padrao invalido.');
      }
      setClauses.push(`default_shift = $${idx++}`);
      params.push(data.default_shift || null);
    }

    if (!setClauses.length) return this.getById(id);

    setClauses.push(`updated_at = now()`);
    params.push(id);

    const rows = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE staff SET ${setClauses.join(', ')} WHERE id = $${idx}
         RETURNING id, name, role, is_active, cpf, phone, email, default_shift,
                   created_at, updated_at`,
        params,
      ),
    );

    if (!rows.length) throw new NotFoundException('Funcionario nao encontrado.');
    return rows[0];
  }

  async delete(id: string) {
    await this.tenantConn.query(`DELETE FROM staff WHERE id = $1`, [id]);
    return { deleted: true };
  }

  async verifyPin(id: string, pin: string): Promise<boolean> {
    // Throttle: bloqueia por 5min apos 5 tentativas falhas. Conta
    // por staffId — atacante rotativo de IPs ainda enfrenta o
    // mesmo limite. 429 distinto de {valid:false} pra UI mostrar
    // mensagem clara.
    const attemptsKey = `staff:pin_attempts:${id}`;
    const lockKey = `staff:pin_lock:${id}`;

    if (await this.redis.get(lockKey)) {
      throw new HttpException(
        'Muitas tentativas. Tente novamente em alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const rows = (await this.tenantConn.query(
      `SELECT pin_hash FROM staff WHERE id = $1 AND is_active = true`,
      [id],
    )) as { pin_hash: string }[];

    if (!rows.length) return false;

    const ok = timingSafeEqualHex(rows[0].pin_hash, hashPin(pin));

    if (ok) {
      // Sucesso reseta o contador.
      await this.redis.del(attemptsKey);
      return true;
    }

    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      // Primeira falha: TTL inicial pra que tentativas antigas nao
      // contem indefinidamente.
      await this.redis.expire(attemptsKey, LOCKOUT_SECONDS);
    }
    if (attempts >= MAX_PIN_ATTEMPTS) {
      await this.redis.set(lockKey, '1', LOCKOUT_SECONDS);
      await this.redis.del(attemptsKey);
    }
    return false;
  }
}
