import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { ConsumptionSummaryService } from './consumption-summary.service';
import { EventsGateway } from '../websocket/events.gateway';
import { OrderRatingsService } from '../order-ratings/order-ratings.service';

/**
 * Fluxo de ENTREGA (call-waiter → claim/in-transit → delivered), extraído do
 * orders.service (FASE 2 · decomposição). Bloco 100% autocontido: corpos
 * movidos VERBATIM, invariantes congeladas em order-delivery.service.test.ts
 * (re-call id/nome do mesmo garçom; resolve degrada com timezone inválida;
 * corrida do ON CONFLICT no claim; delivered idempotente sem re-side-effects).
 *
 * Motivo de ser AGORA: o roteamento de entregas por ZONA prioritária
 * (decisão Caleb 2026-07-04) vai mexer exatamente no resolveTargetWaiter —
 * a feature aterrissa aqui, num serviço pequeno e coberto, não no god-file.
 */
@Injectable()
export class OrderDeliveryService {
  private readonly logger = new Logger(OrderDeliveryService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly consumption: ConsumptionSummaryService,
    @Optional() private readonly eventsGateway?: EventsGateway,
    @Optional() private readonly orderRatings?: OrderRatingsService,
  ) {}

  async callWaiterForOrder(orderId: string, slug: string, staffId: string | null) {
    const orderRows = (await this.tenantConn.query(
      `SELECT o.id, o.status, o.table_session_id, t.label AS table_label, t.code AS table_code,
              z.name AS zone_name
         FROM orders o
         JOIN table_sessions ts ON ts.id = o.table_session_id
         JOIN tables t ON t.id = ts.table_id
         LEFT JOIN zones z ON z.id = t.zone_id
        WHERE o.id = $1`,
      [orderId],
    )) as Array<{
      id: string;
      status: string;
      table_session_id: string;
      table_label: string;
      table_code: string;
      zone_name: string | null;
    }>;

    if (!orderRows.length) {
      throw new NotFoundException('Pedido nao encontrado.');
    }
    const order = orderRows[0];
    if (order.status !== 'ready') {
      throw new BadRequestException('Pedido precisa estar pronto para chamar garcom.');
    }

    const target = await this.resolveTargetWaiter(order.table_session_id);
    const deliveryRows = (await this.tenantConn.query(
      `INSERT INTO order_deliveries
         (order_id, status, called_by, called_at, target_waiter_id)
       VALUES ($1, 'pending', $2, now(), $3)
       ON CONFLICT (order_id) WHERE status != 'cancelled'
       DO UPDATE SET
         called_by = COALESCE(order_deliveries.called_by, EXCLUDED.called_by),
         called_at = COALESCE(order_deliveries.called_at, EXCLUDED.called_at),
         target_waiter_id = COALESCE(order_deliveries.target_waiter_id, EXCLUDED.target_waiter_id)
       RETURNING id, status, called_at, target_waiter_id`,
      [orderId, staffId, target.id],
    )) as Array<{
      id: string;
      status: string;
      called_at: string;
      target_waiter_id: string | null;
    }>;
    const delivery = deliveryRows[0];

    // Re-call: o ON CONFLICT mantém o target_waiter_id ORIGINAL (COALESCE),
    // mas `target` veio de um resolve fresco — podia divergir e o payload
    // saía com id de A e nome de B (cozinha cobrando o garçom errado,
    // achado do code-review). Garante que nome e id são do MESMO garçom.
    let targetWaiterName = target.name;
    if (delivery.target_waiter_id && delivery.target_waiter_id !== target.id) {
      const persisted = (await this.tenantConn.query(`SELECT name FROM staff WHERE id = $1`, [
        delivery.target_waiter_id,
      ])) as Array<{ name: string }>;
      targetWaiterName = persisted[0]?.name ?? null;
    }

    this.eventsGateway?.emitOrderHandoffCalled(slug, {
      orderId,
      deliveryId: delivery.id,
      tableLabel: order.table_label,
      tableCode: order.table_code,
      zoneName: order.zone_name,
      targetWaiterId: delivery.target_waiter_id,
      targetWaiterName,
      // M2 (timeline): sessão + quem chamou (staff validado no controller
      // via requireActiveStaffId; null = estação/TV sem x-staff-id).
      tableSessionId: order.table_session_id,
      calledBy: staffId,
    });
    this.eventsGateway?.emitOrderStatusUpdate(slug, orderId, 'ready', order.table_label, {
      tableSessionId: order.table_session_id,
      changedBy: { type: 'staff', id: staffId },
    });

    return {
      orderId,
      deliveryId: delivery.id,
      deliveryStatus: delivery.status,
      calledAt: delivery.called_at,
      zoneName: order.zone_name,
      targetWaiterId: delivery.target_waiter_id,
      targetWaiterName,
    };
  }

