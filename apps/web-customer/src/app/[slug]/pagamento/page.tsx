'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPost } from '../../../lib/api';
import { getSessionToken } from '../../../lib/storage';
import { useSession } from '../../../hooks/useSession';
import { useNav } from '../../../hooks/useNav';
import { AppShell } from '../../../components/layout/AppShell';
import { PillButton } from '../../../components/ui/PillButton';
import { Row } from '../../../components/ui/Row';

interface BillOrderItem {
  name: string;
  quantity: number;
  subtotalCents: number;
}

interface BillOrder {
  id: string;
  total_cents: number;
  items: BillOrderItem[];
}

interface BillData {
  mode: string;
  /** Total COM taxa — o mesmo valor que o backend cobra no POST /payments. */
  totalCents: number;
  subtotalCents: number;
  /**
   * Desconto de promoção ATIVA aplicado server-side (BillingService). O
   * cliente só EXIBE — o backend é autoritativo. 0/null quando não há promoção.
   */
  discountCents?: number;
  discountLabel?: string | null;
  serviceFeePct: number;
  serviceFeeCents: number;
  orderCount: number;
  orders: BillOrder[];
}

type Method = 'pix' | 'credit' | 'debit';

interface MethodOption {
  key: Method;
  label: string;
  description: string;
}

// Decisão Caleb 2026-07-04 (gate 1D): pagamento é DEMO honesta até o PSP
// real existir — cartão (que caía num erro fabricado E-210) saiu da lista
// e o Pix carrega o selo de simulação. Nenhum CTA finge cobrança real.
const METHODS: MethodOption[] = [
  { key: 'pix', label: 'Pix', description: 'QR Code · simulado nesta versão' },
];

