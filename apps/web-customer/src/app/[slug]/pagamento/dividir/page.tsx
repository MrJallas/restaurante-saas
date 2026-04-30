'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';
import { Avatar } from '../../../../components/ui/Avatar';

interface ApiOrderItem {
  id: string;
  name: string;
  quantity: number;
  subtotalCents: number;
  customerId?: string | null;
}

interface ApiOrder {
  id: string;
  status: string;
  items: ApiOrderItem[];
}

interface Participant {
  customerId: string;
  name: string;
  initial: string;
  color: string;
}

type Mode = 'equal' | 'by_item' | 'custom';

interface Allocation {
  customerId: string;
  amountCents: number;
}

const SERVICE_RATE = 0.1;

export default function PagamentoDividirPage() {
  const params = useParams();
  const router = useRouter();
  const { push } = useNav();
  const { tableLabel, customerId, participants: sessionParticipants } = useSession();
  const slug = params.slug as string;

  const [mode, setMode] = useState<Mode>('by_item');
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [participants, setParticipants] = useState<Participant[]>(sessionParticipants ?? []);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let stop = false;
    const load = async () => {
      try {
        const [oRes, pRes] = await Promise.all([
          apiGet<{ orders: ApiOrder[] }>(`/${slug}/orders?scope=table`),
          apiGet<{ participants: Participant[] }>(`/${slug}/table/participants`),
        ]);
        if (stop) return;
        setOrders(oRes.orders);
        if (pRes.participants?.length) setParticipants(pRes.participants);
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
  }, [slug]);

  const items = useMemo(
    () =>
      orders
        .filter((o) => o.status !== 'cancelled' && o.status !== 'pending_confirmation')
        .flatMap((o) => o.items),
    [orders],
  );

  const subtotalCents = items.reduce((s, it) => s + it.subtotalCents, 0);
  const serviceCents = Math.round(subtotalCents * SERVICE_RATE);
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  useEffect(() => {
    if (participants.length === 0 || items.length === 0) return;
    if (mode === 'equal') {
      const per = Math.round((subtotalCents + serviceCents) / participants.length);
      setAllocations(
        participants.map((p) => ({ customerId: p.customerId, amountCents: per })),
      );
    } else if (mode === 'by_item') {
      const totals = new Map<string, number>();
      participants.forEach((p) => totals.set(p.customerId, 0));
      const sharedItems: ApiOrderItem[] = [];
      for (const it of items) {
        if (it.customerId) {
          totals.set(it.customerId, (totals.get(it.customerId) ?? 0) + it.subtotalCents);
        } else {
          sharedItems.push(it);
        }
      }
      const sharedTotal = sharedItems.reduce((s, it) => s + it.subtotalCents, 0);
      const share = participants.length > 0 ? Math.round(sharedTotal / participants.length) : 0;
      participants.forEach((p) => {
        totals.set(p.customerId, (totals.get(p.customerId) ?? 0) + share);
      });
      const subtotalsByPerson = Array.from(totals.entries()).map(([cid, subtotal]) => ({
        customerId: cid,
        amountCents: subtotal + Math.round(subtotal * SERVICE_RATE),
      }));
      setAllocations(subtotalsByPerson);
    }
  }, [mode, participants, items, subtotalCents, serviceCents]);

  const mineAlloc = allocations.find((a) => a.customerId === customerId);
  const mineAmount = mineAlloc?.amountCents ?? 0;

  const handlePayMine = async () => {
    if (submitting || !customerId) return;
    setSubmitting(true);
    try {
      const res = await apiPost<{ paymentId: string }>(`/${slug}/payments`, {
        mode: 'individual',
        method: 'pix',
        splitMode: mode,
        allocations,
      });
      push(`/${slug}/pagamento/pix?paymentId=${res.paymentId}`);
    } catch {
      setSubmitting(false);
      push(`/${slug}/pagamento/erro?reason=gateway`);
    }
  };

  const handleSendSummary = async () => {
    try {
      await apiPost(`/${slug}/payments/bill/split/notify`, {
        mode,
        allocations,
      });
    } catch {
      /* ignore */
    }
    router.back();
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

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pagamento`}
      noMainPadding
    >
      <div className="flex flex-1 flex-col">
        <div className="shrink-0 px-[22px] pb-3 pt-1">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
            {tableLabel || 'Mesa'} · {participants.length}{' '}
            {participants.length === 1 ? 'pessoa' : 'pessoas'}
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Dividir conta</h1>
        </div>

        <div className="shrink-0 px-[22px] pb-3.5">
          <div className="flex gap-0.5 rounded-full border border-border-soft bg-surface p-1">
            {(
              [
                { key: 'equal', label: 'Igual' },
                { key: 'by_item', label: 'Por item' },
                { key: 'custom', label: 'Customizado' },
              ] as const
            ).map((m) => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`flex-1 rounded-full px-2.5 py-2 text-center text-[12px] transition-colors ${
                    active ? 'bg-ink font-semibold text-white' : 'font-medium text-mute'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-[22px] pb-5">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
            Itens da mesa
          </div>
          {items.map((it) => {
            const person = participants.find((p) => p.customerId === it.customerId);
            const shared = !it.customerId;
            const shareCents =
              shared && participants.length > 0
                ? Math.round(it.subtotalCents / participants.length)
                : 0;
            return (
              <div key={it.id} className="border-b border-border-soft py-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <div className="text-[14px] font-medium">{it.name}</div>
                  <div className="text-[14px] font-semibold tabular-nums">
                    {fmt(it.subtotalCents)}
                  </div>
                </div>
                {shared ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.5px] text-mute">
                      Dividido entre
                    </span>
                    <div className="flex">
                      {participants.map((p, j) => (
                        <div key={p.customerId} style={{ marginLeft: j === 0 ? 0 : -6 }}>
                          <Avatar initial={p.initial} color={p.color} size={22} border />
                        </div>
                      ))}
                    </div>
                    <span className="ml-auto text-[11px] text-mute tabular-nums">
                      {fmt(shareCents)} cada
                    </span>
                  </div>
                ) : person ? (
                  <div className="flex items-center gap-2">
                    <Avatar initial={person.initial} color={person.color} size={22} />
                    <span className="text-[12px] text-mute">somente {person.name}</span>
                  </div>
                ) : (
                  <div className="text-[12px] text-mute">não atribuído</div>
                )}
              </div>
            );
          })}

          <div className="mt-[22px]">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
              Resumo por pessoa
            </div>
            {participants.map((p) => {
              const alloc = allocations.find((a) => a.customerId === p.customerId);
              const amt = alloc?.amountCents ?? 0;
              const base = Math.round(amt / (1 + SERVICE_RATE));
              const me = p.customerId === customerId;
              return (
                <div
                  key={p.customerId}
                  className={`mb-2 flex items-center gap-3 rounded-[14px] border-[1.3px] bg-bg px-4 py-3.5 ${
                    me ? 'border-ink' : 'border-border-soft'
                  }`}
                >
                  <Avatar initial={p.initial} color={p.color} size={34} />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-[14px] font-semibold">
                      {p.name}
                      {me && (
                        <span className="rounded-full bg-ink px-1.5 py-[1px] text-[9px] font-semibold tracking-[0.3px] text-white">
                          VOCÊ
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-mute">
                      base {fmt(base)} · + taxa 10%
                    </div>
                  </div>
                  <div className="text-[16px] font-semibold tabular-nums">{fmt(amt)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
          <PillButton onClick={handleSendSummary} className="flex-1">
            Enviar resumo
          </PillButton>
          <PillButton
            variant="filled"
            onClick={handlePayMine}
            disabled={submitting || mineAmount === 0}
            className="flex-1"
          >
            {submitting ? 'Gerando…' : `Pagar ${fmt(mineAmount)}`}
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
