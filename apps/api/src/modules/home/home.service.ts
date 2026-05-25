import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';
import { renderTemplate, TOTAL_TEMPLATES } from './welcome-messages';
import type { ContinuationMessage } from '@restaurant/shared-types';

export interface HomeData {
  heroMessage: string;
  restaurantName: string;
  tableLabel: string;
  highlights: HighlightItem[];
  quickActions: QuickAction[];
  isReturning: boolean;
  lastVisitSummary: Record<string, unknown> | null;
  /**
   * Optional continuation message rendered by the AI service.
   * Shape mirrors `packages/shared-types/src/ai.ts::ContinuationMessage`.
   * Populated via `GET <AI_SERVICE_URL>/continuation` when available.
   */
  continuationMessage?: ContinuationMessage & { rendered?: string };
}

export interface HighlightItem {
  id: string;
  name: string;
  shortDescription: string | null;
  priceCents: number;
  imageUrl: string | null;
  badge: string | null;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  href: string;
}

type ContinuationKind =
  | 'viu_menu'
  | 'chamou_garcom'
  | 'abriu_pedido'
  | 'pagou'
  | 'voltou_sem_acao';

interface HomeContinuationSignals {
  tenantId?: string;
  kindHint?: string | string[];
  hasDraftOrder?: boolean;
}

interface HomeStaticData {
  restaurantName: string;
  highlights: HighlightItem[];
}

