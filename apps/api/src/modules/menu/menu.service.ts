import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';

// Fields common to every menu-item read. `kind`, `sizes`, and `preferences`
// were added by migration 016 for the drink-detail (SD1) and food/drink
// tabs on the customer app. Keep this list in-sync with MenuItemApi in
// apps/web-customer/src/app/[slug]/cardapio/[itemId]/page.tsx.
const ITEM_COLUMNS = `
  mi.id, mi.name, mi.short_description, mi.price_cents, mi.image_url,
  mi.tags, mi.allergens, mi.is_featured, mi.is_day_special, mi.category_id,
  mi.kind, mi.sizes, mi.preferences
`;

@Injectable()
export class MenuService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  /**
   * FASE 3 · cache-aside das leituras quentes do cardápio (TTL 60s).
   * O cardápio praticamente não muda em runtime — a única mutação é
   * total_orders+1 no pedido confirmado, que só reordena destaque (atraso
   * de até 60s é irrelevante). Fail-open: Redis fora → query direto.
   */
  private async cached<T>(view: string, load: () => Promise<T>): Promise<T> {
    const key = `cache:menu:${this.tenantConn.getTenantSlug() ?? 'unknown'}:${view}`;
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* fail-open */
    }
    const fresh = await load();
    try {
      await this.redis.set(key, JSON.stringify(fresh), 60);
    } catch {
      /* fail-open */
    }
    return fresh;
  }

  async getCategories() {
    return this.cached('categories', () =>
      this.tenantConn.query(
        `SELECT id, name, description, sort_order
       FROM menu_categories
       WHERE is_active = true
       ORDER BY sort_order ASC`,
      ),
    );
  }

  async getItems(categoryId?: string) {
    return this.cached(`items:${categoryId ?? 'all'}`, () => this.loadItems(categoryId));
  }

  private async loadItems(categoryId?: string) {
    if (categoryId) {
      return this.tenantConn.query(
        `SELECT ${ITEM_COLUMNS},
                COALESCE(json_agg(
                  json_build_object('id', mie.id, 'name', mie.name, 'priceCents', mie.price_cents)
                ) FILTER (WHERE mie.id IS NOT NULL AND mie.is_available = true), '[]') as extras
         FROM menu_items mi
         LEFT JOIN menu_item_extras mie ON mie.menu_item_id = mi.id
         WHERE mi.category_id = $1 AND mi.is_available = true
         GROUP BY mi.id
         ORDER BY mi.sort_order ASC`,
        [categoryId],
      );
    }

    return this.tenantConn.query(
      `SELECT ${ITEM_COLUMNS},
              COALESCE(json_agg(
                json_build_object('id', mie.id, 'name', mie.name, 'priceCents', mie.price_cents)
              ) FILTER (WHERE mie.id IS NOT NULL AND mie.is_available = true), '[]') as extras
       FROM menu_items mi
       LEFT JOIN menu_item_extras mie ON mie.menu_item_id = mi.id
       WHERE mi.is_available = true
       GROUP BY mi.id
       ORDER BY mi.sort_order ASC`,
    );
  }

  async getItemById(id: string) {
    // mi.* already includes kind/sizes/preferences, so no change needed here.
    const rows = await this.tenantConn.query(
      `SELECT mi.*, mc.name as category_name,
              COALESCE(json_agg(
                json_build_object('id', mie.id, 'name', mie.name, 'priceCents', mie.price_cents, 'isAvailable', mie.is_available)
              ) FILTER (WHERE mie.id IS NOT NULL), '[]') as extras
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
       LEFT JOIN menu_item_extras mie ON mie.menu_item_id = mi.id
       WHERE mi.id = $1
       GROUP BY mi.id, mc.name`,
      [id],
    );
    return (rows as unknown[])[0] || null;
  }

  async search(query: string) {
    const pattern = `%${query}%`;
    return this.tenantConn.query(
      `SELECT id, name, short_description, price_cents, image_url,
              tags, allergens, category_id, kind, sizes, preferences
       FROM menu_items
       WHERE is_available = true
         AND (name ILIKE $1 OR tags @> ARRAY[$2]::text[] OR ingredients @> ARRAY[$2]::text[])
       ORDER BY total_orders DESC
       LIMIT 20`,
      [pattern, query.toLowerCase()],
    );
  }

  async getFeatured() {
    return this.cached('featured', () =>
      this.tenantConn.query(
        `SELECT id, name, short_description, price_cents, image_url, tags, kind,
              CASE
                WHEN is_day_special THEN 'Prato do dia'
                WHEN is_featured THEN 'Destaque'
                ELSE 'Mais pedido'
              END as badge
       FROM menu_items
       WHERE is_available = true AND (is_featured = true OR is_day_special = true)
       ORDER BY is_day_special DESC, total_orders DESC
       LIMIT 10`,
      ),
    );
  }
}
