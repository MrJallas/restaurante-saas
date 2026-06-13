import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';

@Injectable()
export class PromotionsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async list(activeOnly = false) {
    const where = activeOnly
      ? 'WHERE is_active = true AND (valid_until IS NULL OR valid_until > now())'
      : '';
    return this.tenantConn.query(`SELECT * FROM promotions ${where} ORDER BY created_at DESC`);
  }

  async getById(id: string) {
    const rows = (await this.tenantConn.query(`SELECT * FROM promotions WHERE id = $1`, [
      id,
    ])) as unknown[];
    if (!rows.length) throw new NotFoundException('Promocao nao encontrada.');
    return rows[0];
  }

  async create(data: {
    title: string;
    description?: string;
    discountType: string;
    discountValue: number;
    minOrderCents?: number;
    validFrom?: string;
    validUntil?: string;
  }) {
    const rows = (await this.tenantConn.query(
      `INSERT INTO promotions (title, description, discount_type, discount_value, min_order_cents, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.title,
        data.description || null,
        data.discountType,
        data.discountValue,
        data.minOrderCents || null,
        data.validFrom || null,
        data.validUntil || null,
      ],
    )) as unknown[];
    return rows[0];
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      discountType: string;
      discountValue: number;
      minOrderCents: number;
      validFrom: string;
      validUntil: string;
      isActive: boolean;
    }>,
  ) {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIdx++}`);
      params.push(data.title);
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIdx++}`);
      params.push(data.description);
    }
    if (data.discountType !== undefined) {
      setClauses.push(`discount_type = $${paramIdx++}`);
      params.push(data.discountType);
    }
    if (data.discountValue !== undefined) {
      setClauses.push(`discount_value = $${paramIdx++}`);
      params.push(data.discountValue);
    }
    if (data.minOrderCents !== undefined) {
      setClauses.push(`min_order_cents = $${paramIdx++}`);
      params.push(data.minOrderCents);
    }
    if (data.validFrom !== undefined) {
      setClauses.push(`valid_from = $${paramIdx++}`);
      params.push(data.validFrom);
    }
    if (data.validUntil !== undefined) {
      setClauses.push(`valid_until = $${paramIdx++}`);
      params.push(data.validUntil);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIdx++}`);
      params.push(data.isActive);
    }

    if (!setClauses.length) return this.getById(id);

    setClauses.push(`updated_at = now()`);
    params.push(id);

    const rows = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE promotions SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
        params,
      ),
    );

    if (!rows.length) throw new NotFoundException('Promocao nao encontrada.');
    return rows[0];
  }

  async delete(id: string) {
    await this.tenantConn.query(`DELETE FROM promotions WHERE id = $1`, [id]);
    return { deleted: true };
  }
}
