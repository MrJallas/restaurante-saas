'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  MBottomNav,
  Icon,
} from '../../../../../components/manager';
import { staffGet } from '../../../../../lib/api';

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

const PERIOD_DAYS: Record<string, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
};

function money(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function FinanceDetailInner() {
  const C = useG(false);
  const router = useRouter();
  const route = useParams<{ kind: string }>();
  const params = useSearchParams();
  const slug =
    params.get('slug') ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    'restaurant_dev';
  const period = params.get('period') || '7d';
  const days = PERIOD_DAYS[period] ?? 7;
  const kind = route?.kind ?? 'faturamento';
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      staffGet<OverviewData>(`/${slug}/dashboard/overview`),
      staffGet<RevenuePoint[]>(`/${slug}/dashboard/revenue?days=${days}`),
      staffGet<{ items: TopItem[] }>(`/${slug}/dashboard/top-items?limit=8`),
    ])
      .then(([overviewRes, revenueRes, topRes]) => {
        if (cancelled) return;
        setOverview(overviewRes);
        setRevenue(revenueRes);
        setTopItems(topRes.items ?? []);
        setErrorMsg(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMsg(err.message || 'Erro ao carregar detalhe.');
      });
    return () => {
      cancelled = true;
    };
  }, [days, slug]);

  const totals = useMemo(() => {
    const revenueCents = revenue.reduce((sum, row) => sum + row.revenueCents, 0);
    const orders = revenue.reduce((sum, row) => sum + row.orders, 0);
    return {
      revenueCents,
      orders,
      avgTicketCents: orders > 0 ? Math.round(revenueCents / orders) : 0,
    };
  }, [revenue]);

  const title =
    kind === 'pedidos'
      ? 'Pedidos'
      : kind === 'ticket-medio'
        ? 'Ticket médio'
        : kind === 'pendentes'
          ? 'Pendentes'
          : 'Faturamento';

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        color: C.ink,
        fontFamily: G_FONT,
      }}
    >
      <MTopBar
        title={title}
        left={<GIconBtn icon={Icon.back(20)} onClick={() => router.back()} ariaLabel="Voltar" />}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 96px' }}>
        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: 12,
              borderRadius: 10,
              border: '1px solid #F4C7C7',
              background: '#FFF1F1',
              color: '#A12626',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {errorMsg}
          </div>
        )}

        <div
          style={{
            borderRadius: 12,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: C.faint,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Período
          </div>
          <div style={{ marginTop: 5, fontSize: 28, fontWeight: 900, letterSpacing: -0.7 }}>
            {kind === 'pedidos'
              ? totals.orders
              : kind === 'ticket-medio'
                ? money(totals.avgTicketCents)
                : kind === 'pendentes'
                  ? (overview?.today.pendingOrders ?? 0)
                  : money(totals.revenueCents)}
          </div>
        </div>

        <SectionTitle C={C}>Receita por dia</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {revenue.map((row) => (
            <DetailRow
              key={row.date}
              C={C}
              left={new Date(row.date).toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
              })}
              right={money(row.revenueCents)}
              sub={`${row.orders} pedidos`}
            />
          ))}
        </div>

        <SectionTitle C={C}>Mais vendidos</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topItems.map((item) => (
            <DetailRow
              key={item.id}
              C={C}
              left={item.name}
              right={`${item.total_orders}`}
              sub={item.category_name}
            />
          ))}
        </div>
      </div>
      <MBottomNav active="finance" onTo={(r) => router.push(r)} />
    </div>
  );
}

function SectionTitle({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: '18px 0 8px',
        fontFamily: MONO_FONT,
        fontSize: 10.5,
        color: C.faint,
        fontWeight: 800,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function DetailRow({
  C,
  left,
  right,
  sub,
}: {
  C: ReturnType<typeof useG>;
  left: string;
  right: string;
  sub: string;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        padding: '11px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: C.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {left}
        </div>
        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color: C.faint }}>{sub}</div>
      </div>
      <div
        style={{
          flexShrink: 0,
          fontSize: 14,
          fontWeight: 900,
          color: C.ink,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {right}
      </div>
    </div>
  );
}

export default function FinanceDetailPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando...</div>}
    >
      <FinanceDetailInner />
    </Suspense>
  );
}