interface HomeCustomerContext {
  nome: string;
  isReturning: boolean;
  lastVisitSummary: Record<string, unknown> | null;
  ultimoPrato?: string;
  ultimaBebida?: string;
  ultimaSobremesa?: string;
}

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);
  private static readonly staticDataCache = new Map<
    string,
    { expiresAt: number; value: HomeStaticData }
  >();
  private static readonly continuationCache = new Map<
    string,
    { expiresAt: number; value: HomeData['continuationMessage'] }
  >();
  private readonly staticDataCacheTtlMs = Number(
    process.env.HOME_STATIC_CACHE_TTL_MS ?? 5_000,
  );
  private readonly continuationCacheTtlMs = Number(
    process.env.HOME_CONTINUATION_CACHE_TTL_MS ?? 1_000,
  );

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  async getHome(
    sessionId: string,
    customerId?: string,
    tableLabel?: string,
    continuationSignals: HomeContinuationSignals = {},
  ): Promise<HomeData> {
    const [staticData, templateIndex, customerContext] = await Promise.all([
      this.getStaticHomeData(),
      this.nextWelcomeTemplateIndex(sessionId),
      this.getCustomerContext(customerId),
    ]);
    const { restaurantName, highlights } = staticData;
    const {
      nome,
      isReturning,
      lastVisitSummary,
      ultimoPrato,
      ultimaBebida,
      ultimaSobremesa,
    } = customerContext;

    const heroMessage = renderTemplate(templateIndex, {
      nome,
      restaurante: restaurantName,
      ultimo_prato: ultimoPrato,
      ultima_bebida: ultimaBebida,
      ultima_sobremesa: ultimaSobremesa,
    });

    const quickActions: QuickAction[] = [
      { id: 'menu', label: 'Ver cardápio', icon: 'book-open', href: '/cardapio' },
      { id: 'suggest', label: 'Sugestão da IA', icon: 'sparkles', href: '/assistente' },
      { id: 'waiter', label: 'Chamar garçom', icon: 'bell', href: '#chamar-garcom' },
      { id: 'order', label: 'Ver meu pedido', icon: 'clipboard-list', href: '/pedido' },
      { id: 'pay', label: 'Pagar conta', icon: 'credit-card', href: '/pagamento' },
    ];

    // 7. Continuation message (best-effort) — fetched from the AI service.
    // Failure is silent: we'd rather render the home without the bubble than
    // fail the whole request when the Python service is down.
    let continuationMessage: HomeData['continuationMessage'];
    try {
      const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
      const inferred = await this.inferContinuationKind({
        sessionId,
        customerId,
        isReturning,
        kindHint: continuationSignals.kindHint,
        hasDraftOrder: continuationSignals.hasDraftOrder === true,
      });
      const params = new URLSearchParams({
        tenantId: continuationSignals.tenantId || process.env.TENANT_ID || 'restaurant_dev',
        isReturning: String(isReturning),
        isVip: 'false',
        customerName: nome,
      });
      if (inferred.kind) params.set('kind', inferred.kind);
      if (inferred.favoriteItem) params.set('favoriteItem', inferred.favoriteItem);
      if (inferred.lastOrderId) params.set('lastOrderId', inferred.lastOrderId);
      if (inferred.kind) {
        this.logger.debug(`continuation kind=${inferred.kind} session=${sessionId}`);
      }
      // Round 7 (B-NEW-25): X-AI-Service-Key header obrigatório.
      const aiHeaders: Record<string, string> = {};
      if (process.env.AI_SERVICE_API_KEY) {
        aiHeaders['x-ai-service-key'] = process.env.AI_SERVICE_API_KEY;
      }
      continuationMessage = await this.getCachedContinuationMessage(
        aiUrl,
        params,
        aiHeaders,
      );
    } catch (err) {
      this.logger.debug(`continuation fetch skipped: ${(err as Error).message}`);
    }

    return {
      heroMessage,
      restaurantName,
      tableLabel: tableLabel || '',
      highlights,
      quickActions,
      isReturning,
      lastVisitSummary,
      continuationMessage,
    };
  }

  private async getStaticHomeData(): Promise<HomeStaticData> {
    const cacheKey = `home-static:v1:${this.tenantConn.getTenantSlug() ?? 'unknown'}`;
    const now = Date.now();
    const cached = HomeService.staticDataCache.get(cacheKey);
    if (
      Number.isFinite(this.staticDataCacheTtlMs) &&
      this.staticDataCacheTtlMs > 0 &&
      cached &&
      cached.expiresAt > now
    ) {
      return cached.value;
    }

    const rows = (await this.tenantConn.query(
      `WITH config AS (
          SELECT restaurant_name FROM settings LIMIT 1
        ),
        highlight_items AS (
          SELECT id, name, short_description, price_cents, image_url,
                 CASE
                   WHEN is_day_special THEN 'Prato do dia'
                   WHEN is_featured THEN 'Destaque'
                   ELSE 'Mais pedido'
                 END AS badge,
                 is_day_special,
                 total_orders
          FROM menu_items
          WHERE is_available = true AND (is_featured = true OR is_day_special = true)
          ORDER BY is_day_special DESC, total_orders DESC
          LIMIT 5
        )
       SELECT COALESCE((SELECT restaurant_name FROM config), 'Restaurante') AS restaurant_name,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'id', id,
                      'name', name,
                      'shortDescription', short_description,
                      'priceCents', price_cents,
                      'imageUrl', image_url,
                      'badge', badge
                    )
                    ORDER BY is_day_special DESC, total_orders DESC
                  )
                  FROM highlight_items
                ),
                '[]'::json
              ) AS highlights`,
    )) as Array<{ restaurant_name: string | null; highlights: unknown }>;

    const row = rows[0];
    const value: HomeStaticData = {
      restaurantName: row?.restaurant_name || 'Restaurante',
      highlights: this.normalizeHighlights(row?.highlights),
    };

    if (
      Number.isFinite(this.staticDataCacheTtlMs) &&
      this.staticDataCacheTtlMs > 0
    ) {
      HomeService.staticDataCache.set(cacheKey, {
        expiresAt: now + this.staticDataCacheTtlMs,
        value,
      });
    }

    return value;
  }

  private normalizeHighlights(raw: unknown): HighlightItem[] {
    const items = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? (JSON.parse(raw) as unknown[])
        : [];

    return items.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: item.id as string,
        name: item.name as string,
        shortDescription: (item.shortDescription as string | null) ?? null,
        priceCents: Number(item.priceCents ?? 0),
        imageUrl: (item.imageUrl as string | null) ?? null,
        badge: (item.badge as string | null) ?? null,
      };
    });
  }

  private async nextWelcomeTemplateIndex(sessionId: string): Promise<number> {
    const poolKey = `welcome_pool:${sessionId}`;
    const idx = await this.redis.lpop(poolKey);
    if (idx !== null) {
      return parseInt(idx, 10);
    }

    const indices = Array.from({ length: TOTAL_TEMPLATES }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    await this.redis.rpush(poolKey, ...indices.map(String));
    await this.redis.lpop(poolKey);
    return indices[0];
  }

  private async getCustomerContext(customerId?: string): Promise<HomeCustomerContext> {
    const context: HomeCustomerContext = {
      nome: 'visitante',
      isReturning: false,
      lastVisitSummary: null,
    };
    if (!customerId) return context;

    const rows = (await this.tenantConn.query(
      `SELECT c.name, c.created_at, c.total_visits,
              s.last_items, s.favorite_items, s.total_spent_cents
       FROM customers c
       LEFT JOIN customer_consumption_summary s ON s.customer_id = c.id
       WHERE c.id = $1
       LIMIT 1`,
      [customerId],
    )) as Array<{
      name: string;
      created_at: Date | string;
      total_visits: number | string | null;
      last_items: unknown;
      favorite_items: unknown;
      total_spent_cents: number | string | null;
    }>;

    const row = rows[0];
    if (!row) return context;

    context.nome = row.name;
    const createdAt = row.created_at instanceof Date
      ? row.created_at
      : new Date(row.created_at);
    const ageMs = Date.now() - createdAt.getTime();
    const totalVisits =
      typeof row.total_visits === 'number'
        ? row.total_visits
        : Number(row.total_visits ?? 0);
    if (ageMs > 30 * 60 * 1000 || totalVisits > 1) {
      context.isReturning = true;
    }

    const hasSummary =
      row.last_items !== null ||
      row.favorite_items !== null ||
      row.total_spent_cents !== null;
    if (hasSummary) {
      context.isReturning = true;
      context.lastVisitSummary = {
        last_items: row.last_items,
        favorite_items: row.favorite_items,
        total_spent_cents: row.total_spent_cents,
      };
      const lastItems =
        (context.lastVisitSummary.last_items as {
          name: string;
          category?: string;
        }[]) || [];
      context.ultimoPrato = lastItems.find(
        (i) => i.category !== 'Bebidas' && i.category !== 'Sobremesas',
      )?.name;
      context.ultimaBebida = lastItems.find(
        (i) => i.category === 'Bebidas',
      )?.name;
      context.ultimaSobremesa = lastItems.find(
        (i) => i.category === 'Sobremesas',
      )?.name;
    }

    return context;
  }

  private async getCachedContinuationMessage(
    aiUrl: string,
    params: URLSearchParams,
    headers: Record<string, string>,
  ): Promise<HomeData['continuationMessage']> {
    const cacheKey = `home-continuation:v1:${aiUrl}:${params.toString()}`;
    const now = Date.now();
    const cached = HomeService.continuationCache.get(cacheKey);
    if (
      Number.isFinite(this.continuationCacheTtlMs) &&
      this.continuationCacheTtlMs > 0 &&
      cached &&
      cached.expiresAt > now
    ) {
      return cached.value;
    }

    const res = await fetch(`${aiUrl}/continuation?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(800),
    });
    let value: HomeData['continuationMessage'];
    if (res.ok) {
      const body = (await res.json()) as {
        message: ContinuationMessage | null;
        rendered: string | null;
      };
      if (body.message) {
        value = { ...body.message, rendered: body.rendered || undefined };
      }
    }

    if (
      Number.isFinite(this.continuationCacheTtlMs) &&
      this.continuationCacheTtlMs > 0
    ) {
      HomeService.continuationCache.set(cacheKey, {
        expiresAt: now + this.continuationCacheTtlMs,
        value,
      });
    }

    return value;
  }

  private normalizeKindHint(kindHint?: string | string[]): ContinuationKind | null {
    const raw = Array.isArray(kindHint) ? kindHint[0] : kindHint;
    if (!raw) return null;
    const value = raw.trim();
    if (
      value === 'viu_menu' ||
      value === 'chamou_garcom' ||
      value === 'abriu_pedido' ||
      value === 'pagou' ||
      value === 'voltou_sem_acao'
    ) {
      return value;
    }
    return null;
  }

  private async inferContinuationKind(input: {
    sessionId: string;
    customerId?: string;
    isReturning: boolean;
    kindHint?: string | string[];
    hasDraftOrder: boolean;
  }): Promise<{ kind: ContinuationKind | null; favoriteItem?: string; lastOrderId?: string }> {
    const hint = this.normalizeKindHint(input.kindHint);

    const rows = (await this.tenantConn.query(
      `WITH latest_payment AS (
          SELECT latest_payment_order.id AS order_id
            FROM payments p
       LEFT JOIN LATERAL (
             SELECT o.id
               FROM orders o
              WHERE o.table_session_id = p.table_session_id
                AND (p.visit_id IS NULL OR o.visit_id = p.visit_id)
                AND o.status NOT IN ('cancelled', 'canceled')
              ORDER BY o.created_at DESC
              LIMIT 1
           ) latest_payment_order ON true
           WHERE p.table_session_id = $1
             AND p.status IN ('confirmed', 'paid')
             AND COALESCE(p.paid_at, p.updated_at, p.created_at) >= now() - INTERVAL '10 minutes'
           ORDER BY COALESCE(p.paid_at, p.updated_at, p.created_at) DESC
           LIMIT 1
        ),
        latest_order AS (
          SELECT id
            FROM orders
           WHERE table_session_id = $1
             AND status NOT IN ('cancelled', 'canceled')
           ORDER BY created_at DESC
           LIMIT 1
        ),
        recent_order AS (
          SELECT id
            FROM orders
           WHERE table_session_id = $1
             AND status NOT IN ('cancelled', 'canceled', 'delivered')
             AND created_at >= now() - INTERVAL '30 minutes'
           ORDER BY created_at DESC
           LIMIT 1
        ),
        recent_order_summary AS (
          SELECT string_agg(item.quantity::text || 'x ' || item.name, ', ' ORDER BY item.created_at) AS summary
            FROM (
              SELECT oi.quantity, mi.name, oi.created_at
                FROM order_items oi
                JOIN menu_items mi ON mi.id = oi.menu_item_id
               WHERE oi.order_id = (SELECT id FROM recent_order)
               ORDER BY oi.created_at ASC
               LIMIT 3
            ) item
        )
        SELECT
          (SELECT order_id FROM latest_payment) AS payment_order_id,
          (SELECT id FROM latest_order) AS latest_order_id,
          (SELECT id FROM recent_order) AS recent_order_id,
          (SELECT LEFT(summary, 80) FROM recent_order_summary) AS recent_order_summary,
          EXISTS (
            SELECT 1
              FROM customer_events
             WHERE table_session_id = $1
               AND event_type IN ('menu_viewed', 'item_viewed')
               AND created_at >= now() - INTERVAL '10 minutes'
             LIMIT 1
          ) AS has_menu_event,
          EXISTS (
            SELECT 1
              FROM waiter_calls
             WHERE table_session_id = $1
               AND status IN ('pending', 'acknowledged')
               AND created_at >= now() - INTERVAL '30 minutes'
               AND resolved_at IS NULL
               AND cancelled_at IS NULL
             LIMIT 1
          ) AS has_waiter_call`,
      [input.sessionId],
    )) as Array<{
      payment_order_id: string | null;
      latest_order_id: string | null;
      recent_order_id: string | null;
      recent_order_summary: string | null;
      has_menu_event: boolean;
      has_waiter_call: boolean;
    }>;
    const signals = rows[0];

    if (signals?.payment_order_id) {
      return { kind: 'pagou', lastOrderId: signals.payment_order_id };
    }
    if (hint === 'pagou') {
      return {
        kind: 'pagou',
        lastOrderId: signals?.latest_order_id ?? undefined,
      };
    }

    if (input.hasDraftOrder || hint === 'abriu_pedido') {
      return {
        kind: 'abriu_pedido',
        lastOrderId: signals?.latest_order_id ?? undefined,
      };
    }

    if (signals?.recent_order_id) {
      return {
        kind: 'abriu_pedido',
        favoriteItem: signals.recent_order_summary ?? undefined,
        lastOrderId: signals.recent_order_id,
      };
    }

    if (hint === 'viu_menu') {
      return { kind: 'viu_menu' };
    }

    if (signals?.has_menu_event) {
      return { kind: 'viu_menu' };
    }

    if (signals?.has_waiter_call || hint === 'chamou_garcom') {
      return { kind: 'chamou_garcom' };
    }

    if (input.isReturning || hint === 'voltou_sem_acao') {
      return { kind: 'voltou_sem_acao' };
    }

    return { kind: null };
  }
}
