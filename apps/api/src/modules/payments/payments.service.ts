import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { RedisService } from '../../infra/redis/redis.service';
import { BillingService, BillTotals } from '../billing/billing.service';
import { EventsGateway } from '../websocket/events.gateway';

/** Pix QR codes expire 10 minutes after generation (design S9b). */
const PIX_EXPIRY_SECONDS = 600;

const VALID_SPLIT_MODES = new Set(['equal', 'by_item', 'custom']);

/**
 * A04-PAY-01 (auto-confirm / refeicao gratis): o endpoint de confirm roda
 * sob SessionGuard, então QUALQUER cliente na mesa pode chama-lo. Como NÃO
 * existe webhook de PSP no codigo, esse era o unico caminho pra status
 * 'confirmed'/paid_at — ou seja, o cliente marcava o proprio Pix como pago
 * sem pagar nada.
 *
 * Regra defensiva: o confirm iniciado pelo cliente NUNCA marca como pago em
 * produção. Ele apenas registra 'awaiting_settlement' (aguardando
 * compensação) — que a home/continuation NÃO tratam como conta paga
 * (elas filtram por status IN ('confirmed','paid') + paid_at). O status
 * 'confirmed'/paid_at só deve ser gravado por um webhook de PSP autenticado
 * ou por confirmação manual de staff/manager (guard próprio + x-staff-id).
 *
 * Só liberamos a auto-confirmação do cliente quando explicitamente ligada
 * via env (PAYMENTS_ALLOW_CLIENT_CONFIRM=true) — para mocks/dev/e2e. Em
 * produção a flag fica desligada e o caminho de auto-confirm não existe.
 */
function clientConfirmMarksPaid(): boolean {
  return process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM === 'true';
}

export interface SplitAllocation {
  customerId: string;
  amountCents: number;
  label?: string;
}

export interface RequestPaymentOptions {
  splitMode?: string;
  allocations?: SplitAllocation[];
  /** Resolvido server-side do cookie `recognition_token` (nunca do body). */
  callerCustomerId?: string | null;
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
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    private readonly billing: BillingService,
    // M3 (timeline): @Optional segue o padrão order-delivery.service —
    // param novo opcional não quebra os construtores posicionais dos testes.
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  /**
   * P1-A (re-scan 2026-07-04): soma dos pagamentos JÁ liquidados ou em voo
   * (confirmed/paid/awaiting_settlement) no escopo — mesa (visit_id NULL) ou
   * comanda (visit_id = $2). É o que precisa sair do devido pra não re-cobrar:
   * awaiting_settlement é um Pix em voo, cobrar de novo dobraria a cobrança.
   * 'pending'/'expired'/'cancelled' NÃO contam (o dedup de pending é separado).
   */
  private async sumSettled(tableSessionId: string, visitId: string | null): Promise<number> {
    const rows = (await this.tenantConn.query(
      `SELECT COALESCE(SUM(amount_cents), 0) as paid
         FROM payments
        WHERE table_session_id = $1
          AND status IN ('confirmed', 'paid', 'awaiting_settlement')
          ${visitId ? 'AND visit_id = $2' : 'AND visit_id IS NULL'}`,
      visitId ? [tableSessionId, visitId] : [tableSessionId],
    )) as { paid: number | string }[];
    return Number(rows[0]?.paid ?? 0);
  }