  async markOrderInTransit(orderId: string, slug: string, staffId: string) {
    const result = await this.tenantConn.transaction(async (tx) => {
      const orderRows = (await tx.query(
        `SELECT o.id, o.status, o.table_session_id, t.label AS table_label
           FROM orders o
           JOIN table_sessions ts ON ts.id = o.table_session_id
           JOIN tables t ON t.id = ts.table_id
          WHERE o.id = $1
          FOR UPDATE`,
        [orderId],
      )) as Array<{
        id: string;
        status: string;
        table_session_id: string;
        table_label: string;
      }>;
      if (!orderRows.length) {
        throw new NotFoundException('Pedido nao encontrado.');
      }
      const order = orderRows[0];
      if (!['ready', 'in_transit'].includes(order.status)) {
        throw new BadRequestException('Pedido precisa estar pronto para entrar em transito.');
      }

      const existing = (await tx.query(
        `SELECT id, status, claimed_by
           FROM order_deliveries
          WHERE order_id = $1
            AND status != 'cancelled'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [orderId],
      )) as Array<{ id: string; status: string; claimed_by: string | null }>;

      const claimExistingRow = async (current: {
        id: string;
        status: string;
        claimed_by: string | null;
      }) => {
        if (current.status === 'claimed' && current.claimed_by && current.claimed_by !== staffId) {
          throw new BadRequestException('Pedido ja esta sendo levado por outro garcom.');
        }
        if (current.status === 'delivered') {
          throw new BadRequestException('Pedido ja foi entregue.');
        }
        const updated = unwrapRows<{ id: string; status: string; claimed_by: string | null }>(
          await tx.query(
            `UPDATE order_deliveries
                SET status = 'claimed',
                    claimed_by = COALESCE(claimed_by, $2),
                    claimed_at = COALESCE(claimed_at, now()),
                    target_waiter_id = COALESCE(target_waiter_id, $2)
              WHERE id = $1
              RETURNING id, status, claimed_by`,
            [current.id, staffId],
          ),
        );
        return updated[0];
      };

      let delivery: { id: string; status: string; claimed_by: string | null };
      if (!existing.length) {
        // ON CONFLICT DO NOTHING: o call-waiter da TV roda fora de transação
        // e pode commitar a row 'pending' entre o SELECT vazio acima e este
        // INSERT — sem o arbiter, o índice parcial único (migration 038)
        // estourava 23505 cru → HTTP 500 pro garçom (achado do code-review).
        // DO NOTHING não aborta a transação; ao perder a corrida, re-lê a
        // row vencedora e segue o caminho normal de claim.
        const inserted = (await tx.query(
          `INSERT INTO order_deliveries
             (order_id, status, claimed_by, claimed_at, called_at, target_waiter_id)
           VALUES ($1, 'claimed', $2, now(), now(), $2)
           ON CONFLICT (order_id) WHERE status != 'cancelled' DO NOTHING
           RETURNING id, status, claimed_by`,
          [orderId, staffId],
        )) as Array<{ id: string; status: string; claimed_by: string | null }>;
        if (inserted.length) {
          delivery = inserted[0];
        } else {
          const raced = (await tx.query(
            `SELECT id, status, claimed_by
               FROM order_deliveries
              WHERE order_id = $1
                AND status != 'cancelled'
              ORDER BY created_at DESC
              LIMIT 1
              FOR UPDATE`,
            [orderId],
          )) as Array<{ id: string; status: string; claimed_by: string | null }>;
          if (!raced.length) {
            throw new BadRequestException('Nao foi possivel registrar a entrega. Tente novamente.');
          }
          delivery = await claimExistingRow(raced[0]);
        }
      } else {
        delivery = await claimExistingRow(existing[0]);
      }

      let historyId: string | undefined;
      if (order.status !== 'in_transit') {
        await tx.query(
          `UPDATE orders SET status = 'in_transit', updated_at = now() WHERE id = $1`,
          [orderId],
        );
        // FIX convergência de id: captura o pk da row osh 'in_transit' pra
        // correlacionar o evento live (tap M4) com o backfill (M5).
        const historyRows = unwrapRows<{ id: string }>(
          await tx.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
           VALUES ($1, $2, 'in_transit', $3)
           RETURNING id`,
            [orderId, order.status, staffId],
          ),
        );
        historyId = historyRows[0]?.id;
      }

      return {
        orderId,
        deliveryId: delivery.id,
        tableSessionId: order.table_session_id,
        tableLabel: order.table_label,
        historyId,
        status: 'in_transit' as const,
      };
    });

