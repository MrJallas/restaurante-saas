import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

@Injectable()
export class PaymentsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async requestPayment(
    tableSessionId: string,
    visitId: string | null,
    mode: 'table' | 'individual',
    method: string,
  ) {
    // Calculate amount based on billing mode
    let amountCents: number;

    if (mode === 'individual') {
      if (!visitId) {
        throw new BadRequestException('visitId necessario para pagamento individual.');
      }
      // Sum only individual orders for this visit
      const rows = (await this.tenantConn.query(
        `SELECT COALESCE(SUM(total_cents), 0) as total
         FROM orders
         WHERE table_session_id = $1 AND visit_id = $2
           AND billing_mode = 'individual' AND status != 'cancelled'`,
        [tableSessionId, visitId],
      )) as { total: number }[];
      amountCents = rows[0].total;
    } else {
      // Table mode: sum all table-mode orders for this session
      const rows = (await this.tenantConn.query(
        `SELECT COALESCE(SUM(total_cents), 0) as total
         FROM orders
         WHERE table_session_id = $1
           AND billing_mode = 'table' AND status != 'cancelled'`,
        [tableSessionId],
      )) as { total: number }[];
      amountCents = rows[0].total;
    }

    if (amountCents <= 0) {
      throw new BadRequestException('Nenhum valor pendente para pagamento.');
    }

    // Check for existing pending payment
    const existing = (await this.tenantConn.query(
      `SELECT id FROM payments
       WHERE table_session_id = $1 AND status = 'pending'
       ${visitId ? 'AND visit_id = $2' : ''}`,
      visitId ? [tableSessionId, visitId] : [tableSessionId],
    )) as { id: string }[];

    if (existing.length > 0) {
      throw new BadRequestException('Ja existe um pagamento pendente.');
    }

    // Generate PIX (mock — in production this would call PSP)
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136${crypto.randomUUID()}5204000053039865406${(amountCents / 100).toFixed(2)}5802BR`;
    const pixCopyPaste = pixCode;

    // Create payment
    const rows = (await this.tenantConn.query(
      `INSERT INTO payments (table_session_id, visit_id, amount_cents, status, method, pix_qr_code, pix_copy_paste)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)
       RETURNING id, status, amount_cents, pix_qr_code, pix_copy_paste, created_at`,
      [tableSessionId, visitId, amountCents, method, pixCode, pixCopyPaste],
    )) as { id: string; status: string; amount_cents: number; pix_qr_code: string; pix_copy_paste: string; created_at: string }[];

    return {
      paymentId: rows[0].id,
      status: rows[0].status,
      amountCents: rows[0].amount_cents,
      method,
      pixQrCode: rows[0].pix_qr_code,
      pixCopyPaste: rows[0].pix_copy_paste,
      createdAt: rows[0].created_at,
    };
  }

  async confirmPayment(paymentId: string, pspTransactionId?: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status FROM payments WHERE id = $1`,
      [paymentId],
    )) as { id: string; status: string }[];

    if (!rows.length) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }

    if (rows[0].status !== 'pending') {
      throw new BadRequestException('Pagamento nao esta pendente.');
    }

    await this.tenantConn.query(
      `UPDATE payments SET status = 'paid', paid_at = now(), psp_transaction_id = $2, updated_at = now()
       WHERE id = $1`,
      [paymentId, pspTransactionId || null],
    );

    return { paymentId, status: 'paid' };
  }

  async getPaymentStatus(paymentId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, amount_cents, method, pix_qr_code, pix_copy_paste, paid_at, created_at
       FROM payments WHERE id = $1`,
      [paymentId],
    )) as { id: string; status: string; amount_cents: number; method: string; pix_qr_code: string; pix_copy_paste: string; paid_at: string; created_at: string }[];

    if (!rows.length) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }

    return rows[0];
  }

  async getSessionPayments(tableSessionId: string) {
    return this.tenantConn.query(
      `SELECT id, visit_id, amount_cents, status, method, paid_at, created_at
       FROM payments
       WHERE table_session_id = $1
       ORDER BY created_at DESC`,
      [tableSessionId],
    );
  }
}
