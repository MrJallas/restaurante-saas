'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useG,
  G_FONT,
  MAppHeader,
  MBottomNav,
  MSection,
} from '../../../components/manager';
import { staffGet } from '../../../lib/api';

interface OverviewData {
  today: {
    orders: number;
    revenueCents: number;
    customers: number;
    avgRating: number;
    pendingOrders: number;
  };
}

interface RevenuePoint {
  date: string;
  revenueCents: number;
  orders: number;
}

interface TopItem {
  id: string;
  name: string;
  price_cents: number;
  total_orders: number;
  category_name: string;
}

type PeriodKey = 'today' | '7d' | '30d';

const PERIODS: Array<{ key: PeriodKey; label: string; days: number }> = [
  { key: 'today', label: 'Hoje', days: 1 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function FinanceiroInner() {
  const C = useG(false);
  const router = useRouter();
  const params = useSearchParams();
  const slug =
    params.get('slug') ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    'restaurant_dev';
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [period, setPeriod] = useState<PeriodKey>((params.get('period') as PeriodKey) || '7d');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const periodCfg = PERIODS.find((p) => p.key === period) ?? PERIODS[1];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      staffGet<OverviewData>(`/${slug}/dashboard/overview`),
      staffGet<RevenuePoint[]>(`/${slug}/dashboard/revenue?days=${periodCfg.days}`),
      staffGet<{ items: TopItem[] }>(`/${slug}/dashboard/top-items?limit=5`),
    ])
      .then(([overviewRes, revenueRes, topRes]) => {
        if (cancelled) return;
        setOverview(overviewRes);
        setRevenue(revenueRes);
        setTopItems(topRes.items ?? []);
        setErrorMsg(null);
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg((err as Error).message || 'Erro ao carregar financeiro.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, periodCfg.days]);

  const totals = useMemo(() => {
    const revenueCents = revenue.reduce((sum, row) => sum + row.revenueCents, 0);
    const orders = revenue.reduce((sum, row) => sum + row.orders, 0);
    return {
      revenueCents,
      orders,
      avgTicketCents: orders > 0 ? Math.round(revenueCents / orders) : 0,
      maxRevenue: Math.max(1, ...revenue.map((row) => row.revenueCents)),
    };
  }, [revenue]);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        <MAppHeader title="Financeiro" greetingName="Renata Albuquerque" bellBadge={0} />

        {errorMsg && (
          <div
            role="alert"
            style={{
              margin: '12px 16px',
              padding: 12,
              borderRadius: 10,
              border: '1px solid #F4C7C7',
              background: '#FFF1F1',
              color: '#A12626',
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        <div style={{ padding: '12px 16px 0' }}>
          <div
            role="tablist"
            aria-label="Período financeiro"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 12,
              padding: 4,
              background: C.bg,
            }}
          >
            {PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(p.key)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    textAlign: 'center',
                    padding: '9px 8px',
                    borderRadius: 9,
                    background: active ? C.ink : 'transparent',
                    color: active ? C.bg : C.ink,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <MSection title={`Resumo · ${periodCfg.label.toLowerCase()}`}>
          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MetricBox
                label="Faturamento"
                value={loading ? '...' : formatCurrency(period === 'today' ? overview?.today.revenueCents ?? 0 : totals.revenueCents)}
                onClick={() => router.push(`/manager/financeiro/detalhe/faturamento?slug=${slug}&period=${period}`)}
              />
              <MetricBox
                label="Pedidos"
                value={loading ? '...' : String(period === 'today' ? overview?.today.orders ?? 0 : totals.orders)}
                onClick={() => router.push(`/manager/financeiro/detalhe/pedidos?slug=${slug}&period=${period}`)}
              />
              <MetricBox
                label="Ticket médio"
                value={loading ? '...' : formatCurrency(period === 'today' ? Math.round((overview?.today.revenueCents ?? 0) / Math.max(1, overview?.today.orders ?? 0)) : totals.avgTicketCents)}
                onClick={() => router.push(`/manager/financeiro/detalhe/ticket-medio?slug=${slug}&period=${period}`)}
              />
              <MetricBox
                label="Pendentes hoje"
                value={loading ? '...' : String(overview?.today.pendingOrders ?? 0)}
                onClick={() => router.push(`/manager/financeiro/detalhe/pendentes?slug=${slug}&period=${period}`)}
              />
            </div>
          </div>
        </MSection>

        <MSection title={`Receita · ${periodCfg.label.toLowerCase()}`}>
          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <MetricBox
                label="Receita"
                value={formatCurrency(totals.revenueCents)}
                onClick={() => router.push(`/manager/financeiro/detalhe/faturamento?slug=${slug}&period=${period}`)}
              />
              <MetricBox
                label="Ticket médio"
                value={formatCurrency(totals.avgTicketCents)}
                onClick={() => router.push(`/manager/financeiro/detalhe/ticket-medio?slug=${slug}&period=${period}`)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 120 }}>
              {revenue.map((row) => (
                <div key={row.date} style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      height: `${Math.max(6, (row.revenueCents / totals.maxRevenue) * 100)}px`,
                      maxHeight: 110,
                      borderRadius: '5px 5px 0 0',
                      background: C.ink,
                      opacity: row.revenueCents > 0 ? 1 : 0.18,
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 10, color: C.faint, textAlign: 'center', fontWeight: 700 }}>
                    {new Date(row.date).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </MSection>

        <MSection title="Mais vendidos">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topItems.length === 0 ? (
              <div style={{ padding: 18, border: `1px dashed ${C.borderSoft}`, borderRadius: 10, color: C.faint, fontSize: 13, textAlign: 'center' }}>
                Sem vendas registradas.
              </div>
            ) : (
              topItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: `1px solid ${C.borderSoft}`,
                    background: C.bg,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{item.category_name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{item.total_orders}</div>
                    <div style={{ fontSize: 10, color: C.faint }}>pedidos</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </MSection>

        <div style={{ padding: '24px 16px 0' }}>
          <button
            type="button"
            onClick={() => router.push('/manager')}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              padding: '13px 16px',
              borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              background: 'transparent',
              color: C.ink,
              fontSize: 14,
              fontWeight: 700,
              textAlign: 'center',
              fontFamily: G_FONT,
            }}
          >
            Voltar ao Painel
          </button>
        </div>
      </div>

      <MBottomNav active="finance" onTo={(r) => router.push(r)} />
    </div>
  );
}

function MetricBox({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  const C = useG(false);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: 14,
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: C.ink, letterSpacing: -0.5 }}>
        {value}
      </div>
    </button>
  );
}

export default function ManagerFinanceiroPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <FinanceiroInner />
    </Suspense>
  );
}