    // M2 (timeline): campos aditivos — staffId aqui é identidade validada
    // server-side (requireActiveStaffId no controller).
    this.eventsGateway?.emitOrderClaimed(slug, orderId, staffId, {
      tableSessionId: result.tableSessionId,
      tableLabel: result.tableLabel,
      // FIX convergência de id: pk da row odel claimada → tap usa
      // `odel:<pk>:claimed` (mesmo doc do backfill).
      deliveryId: result.deliveryId,
    });
    this.eventsGateway?.emitOrderStatusUpdate(slug, orderId, 'in_transit', result.tableLabel, {
      tableSessionId: result.tableSessionId,
      changedBy: { type: 'staff', id: staffId },
      // FIX convergência de id: pk da row osh 'in_transit' (undefined quando
      // já estava in_transit e não inserimos osh — tap cai no fallback ws:*).
      ...(result.historyId ? { historyId: result.historyId } : {}),
    });
    this.eventsGateway?.emitToSession(result.tableSessionId, 'order:status', {
      orderId,
      status: 'in_transit',
      tableSessionId: result.tableSessionId,
      changedBy: { type: 'staff', id: staffId },
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  async markOrderDeliveredByWaiter(orderId: string, slug: string, staffId: string) {
    const result = await this.tenantConn.transaction(async (tx) => {
      const orderRows = (await tx.query(
        `SELECT o.id, o.status, o.table_session_id, t.label AS table_label
           FROM orders o
           JOIN table_sessions ts ON ts.id = o.table_session_id
           JOIN tables t ON t.id = ts.table_id
          WHERE o.id = $1
          FOR UPDATE`,
        [orderId],
      )) as Array<{
        id: string;
        status: string;
        table_session_id: string;
        table_label: string;
      }>;
      if (!orderRows.length) {
        throw new NotFoundException('Pedido nao encontrado.');
      }
      const order = orderRows[0];
      if (order.status === 'delivered') {
        return {
          orderId,
          deliveryId: null as string | null,
          tableSessionId: order.table_session_id,
          tableLabel: order.table_label,
          status: 'delivered' as const,
          alreadyDelivered: true,
        };
      }

      const deliveryRows = (await tx.query(
        `SELECT id, status, claimed_by
           FROM order_deliveries
          WHERE order_id = $1
            AND status != 'cancelled'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [orderId],
      )) as Array<{ id: string; status: string; claimed_by: string | null }>;
      const delivery = deliveryRows[0];
      if (!delivery || delivery.status !== 'claimed') {
        throw new BadRequestException('Pedido ainda nao esta em transito.');
      }

      // Qualquer staff ativo pode confirmar a entrega — quem claimou pode
      // ter saído de cena (celular morreu, fim de turno) e bloquear o
      // colega criava beco sem saída: pedido preso em in_transit e cliente
      // preso em "A caminho da mesa" pra sempre (achado do code-review; o
      // módulo deliveries antigo já permitia conclusão cross-staff).
      // claimed_by é atualizado pra quem CONFIRMOU quando difere — reflete
      // quem de fato levou; a trilha completa fica em order_status_history.
      await tx.query(
        `UPDATE order_deliveries
            SET status = 'delivered', delivered_at = now(), claimed_by = $2
          WHERE id = $1`,
        [delivery.id, staffId],
      );
      await tx.query(`UPDATE orders SET status = 'delivered', updated_at = now() WHERE id = $1`, [
        orderId,
      ]);
      await tx.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
         VALUES ($1, $2, 'delivered', $3)`,
        [orderId, order.status, staffId],
      );

      return {
        orderId,
        deliveryId: delivery.id as string | null,
        tableSessionId: order.table_session_id,
        tableLabel: order.table_label,
        status: 'delivered' as const,
        alreadyDelivered: false,
      };
    });

    if (result.alreadyDelivered) {
      // Retry/segundo device de um pedido já entregue: idempotente de
      // verdade — sem re-emitir order:status pro cliente nem re-agendar
      // rating prompt (achado do code-review: side effects rodavam de novo).
      return result;
    }

    await this.consumption.updateForDeliveredOrder(orderId);
    if (this.orderRatings) {
      try {
        const orderInfo = (await this.tenantConn.query(
          `SELECT v.customer_id, o.visit_id
             FROM orders o LEFT JOIN visits v ON v.id = o.visit_id
            WHERE o.id = $1`,
          [orderId],
        )) as Array<{ customer_id: string | null; visit_id: string | null }>;
        const info = orderInfo[0];
        if (info) {
          await this.orderRatings.schedulePromptForDelivered({
            orderId,
            customerId: info.customer_id,
            visitId: info.visit_id,
          });
        }
      } catch (err) {
        this.logger.warn(`Falha ao agendar rating prompt: ${(err as Error).message}`);
      }
    }

    this.eventsGateway?.emitOrderStatusUpdate(slug, orderId, 'delivered', result.tableLabel, {
      tableSessionId: result.tableSessionId,
      changedBy: { type: 'staff', id: staffId },
    });
    this.eventsGateway?.emitToSession(result.tableSessionId, 'order:status', {
      orderId,
      status: 'delivered',
      // M2 (timeline): correlação + staff que confirmou a entrega (identidade
      // validada server-side; espelha o claimed_by persistido acima).
      tableSessionId: result.tableSessionId,
      deliveredBy: staffId,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  private async resolveTargetWaiter(
    tableSessionId: string,
  ): Promise<{ id: string | null; name: string | null }> {
    // ZONA PRIORITÁRIA (decisão Caleb 2026-07-04): a mesa tem zona e o
    // gerente atribuiu garçons a ela hoje (waiter_zone_assignments) →
    // a entrega vai pra um deles, VENCENDO o último-que-atendeu. Elegível =
    // atribuído hoje + ativo + EM TURNO agora + SEM pausa ativa; 2+ =
    // round-robin pelo menos recentemente acionado (last_called ASC).
    // Zona sem elegível (pausa/fora de turno/sem atribuição) → fallback
    // global abaixo. Nunca entrega pra quem está em pausa — o filtro de
    // pausa se repete nos fallbacks. Degrada sem 500 se o tenant ainda não
    // tem a migration 060 (mesmo espírito do fallback de timezone).
    try {
      const zoneWaiters = (await this.tenantConn.query(
        `WITH local_now AS (
           SELECT now() AT TIME ZONE COALESCE(
             (SELECT timezone FROM settings LIMIT 1),
             'America/Sao_Paulo'
           ) AS ts
         )
         SELECT s.id, s.name
           FROM table_sessions tsn
           JOIN tables t ON t.id = tsn.table_id
           JOIN waiter_zone_assignments wza
             ON wza.zone_id = t.zone_id
            AND wza.removed_at IS NULL
            AND wza.work_date = (SELECT ts::date FROM local_now)
           JOIN staff s ON s.id = wza.staff_id
            AND s.role = 'waiter'
            AND s.is_active = true
           LEFT JOIN LATERAL (
             SELECT max(od.called_at) AS last_called
               FROM order_deliveries od
              WHERE od.target_waiter_id = s.id
                AND od.status != 'cancelled'
           ) recent ON true
           JOIN LATERAL (
             SELECT 1 AS on_shift
               FROM staff_shift_assignments sa
               JOIN staff_shifts sh ON sh.id = sa.shift_id
              CROSS JOIN local_now ln
              WHERE sa.staff_id = s.id
                AND sa.removed_at IS NULL
                AND (
                  (sh.time_start <= sh.time_end
                    AND sa.work_date = ln.ts::date
                    AND ln.ts::time >= sh.time_start
                    AND ln.ts::time < sh.time_end)
                  OR (sh.time_start > sh.time_end AND (
                    (sa.work_date = ln.ts::date AND ln.ts::time >= sh.time_start)
                    OR (sa.work_date = (ln.ts - interval '1 day')::date
                      AND ln.ts::time < sh.time_end)
                  ))
                )
              LIMIT 1
           ) shift ON true
          WHERE tsn.id = $1
            AND t.zone_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM zone_pauses zp
               WHERE zp.waiter_id = s.id
                 AND zp.ended_at IS NULL
                 AND (zp.ends_at IS NULL OR zp.ends_at > now())
            )
          ORDER BY recent.last_called ASC NULLS FIRST, s.name ASC
          LIMIT 1`,
        [tableSessionId],
      )) as Array<{ id: string; name: string }>;
      if (zoneWaiters[0]) {
        return zoneWaiters[0];
      }
    } catch (err) {
      this.logger.warn(
        `resolveTargetWaiter: rota por zona falhou (${(err as Error).message}) — usando fallback global.`,
      );
    }

    const recentWaiter = (await this.tenantConn.query(
      `SELECT wc.acknowledged_by AS id,
              COALESCE(s.name, wc.assigned_waiter_name) AS name
         FROM waiter_calls wc
         LEFT JOIN staff s ON s.id = wc.acknowledged_by
        WHERE wc.table_session_id = $1
          AND wc.acknowledged_by IS NOT NULL
          -- Nunca entrega pra quem está em pausa (decisão 2026-07-04) —
          -- vale também no último-que-atendeu.
          AND NOT EXISTS (
            SELECT 1 FROM zone_pauses zp
             WHERE zp.waiter_id = wc.acknowledged_by
               AND zp.ended_at IS NULL
               AND (zp.ends_at IS NULL OR zp.ends_at > now())
          )
        ORDER BY wc.acknowledged_at DESC NULLS LAST, wc.created_at DESC
        LIMIT 1`,
      [tableSessionId],
    )) as Array<{ id: string | null; name: string | null }>;
    if (recentWaiter[0]?.id) {
      return recentWaiter[0];
    }

    // Fallback sem chamado prévio na sessão: prefere garçom EM TURNO
    // AGORA (staff_shift_assignments + janela do staff_shifts, no fuso do
    // restaurante em settings.timezone) e, dentro do grupo, o MENOS
    // recentemente acionado (round-robin por max(called_at)) — antes era
    // ordem alfabética e a primeira garçonete recebia toda entrega
    // não-direcionada. Turnos sem assignment hoje caem pro grupo geral.
    //
    // Turno overnight (time_start > time_end, ex.: 18h–02h): o assignment
    // tem work_date do DIA QUE O TURNO COMEÇA. Depois da meia-noite a data
    // local já virou, então o trecho pós-meia-noite casa com o assignment
    // de ONTEM (work_date = ln.ts::date - 1) e o trecho pré-meia-noite com
    // o de HOJE — sem isso, quem estava trabalhando às 00h30 perdia a
    // preferência e quem só entra hoje à noite ganhava (code-review).
    let fallback: Array<{ id: string; name: string }>;
    try {
      fallback = (await this.tenantConn.query(
        `WITH local_now AS (
           SELECT now() AT TIME ZONE COALESCE(
             (SELECT timezone FROM settings LIMIT 1),
             'America/Sao_Paulo'
           ) AS ts
         )
         SELECT s.id, s.name
           FROM staff s
           LEFT JOIN LATERAL (
             SELECT max(od.called_at) AS last_called
               FROM order_deliveries od
              WHERE od.target_waiter_id = s.id
                AND od.status != 'cancelled'
           ) recent ON true
           LEFT JOIN LATERAL (
             SELECT 1 AS on_shift
               FROM staff_shift_assignments sa
               JOIN staff_shifts sh ON sh.id = sa.shift_id
              CROSS JOIN local_now ln
              WHERE sa.staff_id = s.id
                AND sa.removed_at IS NULL
                AND (
                  (sh.time_start <= sh.time_end
                    AND sa.work_date = ln.ts::date
                    AND ln.ts::time >= sh.time_start
                    AND ln.ts::time < sh.time_end)
                  OR (sh.time_start > sh.time_end AND (
                    (sa.work_date = ln.ts::date AND ln.ts::time >= sh.time_start)
                    OR (sa.work_date = (ln.ts - interval '1 day')::date
                      AND ln.ts::time < sh.time_end)
                  ))
                )
              LIMIT 1
           ) shift ON true
          WHERE s.role = 'waiter'
            AND s.is_active = true
            -- Nunca entrega pra quem está em pausa (decisão 2026-07-04).
            AND NOT EXISTS (
              SELECT 1 FROM zone_pauses zp
               WHERE zp.waiter_id = s.id
                 AND zp.ended_at IS NULL
                 AND (zp.ends_at IS NULL OR zp.ends_at > now())
            )
          ORDER BY (shift.on_shift IS NULL) ASC,
                   recent.last_called ASC NULLS FIRST,
                   s.name ASC
          LIMIT 1`,
      )) as Array<{ id: string; name: string }>;
    } catch (err) {
      // settings.timezone é texto livre (001) — um valor não-IANA faria
      // TODO call-waiter do tenant falhar 500. Degrada pro fallback simples
      // (garçom ativo por nome) em vez de derrubar o fluxo de entrega.
      this.logger.warn(
        `resolveTargetWaiter: fallback por turno falhou (${(err as Error).message}) — usando fallback simples.`,
      );
      fallback = (await this.tenantConn.query(
        `SELECT id, name
           FROM staff s
          WHERE role = 'waiter'
            AND is_active = true
            -- Nunca entrega pra quem está em pausa (decisão 2026-07-04).
            AND NOT EXISTS (
              SELECT 1 FROM zone_pauses zp
               WHERE zp.waiter_id = s.id
                 AND zp.ended_at IS NULL
                 AND (zp.ends_at IS NULL OR zp.ends_at > now())
            )
          ORDER BY name ASC
          LIMIT 1`,
      )) as Array<{ id: string; name: string }>;
    }
    if (fallback[0]) {
      return fallback[0];
    }
    return { id: null, name: null };
  }
}
