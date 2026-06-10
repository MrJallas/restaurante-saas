'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';
import { Row } from '../../../../components/ui/Row';
import { Avatar } from '../../../../components/ui/Avatar';
import { AvatarStack } from '../../../../components/ui/AvatarStack';

interface ApiOrderItem {
  id: string;
  name: string;
  quantity: number;
  subtotalCents: number;
  customerId?: string | null;
  createdAt: string;
}

interface ApiOrder {
  id: string;
  status: string;
  billing_mode: string;
  visit_id: string | null;
  created_at: string;
  items: ApiOrderItem[];
}

interface Participant {
  customerId: string;
  name: string;
  initial: string;
  color: string;
}

type TabMode = 'all' | 'mine' | 'shared';

const NEW_BADGE_MINUTES = 2;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function isRecent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < NEW_BADGE_MINUTES * 60_000;
}

export default function PedidoMesaPage() {
  const params = useParams();
  const { push } = useNav();
  const { tableLabel, customerId, participants: sessionParticipants } = useSession();
  const slug = params.slug as string;

  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [participants, setParticipants] = useState<Participant[]>(sessionParticipants ?? []);
  const [tab, setTab] = useState<TabMode>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let stop = false;
    const load = async () => {
      try {
        const [ordersRes, partRes] = await Promise.all([
          apiGet<{ orders: ApiOrder[] }>(`/${slug}/orders?scope=table`),
          apiGet<{ participants: Participant[] }>(`/${slug}/table/participants`),
        ]);
        if (stop) return;
        setOrders(ordersRes.orders);
        if (partRes.participants?.length) setParticipants(partRes.participants);
      } catch {
        /* ignore */
      } finally {
        if (!stop) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [slug]);

  const flatItems = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'cancelled' && o.status !== 'pending_confirmation')
      .flatMap((o) =>
        o.items.map((it) => ({
          ...it,
          orderId: o.id,
          billingMode: o.billing_mode,
        })),
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [orders]);

  const filtered = flatItems.filter((it) => {
    if (tab === 'all') return true;
    if (tab === 'mine') return it.customerId && it.customerId === customerId;
    if (tab === 'shared') return !it.customerId;
    return true;
  });

  const subtotalCents = flatItems.reduce((s, it) => s + it.subtotalCents, 0);
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  const perPerson = participants.length > 0 ? subtotalCents / participants.length : subtotalCents;

  if (loading) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pedido/mesa`}
      >
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pedido/mesa`}
      noMainPadding
    >
      <div className="flex flex-1 flex-col">
        <div className="shrink-0 px-[22px] pb-3 pt-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
                Comanda compartilhada
              </div>
              <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
                Pedido da mesa
              </h1>
            </div>
            {participants.length > 0 && (
              <AvatarStack people={participants} size={30} max={4} />
            )}
          </div>
          <div className="mt-1.5 text-[12px] text-mute">
            {participants.length || 0} {participants.length === 1 ? 'pessoa' : 'pessoas'} ·{' '}
            {flatItems.length} {flatItems.length === 1 ? 'item' : 'itens'} · atualizado agora
          </div>
        </div>

        <div className="flex shrink-0 gap-2 px-[22px] pb-3.5">
          {(
            [
              { key: 'all', label: 'Todos' },
              { key: 'mine', label: 'Meus' },
              { key: 'shared', label: 'Compartilhados' },
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full border-[1.2px] border-ink px-3.5 py-[7px] text-[12px] font-medium transition-colors ${
                  active ? 'bg-ink text-white' : 'bg-bg text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto px-[22px] pb-5">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-[13px] text-mute">
              Nenhum item nesta categoria.
            </div>
          )}
          {filtered.map((it) => {
            const person = participants.find((p) => p.customerId === it.customerId);
            const shared = !it.customerId;
            const fresh = isRecent(it.createdAt);
            return (
              <div
                key={it.id}
                className="flex items-start gap-3 border-b border-border-soft py-3.5"
              >
                {person ? (
                  <Avatar initial={person.initial} color={person.color} size={32} />
                ) : shared ? (
                  <Avatar initial="⊞" dashed size={32} />
                ) : (
                  <Avatar initial="?" color="#a3a3a3" size={32} />
                )}
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[15px] font-medium tracking-[-0.005em]">
                      {it.quantity}× {it.name}
                    </div>
                    <div className="shrink-0 text-[14px] font-semibold tabular-nums">
                      {fmt(it.subtotalCents)}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-mute">
                    <span>{shared ? 'compartilhado' : `por ${person?.name ?? 'convidado'}`}</span>
                    <span>·</span>
                    <span className="tabular-nums">{formatTime(it.createdAt)}</span>
                    {fresh && (
                      <span className="ml-1 rounded-full bg-ink px-1.5 py-[1px] text-[9px] font-semibold tracking-[0.3px] text-white">
                        NOVO
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-[18px] border-t-[1.3px] border-ink pt-4">
            <Row label="Subtotal" value={fmt(subtotalCents)} />
            <div className="h-1.5" />
            <Row
              label={<b className="text-[15px] text-ink">Total da mesa</b>}
              value={<b className="text-[19px] text-ink tabular-nums">{fmt(subtotalCents)}</b>}
            />
            {participants.length > 0 && (
              <div className="mt-0.5 text-right text-[11px] text-mute">
                ÷ {participants.length} = {fmt(Math.round(perPerson))} por pessoa
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
          <PillButton
            onClick={() => push(`/${slug}/pagamento/dividir`)}
            className="flex-1"
          >
            Dividir conta
          </PillButton>
          <PillButton
            variant="filled"
            onClick={() => push(`/${slug}/pagamento`)}
            className="flex-1"
          >
            Pagar minha parte
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
