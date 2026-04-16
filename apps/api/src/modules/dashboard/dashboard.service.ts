import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

@Injectable()
export class DashboardService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async getOverview() {
    // Today's stats
    const todayOrders = (await this.tenantConn.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as revenue
       FROM orders
       WHERE created_at >= CURRENT_DATE AND status != 'cancelled'`,
    )) as { count: string; revenue: string }[];

    const todayCustomers = (await this.tenantConn.query(
      `SELECT COUNT(DISTINCT customer_id) as count
       FROM visits
       WHERE created_at >= CURRENT_DATE`,
    )) as { count: string }[];

    const avgRating = (await this.tenantConn.query(
      `SELECT ROUND(AVG(overall_rating), 1) as avg
       FROM feedbacks
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`,
    )) as { avg: string }[];

    const pendingOrders = (await this.tenantConn.query(
      `SELECT COUNT(*) as count FROM orders WHERE status NOT IN ('delivered', 'cancelled')`,
    )) as { count: string }[];

    return {
      today: {
        orders: parseInt(todayOrders[0].count),
        revenueCents: parseInt(todayOrders[0].revenue),
        customers: parseInt(todayCustomers[0].count),
        avgRating: parseFloat(avgRating[0].avg) || 0,
        pendingOrders: parseInt(pendingOrders[0].count),
      },
    };
  }

  async getRevenueChart(days = 7) {
    const rows = (await this.tenantConn.query(
      `SELECT DATE(created_at) as date, COALESCE(SUM(total_cents), 0) as revenue, COUNT(*) as orders
       FROM orders
       WHERE created_at >= CURRENT_DATE - $1::int AND status != 'cancelled'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days],
    )) as { date: string; revenue: string; orders: string }[];

    return rows.map((r) => ({
      date: r.date,
      revenueCents: parseInt(r.revenue),
      orders: parseInt(r.orders),
    }));
  }

  async getTopItems(limit = 10) {
    return this.tenantConn.query(
      `SELECT mi.id, mi.name, mi.price_cents, mi.total_orders, mc.name as category_name
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
       ORDER BY mi.total_orders DESC
       LIMIT $1`,
      [limit],
    );
  }

  async getFeedbackSummary() {
    const distribution = (await this.tenantConn.query(
      `SELECT overall_rating, COUNT(*) as count
       FROM feedbacks
       GROUP BY overall_rating
       ORDER BY overall_rating DESC`,
    )) as { overall_rating: number; count: string }[];

    const recentComments = (await this.tenantConn.query(
      `SELECT f.overall_rating, f.comment, f.created_at, c.name as customer_name
       FROM feedbacks f
       LEFT JOIN customers c ON c.id = f.customer_id
       WHERE f.comment IS NOT NULL AND f.comment != ''
       ORDER BY f.created_at DESC
       LIMIT 10`,
    )) as unknown[];

    return { distribution, recentComments };
  }

  async getAiUsage() {
    const rows = (await this.tenantConn.query(
      `SELECT COUNT(*) as total_messages,
              SUM(tokens_in + tokens_out) as total_tokens,
              SUM(estimated_cost_cents) as total_cost_cents,
              SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END) as blocked_count
       FROM assistant_messages
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`,
    )) as { total_messages: string; total_tokens: string; total_cost_cents: string; blocked_count: string }[];

    return {
      totalMessages: parseInt(rows[0].total_messages) || 0,
      totalTokens: parseInt(rows[0].total_tokens) || 0,
      totalCostCents: parseInt(rows[0].total_cost_cents) || 0,
      blockedCount: parseInt(rows[0].blocked_count) || 0,
    };
  }
}
