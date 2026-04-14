import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

@Injectable()
export class MenuService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async getCategories() {
    return this.tenantConn.query(
      `SELECT id, name, description, sort_order
       FROM menu_categories
       WHERE is_active = true
       ORDER BY sort_order ASC`,
    );
  }

  async getItems(categoryId?: string) {
    if (categoryId) {
      return this.tenantConn.query(
        `SELECT mi.id, mi.name, mi.short_description, mi.price_cents, mi.image_url,
                mi.tags, mi.allergens, mi.is_featured, mi.is_day_special, mi.category_id,
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
      `SELECT mi.id, mi.name, mi.short_description, mi.price_cents, mi.image_url,
              mi.tags, mi.allergens, mi.is_featured, mi.is_day_special, mi.category_id,
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
      `SELECT id, name, short_description, price_cents, image_url, tags, allergens, category_id
       FROM menu_items
       WHERE is_available = true
         AND (name ILIKE $1 OR tags @> ARRAY[$2]::text[] OR ingredients @> ARRAY[$2]::text[])
       ORDER BY total_orders DESC
       LIMIT 20`,
      [pattern, query.toLowerCase()],
    );
  }

  async getFeatured() {
    return this.tenantConn.query(
      `SELECT id, name, short_description, price_cents, image_url, tags,
              CASE
                WHEN is_day_special THEN 'Prato do dia'
                WHEN is_featured THEN 'Destaque'
                ELSE 'Mais pedido'
              END as badge
       FROM menu_items
       WHERE is_available = true AND (is_featured = true OR is_day_special = true)
       ORDER BY is_day_special DESC, total_orders DESC
       LIMIT 10`,
    );
  }
}
