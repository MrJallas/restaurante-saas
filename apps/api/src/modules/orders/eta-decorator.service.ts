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

  private queueKey(orderId: string, station: 'kitchen' | 'bar'): string {
    return `${orderId}:${station}`;
  }

  /**
   * Snapshot das filas ativas por estação na ordenação canônica
   * (urgência > VIP > normal, FIFO). Mantemos duas medidas: pedidos à frente
   * para a copy da UI e quantidade de itens à frente para o cálculo do ETA.
   */
  private async getStationQueuePositions(): Promise<
    Map<string, { ordersAhead: number; workUnitsAhead: number }>
  > {
    const rows = (await this.tenantConn.query(
      `SELECT o.id,
              CASE WHEN mi.kind = 'drink' THEN 'bar' ELSE 'kitchen' END AS station,
              SUM(oi.quantity)::int AS workload
         FROM orders o
         JOIN table_sessions ts ON ts.id = o.table_session_id
         JOIN order_items oi ON oi.order_id = o.id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN visits vip_visit ON vip_visit.id = o.visit_id
         LEFT JOIN customers vip_customer ON vip_customer.id = vip_visit.customer_id
        WHERE o.status IN ('pending_confirmation', 'received', 'open', 'confirmed')
          AND oi.status <> 'ready'
          AND o.created_at > now() - interval '8 hours'
        GROUP BY o.id, 2, ts.flags, vip_customer.is_vip
        ORDER BY
          CASE
            WHEN o.priority_rank > 0 THEN 0
            WHEN ('vip' = ANY(COALESCE(ts.flags, '{}'::text[])))
              OR COALESCE(vip_customer.is_vip, false) THEN 1
            ELSE 2
          END ASC,
          o.priority_rank DESC,
          o.created_at ASC
        LIMIT 400`,
    )) as Array<{ id: string; station?: string; workload?: number | string }>;

    const positions = new Map<string, { ordersAhead: number; workUnitsAhead: number }>();
    const counters: Record<'kitchen' | 'bar', { orders: number; workUnits: number }> = {
      kitchen: { orders: 0, workUnits: 0 },
      bar: { orders: 0, workUnits: 0 },
    };
    for (const row of rows) {
      const station = row.station === 'bar' ? 'bar' : 'kitchen';
      positions.set(this.queueKey(row.id, station), {
        ordersAhead: counters[station].orders,
        workUnitsAhead: counters[station].workUnits,
      });
      counters[station].orders += 1;
      const parsedWorkload = Number(row.workload ?? 1);
      counters[station].workUnits +=
        Number.isFinite(parsedWorkload) && parsedWorkload >= 1 ? parsedWorkload : 1;
    }
    return positions;
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
  async decorateWithEta<
    T extends {
      id: string;
      status: string;
      items?: Array<{ kind?: string; quantity?: number }>;
    },
  >(
    orders: T[],
  ): Promise<Array<T & { etaMin: number | null; etaMax: number | null; queueAhead: number }>> {
    const needsEta = orders.some((o) => ETA_STAGE_RANGE[o.status]);
    const needsQueue = orders.some((o) => ETA_QUEUED_STATUSES.has(o.status));
    const base = needsEta ? await this.getKitchenEtaBase() : ETA_STAGE_RANGE.received;
    let positions = new Map<string, { ordersAhead: number; workUnitsAhead: number }>();
    if (needsQueue) {
      try {
        positions = await this.getStationQueuePositions();
      } catch {
        positions = new Map();
      }
    }
    return orders.map((o) => {
      const stations = new Set<'kitchen' | 'bar'>();
      for (const item of o.items ?? []) {
        stations.add(item.kind === 'drink' ? 'bar' : 'kitchen');
      }
      // Compatibilidade com rows/testes antigos sem items: eram tratados como
      // cozinha e continuam degradando de forma segura.
      if (stations.size === 0) stations.add('kitchen');

      const stationEtas = [...stations].map((station) => {
        const position = positions.get(this.queueKey(o.id, station)) ?? {
          ordersAhead: 0,
          workUnitsAhead: 0,
        };
        return {
          ...position,
          eta: computeEtaRange(o.status, position.workUnitsAhead, base),
        };
      });
      const bottleneck = stationEtas.reduce((current, candidate) =>
        (candidate.eta?.max ?? -1) > (current.eta?.max ?? -1) ? candidate : current,
      );
      return {
        ...o,
        etaMin: bottleneck.eta?.min ?? null,
        etaMax: bottleneck.eta?.max ?? null,
        queueAhead: ETA_QUEUED_STATUSES.has(o.status) ? bottleneck.ordersAhead : 0,
      };
    });
  }
}
