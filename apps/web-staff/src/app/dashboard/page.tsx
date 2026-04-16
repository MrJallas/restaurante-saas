'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingCart, DollarSign, Users, Star, Clock,
  TrendingUp, MessageSquare, Zap,
} from 'lucide-react';
import { staffGet } from '../../lib/api';

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';

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

interface AiUsage {
  totalMessages: number;
  totalTokens: number;
  totalCostCents: number;
  blockedCount: number;
}

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [ov, rev, items, ai] = await Promise.all([
          staffGet<OverviewData>(`/${TENANT_SLUG}/dashboard/overview`),
          staffGet<RevenuePoint[]>(`/${TENANT_SLUG}/dashboard/revenue?days=7`),
          staffGet<{ items: TopItem[] }>(`/${TENANT_SLUG}/dashboard/top-items?limit=5`),
          staffGet<AiUsage>(`/${TENANT_SLUG}/dashboard/ai-usage`),
        ]);
        setOverview(ov);
        setRevenue(Array.isArray(rev) ? rev : []);
        setTopItems(items.items || []);
        setAiUsage(ai);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-staff-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-staff-accent border-t-transparent" />
      </div>
    );
  }

  const ov = overview?.today;

  return (
    <div className="min-h-screen bg-staff-bg p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold text-white">Dashboard</h1>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard icon={ShoppingCart} label="Pedidos hoje" value={String(ov?.orders || 0)} color="text-staff-accent" />
          <StatCard icon={DollarSign} label="Receita hoje" value={formatCents(ov?.revenueCents || 0)} color="text-staff-success" />
          <StatCard icon={Users} label="Clientes hoje" value={String(ov?.customers || 0)} color="text-purple-400" />
          <StatCard icon={Star} label="Avaliacao (30d)" value={String(ov?.avgRating || '-')} color="text-yellow-400" />
          <StatCard icon={Clock} label="Pedidos ativos" value={String(ov?.pendingOrders || 0)} color="text-staff-warning" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Revenue chart (simplified bar chart) */}
          <div className="rounded-xl bg-staff-card p-4">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-staff-success" /> Receita 7 dias
            </h2>
            <div className="flex items-end gap-1" style={{ height: '160px' }}>
              {revenue.length > 0 ? (
                (() => {
                  const maxRev = Math.max(...revenue.map((r) => r.revenueCents), 1);
                  return revenue.map((r) => {
                    const height = (r.revenueCents / maxRev) * 140;
                    const day = new Date(r.date).toLocaleDateString('pt-BR', { weekday: 'short' });
                    return (
                      <div key={r.date} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] text-slate-400">{formatCents(r.revenueCents)}</span>
                        <div
                          className="w-full rounded-t bg-staff-accent/60"
                          style={{ height: `${Math.max(4, height)}px` }}
                        />
                        <span className="text-[10px] text-slate-500">{day}</span>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="flex w-full items-center justify-center text-sm text-slate-500">
                  Sem dados
                </div>
              )}
            </div>
          </div>

          {/* Top items */}
          <div className="rounded-xl bg-staff-card p-4">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-white">
              <ShoppingCart className="h-5 w-5 text-staff-accent" /> Mais Pedidos
            </h2>
            <div className="space-y-2">
              {topItems.map((item, i) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-staff-accent/20 text-xs font-bold text-staff-accent">
                      {i + 1}
                    </span>
                    <div>
                      <span className="text-sm text-white">{item.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{item.category_name}</span>
                    </div>
                  </div>
                  <span className="text-sm text-slate-400">{item.total_orders}x</span>
                </div>
              ))}
              {topItems.length === 0 && (
                <p className="text-sm text-slate-500">Sem dados</p>
              )}
            </div>
          </div>

          {/* AI Usage */}
          <div className="rounded-xl bg-staff-card p-4">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-white">
              <Zap className="h-5 w-5 text-yellow-400" /> Uso da IA (30d)
            </h2>
            {aiUsage ? (
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Mensagens" value={String(aiUsage.totalMessages)} />
                <MiniStat label="Tokens" value={aiUsage.totalTokens.toLocaleString()} />
                <MiniStat label="Custo estimado" value={formatCents(aiUsage.totalCostCents)} />
                <MiniStat label="Bloqueadas" value={String(aiUsage.blockedCount)} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sem dados</p>
            )}
          </div>

          {/* Quick links */}
          <div className="rounded-xl bg-staff-card p-4">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-white">
              <MessageSquare className="h-5 w-5 text-purple-400" /> Acesso rapido
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickLink href="/garcom/pedidos" label="Pedidos" color="bg-staff-accent/20 text-staff-accent" />
              <QuickLink href="/cozinha" label="Cozinha" color="bg-staff-warning/20 text-staff-warning" />
              <QuickLink href="/dashboard/promocoes" label="Promocoes" color="bg-purple-500/20 text-purple-400" />
              <QuickLink href="/" label="Voltar" color="bg-slate-500/20 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof ShoppingCart; label: string; value: string; color: string;
}) {
  return (
    <div className="rounded-xl bg-staff-card p-4">
      <Icon className={`mb-2 h-5 w-5 ${color}`} />
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

function QuickLink({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a
      href={href}
      className={`rounded-lg ${color} px-3 py-2 text-center text-sm font-medium transition-opacity hover:opacity-80`}
    >
      {label}
    </a>
  );
}