  async requestPayment(
    tableSessionId: string,
    visitId: string | null,
    mode: 'table' | 'individual',
    method: string,
    options: RequestPaymentOptions = {},
  ) {
    let amountCents: number;
    let billTotals: BillTotals;
    let effectiveVisitId = visitId;
    const callerCustomerId = options.callerCustomerId ?? null;

    if (mode === 'individual') {
      // "Pagar minha parte": o FE não manda visitId — a comanda é derivada
      // do cliente RECONHECIDO (cookie recognition_token), nunca do body.
      if (!effectiveVisitId && callerCustomerId) {
        const vrows = (await this.tenantConn.query(
          `SELECT id FROM visits
           WHERE table_session_id = $1 AND customer_id = $2
           ORDER BY created_at DESC LIMIT 1`,
          [tableSessionId, callerCustomerId],
        )) as { id: string }[];
        effectiveVisitId = vrows[0]?.id ?? null;
      }
      if (!effectiveVisitId) {
        throw new BadRequestException(
          'Não foi possível identificar sua comanda. Escaneie o QR da mesa novamente.',
        );
      }
      const rows = (await this.tenantConn.query(
        `SELECT COALESCE(SUM(total_cents), 0) as total
         FROM orders
         WHERE table_session_id = $1 AND visit_id = $2
           AND billing_mode = 'individual'
           AND status NOT IN ('cancelled', 'pending_confirmation')`,
        [tableSessionId, effectiveVisitId],
      )) as { total: number }[];
      // O devido inclui a taxa de serviço server-side (settings.service_fee_pct
      // via BillingService) — o backend cobra o MESMO total que exibe.
      billTotals = await this.billing.computeTotals(rows[0].total);
      // P1-A (re-scan 2026-07-04): subtrai o já-pago da MINHA comanda —
      // pagamento confirmed/paid/awaiting_settlement reduz o devido. Sem
      // isso, um 2º request re-cobrava a conta inteira (double-charge).
      const settledForVisit = await this.sumSettled(tableSessionId, effectiveVisitId);
      const outstanding = billTotals.totalCents - settledForVisit;
      if (options.splitMode === 'equal' || options.splitMode === 'by_item') {
        // Decisão Caleb 2026-07-04: "pagar minha parte" cobra a parte
        // CANÔNICA do rateio da mesa, recalculada server-side — o valor
        // enviado precisa bater exatamente (o FE exibe o que o backend
        // calculou).
        if (!callerCustomerId) {
          throw new BadRequestException(
            'Não foi possível identificar você na divisão. Escaneie o QR da mesa novamente.',
          );
        }
        const split = await this.computeSplit(tableSessionId, options.splitMode, []);
        const mine = split.allocations.find((a) => a.customerId === callerCustomerId);
        if (!mine) {
          throw new BadRequestException(
            'Você não está entre os participantes aprovados desta divisão.',
          );
        }
        const sent = options.allocations?.find((a) => a.customerId === callerCustomerId);
        if (!sent || sent.amountCents !== mine.amountCents) {
          throw new BadRequestException(
            `Sua parte na divisão é de ${mine.amountCents} centavos — atualize a tela e tente novamente.`,
          );
        }
        // P1-A: se já paguei parte da minha cota, cobra só o restante.
        amountCents = mine.amountCents - settledForVisit;
        billTotals = {
          subtotalCents: split.subtotalCents,
          serviceFeePct: split.serviceFeePct,
          serviceFeeCents: split.serviceFeeCents,
          totalCents: split.totalCents,
        };
      } else if (options.splitMode && options.allocations?.length) {
        // A allocation do caller casa por customerId (as allocations são
        // chaveadas assim no FE) — antes casava por visitId e nunca batia.
        const myAllocation = callerCustomerId
          ? options.allocations.find((a) => a.customerId === callerCustomerId)
          : undefined;
        if (!myAllocation) {
          throw new BadRequestException(
            'Não encontrei a sua parte na divisão. Atualize a página e tente novamente.',
          );
        }
        // A04-PAY-02 (short-pay): o allocation vem CRU do body (validado só
        // por @Min/@Max no DTO). Clampamos ao saldo real e rejeitamos valor
        // abaixo dele — pagar a menos nunca é fluxo válido do cliente.
        if (myAllocation.amountCents < outstanding) {
          throw new BadRequestException('Valor do pagamento individual abaixo do saldo devido.');
        }
        amountCents = Math.min(myAllocation.amountCents, outstanding);
      } else {
        amountCents = outstanding;
      }
    } else {
      const rows = (await this.tenantConn.query(
        `SELECT COALESCE(SUM(total_cents), 0) as total
         FROM orders
         WHERE table_session_id = $1
           AND billing_mode = 'table'
           AND status NOT IN ('cancelled', 'pending_confirmation')`,
        [tableSessionId],
      )) as { total: number }[];
      billTotals = await this.billing.computeTotals(rows[0].total);
      // P1-A: subtrai o já-pago no escopo da MESA (pagamentos table-scoped,
      // visit_id NULL). Sem isso a conta da mesa era re-cobrada inteira.
      amountCents = billTotals.totalCents - (await this.sumSettled(tableSessionId, null));
    }

    if (amountCents <= 0) {
      throw new BadRequestException('Nenhum valor pendente para pagamento.');
    }

    // Validate split metadata if the caller sent any
    let splitMode: string | null = null;
    let splitAllocations: SplitAllocation[] | null = null;
    if (options.splitMode) {
      if (!VALID_SPLIT_MODES.has(options.splitMode)) {
        throw new BadRequestException(`splitMode invalido: ${options.splitMode}.`);
      }
      splitMode = options.splitMode;
      splitAllocations = options.allocations ?? null;
    }

    // Round 11 (B-NEW-42): SETNX lock por scope antes do SELECT-then-INSERT
    // pra fechar TOCTOU window. Antes 2 POSTs concorrentes ambos viam
    // `existing=[]` e ambos INSERTavam → 2 Pix com QRs diferentes,
    // PSP webhook batia em ambos = double charge.
    const lockKey = `payment_lock:${tableSessionId}:${effectiveVisitId ?? 'table'}`;
    const gotLock = await this.redis.setNX(lockKey, JSON.stringify({ ts: Date.now() }), 30);
    if (!gotLock) {
      throw new BadRequestException('Pagamento sendo processado. Aguarde alguns segundos.');
    }

    try {
      // Reject duplicate pending payments for the same scope. If one exists
      // and has already expired, mark it expired so the user can retry.
      const existing = (await this.tenantConn.query(
        `SELECT id, expires_at FROM payments
         WHERE table_session_id = $1 AND status = 'pending'
           ${effectiveVisitId ? 'AND visit_id = $2' : 'AND visit_id IS NULL'}`,
        effectiveVisitId ? [tableSessionId, effectiveVisitId] : [tableSessionId],
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
      // Continue após dedup limpo.
      return await this.continueRequestPayment({
        tableSessionId,
        visitId: effectiveVisitId,
        mode,
        method,
        amountCents,
        splitMode,
        splitAllocations,
        totals: billTotals,
        options,
      });
    } finally {
      // Libera o lock independente do desfecho — request bem-sucedida
      // grava o INSERT em payments table; subsequente vê via DB.
      await this.redis.del(lockKey);
    }
  }

  /**
   * Round 11 (B-NEW-42): extracted continuation of `requestPayment` pra
   * permitir try/finally do SETNX lock acima sem indentar TODO o método.
   */
  private async continueRequestPayment(input: {
    tableSessionId: string;
    visitId: string | null;
    mode: 'table' | 'individual';
    method: string;
    amountCents: number;
    splitMode: string | null;
    splitAllocations: SplitAllocation[] | null;
    totals: BillTotals;
    options: RequestPaymentOptions;
  }) {
    const { tableSessionId, visitId, method, amountCents, splitMode, splitAllocations } = input;

    // Generate PIX payload only when method is `pix`. Antes, gerávamos
    // sempre — então `pixQrCode`/`pixCopyPaste` vazavam no response de um
    // pagamento de cartão (P2-D-3). Agora null pra method != 'pix' (tanto
    // no INSERT quanto no response).
    const isPix = method === 'pix';
    const pixCode = isPix
      ? `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}5204000053039865406${(amountCents / 100).toFixed(2)}5802BR`
      : null;
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
      pix_qr_code: string | null;
      pix_copy_paste: string | null;
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
      subtotalCents: input.totals.subtotalCents,
      serviceFeeCents: input.totals.serviceFeeCents,
      serviceFeePct: input.totals.serviceFeePct,
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
  async confirmPayment(paymentId: string, tableSessionId: string, pspTransactionId?: string) {
    // M3 (timeline): amount_cents/method/split_mode/visit_id são lidos só
    // pra montar o payload do WS payment.confirmed — nenhuma validação nova.
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id, expires_at,
              amount_cents, method, split_mode, visit_id
       FROM payments WHERE id = $1`,
      [paymentId],
    )) as {
      id: string;
      status: string;
      table_session_id: string;
      expires_at: string | null;
      amount_cents: number | string;
      method: string | null;
      split_mode: string | null;
      visit_id: string | null;
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
    // Confirm idempotente também quando já está aguardando compensação: o
    // cliente pode chamar /confirm mais de uma vez (poll/retry) sem erro.
    if (payment.status === 'awaiting_settlement') {
      return { paymentId, status: 'awaiting_settlement' };
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
    if (payment.expires_at && new Date(payment.expires_at).getTime() <= Date.now()) {
      await this.tenantConn.query(
        `UPDATE payments SET status = 'expired', updated_at = now() WHERE id = $1`,
        [paymentId],
      );
      throw new BadRequestException('Pagamento expirado. Solicite um novo Pix.');
    }

    // A04-PAY-01: o cliente NÃO pode marcar como pago. Sem a flag de
    // mock/dev explicitamente ligada, o confirm só move o pagamento para
    // 'awaiting_settlement' — nunca grava paid_at nem 'confirmed'. A
    // conta continua em aberto até um webhook de PSP autenticado ou uma
    // confirmação manual de staff transicionar de verdade para pago.
    if (!clientConfirmMarksPaid()) {
      await this.tenantConn.query(
        `UPDATE payments
         SET status = 'awaiting_settlement',
             psp_transaction_id = $2, updated_at = now()
         WHERE id = $1`,
        [paymentId, pspTransactionId || null],
      );
      return { paymentId, status: 'awaiting_settlement' };
    }

    const confirmedRows = unwrapRows<{ paid_at: string | Date | null }>(
      await this.tenantConn.query(
        `UPDATE payments
       SET status = 'confirmed', paid_at = now(),
           psp_transaction_id = $2, updated_at = now()
       WHERE id = $1
       RETURNING paid_at`,
        [paymentId, pspTransactionId || null],
      ),
    );

    // M3 (timeline): payment.confirmed — primeiro evento WS da família
    // payments. Emitido DEPOIS do UPDATE (auto-commit) resolver, seguindo o
    // padrão markOrderInTransit: emissão nunca segura/aborta o pagamento.
    // Só o caminho 'confirmed' de verdade emite — awaiting_settlement NÃO é
    // conta paga (A04-PAY-01). customerId fica de fora: payments não tem
    // customer_id (só visit_id) e não inventamos identidade aqui.
    const paidAtRaw = confirmedRows[0]?.paid_at;
    this.eventsGateway?.emitPaymentConfirmed(this.tenantConn.getTenantSlug() ?? '', {
      paymentId,
      tableSessionId,
      amountCents: Number(payment.amount_cents),
      method: payment.method ?? undefined,
      splitMode: payment.split_mode ?? undefined,
      visitId: payment.visit_id ?? undefined,
      confirmedAt: paidAtRaw ? new Date(paidAtRaw).toISOString() : new Date().toISOString(),
      timestamp: new Date().toISOString(),
    });

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

  async getPaymentStatus(paymentId: string, tableSessionId: string) {
    // Filtra por table_session_id pra que cliente em mesa diferente
    // nao consiga ler QR Code Pix / pix_copy_paste / amount_cents de
    // pagamento alheio adivinhando o UUID. P1 do bug-hunt.
    const rows = (await this.tenantConn.query(
      `SELECT id, status, amount_cents, method, pix_qr_code, pix_copy_paste,
              paid_at, created_at, expires_at, cancelled_at,
              split_mode, split_allocations
       FROM payments WHERE id = $1 AND table_session_id = $2`,
      [paymentId, tableSessionId],
    )) as Array<{
      id: string;
      status: string;
      amount_cents: number;
      method: string;
      pix_qr_code: string | null;
      pix_copy_paste: string | null;
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
    if (status === 'pending' && p.expires_at && new Date(p.expires_at).getTime() <= Date.now()) {
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
    _participantIds: string[],
    customAllocations?: SplitAllocation[],
  ): Promise<{
    mode: string;
    subtotalCents: number;
    serviceFeePct: number;
    serviceFeeCents: number;
    totalCents: number;
    allocations: SplitAllocation[];
  }> {
    if (!VALID_SPLIT_MODES.has(mode)) {
      throw new BadRequestException(`splitMode invalido: ${mode}.`);
    }

    // Decisão Caleb 2026-07-04: o rateio é CANÔNICO no backend.
    // Participantes vêm da sessão (aprovados), NUNCA do body.
    const partRows = (await this.tenantConn.query(
      `SELECT customer_id
         FROM session_participants
        WHERE table_session_id = $1
          AND status = 'approved'
          AND left_at IS NULL
        ORDER BY joined_at ASC`,
      [tableSessionId],
    )) as Array<{ customer_id: string }>;
    const participantIds = partRows.map((r) => r.customer_id);
    if (!participantIds.length) {
      throw new BadRequestException('Nenhum participante aprovado na sessão pra dividir.');
    }

    // Conta da MESA (mesma cerca do getBill/POST payments da fatia 1A):
    // comanda individual fica fora — o dono paga a própria.
    const items = (await this.tenantConn.query(
      `SELECT oi.subtotal_cents, oi.customer_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.table_session_id = $1
         AND o.billing_mode = 'table'
         AND o.status NOT IN ('cancelled', 'pending_confirmation')`,
      [tableSessionId],
    )) as { subtotal_cents: number; customer_id: string | null }[];

    const subtotalCents = items.reduce((s, it) => s + Number(it.subtotal_cents), 0);
    if (subtotalCents <= 0) {
      throw new BadRequestException('Nenhum valor pendente para dividir.');
    }
    const totals = await this.billing.computeTotals(subtotalCents);

    let allocations: SplitAllocation[] = [];
    if (mode === 'equal') {
      // Total COM taxa dividido igual; floor + resto pro primeiro (regra
      // de arredondamento estável — o primeiro participante absorve os
      // centavos, nunca a casa).
      const share = Math.floor(totals.totalCents / participantIds.length);
      const remainder = totals.totalCents - share * participantIds.length;
      allocations = participantIds.map((cid, idx) => ({
        customerId: cid,
        amountCents: share + (idx === 0 ? remainder : 0),
      }));
    } else if (mode === 'by_item') {
      // Cada um paga os próprios itens + share igual dos compartilhados,
      // e a taxa sobre a PRÓPRIA parte.
      const totalsByPerson = new Map<string, number>(participantIds.map((id) => [id, 0]));
      const sharedItems = items.filter((it) => !it.customer_id);
      for (const it of items) {
        if (it.customer_id && totalsByPerson.has(it.customer_id)) {
          totalsByPerson.set(
            it.customer_id,
            (totalsByPerson.get(it.customer_id) ?? 0) + Number(it.subtotal_cents),
          );
        }
      }
      const sharedTotal = sharedItems.reduce((s, it) => s + Number(it.subtotal_cents), 0);
      const sharedShare = Math.floor(sharedTotal / participantIds.length);
      const sharedRemainder = sharedTotal - sharedShare * participantIds.length;
      participantIds.forEach((cid, idx) => {
        const bonus = idx === 0 ? sharedRemainder : 0;
        totalsByPerson.set(cid, (totalsByPerson.get(cid) ?? 0) + sharedShare + bonus);
      });
      allocations = participantIds.map((cid) => {
        const sub = totalsByPerson.get(cid) ?? 0;
        return {
          customerId: cid,
          amountCents: sub + Math.round((sub * totals.serviceFeePct) / 100),
        };
      });
    } else {
      // custom — soma deve bater com o total da mesa COM taxa (tolerância
      // de arredondamento de 1 centavo por participante).
      if (!customAllocations?.length) {
        throw new BadRequestException('Para split customizado, envie as allocations.');
      }
      const sum = customAllocations.reduce((s, a) => s + a.amountCents, 0);
      if (Math.abs(sum - totals.totalCents) > participantIds.length) {
        throw new BadRequestException(
          `Soma das alocacoes (${sum}) diferente do total com taxa (${totals.totalCents}).`,
        );
      }
      allocations = customAllocations;
    }

    return {
      mode,
      subtotalCents: totals.subtotalCents,
      serviceFeePct: totals.serviceFeePct,
      serviceFeeCents: totals.serviceFeeCents,
      totalCents: totals.totalCents,
      allocations,
    };
  }

  /**
   * Stub for SP1 "Enviar resumo" — notify staff/room of the split layout
   * without creating a payment. Persists nothing yet; kitchen dashboards can
   * layer on top later. Safe no-op for now so the frontend's CTA works.
   */
  async notifySplit(tableSessionId: string, mode: string, allocations: SplitAllocation[]) {
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