export default function PagamentoPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { push } = useNav();
  const { tableLabel, visitId } = useSession();
  const slug = params.slug as string;

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  const [tableBill, setTableBill] = useState<BillData | null>(null);
  const [individualBill, setIndividualBill] = useState<BillData | null>(null);
  const [mode, setMode] = useState<'table' | 'individual'>('table');
  const [method, setMethod] = useState<Method>('pix');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const requestedMode = searchParams.get('mode') === 'individual' ? 'individual' : 'table';

  useEffect(() => {
    setMode(requestedMode);
  }, [requestedMode]);

  useEffect(() => {
    if (!slug) return;
    let stop = false;
    const load = async () => {
      try {
        const [tRes, iRes] = await Promise.all([
          apiGet<BillData>(`/${slug}/orders/bill?mode=table`),
          visitId
            ? apiGet<BillData>(`/${slug}/orders/bill?mode=individual&visitId=${visitId}`)
            : Promise.resolve(null),
        ]);
        if (stop) return;
        setTableBill(tRes);
        if (iRes) setIndividualBill(iRes);
      } catch {
        /* ignore */
      } finally {
        if (!stop) setLoading(false);
      }
    };
    load();
    return () => {
      stop = true;
    };
  }, [slug, visitId]);

  const bill = mode === 'table' ? tableBill : individualBill;

  const aggregated = useMemo(() => {
    if (!bill)
      return {
        items: [] as { name: string; quantity: number; subtotalCents: number }[],
        subtotalCents: 0,
      };
    const map = new Map<string, { name: string; quantity: number; subtotalCents: number }>();
    bill.orders.forEach((o) => {
      o.items.forEach((it) => {
        const cur = map.get(it.name);
        if (cur) {
          cur.quantity += it.quantity;
          cur.subtotalCents += it.subtotalCents;
        } else {
          map.set(it.name, {
            name: it.name,
            quantity: it.quantity,
            subtotalCents: it.subtotalCents,
          });
        }
      });
    });
    const items = Array.from(map.values());
    const subtotalCents = items.reduce((s, it) => s + it.subtotalCents, 0);
    return { items, subtotalCents };
  }, [bill]);

  const { items } = aggregated;
  // A conta vem TODA do backend (BillingService lê settings.service_fee_pct)
  // — a tela não inventa taxa; exibe exatamente o que o POST /payments cobra.
  const subtotalCents = bill?.subtotalCents ?? 0;
  const discountCents = bill?.discountCents ?? 0;
  const discountLabel = bill?.discountLabel ?? null;
  const serviceCents = bill?.serviceFeeCents ?? 0;
  const totalCents = bill?.totalCents ?? 0;
  const serviceFeeLabel = `Taxa ${String(bill?.serviceFeePct ?? 10).replace('.', ',')}%`;
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  const totalItemCount = items.reduce((s, it) => s + it.quantity, 0);

  const handleProceed = async () => {
    if (submitting || !bill || bill.totalCents <= 0) return;
    if (method !== 'pix') {
      push(`/${slug}/pagamento/erro?reason=method_unavailable`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ paymentId: string }>(`/${slug}/payments`, {
        mode,
        visitId: mode === 'individual' ? visitId : undefined,
        method,
      });
      push(`/${slug}/pagamento/pix?paymentId=${res.paymentId}`);
    } catch {
      setSubmitting(false);
      push(`/${slug}/pagamento/erro?reason=gateway`);
    }
  };

  if (loading) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pagamento`}
      >
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!bill || bill.totalCents <= 0) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pagamento`}
        noMainPadding
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[1.5px] border-border-soft text-[28px] text-faint">
            ⛝
          </div>
          <div>
            <div className="mb-1 text-[18px] font-semibold tracking-[-0.02em]">
              Nada a pagar ainda
            </div>
            <div className="text-[13px] leading-[1.5] text-mute">
              Faça seu pedido primeiro para abrir a conta.
            </div>
          </div>
          <PillButton variant="filled" onClick={() => push(`/${slug}/cardapio`)}>
            Ver cardápio
          </PillButton>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pagamento`}
      noMainPadding
    >
      <div className="flex flex-1 flex-col">
        <div className="shrink-0 px-[22px] pb-2.5 pt-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Pagar conta</h1>
          <div className="mt-1 text-[12px] text-mute">
            {tableLabel || 'Mesa'} · {totalItemCount} {totalItemCount === 1 ? 'item' : 'itens'}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-[22px] pb-5 pt-1">
          {individualBill && (
            <div className="mb-4 flex gap-2 rounded-full border border-border-soft p-1">
              <button
                type="button"
                onClick={() => setMode('table')}
                className={`flex-1 rounded-full py-2 text-[12px] font-medium transition-colors ${
                  mode === 'table' ? 'bg-ink text-white' : 'text-mute'
                }`}
              >
                Conta da mesa
              </button>
              <button
                type="button"
                onClick={() => setMode('individual')}
                className={`flex-1 rounded-full py-2 text-[12px] font-medium transition-colors ${
                  mode === 'individual' ? 'bg-ink text-white' : 'text-mute'
                }`}
              >
                Minha comanda
              </button>
            </div>
          )}

          <div className="mb-5 rounded-[18px] border-[1.3px] border-ink px-4 py-3">
            {items.map((it) => (
              <Row
                key={it.name}
                label={`${it.name} (${it.quantity}×)`}
                value={fmt(it.subtotalCents)}
              />
            ))}
            <div className="my-2.5 h-px bg-border-soft" />
            <Row label="Subtotal" value={fmt(subtotalCents)} />
            {discountCents > 0 && (
              <Row
                label={
                  <span className="text-ink">{discountLabel ? discountLabel : 'Desconto'}</span>
                }
                value={<span className="text-ink">−{fmt(discountCents)}</span>}
              />
            )}
            <Row label={serviceFeeLabel} value={fmt(serviceCents)} />
            <div className="h-1.5" />
            <Row
              label={<b className="text-[15px] text-ink">Total</b>}
              value={<b className="text-[19px] text-ink tabular-nums">{fmt(totalCents)}</b>}
            />
          </div>

          <div>
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
              Forma de pagamento
            </div>
            <div className="flex flex-col gap-2">
              {METHODS.map((m) => {
                const selected = method === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMethod(m.key)}
                    className={`flex items-center gap-3.5 rounded-[14px] border-[1.3px] bg-bg px-4 py-3.5 text-left transition-colors ${
                      selected ? 'border-ink' : 'border-border-soft'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="text-[15px] font-medium">{m.label}</div>
                      <div className="text-[11px] text-mute">{m.description}</div>
                    </div>
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] text-white ${
                        selected ? 'border-ink bg-ink' : 'border-border-soft bg-transparent'
                      }`}
                    >
                      {selected && '✓'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => push(`/${slug}/pagamento/dividir`)}
            className="mt-4 w-full rounded-full border-[1.2px] border-dashed border-border-soft px-4 py-3 text-[13px] text-mute"
          >
            Dividir conta com outras pessoas
          </button>
        </div>

        <div className="shrink-0 px-[22px] pb-safe pb-6 pt-2.5">
          <PillButton variant="filled" fullWidth onClick={handleProceed} disabled={submitting}>
            {submitting
              ? 'Gerando…'
              : method === 'pix'
                ? `Gerar QR Code Pix · ${fmt(totalCents)}`
                : `Pagar · ${fmt(totalCents)}`}
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
