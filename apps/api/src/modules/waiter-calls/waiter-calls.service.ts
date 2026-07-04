import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { BillingService } from '../billing/billing.service';
import { EventsGateway } from '../websocket/events.gateway';

/** Whitelist kept in-sync with WaiterCallReason in packages/shared-types. */
const VALID_REASONS = new Set(['bring_menu', 'place_order', 'serve_drink', 'ask_bill', 'other']);

// "Ativo" tem que casar EXATAMENTE com o predicado do índice único parcial
// `waiter_calls_one_active_per_session` (migration 057) e do ON CONFLICT do
// createCall. 'accepted'/'enroute' nunca são escritos nesta tabela (são
// vocabulário de pedido/handoff) — fora daqui pra não abrir footgun: se algo
// um dia gravar esses status, a garantia de 1-ativo-por-mesa do índice não os
// cobriria e createCall reabriria a corrida de chamado duplicado.
const ACTIVE_STATUSES = ['pending', 'acknowledged'];

export interface CreateWaiterCallOptions {
  reason?: string;
  customerId?: string | null;
  visitId?: string | null;
}

@Injectable()
export class WaiterCallsService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly eventsGateway: EventsGateway,
    private readonly billing: BillingService,
  ) {}

  async createCall(tableSessionId: string, slug: string, options: CreateWaiterCallOptions = {}) {
    const reason = options.reason ?? 'other';
    if (!VALID_REASONS.has(reason)) {
      throw new BadRequestException(`Motivo invalido: ${reason}.`);
    }

    const sessions = (await this.tenantConn.query(
      `SELECT ts.id, t.label, t.code
       FROM table_sessions ts
       JOIN tables t ON t.id = ts.table_id
       WHERE ts.id = $1`,
      [tableSessionId],
    )) as { id: string; label: string; code: string }[];

    if (!sessions.length) {
      throw new BadRequestException('Sessao nao encontrada.');
    }

    const tableInfo = sessions[0];

    // Round 5 (P2-2): cria OU retorna o chamado ativo de forma ATÔMICA. O
    // índice único parcial `waiter_calls_one_active_per_session` (migration
    // 057) garante no máximo 1 chamado ativo por mesa; sob N POSTs
    // concorrentes todos resolvem na MESMA linha (mesmo callId) via
    // ON CONFLICT, em vez do antigo SELECT-then-INSERT que corria e abria N
    // chamados. A UI do cliente mostra "Aguardando garçom" até cancelar/resolver.
    const rows = (await this.tenantConn.query(
      `INSERT INTO waiter_calls (table_session_id, status, reason, customer_id, visit_id)
       VALUES ($1, 'pending', $2, $3, $4)
       ON CONFLICT (table_session_id) WHERE status IN ('pending', 'acknowledged')
       DO UPDATE SET reason = EXCLUDED.reason
       RETURNING id, status, reason, created_at, assigned_waiter_name, eta_minutes,
                 (xmax = 0) AS was_inserted`,
      [tableSessionId, reason, options.customerId ?? null, options.visitId ?? null],
    )) as {
      id: string;
      status: string;
      reason: string;
      created_at: string;
      assigned_waiter_name: string | null;
      eta_minutes: number | null;
      was_inserted: boolean;
    }[];

    const call = rows[0];

    // Só emite o WS de "novo chamado" quando REALMENTE inseriu — um re-POST
    // que caiu no ON CONFLICT não deve re-notificar o garçom.
    if (call.was_inserted) {
      this.eventsGateway.emitWaiterCall(slug, {
        callId: call.id,
        tableLabel: tableInfo.label,
        tableCode: tableInfo.code,
        reason: call.reason,
        // M2 (timeline): sessão + customer resolvido SERVER-SIDE (round 8
        // B-NEW-27: controller deriva do cookie, nunca do body).
        tableSessionId,
        customerId: options.customerId ?? null,
      });
    }

    return {
      callId: call.id,
      status: call.status,
      reason: call.reason,
      createdAt: call.created_at,
      waiterName: call.assigned_waiter_name ?? undefined,
      etaMinutes: call.eta_minutes ?? undefined,
    };
  }

  /**
   * Customer-facing polling endpoint. Returns the status + the waiter's name
   * and ETA once the staff app has acknowledged the call.
   */
  async getActiveCall(tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, reason, created_at, acknowledged_at, resolved_at,
              cancelled_at, assigned_waiter_name, eta_minutes
       FROM waiter_calls
       WHERE table_session_id = $1 AND status = ANY($2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [tableSessionId, ACTIVE_STATUSES],
    )) as Array<{
      id: string;
      status: string;
      reason: string;
      created_at: string;
      acknowledged_at: string | null;
      resolved_at: string | null;
      cancelled_at: string | null;
      assigned_waiter_name: string | null;
      eta_minutes: number | null;
    }>;

    if (!rows.length) return null;
    const call = rows[0];
    return {
      callId: call.id,
      status: call.status,
      reason: call.reason,
      createdAt: call.created_at,
      acknowledgedAt: call.acknowledged_at,
      resolvedAt: call.resolved_at,
      cancelledAt: call.cancelled_at,
      waiterName: call.assigned_waiter_name ?? undefined,
      etaMinutes: call.eta_minutes ?? undefined,
    };
  }

  async getCall(callId: string, tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, reason, created_at, acknowledged_at, resolved_at,
              cancelled_at, assigned_waiter_name, eta_minutes, table_session_id
       FROM waiter_calls WHERE id = $1`,
      [callId],
    )) as Array<{
      id: string;
      status: string;
      reason: string;
      created_at: string;
      acknowledged_at: string | null;
      resolved_at: string | null;
      cancelled_at: string | null;
      assigned_waiter_name: string | null;
      eta_minutes: number | null;
      table_session_id: string;
    }>;

    if (!rows.length) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    const call = rows[0];
    // Scope check — don't let a customer peek at another table's calls.
    if (call.table_session_id !== tableSessionId) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    return {
      callId: call.id,
      status: call.status,
      reason: call.reason,
      createdAt: call.created_at,
      acknowledgedAt: call.acknowledged_at,
      resolvedAt: call.resolved_at,
      cancelledAt: call.cancelled_at,
      waiterName: call.assigned_waiter_name ?? undefined,
      etaMinutes: call.eta_minutes ?? undefined,
    };
  }

  /**
   * Detalhe do chamado pro STAFF (auditoria 2026-07-03): a tela do garçom
   * era placebo (R$ 612,40 hardcoded — maquininha com valor errado). Aqui
   * vai a mesa REAL e a conta REAL da sessão inteira (todos os billing
   * modes: é o fechamento presencial), com a MESMA taxa do POST /payments.
   */
  async getCallStaffDetail(callId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT wc.id, wc.status, wc.reason, wc.created_at, wc.acknowledged_at,
              wc.resolved_at, wc.cancelled_at, wc.assigned_waiter_name,
              wc.eta_minutes, wc.table_session_id,
              t.label AS table_label, t.code AS table_code
         FROM waiter_calls wc
         JOIN table_sessions ts ON ts.id = wc.table_session_id
         JOIN tables t ON t.id = ts.table_id
        WHERE wc.id = $1`,
      [callId],
    )) as Array<{
      id: string;
      status: string;
      reason: string;
      created_at: string;
      acknowledged_at: string | null;
      resolved_at: string | null;
      cancelled_at: string | null;
      assigned_waiter_name: string | null;
      eta_minutes: number | null;
      table_session_id: string;
      table_label: string;
      table_code: string;
    }>;
    if (!rows.length) {
      throw new NotFoundException('Chamado nao encontrado.');
    }
    const call = rows[0];

    const sumRows = (await this.tenantConn.query(
      `SELECT COALESCE(SUM(total_cents), 0) AS total
         FROM orders
        WHERE table_session_id = $1
          AND status NOT IN ('cancelled', 'pending_confirmation')`,
      [call.table_session_id],
    )) as Array<{ total: unknown }>;
    const bill = await this.billing.computeTotals(Number(sumRows[0]?.total ?? 0));

    return {
      callId: call.id,
      status: call.status,
      reason: call.reason,
      createdAt: call.created_at,
      acknowledgedAt: call.acknowledged_at,
      resolvedAt: call.resolved_at,
      cancelledAt: call.cancelled_at,
      waiterName: call.assigned_waiter_name ?? undefined,
      etaMinutes: call.eta_minutes ?? undefined,
      tableLabel: call.table_label,
      tableCode: call.table_code,
      bill: {
        subtotalCents: bill.subtotalCents,
        serviceFeePct: bill.serviceFeePct,
        serviceFeeCents: bill.serviceFeeCents,
        totalCents: bill.totalCents,
      },
    };
  }

  async acknowledgeCall(
    callId: string,
    slug: string,
    staffId: string,
    staffName?: string,
    etaMinutes?: number,
  ) {
    const staffRows = (await this.tenantConn.query(
      `SELECT name FROM staff WHERE id = $1 AND is_active = true`,
      [staffId],
    )) as Array<{ name: string }>;
    const effectiveStaffName = staffName ?? staffRows[0]?.name ?? null;

    // Round 5 (B-NEW-14): UPDATE atômico em vez de SELECT-then-UPDATE.
    // Antes: 2 garçons clicando "atender" simultaneamente passavam pelo
    // SELECT (status=pending), ambos UPDATE — segundo sobrescrevia
    // assigned_waiter_name do primeiro, e o WS event acknowledged disparava
    // 2x (mesmo padrão errado de B-NEW-1 round 3 em complaints).
    //
    // Agora: WHERE id=$1 AND status='pending' garante que só 1 UPDATE
    // efetivamente flipa o status. RETURNING expõe se a row foi tocada.
    // 0 rows = "ja foi atendido" (segundo garçom no race) ou "callId
    // inexistente" (NotFoundException distinta).
    // unwrapRows: UPDATE…RETURNING chega como [rows, count] — o cast cru
    // fazia updated.length ser sempre 2, o guard do race nunca disparar e
    // o WS acknowledged sair com table_session_id undefined.
    const updated = unwrapRows<{ id: string; table_session_id: string }>(
      await this.tenantConn.query(
        `UPDATE waiter_calls
       SET status = 'acknowledged',
           acknowledged_at = now(),
           acknowledged_by = $2,
           assigned_waiter_name = COALESCE($3, assigned_waiter_name),
           eta_minutes = COALESCE($4, eta_minutes)
       WHERE id = $1 AND status = 'pending'
       RETURNING id, table_session_id`,
        [callId, staffId, effectiveStaffName, etaMinutes ?? null],
      ),
    );

    if (!updated.length) {
      // Distinguir "não existe" de "já atendido" pra UX correta.
      const probe = (await this.tenantConn.query(`SELECT status FROM waiter_calls WHERE id = $1`, [
        callId,
      ])) as { status: string }[];
      if (!probe.length) {
        throw new NotFoundException('Chamado nao encontrado.');
      }
      throw new BadRequestException('Chamado ja foi atendido.');
    }

    // M2 (timeline): quem atendeu + ETA agora vão no WS (antes só no
    // response REST). staffId é identidade validada server-side
    // (requireActiveStaffId); effectiveStaffName vem do banco.
    this.eventsGateway.emitWaiterCallAcknowledged(slug, callId, updated[0].table_session_id, {
      acknowledgedBy: { id: staffId, name: effectiveStaffName },
      etaMinutes: etaMinutes ?? null,
    });

    return {
      callId,
      status: 'acknowledged',
      waiterName: effectiveStaffName ?? undefined,
      etaMinutes,
    };
  }

  async resolveCall(callId: string) {
    await this.tenantConn.query(
      `UPDATE waiter_calls
       SET status = 'resolved', resolved_at = now()
       WHERE id = $1 AND status IN ('pending', 'acknowledged')`,
      [callId],
    );
    return { callId, status: 'resolved' };
  }

  /**
   * Customer cancels their own pending call (SW2 "Cancelar chamado"). A
   * call that's already acknowledged cannot be cancelled — the waiter is
   * already on their way.
   */
  async cancelCall(callId: string, tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id FROM waiter_calls WHERE id = $1`,
      [callId],
    )) as { id: string; status: string; table_session_id: string }[];

    if (!rows.length) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    const call = rows[0];
    if (call.table_session_id !== tableSessionId) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    if (call.status === 'cancelled') {
      return { callId, status: 'cancelled' };
    }
    // P1-R (re-scan 2026-07-03): 'acknowledged' NÃO pode ser cancelado — o
    // garçom já está a caminho (é o que o docstring promete). O gate antigo
    // usava `ACTIVE_STATUSES` (que INCLUI 'acknowledged'), então acknowledged
    // passava e caía no UPDATE sem `WHERE status='pending'`, cancelando um
    // chamado já atendido sem NENHUM WS pro garçom — ele continuava andando
    // pra um chamado que sumiu silenciosamente. Barrar é o conservador.
    if (call.status === 'acknowledged') {
      throw new BadRequestException('Chamado já atendido, não pode cancelar.');
    }
    if (call.status !== 'pending') {
      // resolved/qualquer outro estado terminal — nada a cancelar.
      return { callId, status: call.status };
    }

    // `WHERE status = 'pending'` como guarda de corrida: se o garçom atender
    // no intervalo entre o SELECT e este UPDATE, o cancelamento não flipa
    // um chamado já 'acknowledged'.
    await this.tenantConn.query(
      `UPDATE waiter_calls SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [callId],
    );

    return { callId, status: 'cancelled' };
  }

  async getPendingCalls() {
    // `ts.flags` is required by `priorityOf()` (see
    // apps/api/src/modules/vip/priority.util.ts and
    // docs/features/vip-customer.md). Migration 031 added
    // `table_sessions.flags text[]`.
    return this.tenantConn.query(
      `SELECT wc.id, wc.status, wc.reason, wc.created_at,
              wc.assigned_waiter_name, wc.eta_minutes,
              t.label as table_label, t.code as table_code,
              COALESCE(ts.flags, '{}') as flags
       FROM waiter_calls wc
       JOIN table_sessions ts ON ts.id = wc.table_session_id
       JOIN tables t ON t.id = ts.table_id
       WHERE wc.status = 'pending'
       ORDER BY wc.created_at ASC`,
    );
  }
}
