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
  revenue_cents: number;
}

interface ActiveTableRow {
  sessionId: string;
  tableLabel: string;
  tableNumber: number;
  openedMinutes: number;
  people: number;
  subtotalCents: number;
}

interface LateOrderRow {
  orderId: string;
  tableLabel: string;
  station: 'kitchen';
  minutesInPrep: number;
  itemCount: number;
  targetMinutes: number;
}

interface ActiveTablesData {
  tables: ActiveTableRow[];
  lateOrders: LateOrderRow[];
  kitchenEtaMaxMinutes: number | null;
}

const PERIOD_DAYS: Record<string, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
};

const KNOWN_KINDS = ['faturamento', 'pedidos', 'ticket-medio', 'pendentes'] as const;
type Kind = (typeof KNOWN_KINDS)[number];

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
  const rawKind = route?.kind ?? 'faturamento';
  const kind: Kind = (KNOWN_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as Kind)
    : 'faturamento';
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [activeTables, setActiveTables] = useState<ActiveTablesData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // "Pendentes" é um recorte AO VIVO (pedidos abertos / mesas ativas / cozinha
    // atrasada), não uma série histórica. Puxa a fonte real (active-tables) só
    // nesse kind; os demais usam revenue/top-items.
    const isPending = kind === 'pendentes';
    Promise.all([
      staffGet<OverviewData>(`/${slug}/dashboard/overview`),
      staffGet<RevenuePoint[]>(`/${slug}/dashboard/revenue?days=${days}`),
      isPending
        ? Promise.resolve<{ items: TopItem[] }>({ items: [] })
        : staffGet<{ items: TopItem[] }>(`/${slug}/dashboard/top-items?limit=8&days=${days}`),
      isPending
        ? staffGet<ActiveTablesData>(`/${slug}/dashboard/active-tables`)
        : Promise.resolve<ActiveTablesData | null>(null),
    ])
      .then(([overviewRes, revenueRes, topRes, activeRes]) => {
        if (cancelled) return;
        setOverview(overviewRes);
        setRevenue(revenueRes);
        setTopItems(topRes.items ?? []);
        setActiveTables(activeRes);
        setErrorMsg(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMsg(err.message || 'Erro ao carregar detalhe.');
      });
    return () => {
      cancelled = true;
    };
  }, [days, slug, kind]);

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
            {kind === 'pendentes' ? 'Agora' : 'Período'}
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

        {kind === 'pendentes' ? (
          <PendingBody C={C} overview={overview} activeTables={activeTables} />
        ) : (
          <SeriesBody C={C} kind={kind} revenue={revenue} topItems={topItems} />
        )}
      </div>
      <MBottomNav active="finance" onTo={(r) => router.push(r)} />
    </div>
  );
}

/**
 * Corpo dos kinds de SÉRIE (faturamento · pedidos · ticket-medio): a linha
 * "por dia" mostra a MÉTRICA do kind (não sempre a receita), e o "Mais
 * vendidos" ranqueia por receita ou por pedidos conforme o kind.
 */
function SeriesBody({
  C,
  kind,
  revenue,
  topItems,
}: {
  C: ReturnType<typeof useG>;
  kind: Kind;
  revenue: RevenuePoint[];
  topItems: TopItem[];
}) {
  const dayTitle =
    kind === 'pedidos'
      ? 'Pedidos por dia'
      : kind === 'ticket-medio'
        ? 'Ticket médio por dia'
        : 'Receita por dia';

  const dayValue = (row: RevenuePoint): string => {
    if (kind === 'pedidos') return `${row.orders}`;
    if (kind === 'ticket-medio') {
      return money(row.orders > 0 ? Math.round(row.revenueCents / row.orders) : 0);
    }
    return money(row.revenueCents);
  };

  const daySub = (row: RevenuePoint): string => {
    // Mostra a segunda dimensão pra não repetir o valor do hero.
    if (kind === 'pedidos') return money(row.revenueCents);
    if (kind === 'ticket-medio') return `${row.orders} pedidos`;
    return `${row.orders} pedidos`;
  };

  return (
    <>
      <SectionTitle C={C}>{dayTitle}</SectionTitle>
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
            right={dayValue(row)}
            sub={daySub(row)}
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
            right={kind === 'faturamento' ? money(item.revenue_cents) : `${item.total_orders}`}
            sub={
              kind === 'faturamento'
                ? `${item.total_orders} pedidos · ${item.category_name}`
                : item.category_name
            }
          />
        ))}
      </div>
    </>
  );
}

/**
 * Corpo do kind "pendentes": recorte AO VIVO. O hero (pedidos abertos) casa com
 * a lista de mesas ativas e a fila da cozinha atrasada — antes o corpo mostrava
 * "Receita por dia", desconectado do herói de pendentes.
 */
function PendingBody({
  C,
  overview,
  activeTables,
}: {
  C: ReturnType<typeof useG>;
  overview: OverviewData | null;
  activeTables: ActiveTablesData | null;
}) {
  const tables = activeTables?.tables ?? [];
  const lateOrders = activeTables?.lateOrders ?? [];
  const pending = overview?.today.pendingOrders ?? 0;

  return (
    <>
      <SectionTitle C={C}>Cozinha atrasada</SectionTitle>
      {lateOrders.length === 0 ? (
        <EmptyRow
          C={C}
          text={
            activeTables?.kitchenEtaMaxMinutes == null
              ? 'Meta de tempo da cozinha não configurada.'
              : 'Nenhum pedido acima da meta da cozinha agora.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lateOrders.map((o) => (
            <DetailRow
              key={o.orderId}
              C={C}
              left={o.tableLabel}
              right={`${o.minutesInPrep} min`}
              sub={`${o.itemCount} ${o.itemCount === 1 ? 'unidade' : 'unidades'} em preparo · meta ${o.targetMinutes} min`}
            />
          ))}
        </div>
      )}

      <SectionTitle C={C}>Mesas abertas agora</SectionTitle>
      {tables.length === 0 ? (
        <EmptyRow C={C} text="Nenhuma mesa com sessão aberta." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tables.map((t) => (
            <DetailRow
              key={t.sessionId}
              C={C}
              left={t.tableLabel}
              right={money(t.subtotalCents)}
              sub={`${t.openedMinutes} min · ${t.people} ${t.people === 1 ? 'pessoa' : 'pessoas'}`}
            />
          ))}
        </div>
      )}

      <div
        style={{ marginTop: 14, fontSize: 11.5, color: C.faint, fontWeight: 500, lineHeight: 1.5 }}
      >
        {pending} {pending === 1 ? 'pedido pendente' : 'pedidos pendentes'} no total (não entregues
        / não cancelados). A cozinha atrasada e as mesas abertas acima são a fonte ao vivo desse
        número.
      </div>
    </>
  );
}

function EmptyRow({ C, text }: { C: ReturnType<typeof useG>; text: string }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px dashed ${C.borderSoft}`,
        background: C.surface,
        padding: '14px 12px',
        fontSize: 12.5,
        color: C.mute,
        fontWeight: 500,
        textAlign: 'center',
      }}
    >
      {text}
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
