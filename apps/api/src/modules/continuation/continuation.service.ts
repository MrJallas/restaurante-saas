import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { aiConfig } from '../../config/ai.config';

/**
 * `kind` derived from DB state for a given table session. Priority order
 * top-to-bottom: first match wins.
 *
 * `viu_cardapio` is fed by customer_events (`menu_viewed`/`item_viewed`).
 * The AI service pool key is `viu_menu`; we forward the alias.
 */
export type ContinuationKind =
  | 'pos_reclamacao'
  | 'pagou'
  | 'abriu_pedido'
  | 'chamou_garcom'
  | 'viu_cardapio'
  | 'voltou_sem_acao'
  | 'first_time';

type ContinuationClientKindHint =
  | 'viu_menu'
  | 'chamou_garcom'
  | 'abriu_pedido'
  | 'pagou'
  | 'voltou_sem_acao';

interface ContinuationSignals {
  clientKindHint?: string | null;
  hasDraftOrder?: boolean;
  isReturning?: boolean;
}

interface DerivedContext {
  kind: ContinuationKind;
  slots: {
    tenant_slug: string;
    table_number: number | string | null;
    customer_name: string | null;
    last_item_seen: string | null;
    last_order_summary: string | null;
    last_order_id: string | null;
    wait_minutes: number | null;
    // Round 19 (C2 fix): rich slots pra pos_reclamacao (canvas V20)
    manager_name: string | null;
    avg_response_min: number | null;
  };
}

export interface ContinuationResponse {
  kind: ContinuationKind | string;
  text: string;
  chips: unknown[];
  meta: Record<string, unknown>;
}

const FALLBACK_RESPONSE: ContinuationResponse = {
  kind: 'first_time',
  text: 'Bem-vindo. Em que posso ajudar?',
  chips: [],
  meta: {},
};

// Round 4 (C-NEW-4) fallback policy — call site bails to this whenever
// the AI service times out or 5xxs, so the customer-facing assistente
// landing never breaks the page just because the Python service hiccups.
const AI_TIMEOUT_MS = 1500;

@Injectable()
export class ContinuationService {
  private readonly logger = new Logger(ContinuationService.name);

  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  /**
   * Inspect DB state for `tableSessionId`, derive the most-relevant
   * `kind` (highest priority signal in the last 30 min) and fetch the
   * matching template from the AI service. Any failure short-circuits to
   * `FALLBACK_RESPONSE` so the customer landing always renders.
   */
  async getContinuation(
    tableSessionId: string,
    customerId: string | null,
    tenantSlug: string,
    signals: ContinuationSignals = {},
  ): Promise<ContinuationResponse> {
    let derived: DerivedContext;
    try {
      derived = await this.deriveKindAndSlots(
        tableSessionId,
        customerId,
        tenantSlug,
        signals,
      );
    } catch (err) {
      this.logger.error(
        `Failed to derive continuation context for ${tableSessionId}: ${
          (err as Error).message
        }`,
      );
      return FALLBACK_RESPONSE;
    }

    return this.forwardToAi(derived);
  }

