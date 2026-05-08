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

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  async getHome(
    sessionId: string,
    customerId?: string,
    tableLabel?: string,
  ): Promise<HomeData> {
    // 1. Busca settings
    const settings = await this.tenantConn.query('SELECT * FROM settings LIMIT 1');
    const config = (settings as Record<string, unknown>[])[0] || {};
    const restaurantName = (config.restaurant_name as string) || 'Restaurante';

    // 2. LPOP welcome pool
    let templateIndex = 0;
    const poolKey = `welcome_pool:${sessionId}`;
    const idx = await this.redis.lpop(poolKey);

    if (idx !== null) {
      templateIndex = parseInt(idx, 10);
    } else {
      // Pool vazio — re-shuffle
      const indices = Array.from({ length: TOTAL_TEMPLATES }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      await this.redis.rpush(poolKey, ...indices.map(String));
      templateIndex = indices[0];
      await this.redis.lpop(poolKey); // remove o que acabamos de usar
    }

    // 3. Monta variaveis do template
    let nome = 'visitante';
    let isReturning = false;
    let lastVisitSummary: Record<string, unknown> | null = null;
    let ultimoPrato: string | undefined;
    let ultimaBebida: string | undefined;
    let ultimaSobremesa: string | undefined;

    if (customerId) {
      const customers = await this.tenantConn.query(
        'SELECT name FROM customers WHERE id = $1',
        [customerId],
      );
      if ((customers as unknown[]).length > 0) {
        nome = (customers as Record<string, unknown>[])[0].name as string;
      }

      const summary = await this.tenantConn.query(
        'SELECT last_items, favorite_items, total_spent_cents FROM customer_consumption_summary WHERE customer_id = $1',
        [customerId],
      );
      if ((summary as unknown[]).length > 0) {
        isReturning = true;
        lastVisitSummary = (summary as Record<string, unknown>[])[0];
        const lastItems = (lastVisitSummary.last_items as { name: string; category?: string }[]) || [];
        ultimoPrato = lastItems.find((i) => i.category !== 'Bebidas' && i.category !== 'Sobremesas')?.name;
        ultimaBebida = lastItems.find((i) => i.category === 'Bebidas')?.name;
        ultimaSobremesa = lastItems.find((i) => i.category === 'Sobremesas')?.name;
      }
    }

    // 4. Renderiza template
    const heroMessage = renderTemplate(templateIndex, {
      nome,
      restaurante: restaurantName,
      ultimo_prato: ultimoPrato,
      ultima_bebida: ultimaBebida,
      ultima_sobremesa: ultimaSobremesa,
    });

    // 5. Busca highlights
    const highlightRows = await this.tenantConn.query(
      `SELECT id, name, short_description, price_cents, image_url,
              CASE
                WHEN is_day_special THEN 'Prato do dia'
                WHEN is_featured THEN 'Destaque'
                ELSE 'Mais pedido'
              END as badge
       FROM menu_items
       WHERE is_available = true AND (is_featured = true OR is_day_special = true)
       ORDER BY is_day_special DESC, total_orders DESC
       LIMIT 5`,
    );

    const highlights = (highlightRows as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      shortDescription: row.short_description as string | null,
      priceCents: row.price_cents as number,
      imageUrl: row.image_url as string | null,
      badge: row.badge as string | null,
    }));

    // 6. Quick actions (fixas)
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
      const params = new URLSearchParams({
        tenantId: process.env.TENANT_ID || 'restaurant_dev',
        isReturning: String(isReturning),
        isVip: 'false',
        customerName: nome,
      });
      const res = await fetch(`${aiUrl}/continuation?${params.toString()}`, {
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) {
        const body = (await res.json()) as { message: ContinuationMessage | null; rendered: string | null };
        if (body.message) {
          continuationMessage = { ...body.message, rendered: body.rendered || undefined };
        }
      }
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
}
