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
  // Taxa vem do backend (settings.service_fee_pct via GET /orders/bill) —
  // preview local usa o MESMO pct que o POST /payments cobra.
  const [serviceFeePct, setServiceFeePct] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  // Total da mesa COM taxa (canônico do backend) — alvo que a soma do split
  // 'custom' precisa fechar. Vem do compute (equal/by_item retornam totalCents).
  const [totalDueCents, setTotalDueCents] = useState(0);
  // Split 'customizado': valor (em centavos) que cada participante paga,
  // chaveado por customerId. É o editor que faltava — o backend rejeita a
  // divisão se a soma não bate com o total da mesa (short-pay), então o FE
  // coleta e valida a soma ANTES de mandar.
  const [customCents, setCustomCents] = useState<Record<string, number>>({});
  const [customSeeded, setCustomSeeded] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let stop = false;
    const load = async () => {
      try {
        const [oRes, pRes, bRes] = await Promise.all([
          apiGet<{ orders: ApiOrder[] }>(`/${slug}/orders?scope=table`),
          apiGet<{ participants: Participant[] }>(`/${slug}/table/participants`),
          apiGet<{ serviceFeePct?: number }>(`/${slug}/orders/bill?mode=table`),
        ]);
        if (stop) return;
        setOrders(oRes.orders);
        if (pRes.participants?.length) setParticipants(pRes.participants);
        if (typeof bRes.serviceFeePct === 'number') setServiceFeePct(bRes.serviceFeePct);
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

  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  // Decisão Caleb 2026-07-04: o rateio é CANÔNICO no backend — o preview
  // vem do POST bill/split/compute (mesa + taxa + participantes aprovados
  // server-side) e "pagar minha parte" envia exatamente a parte calculada.
  // Para 'custom' pedimos o rateio 'equal' apenas pra saber o TOTAL da mesa
  // (alvo que a soma manual precisa fechar) e semear os campos com uma
  // divisão igual — as allocations em si vêm do editor, não do backend.
  useEffect(() => {
    let stop = false;
    const computeMode = mode === 'custom' ? 'equal' : mode;
    apiPost<{
      allocations: Allocation[];
      serviceFeePct: number;
      subtotalCents: number;
      totalCents: number;
    }>(`/${slug}/payments/bill/split/compute`, { mode: computeMode, participants: [] })
      .then((res) => {
        if (stop) return;
        if (typeof res.totalCents === 'number') setTotalDueCents(res.totalCents);
        if (typeof res.serviceFeePct === 'number') setServiceFeePct(res.serviceFeePct);
        if (mode === 'custom') {
          // Semeia os campos UMA vez com a divisão igual — depois é o usuário
          // que ajusta. Re-semeia se o nº de participantes mudar.
          setCustomCents((prev) => {
            if (customSeeded && Object.keys(prev).length === res.allocations.length) return prev;
            const seed: Record<string, number> = {};
            for (const a of res.allocations) seed[a.customerId] = a.amountCents;
            return seed;
          });
          setCustomSeeded(true);
        } else {
          setAllocations(res.allocations);
        }
      })
      .catch(() => {
        if (!stop && mode !== 'custom') setAllocations([]);
      });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, slug, participants.length, items.length]);

  // Em 'custom' as allocations são derivadas do editor (customCents), cobrindo
  // todos os participantes; nos demais modos vêm do backend.
  const effectiveAllocations = useMemo<Allocation[]>(
    () =>
      mode === 'custom'
        ? participants.map((p) => ({
            customerId: p.customerId,
            amountCents: customCents[p.customerId] ?? 0,
          }))
        : allocations,
    [mode, participants, customCents, allocations],
  );

  const customSumCents = useMemo(
    () =>
      mode === 'custom'
        ? participants.reduce((s, p) => s + (customCents[p.customerId] ?? 0), 0)
        : 0,
    [mode, participants, customCents],
  );

  // Tolerância de arredondamento igual à do backend (1 centavo por
  // participante) — a soma "fecha" quando fica dentro dessa janela.
  const customRemainderCents = totalDueCents - customSumCents;
  const customBalanced =
    mode !== 'custom' || Math.abs(customRemainderCents) <= Math.max(participants.length, 1);

  const setCustomAmount = (cid: string, cents: number) =>
    setCustomCents((prev) => ({ ...prev, [cid]: Math.max(0, cents) }));

  const mineAlloc = effectiveAllocations.find((a) => a.customerId === customerId);
  const mineAmount = mineAlloc?.amountCents ?? 0;

  const handlePayMine = async () => {
    // Em 'custom' a soma precisa fechar com o total da mesa — senão o
    // backend rejeita (short-pay) e o cliente cairia na tela de erro.
    if (submitting || !customerId || !customBalanced || mineAmount === 0) return;
    setSubmitting(true);
    try {
      const res = await apiPost<{ paymentId: string }>(`/${slug}/payments`, {
        mode: 'individual',
        method: 'pix',
        splitMode: mode,
        allocations: effectiveAllocations,
      });
      push(`/${slug}/pagamento/pix?paymentId=${res.paymentId}`);
    } catch {
      setSubmitting(false);
      push(`/${slug}/pagamento/erro?reason=gateway`);
    }
  };

  const handleSendSummary = async () => {
    if (mode === 'custom' && !customBalanced) return;
    try {
      await apiPost(`/${slug}/payments/bill/split/notify`, {
        mode,
        allocations: effectiveAllocations,
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
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
                {mode === 'custom' ? 'Quanto cada um paga' : 'Resumo por pessoa'}
              </span>
              {mode === 'custom' && (
                <span className="text-[11px] text-mute tabular-nums">
                  total {fmt(totalDueCents)}
                </span>
              )}
            </div>
            {participants.map((p) => {
              const amt =
                mode === 'custom'
                  ? (customCents[p.customerId] ?? 0)
                  : (allocations.find((a) => a.customerId === p.customerId)?.amountCents ?? 0);
              const base = Math.round(amt / (1 + serviceFeePct / 100));
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
                      {mode === 'custom'
                        ? `inclui taxa ${String(serviceFeePct).replace('.', ',')}%`
                        : `base ${fmt(base)} · + taxa ${String(serviceFeePct).replace('.', ',')}%`}
                    </div>
                  </div>
                  {mode === 'custom' ? (
                    <CustomAmountField
                      valueCents={customCents[p.customerId] ?? 0}
                      onChangeCents={(c) => setCustomAmount(p.customerId, c)}
                    />
                  ) : (
                    <div className="text-[16px] font-semibold tabular-nums">{fmt(amt)}</div>
                  )}
                </div>
              );
            })}

            {mode === 'custom' && (
              <div
                className={`mt-1 flex items-center justify-between rounded-[12px] border px-4 py-2.5 text-[12px] tabular-nums ${
                  customBalanced
                    ? 'border-border-soft text-mute'
                    : 'border-ink bg-surface font-medium text-ink'
                }`}
              >
                <span>Soma {fmt(customSumCents)}</span>
                {customBalanced ? (
                  <span>fecha com a conta ✓</span>
                ) : (
                  <span>
                    {customRemainderCents > 0
                      ? `faltam ${fmt(customRemainderCents)}`
                      : `${fmt(-customRemainderCents)} a mais`}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
          <PillButton
            onClick={handleSendSummary}
            disabled={mode === 'custom' && !customBalanced}
            className="flex-1"
          >
            Enviar resumo
          </PillButton>
          <PillButton
            variant="filled"
            onClick={handlePayMine}
            disabled={submitting || mineAmount === 0 || !customBalanced}
            className="flex-1"
          >
            {submitting ? 'Gerando…' : `Pagar ${fmt(mineAmount)}`}
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Campo de valor por pessoa do split 'customizado'. Digita em reais
 * (aceita vírgula ou ponto) e emite centavos pro pai. Naked-ish: herda o
 * card do participante, só desenha o prefixo R$ e o próprio valor alinhado
 * à direita com tabular-nums (mesmo canon dos valores da página).
 */
function CustomAmountField({
  valueCents,
  onChangeCents,
}: {
  valueCents: number;
  onChangeCents: (cents: number) => void;
}) {
  // Texto local pra não brigar com o cursor enquanto o usuário digita
  // (ex.: "12," intermediário). Ressincroniza quando o valor externo muda
  // (semear com a divisão igual).
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setText(valueCents > 0 ? (valueCents / 100).toFixed(2).replace('.', ',') : '');
  }, [valueCents, focused]);

  const handleChange = (raw: string) => {
    // Mantém só dígitos e um separador decimal; converte pra centavos.
    const cleaned = raw.replace(/[^\d.,]/g, '').replace(/\./g, ',');
    setText(cleaned);
    const normalized = cleaned.replace(',', '.');
    const reais = parseFloat(normalized);
    onChangeCents(Number.isFinite(reais) ? Math.round(reais * 100) : 0);
  };

  return (
    <div
      className={`flex items-center gap-1 rounded-[10px] border-[1.3px] px-2.5 py-1.5 ${
        focused ? 'border-ink' : 'border-border-soft'
      }`}
    >
      <span className="text-[13px] text-mute">R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="0,00"
        aria-label="Valor a pagar"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => handleChange(e.target.value)}
        className="w-[68px] bg-transparent text-right text-[15px] font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-faint"
      />
    </div>
  );
}