  /**
   * Heuristic priority chain:
   *   1. complaint < 10 min  → pos_reclamacao
   *   2. payment paid_at < 10 min → pagou
   *   3. active order < 30 min → abriu_pedido
   *   4. explicit/recent menu event < 10 min → viu_cardapio
   *   5. waiter_call < 5 min → chamou_garcom
   *   6. any prior event for this session → voltou_sem_acao
   *   7. nothing → first_time
   *
   * Slot population is opportunistic; missing slots are passed
   * as null and the AI service renders a sensible fallback (C-NEW-4).
   */
  private async deriveKindAndSlots(
    tableSessionId: string,
    customerId: string | null,
    tenantSlug: string,
    signals: ContinuationSignals,
  ): Promise<DerivedContext> {
    // Resolve table label first — useful for greeting copy regardless of
    // which kind wins. tables.label is the canonical column (the spec
    // referenced tables.number which doesn't exist; we coerce numeric
    // labels into ints when possible, otherwise pass the raw string).
    const sessionRows = (await this.tenantConn.query(
      `SELECT t.label AS table_label
         FROM table_sessions ts
         JOIN tables t ON t.id = ts.table_id
        WHERE ts.id = $1
        LIMIT 1`,
      [tableSessionId],
    )) as { table_label: string | null }[];
    const tableLabel = sessionRows[0]?.table_label ?? null;
    const tableNumber = this.coerceTableNumber(tableLabel);

    // Customer name — explicit customerId wins, falls back to the most
    // recent active session_participants row.
    let customerName: string | null = null;
    let resolvedCustomerId: string | null = customerId;
    if (!resolvedCustomerId) {
      const lastParticipant = (await this.tenantConn.query(
        `SELECT sp.customer_id
           FROM session_participants sp
          WHERE sp.table_session_id = $1
            AND sp.left_at IS NULL
          ORDER BY sp.joined_at DESC
          LIMIT 1`,
        [tableSessionId],
      )) as { customer_id: string }[];
      if (lastParticipant.length > 0) {
        resolvedCustomerId = lastParticipant[0].customer_id;
      }
    }
    if (resolvedCustomerId) {
      const rows = (await this.tenantConn.query(
        `SELECT name FROM customers WHERE id = $1 LIMIT 1`,
        [resolvedCustomerId],
      )) as { name: string }[];
      customerName = rows[0]?.name ?? null;
    }

    const baseSlots = {
      tenant_slug: tenantSlug,
      table_number: tableNumber,
      customer_name: customerName,
      last_item_seen: null as string | null,
      last_order_summary: null as string | null,
      last_order_id: null as string | null,
      wait_minutes: null as number | null,
      manager_name: null as string | null,
      avg_response_min: null as number | null,
    };
    const clientHint = this.normalizeClientKindHint(signals.clientKindHint);

    // ── Priority 1: complaint within 10 min ──────────────────────────
    // Round 19 (C2 fix): also fetch manager name + avg response time pra
    // popular slots managerName + avgResponseMin nos templates pos_reclamacao
    // ricos (canvas V20 §F5). Fallback no manager: pc_fallback template kicks in.
    const complaintEnriched = (await this.tenantConn.query(
      `SELECT s.name AS manager_name
         FROM complaints c
    LEFT JOIN orders o ON o.id = c.order_id
    LEFT JOIN staff s ON s.id = c.assigned_manager_id
        WHERE (o.table_session_id = $1 OR c.customer_id = $2)
          AND c.created_at >= now() - INTERVAL '10 minutes'
        ORDER BY c.created_at DESC
        LIMIT 1`,
      [tableSessionId, resolvedCustomerId],
    )) as { manager_name: string | null }[];
    if (complaintEnriched.length > 0) {
      const managerName = complaintEnriched[0].manager_name;
      // Avg response time across all closed complaints for this manager.
      // Round to nearest minute; fallback to 2 if no historical data.
      let avgResponseMin: number | null = null;
      if (managerName) {
        const avgRows = (await this.tenantConn.query(
          `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (response_at - submitted_at)) / 60.0))::int AS avg_min
             FROM complaints c
        LEFT JOIN staff s ON s.id = c.assigned_manager_id
            WHERE s.name = $1
              AND response_at IS NOT NULL
              AND submitted_at IS NOT NULL`,
          [managerName],
        )) as { avg_min: number | null }[];
        avgResponseMin = avgRows[0]?.avg_min ?? 2;
      }
      return {
        kind: 'pos_reclamacao',
        slots: {
          ...baseSlots,
          manager_name: managerName,
          avg_response_min: avgResponseMin,
        },
      };
    }

    // ── Priority 2: payment.paid_at within 10 min ────────────────────
    const payRows = (await this.tenantConn.query(
      `SELECT latest_order.id AS order_id
         FROM payments p
    LEFT JOIN LATERAL (
          SELECT o.id
            FROM orders o
           WHERE o.table_session_id = p.table_session_id
             AND (p.visit_id IS NULL OR o.visit_id = p.visit_id)
             AND o.status NOT IN ('cancelled', 'canceled')
           ORDER BY o.created_at DESC
           LIMIT 1
        ) latest_order ON true
        WHERE p.table_session_id = $1
          AND p.paid_at IS NOT NULL
          AND p.paid_at >= now() - INTERVAL '10 minutes'
        ORDER BY p.paid_at DESC
        LIMIT 1`,
      [tableSessionId],
    )) as { order_id: string | null }[];
    if (payRows.length > 0) {
      return {
        kind: 'pagou',
        slots: { ...baseSlots, last_order_id: payRows[0].order_id },
      };
    }
    if (clientHint === 'pagou') {
      return {
        kind: 'pagou',
        slots: {
          ...baseSlots,
          last_order_id: await this.latestOrderIdForSession(tableSessionId),
        },
      };
    }

    if (signals.hasDraftOrder || clientHint === 'abriu_pedido') {
      return {
        kind: 'abriu_pedido',
        slots: {
          ...baseSlots,
          last_order_id: await this.latestOrderIdForSession(tableSessionId),
        },
      };
    }

    // ── Priority 3: active order within 30 min ───────────────────────
    const orderRows = (await this.tenantConn.query(
      `SELECT o.id, o.created_at
         FROM orders o
        WHERE o.table_session_id = $1
          AND o.status NOT IN ('cancelled', 'canceled', 'delivered')
          AND o.created_at >= now() - INTERVAL '30 minutes'
        ORDER BY o.created_at DESC
        LIMIT 1`,
      [tableSessionId],
    )) as { id: string }[];
    if (orderRows.length > 0) {
      const summary = await this.summariseOrder(orderRows[0].id);
      return {
        kind: 'abriu_pedido',
        slots: {
          ...baseSlots,
          last_order_summary: summary,
          last_order_id: orderRows[0].id,
        },
      };
    }

    if (clientHint === 'viu_menu') {
      return { kind: 'viu_cardapio', slots: baseSlots };
    }

    const menuEventRows = (await this.tenantConn.query(
      `SELECT event_type,
              COALESCE(
                metadata->>'itemName',
                metadata->>'item_name',
                metadata->>'name'
              ) AS item_name
         FROM customer_events
        WHERE table_session_id = $1
          AND event_type IN ('menu_viewed', 'item_viewed')
          AND created_at >= now() - INTERVAL '10 minutes'
        ORDER BY created_at DESC
        LIMIT 1`,
      [tableSessionId],
    )) as { event_type: string; item_name: string | null }[];
    if (menuEventRows.length > 0) {
      return {
        kind: 'viu_cardapio',
        slots: {
          ...baseSlots,
          last_item_seen: menuEventRows[0].item_name,
        },
      };
    }

    // ── Priority 4: waiter call within 5 min ─────────────────────────
    const waiterRows = (await this.tenantConn.query(
      `SELECT EXTRACT(EPOCH FROM (now() - created_at))::int AS age_sec
         FROM waiter_calls
        WHERE table_session_id = $1
          AND created_at >= now() - INTERVAL '5 minutes'
        ORDER BY created_at DESC
        LIMIT 1`,
      [tableSessionId],
    )) as { age_sec: number }[];
    if (waiterRows.length > 0) {
      const waitMinutes = Math.max(
        0,
        Math.floor((waiterRows[0].age_sec ?? 0) / 60),
      );
      return {
        kind: 'chamou_garcom',
        slots: { ...baseSlots, wait_minutes: waitMinutes },
      };
    }
    if (clientHint === 'chamou_garcom') {
      return { kind: 'chamou_garcom', slots: baseSlots };
    }

    // ── Priority 5 vs 6: any prior event → voltou_sem_acao, else first_time
    // "Prior event" = at least one order/payment/waiter_call/complaint
    // for this session, regardless of age (the recent ones above already
    // returned; we land here only when nothing is recent).
    const priorRows = (await this.tenantConn.query(
      `SELECT 1
         FROM (
           SELECT id FROM orders WHERE table_session_id = $1
           UNION ALL
           SELECT id FROM payments WHERE table_session_id = $1
           UNION ALL
           SELECT id FROM waiter_calls WHERE table_session_id = $1
           UNION ALL
           SELECT id FROM customer_events WHERE table_session_id = $1
         ) ev
        LIMIT 1`,
      [tableSessionId],
    )) as unknown[];
    if (priorRows.length > 0) {
      // last_order_summary helps the `voltou_sem_acao` template render a
      // contextual welcome-back line ("Da última vez foi <X>") instead of
      // the generic copy. Best-effort — null is fine, AI side has fallback.
      const lastOrderRows = (await this.tenantConn.query(
        `SELECT id
           FROM orders
          WHERE table_session_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [tableSessionId],
      )) as { id: string }[];
      const summary =
        lastOrderRows.length > 0
          ? await this.summariseOrder(lastOrderRows[0].id)
          : null;
      return {
        kind: 'voltou_sem_acao',
        slots: {
          ...baseSlots,
          last_order_summary: summary,
          last_order_id: lastOrderRows[0]?.id ?? null,
        },
      };
    }

    if (signals.isReturning || clientHint === 'voltou_sem_acao') {
      return { kind: 'voltou_sem_acao', slots: baseSlots };
    }

    return { kind: 'first_time', slots: baseSlots };
  }

  private normalizeClientKindHint(
    value?: string | null,
  ): ContinuationClientKindHint | null {
    if (!value) return null;
    const kind = value.trim();
    if (
      kind === 'viu_menu' ||
      kind === 'chamou_garcom' ||
      kind === 'abriu_pedido' ||
      kind === 'pagou' ||
      kind === 'voltou_sem_acao'
    ) {
      return kind;
    }
    return null;
  }

  private async latestOrderIdForSession(tableSessionId: string): Promise<string | null> {
    const rows = (await this.tenantConn.query(
      `SELECT id
         FROM orders
        WHERE table_session_id = $1
          AND status NOT IN ('cancelled', 'canceled')
        ORDER BY created_at DESC
        LIMIT 1`,
      [tableSessionId],
    )) as { id: string }[];
    return rows[0]?.id ?? null;
  }

  /** "2x Pizza Margherita, 1x Coca" — truncated to 80 chars. */
  private async summariseOrder(orderId: string): Promise<string | null> {
    const rows = (await this.tenantConn.query(
      `SELECT oi.quantity, mi.name
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC`,
      [orderId],
    )) as { quantity: number; name: string }[];
    if (rows.length === 0) return null;
    const summary = rows
      .map((r) => `${r.quantity}x ${r.name}`)
      .join(', ')
      .slice(0, 80);
    return summary || null;
  }

  private coerceTableNumber(
    label: string | null,
  ): number | string | null {
    if (!label) return null;
    const m = label.match(/\d+/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (Number.isFinite(n)) return n;
    }
    return label;
  }

  /**
   * Forward the derived (kind, slots) tuple to the AI service. On any
   * non-2xx, abort, or timeout we return the round-4 fallback greeting
   * so the customer landing keeps rendering. `kind: 'first_time'` maps
   * to the AI service's `new:regular` pool via `_segment_for_kind`.
   *
   * Note: the AI service exposes both POST and GET. We POST because the
   * future shape may need to carry richer slots (image refs, big strings)
   * that don't fit cleanly in a query string.
   */
  private async forwardToAi(
    derived: DerivedContext,
  ): Promise<ContinuationResponse> {
    const { kind, slots } = derived;
    // `first_time` doesn't have a dedicated pool — the AI service falls
    // back to `new:regular` segment when `kind` is unrecognised.
    const aiKind = kind === 'viu_cardapio' ? 'viu_menu' : kind;

    const body = {
      tenantId: slots.tenant_slug,
      isReturning: kind !== 'first_time',
      isVip: false,
      customerName: slots.customer_name ?? null,
      kind: kind === 'first_time' ? null : aiKind,
      favoriteItem: slots.last_order_summary ?? slots.last_item_seen ?? null,
      // Round 19 (C2 fix): rich slots forwarded pra eligible_pool selection
      // no AI service · permite templates contextuais ricos (pos_reclamacao
      // canvas V20, chamou_garcom com wait time, etc).
      managerName: slots.manager_name ?? null,
      avgResponseMin: slots.avg_response_min ?? null,
      waitMinutes: slots.wait_minutes ?? null,
      tableLabel:
        typeof slots.table_number === 'number'
          ? `Mesa ${slots.table_number}`
          : slots.table_number ?? null,
      lastItem: slots.last_item_seen ?? null,
      lastOrderSummary: slots.last_order_summary ?? null,
      lastOrderId: slots.last_order_id ?? null,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.AI_SERVICE_API_KEY) {
      headers['x-ai-service-key'] = process.env.AI_SERVICE_API_KEY;
    }

    try {
      const res = await fetch(`${aiConfig.serviceUrl}/continuation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(
          `AI service /continuation returned ${res.status} for kind=${kind}`,
        );
        return FALLBACK_RESPONSE;
      }
      const payload = (await res.json()) as {
        message?: { kind?: string } | null;
        rendered?: string | null;
        chips?: unknown[];
        subtitle?: string | null;
        primary_cta?: Record<string, unknown> | null;
      };
      const renderedKind = (payload.message?.kind as ContinuationKind) ?? kind;
      const text =
        typeof payload.rendered === 'string' && payload.rendered.length > 0
          ? payload.rendered
          : FALLBACK_RESPONSE.text;
      return {
        kind: renderedKind,
        text,
        chips: Array.isArray(payload.chips) ? payload.chips : [],
        meta: {
          subtitle: payload.subtitle ?? null,
          primary_cta: payload.primary_cta ?? null,
          slots,
        },
      };
    } catch (err) {
      this.logger.warn(
        `AI service /continuation failed (${(err as Error).name}): ${
          (err as Error).message
        }`,
      );
      return FALLBACK_RESPONSE;
    }
  }
}
