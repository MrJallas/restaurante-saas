import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/** Pix QR codes expire 10 minutes after generation (design S9b). */
const PIX_EXPIRY_SECONDS = 600;

const VALID_SPLIT_MODES = new Set(['equal', 'by_item', 'custom']);

export interface SplitAllocation {
  customerId: string;
  amountCents: number;
  label?: string;
}

export interface RequestPaymentOptions {
  splitMode?: string;
  allocations?: SplitAllocation[];
}

/**
 * Treat 'paid' as an alias for 'confirmed' on read so legacy rows created
 * before the shared-types normalization still return correctly to clients
 * that poll for 'confirmed'.
 */
function normalizeStatus(raw: string): string {
  return raw === 'paid' ? 'confirmed' : raw;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async requestPayment(
    tableSessionId: string,
    visitId: string | null,
    mode: 'table' | 'individual',
    method: string,
    options: RequestPaymentOptions = {},
  ) {
    let amountCents: number;

    // For split-by-allocation flows the caller already computed the share
    // (e.g. SP1 "Pagar minha parte"). Trust that amount — but bound-check
    // it against the outstanding bill so a rogue client can't short-pay.
    const myAllocation =
      options.splitMode && options.allocations && visitId
        ? options.allocations.find((a) => a.customerId === visitId)
        : undefined;

    if (mode === 'individual') {
      if (!visitId) {
        throw new BadRequestException(
          'visitId necessario para pagamento individual.',
        );
      }
      const rows = (await this.tenantConn.query(
        `SELECT COALESCE(SUM(total_cents), 0) as total
         FROM orders
         WHERE table_session_id = $1 AND visit_id = $2
           AND billing_mode = 'individual'
           AND status NOT IN ('cancelled', 'pending_confirmation')`,
        [tableSessionId, visitId],
      )) as { total: number }[];
      amountCents = myAllocation?.amountCents ?? rows[0].total;
    } else {
      const rows = (await this.tenantConn.query(
        `SELECT COALESCE(SUM(total_cents), 0) as total
         FROM orders
         WHERE table_session_id = $1
           AND billing_mode = 'table'
           AND status NOT IN ('cancelled', 'pending_confirmation')`,
        [tableSessionId],
      )) as { total: number }[];
      amountCents = rows[0].total;
    }

    if (amountCents <= 0) {
      throw new BadRequestException('Nenhum valor pendente para pagamento.');
    }

    // Validate split metadata if the caller sent any
    let splitMode: string | null = null;
    let splitAllocations: SplitAllocation[] | null = null;
    if (options.splitMode) {
      if (!VALID_SPLIT_MODES.has(options.splitMode)) {
        throw new BadRequestException(
          `splitMode invalido: ${options.splitMode}.`,
        );
      }
      splitMode = options.splitMode;
      splitAllocations = options.allocations ?? null;
    }

    // Reject duplicate pending payments for the same scope. If one exists and
    // has already expired, mark it expired so the user can retry.
    const existing = (await this.tenantConn.query(
      `SELECT id, expires_at FROM payments
       WHERE table_session_id = $1 AND status = 'pending'
         ${visitId ? 'AND visit_id = $2' : 'AND visit_id IS NULL'}`,
      visitId ? [tableSessionId, visitId] : [tableSessionId],
    )) as { id: string; expires_at: string | null }[];

    for (const row of existing) {
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        await this.tenantConn.query(
          `UPDATE payments SET status = 'expired', updated_at = now() WHERE id = $1`,
          [row.id],
        );
      } else {
        throw new BadRequestException('Ja existe um pagamento pendente.');
      }
    }

    // Generate PIX (mock — PSP wiring lives elsewhere)
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}5204000053039865406${(amountCents / 100).toFixed(2)}5802BR`;
    const pixCopyPaste = pixCode;

    const rows = (await this.tenantConn.query(
      `INSERT INTO payments
         (table_session_id, visit_id, amount_cents, status, method,
          pix_qr_code, pix_copy_paste, expires_at, split_mode, split_allocations)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6,
               now() + ($7 || ' seconds')::interval, $8, $9)
       RETURNING id, status, amount_cents, method, pix_qr_code, pix_copy_paste,
                 expires_at, split_mode, split_allocations, created_at`,
      [
        tableSessionId,
        visitId,
        amountCents,
        method,
        pixCode,
        pixCopyPaste,
        String(PIX_EXPIRY_SECONDS),
        splitMode,
        splitAllocations ? JSON.stringify(splitAllocations) : null,
      ],
    )) as Array<{
      id: string;
      status: string;
      amount_cents: number;
      method: string;
      pix_qr_code: string;
      pix_copy_paste: string;
      expires_at: string | null;
      split_mode: string | null;
      split_allocations: SplitAllocation[] | null;
      created_at: string;
    }>;

    const p = rows[0];
    return {
      paymentId: p.id,
      status: normalizeStatus(p.status),
      amountCents: p.amount_cents,
      method: p.method,
      pixQrCode: p.pix_qr_code,
      pixCopyPaste: p.pix_copy_paste,
      expiresAt: p.expires_at,
      splitMode: p.split_mode ?? undefined,
      splitAllocations: p.split_allocations ?? undefined,
      createdAt: p.created_at,
    };
  }

  /**
   * PSP-confirmed (or manual) success transition. The customer app polls
   * GET /:id and redirects to the feedback screen when it sees 'confirmed'.
   */
  async confirmPayment(
    paymentId: string,
    tableSessionId: string,
    pspTransactionId?: string,
  ) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id, expires_at
       FROM payments WHERE id = $1`,
      [paymentId],
    )) as {
      id: string;
      status: string;
      table_session_id: string;
      expires_at: string | null;
    }[];

    if (!rows.length) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }
    const payment = rows[0];

    // Ownership: paymentId vaza no QR Code Pix e em logs. Sem essa
    // checagem, qualquer cliente com o UUID podia marcar como pago
    // pagamento de OUTRA mesa.
    if (payment.table_session_id !== tableSessionId) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }

    if (payment.status === 'confirmed' || payment.status === 'paid') {
      return { paymentId, status: 'confirmed' };
    }
    if (payment.status !== 'pending') {
      throw new BadRequestException(
        `Pagamento nao esta pendente (status atual: ${payment.status}).`,
      );
    }

    // Pix vencido nao pode ser confirmado. Antes era possivel marcar
    // como pago um Pix com expires_at = '2020-01-01' — fraude direta.
    // Lazy expiry: alem de bloquear o confirm, transiciona o status pra
    // 'expired' pra que polls subsequentes vejam o estado correto.
    if (
      payment.expires_at &&
      new Date(payment.expires_at).getTime() <= Date.now()
    ) {
      await this.tenantConn.query(
        `UPDATE payments SET status = 'expired', updated_at = now() WHERE id = $1`,
        [paymentId],
      );
      throw new BadRequestException(
        'Pagamento expirado. Solicite um novo Pix.',
      );
    }

    await this.tenantConn.query(
      `UPDATE payments
       SET status = 'confirmed', paid_at = now(),
           psp_transaction_id = $2, updated_at = now()
       WHERE id = $1`,
      [paymentId, pspTransactionId || null],
    );

    return { paymentId, status: 'confirmed' };
  }

  async cancelPayment(paymentId: string, tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id FROM payments WHERE id = $1`,
      [paymentId],
    )) as { id: string; status: string; table_session_id: string }[];

    if (!rows.length) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }
    const payment = rows[0];
    if (payment.table_session_id !== tableSessionId) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }
    if (payment.status === 'cancelled') {
      return { paymentId, status: 'cancelled' };
    }
    if (payment.status !== 'pending') {
      throw new BadRequestException(
        `Pagamento nao pode mais ser cancelado (status: ${payment.status}).`,
      );
    }

    await this.tenantConn.query(
      `UPDATE payments
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE id = $1`,
      [paymentId],
    );
    return { paymentId, status: 'cancelled' };
  }

  async getPaymentStatus(paymentId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, amount_cents, method, pix_qr_code, pix_copy_paste,
              paid_at, created_at, expires_at, cancelled_at,
              split_mode, split_allocations
       FROM payments WHERE id = $1`,
      [paymentId],
    )) as Array<{
      id: string;
      status: string;
      amount_cents: number;
      method: string;
      pix_qr_code: string;
      pix_copy_paste: string;
      paid_at: string | null;
      created_at: string;
      expires_at: string | null;
      cancelled_at: string | null;
      split_mode: string | null;
      split_allocations: SplitAllocation[] | null;
    }>;

    if (!rows.length) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }

    const p = rows[0];

    // Lazy expiry: if a pending payment has outrun its expires_at, flip it
    // here so the client's next poll sees `expired` and routes to S9c.
    let status = normalizeStatus(p.status);
    if (
      status === 'pending' &&
      p.expires_at &&
      new Date(p.expires_at).getTime() <= Date.now()
    ) {
      await this.tenantConn.query(
        `UPDATE payments SET status = 'expired', updated_at = now() WHERE id = $1`,
        [paymentId],
      );
      status = 'expired';
    }

    return {
      paymentId: p.id,
      status,
      amountCents: p.amount_cents,
      method: p.method,
      pixQrCode: p.pix_qr_code,
      pixCopyPaste: p.pix_copy_paste,
      paidAt: p.paid_at,
      createdAt: p.created_at,
      expiresAt: p.expires_at,
      cancelledAt: p.cancelled_at,
      splitMode: p.split_mode ?? undefined,
      splitAllocations: p.split_allocations ?? undefined,
    };
  }

  async getSessionPayments(tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, visit_id, amount_cents, status, method,
              paid_at, created_at, expires_at, cancelled_at,
              split_mode, split_allocations
       FROM payments
       WHERE table_session_id = $1
       ORDER BY created_at DESC`,
      [tableSessionId],
    )) as Array<{
      id: string;
      visit_id: string | null;
      amount_cents: number;
      status: string;
      method: string;
      paid_at: string | null;
      created_at: string;
      expires_at: string | null;
      cancelled_at: string | null;
      split_mode: string | null;
      split_allocations: SplitAllocation[] | null;
    }>;

    return rows.map((p) => ({
      id: p.id,
      visitId: p.visit_id,
      amountCents: p.amount_cents,
      status: normalizeStatus(p.status),
      method: p.method,
      paidAt: p.paid_at,
      createdAt: p.created_at,
      expiresAt: p.expires_at,
      cancelledAt: p.cancelled_at,
      splitMode: p.split_mode ?? undefined,
      splitAllocations: p.split_allocations ?? undefined,
    }));
  }

  /**
   * Server-side compute for "Dividir conta" so the client is never the
   * source of truth for money. Returns the per-person allocation; does NOT
   * persist a payment. The frontend then calls POST /payments for "my
   * share" once the user confirms.
   */
  async computeSplit(
    tableSessionId: string,
    mode: string,
    participantIds: string[],
    customAllocations?: SplitAllocation[],
  ): Promise<{
    mode: string;
    totalCents: number;
    allocations: SplitAllocation[];
  }> {
    if (!VALID_SPLIT_MODES.has(mode)) {
      throw new BadRequestException(`splitMode invalido: ${mode}.`);
    }
    if (!participantIds.length) {
      throw new BadRequestException('Informe ao menos um participante.');
    }

    const items = (await this.tenantConn.query(
      `SELECT oi.subtotal_cents, oi.customer_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.table_session_id = $1
         AND o.status NOT IN ('cancelled', 'pending_confirmation')`,
      [tableSessionId],
    )) as { subtotal_cents: number; customer_id: string | null }[];

    const totalCents = items.reduce((s, it) => s + it.subtotal_cents, 0);
    if (totalCents <= 0) {
      throw new BadRequestException('Nenhum valor pendente para dividir.');
    }

    let allocations: SplitAllocation[] = [];
    if (mode === 'equal') {
      const share = Math.floor(totalCents / participantIds.length);
      const remainder = totalCents - share * participantIds.length;
      allocations = participantIds.map((cid, idx) => ({
        customerId: cid,
        amountCents: share + (idx === 0 ? remainder : 0),
      }));
    } else if (mode === 'by_item') {
      const totals = new Map<string, number>(
        participantIds.map((id) => [id, 0]),
      );
      const sharedItems = items.filter((it) => !it.customer_id);
      for (const it of items) {
        if (it.customer_id && totals.has(it.customer_id)) {
          totals.set(
            it.customer_id,
            (totals.get(it.customer_id) ?? 0) + it.subtotal_cents,
          );
        }
      }
      const sharedTotal = sharedItems.reduce(
        (s, it) => s + it.subtotal_cents,
        0,
      );
      const sharedShare = Math.floor(sharedTotal / participantIds.length);
      const sharedRemainder = sharedTotal - sharedShare * participantIds.length;
      participantIds.forEach((cid, idx) => {
        const bonus = idx === 0 ? sharedRemainder : 0;
        totals.set(cid, (totals.get(cid) ?? 0) + sharedShare + bonus);
      });
      allocations = Array.from(totals.entries()).map(([cid, amount]) => ({
        customerId: cid,
        amountCents: amount,
      }));
    } else {
      // custom — trust the caller but bound-check sum against totalCents
      if (!customAllocations?.length) {
        throw new BadRequestException(
          'Para split customizado, envie as allocations.',
        );
      }
      const sum = customAllocations.reduce((s, a) => s + a.amountCents, 0);
      if (Math.abs(sum - totalCents) > participantIds.length) {
        throw new BadRequestException(
          `Soma das alocacoes (${sum}) diferente do total (${totalCents}).`,
        );
      }
      allocations = customAllocations;
    }

    return { mode, totalCents, allocations };
  }

  /**
   * Stub for SP1 "Enviar resumo" — notify staff/room of the split layout
   * without creating a payment. Persists nothing yet; kitchen dashboards can
   * layer on top later. Safe no-op for now so the frontend's CTA works.
   */
  async notifySplit(
    tableSessionId: string,
    mode: string,
    allocations: SplitAllocation[],
  ) {
    if (!VALID_SPLIT_MODES.has(mode)) {
      throw new BadRequestException(`splitMode invalido: ${mode}.`);
    }
    // Placeholder for a future `bill_split_notifications` table / socket emit.
    return {
      ok: true,
      tableSessionId,
      mode,
      allocations,
      notifiedAt: new Date().toISOString(),
    };
  }
}
