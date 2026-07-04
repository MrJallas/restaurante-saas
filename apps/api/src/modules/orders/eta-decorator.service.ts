/**
 * FASE 2 · 2C: decorador de ETA extraído do orders.service — a parte de I/O
 * (leitura do range base configurado pela cozinha + snapshot da fila) mais o
 * `decorateWithEta<T>` que anota pedidos do cliente. As funções PURAS
 * (ETA_STAGE_RANGE, ETA_QUEUED_STATUSES, computeEtaRange) seguem no
 * eta-engine.ts — aqui só orquestração + consulta ao banco via
 * TenantConnectionProvider. Os três métodos foram movidos VERBATIM do
 * orders.service (comportamento congelado em eta-decorator.service.test.ts).
 *
 * O orders.service passa a delegar (FACADE): os métodos públicos que usavam
 * decorateWithEta (getOrderById, getOrdersBySession) chamam
 * this.etaDecorator.decorateWithEta(...).
 */

import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { ETA_QUEUED_STATUSES, ETA_STAGE_RANGE, computeEtaRange } from './eta-engine';

@Injectable()
export class EtaDecoratorService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  /**
   * Snapshot leve da fila ativa da cozinha na ordenação canônica
   * (urgência > VIP > normal, FIFO dentro da fila) — mesma regra do _kds.
   * O índice do pedido no array = quantos pedidos existem à frente dele.
   */
  private async getKitchenQueueSnapshot(): Promise<string[]> {
    const rows = (await this.tenantConn.query(
      `SELECT o.id
         FROM orders o
         JOIN table_sessions ts ON ts.id = o.table_session_id
         LEFT JOIN visits vip_visit ON vip_visit.id = o.visit_id
         LEFT JOIN customers vip_customer ON vip_customer.id = vip_visit.customer_id
        WHERE o.status IN ('pending_confirmation', 'received', 'open', 'confirmed')
          AND o.created_at > now() - interval '8 hours'
        ORDER BY
          CASE
            WHEN o.priority_rank > 0 THEN 0
            WHEN ('vip' = ANY(COALESCE(ts.flags, '{}'::text[])))
              OR COALESCE(vip_customer.is_vip, false) THEN 1
            ELSE 2
          END ASC,
          o.priority_rank DESC,
          o.created_at ASC
        LIMIT 200`,
    )) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /**
   * Range base de preparo: configurado pela cozinha em /cozinha/eu
   * (settings.kitchen_eta_*, decisão Caleb 2026-06-10 Q9) com fallback
   * pros defaults do código quando NULL/ausente.
   */
  private async getKitchenEtaBase(): Promise<[number, number]> {
    try {
      const rows = (await this.tenantConn.query(
        `SELECT kitchen_eta_min_minutes AS min, kitchen_eta_max_minutes AS max
           FROM settings LIMIT 1`,
      )) as Array<{ min: number | null; max: number | null }>;
      const min = rows[0]?.min;
      const max = rows[0]?.max;
      if (min != null && max != null && min >= 1 && max >= min) {
        return [min, max];
      }
    } catch {
      // settings sem as colunas (tenant pré-056) ou falha pontual → default
    }
    return ETA_STAGE_RANGE.received;
  }

  /**
   * Anota pedidos do cliente com ETA dinâmica (min/max) + posição na fila.
   * Uma consulta de snapshot por chamada; falha de snapshot degrada pra
   * ETA sem componente de fila (nunca derruba a listagem do cliente).
   */
  async decorateWithEta<T extends { id: string; status: string }>(
    orders: T[],
  ): Promise<Array<T & { etaMin: number | null; etaMax: number | null; queueAhead: number }>> {
    const needsEta = orders.some((o) => ETA_STAGE_RANGE[o.status]);
    const needsQueue = orders.some((o) => ETA_QUEUED_STATUSES.has(o.status));
    const base = needsEta ? await this.getKitchenEtaBase() : ETA_STAGE_RANGE.received;
    let position = new Map<string, number>();
    if (needsQueue) {
      try {
        const snapshot = await this.getKitchenQueueSnapshot();
        position = new Map(snapshot.map((id, index) => [id, index]));
      } catch {
        position = new Map();
      }
    }
    return orders.map((o) => {
      const ahead = position.get(o.id) ?? 0;
      const eta = computeEtaRange(o.status, ahead, base);
      return {
        ...o,
        etaMin: eta?.min ?? null,
        etaMax: eta?.max ?? null,
        queueAhead: ETA_QUEUED_STATUSES.has(o.status) ? ahead : 0,
      };
    });
  }
}
