import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';

/** Totais de conta com a taxa de serviço server-side (migration 050). */
export interface BillTotals {
  subtotalCents: number;
  /**
   * Desconto de promoção ativa aplicado ao subtotal (>= 0), autoritativo
   * server-side. O cliente NUNCA escolhe o desconto — sai da tabela
   * `promotions` (migration 014). 0 quando nenhuma promoção qualifica.
   */
  discountCents: number;
  /** Rótulo da promoção vencedora ("Terça 20% off") ou null. Só p/ UI. */
  discountLabel: string | null;
  serviceFeePct: number;
  serviceFeeCents: number;
  totalCents: number;
}

/** Uma promoção resolvida como candidata a aplicar na conta. */
export interface ResolvedDiscount {
  discountCents: number;
  label: string | null;
}

interface PromotionRow {
  title: string;
  discount_type: string;
  discount_value: number | string;
  min_order_cents: number | string | null;
}

@Injectable()
export class BillingService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  /**
   * Lê `settings.service_fee_pct` (NUMERIC(5,2) — o pg devolve string).
   * Valor ausente/inválido cai no default 10 (mesmo da migration 050),
   * nunca em taxa negativa.
   */
  async getServiceFeePct(): Promise<number> {
    const rows = (await this.tenantConn.query(
      `SELECT service_fee_pct FROM settings LIMIT 1`,
    )) as Array<{ service_fee_pct: unknown }>;
    const pct = Number(rows[0]?.service_fee_pct);
    return Number.isFinite(pct) && pct >= 0 ? pct : 10;
  }

  /**
   * Resolve o desconto AUTORITATIVO da(s) promoção(ões) ATIVA(S) para um
   * dado subtotal. Regra de produto (Caleb 2026-07-05):
   *
   * - Uma promoção é elegível quando `is_active = true`, está DENTRO da
   *   janela [valid_from, valid_until] (NULLs = janela aberta) e o subtotal
   *   atinge o `min_order_cents` (NULL = sem mínimo). A janela é como o
   *   gerente modela "Terça 20% off" — valid_from/valid_until no dia/horário.
   * - MELHOR PROMOÇÃO VENCE: promoções NÃO empilham. Pegamos a que dá o
   *   MAIOR desconto em centavos (evita abuso de somar percentuais).
   * - `percentage`: discount_value% sobre o subtotal. `fixed`: discount_value
   *   centavos fixos.
   * - CLAMP: o desconto nunca passa do subtotal (total nunca fica negativo).
   *
   * A janela é filtrada no SQL (`now()`), então o resultado varia no tempo:
   * fora do horário a promoção simplesmente não volta e não aplica.
   */
  async resolveDiscount(subtotalCents: number): Promise<ResolvedDiscount> {
    const subtotal = Number(subtotalCents) || 0;
    if (subtotal <= 0) return { discountCents: 0, label: null };

    const rows = unwrapRows<PromotionRow>(
      await this.tenantConn.query(
        `SELECT title, discount_type, discount_value, min_order_cents
           FROM promotions
          WHERE is_active = true
            AND (valid_from IS NULL OR valid_from <= now())
            AND (valid_until IS NULL OR valid_until > now())`,
      ),
    );

    let best: ResolvedDiscount = { discountCents: 0, label: null };
    for (const row of rows) {
      const minOrder = row.min_order_cents == null ? 0 : Number(row.min_order_cents) || 0;
      if (subtotal < minOrder) continue;

      const value = Number(row.discount_value) || 0;
      if (value <= 0) continue;

      let discount: number;
      if (row.discount_type === 'percentage') {
        discount = Math.round((subtotal * value) / 100);
      } else if (row.discount_type === 'fixed') {
        discount = Math.round(value);
      } else {
        continue; // tipo desconhecido não aplica
      }

      // Nunca desconta mais que o subtotal (total nunca fica negativo).
      discount = Math.min(discount, subtotal);
      if (discount > best.discountCents) {
        best = { discountCents: discount, label: row.title };
      }
    }

    return best;
  }

  /**
   * Monta os totais a partir do subtotal, do desconto (já resolvido) e da
   * taxa. Ordem canônica (Caleb 2026-07-05): DESCONTO primeiro, taxa DEPOIS
   * — a taxa de serviço incide sobre o subtotal JÁ DESCONTADO (o cliente não
   * paga taxa sobre o que não pagou). total = (subtotal - desconto) + taxa.
   */
  applyServiceFee(
    subtotalCents: number,
    serviceFeePct: number,
    discount: ResolvedDiscount = { discountCents: 0, label: null },
  ): BillTotals {
    // O driver do pg devolve SUM()/NUMERIC como STRING — sem coerção,
    // `'790' + 79` vira '79079' (concatenação; conta de R$790,79). O
    // Number() aqui blinda TODOS os call sites que passam agregados do DB.
    const subtotal = Number(subtotalCents) || 0;
    // Clamp defensivo: mesmo com desconto vindo pronto, nunca deixa negativo.
    const discountCents = Math.min(Math.max(0, Math.round(discount.discountCents) || 0), subtotal);
    const discountedSubtotal = subtotal - discountCents;
    const serviceFeeCents = Math.round((discountedSubtotal * serviceFeePct) / 100);
    return {
      subtotalCents: subtotal,
      discountCents,
      discountLabel: discountCents > 0 ? discount.label : null,
      serviceFeePct,
      serviceFeeCents,
      totalCents: discountedSubtotal + serviceFeeCents,
    };
  }

  async computeTotals(subtotalCents: number): Promise<BillTotals> {
    const [serviceFeePct, discount] = await Promise.all([
      this.getServiceFeePct(),
      this.resolveDiscount(subtotalCents),
    ]);
    return this.applyServiceFee(subtotalCents, serviceFeePct, discount);
  }
}
