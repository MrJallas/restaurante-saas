import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { RedisService } from '../../infra/redis/redis.service';
import { BillingService, BillTotals } from '../billing/billing.service';
import { EventsGateway } from '../websocket/events.gateway';

/**
 * ⚠️ Pix é STUB de demonstração (decisão de produto Caleb 2026-07-04) — ver
 * docs/PIX-STATUS.md. O QR/copia-e-cola gerado aqui NÃO é um BR Code de banco;
 * não há PSP nem webhook. Em prod o pagamento nunca chega a 'confirmed'. Isso é
 * INTENCIONAL até haver um cliente fechado — não é bug. O caminho real (PixProvider
 * + webhook = a verificação de que o Pix chegou) está documentado no doc acima.
 */

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
   * (confirmed/paid/awaiting_settlement) no escopo. É o que precisa sair do
   * devido pra não re-cobrar: awaiting_settlement é um Pix em voo, cobrar de
   * novo dobraria a cobrança. 'pending'/'expired'/'cancelled' NÃO contam (o
   * dedup de pending é separado).
   *
   * Re-scan 2026-07-04 (cross-mode scope contamination): o escopo do
   * "já pago" TEM que bater com o escopo do "total devido" de cada modo.
   * A comanda INDIVIDUAL e a parte do RATEIO da mesa compartilham o MESMO
   * visit_id — filtrar só por visit_id somava os pagamentos dos dois modos,
   * fazendo um abater o devido do outro (UNDERCHARGE). Discriminamos por
   * `split_mode`:
   *   - scope 'table'      → visit_id IS NULL (conta cheia da mesa).
   *   - scope 'individual' → visit_id = X AND split_mode IS NULL (comanda).
   *   - scope 'split'      → visit_id = X AND split_mode IS NOT NULL
   *     (parte do rateio da mesa paga por ESTE cliente — o próprio já-pago).
   *
   * Re-scan de convergência 2026-07-04 (DOUBLE-CHARGE cross-scope table↔split):
   *   A conta da MESA é UMA dívida, mas liquida por DOIS caminhos que o fix
   *   cross-mode isolou: mode='table' (visit_id NULL) e split (visit_id=X,
   *   split_mode≠null, um por participante). Isolados, um não via o outro →
   *   nada impedia liquidar a mesa DUAS vezes (A paga tudo por mode=table;
   *   B/C/D abrem 'dividir' e pagam a parte cheia por cima da conta já paga).
   *   O escopo 'table_bill' soma AMBOS os caminhos — table-scope + TODOS os
   *   split-scope (qualquer visita) — porque os dois pagam a MESMA conta da
   *   mesa. É o "já-pago" correto do devido da mesa. A comanda INDIVIDUAL
   *   (split_mode NULL) fica de FORA — dívida separada da pessoa.
   */
  private async sumSettled(
    tableSessionId: string,
    visitId: string | null,
    scope: 'table' | 'individual' | 'split' | 'table_bill',
  ): Promise<number> {
    let scopeClause: string;
    if (scope === 'table') {
      // Conta cheia da mesa: pagamentos table-scoped nunca têm visit_id.
      scopeClause = 'AND visit_id IS NULL';
    } else if (scope === 'table_bill') {
      // Devido da MESA: table-scope (visit_id NULL) + TODOS os split-scope
      // (split_mode≠null, qualquer visita) juntos — ambos pagam a MESMA conta
      // da mesa. Exclui a comanda individual (visit_id=X, split_mode NULL).
      scopeClause = 'AND (visit_id IS NULL OR split_mode IS NOT NULL)';
    } else if (scope === 'split') {
      // Parte do rateio: mesmo visit_id, mas só os pagamentos de rateio
      // (split_mode não-nulo) contam contra a parte canônica da mesa.
      scopeClause = 'AND visit_id = $2 AND split_mode IS NOT NULL';
    } else {
      // Comanda individual: mesmo visit_id, mas só os pagamentos da comanda
      // (sem split_mode) — o rateio da mesa é dívida separada.
      scopeClause = 'AND visit_id = $2 AND split_mode IS NULL';
    }
    const params =
      scope === 'table' || scope === 'table_bill'
        ? [tableSessionId]
        : [tableSessionId, visitId];
    const rows = (await this.tenantConn.query(
      `SELECT COALESCE(SUM(amount_cents), 0) as paid
         FROM payments
        WHERE table_session_id = $1
          AND status IN ('confirmed', 'paid', 'awaiting_settlement')
          ${scopeClause}`,
      params,
    )) as { paid: number | string }[];
    return Number(rows[0]?.paid ?? 0);
  }

  /**
   * DOUBLE-CHARGE CONCORRENTE (re-scan de convergência #3, fix parte b):
   * soma dos pagamentos 'pending' NÃO-expirados table-bill-scoped
   * (visit_id NULL OU split_mode≠null — a MESMA cerca do escopo 'table_bill').
   *
   * Por que reservar contra pending: mesmo com os writes table-bill
   * serializados pelo lock ':tablebill', `sumSettled` só conta o que já
   * liquidou (confirmed/paid/awaiting_settlement). Um pagamento recém-criado
   * entra como 'pending' — se o 2º request (serializado depois) não contasse o
   * pending do 1º, leria o mesmo tableRemaining e re-inseriria em cima. Contar
   * o pending reserva o saldo já em voo → a soma dos INSERTs nunca passa do
   * total da mesa.
   *
   * Por que só NÃO-expirado: pending tem TTL de 10min (PIX_EXPIRY_SECONDS). Um
   * pending expirado NÃO deve reservar saldo pra sempre — o dedup logo abaixo
   * o transiciona pra 'expired', liberando o valor pro retry. O filtro
   * `expires_at IS NULL OR expires_at > now()` alinha esta reserva com aquela
   * expiração: só o que ainda está de pé conta.
   */
  private async sumPendingTableBill(tableSessionId: string): Promise<number> {
    const rows = (await this.tenantConn.query(
      `SELECT COALESCE(SUM(amount_cents), 0) as pending
         FROM payments
        WHERE table_session_id = $1
          AND status = 'pending'
          AND (visit_id IS NULL OR split_mode IS NOT NULL)
          AND (expires_at IS NULL OR expires_at > now())`,
      [tableSessionId],
    )) as { pending: number | string }[];
    return Number(rows[0]?.pending ?? 0);
  }

  async requestPayment(
    tableSessionId: string,
    visitId: string | null,
    mode: 'table' | 'individual',
    method: string,
    options: RequestPaymentOptions = {},
  ) {
    // Pagamento de MESA é por definição visit-less: o sumSettled('table') filtra
    // `visit_id IS NULL` (contra double-charge, P1-A). Se o write-path aceitasse um
    // visitId do body em mode='table', o pagamento cairia num bucket de visit que o
    // sumSettled('table') nunca enxerga → a 2ª cobrança re-cobraria a mesa cheia
    // (P1 do re-scan de convergência). Pinamos null pra alinhar write ↔ sumSettled ↔
    // getBill; o visitId do body só vale no ramo individual (derivado do cookie).
    let effectiveVisitId = mode === 'table' ? null : visitId;
    const callerCustomerId = options.callerCustomerId ?? null;

    // Resolve o visitId da comanda ANTES do lock: o lock per-visit da comanda
    // INDIVIDUAL (sem splitMode) precisa da chave certa `:<visitId>` pra isolar
    // uma dívida separada. O FE não manda visitId — derivamos do cliente
    // RECONHECIDO (cookie). Feito aqui pra que o lockScope tenha o visitId real.
    // (Writes table-bill usam ':tablebill' e nem dependem disto.)
    if (mode === 'individual' && !effectiveVisitId && callerCustomerId) {
      const vrows = (await this.tenantConn.query(
        `SELECT id FROM visits
         WHERE table_session_id = $1 AND customer_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [tableSessionId, callerCustomerId],
      )) as { id: string }[];
      effectiveVisitId = vrows[0]?.id ?? null;
    }

    // Round 11 (B-NEW-42): SETNX lock por scope ENVOLVENDO o read-then-INSERT
    // pra fechar a janela TOCTOU. Antes 2 POSTs concorrentes ambos viam
    // `existing=[]` e ambos INSERTavam → 2 Pix com QRs diferentes, PSP webhook
    // batia em ambos = double charge.
    //
    // DOUBLE-CHARGE CONCORRENTE cross-scope (re-scan de convergência #3):
    // o lock per-visit NÃO serializava os caminhos que liquidam a MESMA conta
    // da mesa. mode=table pegava ':table'; cada split payer pegava ':<seu
    // visitId>' (distinto por cliente) — chaves DIFERENTES, então mode=table
    // vs split e dois splits de visitas distintas rodavam o
    // sumSettled(table_bill)+clamp+INSERT em PARALELO, cada um lendo o mesmo
    // tableRemaining ANTES de qualquer INSERT → coletavam > total da mesa.
    //
    // Fix (a): os writes table-bill-scoped (mode=table OU mode=individual COM
    // splitMode) compartilham UMA chave ':tablebill' — serializa mode=table e
    // TODOS os splits entre si. A comanda INDIVIDUAL (sem splitMode) é dívida
    // separada e mantém o lock per-visit. O lock é adquirido AQUI (antes das
    // leituras de saldo), não depois, pra que o sumSettled/clamp de cada
    // caminho leia o estado JÁ com o INSERT do caminho anterior visível.
    const splitModeRequested =
      typeof options.splitMode === 'string' && VALID_SPLIT_MODES.has(options.splitMode);
    const isTableBillWrite = mode === 'table' || (mode === 'individual' && splitModeRequested);
    const lockScope = isTableBillWrite ? 'tablebill' : (effectiveVisitId ?? 'table');
    const lockKey = `payment_lock:${tableSessionId}:${lockScope}`;
    const gotLock = await this.redis.setNX(lockKey, JSON.stringify({ ts: Date.now() }), 30);
    if (!gotLock) {
      throw new BadRequestException('Pagamento sendo processado. Aguarde alguns segundos.');
    }

    try {
      return await this.computeAndInsertPayment({
        tableSessionId,
        visitId,
        mode,
        method,
        options,
        effectiveVisitId,
        callerCustomerId,
      });
    } finally {
      // Libera o lock independente do desfecho — request bem-sucedida gravou o
      // INSERT (auto-commit) que o próximo lock holder já enxerga via DB.
      await this.redis.del(lockKey);
    }
  }

  /**
   * Núcleo do requestPayment: roda SEMPRE dentro do lock adquirido acima.
   * Faz o read-then-INSERT (sumSettled + clamp + dedup + INSERT) de forma
   * serializada pelo lock, então o clamp de cada caminho enxerga os
   * pagamentos (settled E pending) dos caminhos anteriores.
   */
  private async computeAndInsertPayment(input: {
    tableSessionId: string;
    visitId: string | null;
    mode: 'table' | 'individual';
    method: string;
    options: RequestPaymentOptions;
    effectiveVisitId: string | null;
    callerCustomerId: string | null;
  }) {
    const { tableSessionId, mode, method, options, callerCustomerId } = input;
    // effectiveVisitId já vem resolvido de requestPayment (a busca de visita
    // roda antes do lock, pra o lock per-visit da comanda ter a chave certa).
    const effectiveVisitId = input.effectiveVisitId;
    let amountCents: number;
    let billTotals: BillTotals;

    if (mode === 'individual') {
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
      if (
        options.splitMode === 'equal' ||
        options.splitMode === 'by_item' ||
        options.splitMode === 'custom'
      ) {
        // Decisão Caleb 2026-07-04: "pagar minha parte" cobra a parte
        // CANÔNICA do rateio da MESA, recalculada server-side — o valor
        // enviado precisa bater exatamente (o FE exibe o que o backend
        // calculou). Para 'custom', o FE também manda as allocations de
        // TODOS os participantes: o computeSplit valida que a soma bate com
        // o total da mesa (com taxa) antes de aceitar a divisão — é assim
        // que o short-pay (A04-PAY-02) fica barrado no modo customizado.
        if (!callerCustomerId) {
          throw new BadRequestException(
            'Não foi possível identificar você na divisão. Escaneie o QR da mesa novamente.',
          );
        }
        // custom precisa das allocations completas (a soma é validada contra
        // o total da mesa dentro do computeSplit); equal/by_item ignoram.
        const split = await this.computeSplit(
          tableSessionId,
          options.splitMode,
          [],
          options.splitMode === 'custom' ? options.allocations : undefined,
        );
        const mine = split.allocations.find((a) => a.customerId === callerCustomerId);
        if (!mine) {
          throw new BadRequestException(
            'Você não está entre os participantes desta divisão. Atualize a tela e tente novamente.',
          );
        }
        // Re-scan 2026-07-04 (check tautológico no custom): comparar o valor
        // ENVIADO pelo cliente contra o CANÔNICO server-side. Snapshot do
        // enviado ANTES de qualquer normalização — no custom, computeSplit
        // devolvia `options.allocations` verbatim, então `mine` e o find em
        // `options.allocations` eram o MESMO objeto e `sent !== mine` nunca
        // barrava nada. Guardamos o amountCents enviado por primitivo.
        const sentAmount = options.allocations?.find(
          (a) => a.customerId === callerCustomerId,
        )?.amountCents;
        if (sentAmount === undefined || sentAmount !== mine.amountCents) {
          throw new BadRequestException(
            `Sua parte na divisão é de ${mine.amountCents} centavos — atualize a tela e tente novamente.`,
          );
        }
        // A parte canônica do caller tem que ser estritamente positiva: no
        // custom a soma bater com o total da mesa NÃO impede um caller de se
        // cobrar 0/negativo e jogar a conta nos outros (o check tautológico
        // deixava passar). Ninguém "paga a própria parte" com <= 0.
        if (mine.amountCents <= 0) {
          throw new BadRequestException(
            'Sua parte na divisão precisa ser maior que zero. Atualize a tela e tente novamente.',
          );
        }
        // P1-A + cross-mode scope: subtrai o já-pago DO PRÓPRIO rateio deste
        // cliente (mesmo visit, split_mode não-nulo) pra não re-cobrar retries
        // dele. Um pagamento da comanda individual (split_mode NULL) NÃO abate.
        const settledForSplit = await this.sumSettled(tableSessionId, effectiveVisitId, 'split');
        // DOUBLE-CHARGE cross-scope (re-scan de convergência): table e split
        // pagam a MESMA conta da mesa. A parte canônica sozinha não protege a
        // mesa de ser liquidada duas vezes (A paga tudo por mode=table; B abre
        // split → parte cheia por cima). Limitamos o cobrado ao que a MESA
        // AINDA deve = total da mesa - (já-pago table-scope + TODOS os splits).
        // Assim: mesa já quitada → 0 (recusa); table parcial → cobra só o que
        // falta; e a soma coletada NUNCA passa do total da mesa.
        // Reserva contra pending (fix parte b): além do já-liquidado
        // (settled), subtrai os pagamentos 'pending' NÃO-expirados
        // table-bill-scoped em voo. Serializado pelo lock ':tablebill', o 2º
        // request vê o pending que o 1º acabou de INSERTar e não re-cobra por
        // cima. Sem isto, mesmo serializados, a soma dos INSERTs passaria do
        // total da mesa.
        const settledTableBill = await this.sumSettled(tableSessionId, null, 'table_bill');
        const pendingTableBill = await this.sumPendingTableBill(tableSessionId);
        const tableRemaining = split.totalCents - settledTableBill - pendingTableBill;
        amountCents = Math.min(mine.amountCents - settledForSplit, tableRemaining);
        billTotals = {
          subtotalCents: split.subtotalCents,
          discountCents: split.discountCents,
          discountLabel: split.discountLabel,
          serviceFeePct: split.serviceFeePct,
          serviceFeeCents: split.serviceFeeCents,
          totalCents: split.totalCents,
        };
      } else {
        // Comanda individual pura: subtrai só o já-pago DA COMANDA (mesmo
        // visit, split_mode NULL). Um pagamento do rateio da mesa
        // (split_mode não-nulo) NÃO abate a comanda individual.
        const settledForVisit = await this.sumSettled(
          tableSessionId,
          effectiveVisitId,
          'individual',
        );
        amountCents = billTotals.totalCents - settledForVisit;
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
      // P1-A + DOUBLE-CHARGE cross-scope: subtrai o já-pago da conta da MESA —
      // table-scope (visit_id NULL) E TODOS os splits (split_mode≠null). Antes
      // só descontava table-scope, então uma mesa já liquidada via 'dividir'
      // (todos pagaram suas partes) era re-cobrada INTEIRA por um mode=table.
      // A comanda individual fica de fora (dívida separada).
      //
      // Reserva contra pending (fix parte b): subtrai também os pagamentos
      // 'pending' NÃO-expirados table-bill-scoped em voo. Serializado pelo lock
      // ':tablebill' com os splits, um mode=table concorrente com um split (ou
      // com outro mode=table) enxerga o pending do caminho anterior e não
      // re-cobra a mesa por cima.
      amountCents =
        billTotals.totalCents -
        (await this.sumSettled(tableSessionId, null, 'table_bill')) -
        (await this.sumPendingTableBill(tableSessionId));
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
    // Continue após dedup limpo (dentro do lock adquirido em requestPayment).
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
      discountCents: input.totals.discountCents,
      discountLabel: input.totals.discountLabel,
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
    discountCents: number;
    discountLabel: string | null;
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
      // ITEM ÓRFÃO (re-scan 2026-07-04): um item pode ter customer_id de um
      // participante que SAIU depois de pedir (left_at setado — só o índice
      // parcial some, a row do pedido permanece na conta da mesa). Esse dono
      // não está em `participantIds` (derivado dos presentes). Antes o item
      // caía FORA de todos os buckets: não era do próprio (has() falso) e não
      // era compartilhado (customer_id não-nulo), então a soma das allocations
      // ficava MENOR que o total da mesa — subcobrança (um buraco que ninguém
      // pagava). Como não há caminho que reatribua/remova o pedido de quem
      // sai, o valor continua devido pela mesa: redistribuímos o item órfão
      // como COMPARTILHADO entre os presentes (mesmo tratamento de item sem
      // dono). Assim as partes fecham o total da mesa.
      const present = totalsByPerson;
      const sharedItems = items.filter((it) => !it.customer_id || !present.has(it.customer_id));
      for (const it of items) {
        if (it.customer_id && present.has(it.customer_id)) {
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
      // Desconto de promoção (round 2026-07-05): a promoção incide sobre a
      // conta da MESA (totals.discountCents). No by_item cada um paga a
      // PRÓPRIA parte, então o desconto é rateado PROPORCIONALMENTE ao
      // subtotal de cada pessoa e a taxa incide sobre a parte JÁ DESCONTADA —
      // mesma ordem canônica do BillingService (desconto → taxa). Sem isto o
      // by_item cobraria o cheio e o guard de soma (contra totals.totalCents,
      // que JÁ é descontado) estouraria.
      const discountCents = totals.discountCents;
      allocations = participantIds.map((cid) => {
        const sub = totalsByPerson.get(cid) ?? 0;
        const personDiscount =
          subtotalCents > 0 ? Math.round((sub * discountCents) / subtotalCents) : 0;
        const discountedSub = Math.max(0, sub - personDiscount);
        return {
          customerId: cid,
          amountCents: discountedSub + Math.round((discountedSub * totals.serviceFeePct) / 100),
        };
      });
      // GUARD DE SOMA (re-scan 2026-07-04): espelha o check do custom — a soma
      // das partes TEM que fechar o total da mesa com taxa. Blinda contra
      // qualquer item que escape dos buckets (órfão redistribuído mal, dado
      // sujo) virar buraco silencioso no pay-path. Tolerância de
      // arredondamento: a taxa é aplicada per-capita e arredondada por pessoa,
      // então o desvio possível é até ~1 centavo por participante.
      // Tolerância: taxa arredondada por pessoa (~1 centavo/participante) +
      // desconto rateado e arredondado por pessoa (mais ~1 centavo/participante
      // quando há promoção). 2 centavos/participante cobre os dois sem deixar
      // passar buraco real.
      const byItemSum = allocations.reduce((s, a) => s + a.amountCents, 0);
      if (Math.abs(byItemSum - totals.totalCents) > 2 * participantIds.length) {
        throw new BadRequestException(
          `Soma das partes (${byItemSum}) diferente do total da mesa com taxa (${totals.totalCents}).`,
        );
      }
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
      discountCents: totals.discountCents,
      discountLabel: totals.discountLabel,
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
