'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { apiGet } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';
import {
  EnviadoOrdersLoadError,
  loadEnviadoOrders,
  parseEnviadoOrderIds,
  ENVIADO_STATUS_INDEX as STATUS_INDEX,
  type EnviadoOrder,
} from './aggregate';

const DEFAULT_STEPS: { key: string; label: string }[] = [
  { key: 'received', label: 'Recebido pela cozinha' },
  { key: 'in_progress', label: 'Em preparo' },
  { key: 'ready', label: 'Pronto para servir' },
  { key: 'in_transit', label: 'A caminho da mesa' },
  { key: 'delivered', label: 'Na sua mesa' },
];

export default function PedidoEnviadoPage() {
  const params = useParams();
  const { push } = useNav();
  const searchParams = useSearchParams();
  const { tableLabel } = useSession();
  const slug = params.slug as string;
  // Carrinho misto = um order por billingMode; a tela reflete TODOS.
  const orderIds = parseEnviadoOrderIds(searchParams);
  const orderIdsKey = orderIds.join(',');

  const [order, setOrder] = useState<EnviadoOrder | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const ids = orderIdsKey ? orderIdsKey.split(',') : [];
    let stop = false;
    let hasVerifiedOrder = false;
    setOrder(null);
    setLoadState('loading');
    setLoadError('');
    const load = async () => {
      try {
        const result = await loadEnviadoOrders(ids, (id) =>
          apiGet<EnviadoOrder>(`/${slug}/orders/${id}`),
        );
        if (!stop) {
          hasVerifiedOrder = true;
          setOrder(result);
          setLoadState('ready');
        }
      } catch (error) {
        if (stop || (hasVerifiedOrder && !(error instanceof EnviadoOrdersLoadError))) return;
        setLoadError(
          error instanceof EnviadoOrdersLoadError && error.code === 'missing_order_ids'
            ? 'Não encontrei um pedido para confirmar. Volte ao pedido e tente novamente.'
            : error instanceof EnviadoOrdersLoadError && error.code === 'order_not_sent'
              ? 'O pedido ainda não aparece como enviado para a cozinha. Tente novamente ou volte ao pedido.'
              : 'Não consegui confirmar o envio do pedido. Verifique sua conexão e tente novamente.',
        );
        setLoadState('error');
      }
    };
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [orderIdsKey, slug, reloadNonce]);

  if (loadState !== 'ready' || !order) {
    const failed = loadState === 'error';
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pedido/enviado`}
        onBack={() => push(`/${slug}/pedido`)}
      >
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-[320px]">
            <div className="text-[11px] font-bold uppercase tracking-[1.5px] text-mute">
              {failed ? 'Envio não confirmado' : 'Confirmando envio'}
            </div>
            <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
              {failed ? 'Ainda não consegui validar seu pedido' : 'Só um instante…'}
            </h1>
            <p
              className="mt-2 text-[13px] leading-[1.5] text-mute"
              role={failed ? 'alert' : undefined}
            >
              {failed ? loadError : 'Estamos consultando a cozinha antes de confirmar o envio.'}
            </p>
            {failed && (
              <div className="mt-5 flex flex-col gap-2.5">
                <PillButton variant="filled" fullWidth onClick={() => setReloadNonce((n) => n + 1)}>
                  Tentar novamente
                </PillButton>
                <PillButton fullWidth onClick={() => push(`/${slug}/pedido`)}>
                  Voltar ao pedido
                </PillButton>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  const currentIndex = STATUS_INDEX[order.status] ?? 0;
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  // ETA real do backend (fila + prioridade + estágio) — o fallback
  // hardcoded "22–28 minutos" saiu; antes do primeiro fetch mostra
  // "calculando…" e pedido entregue mostra "—".
  const eta =
    order.etaMinutesMin != null && order.etaMinutesMax != null
      ? order.etaMinutesMax <= 3
        ? `~${order.etaMinutesMax} min`
        : `${order.etaMinutesMin}–${order.etaMinutesMax} minutos`
      : '—';
  const items = order.items;
  const totalCents = order.totalCents;

  const summaryLine = items.map((it) => `${it.quantity}× ${it.name}`).join(' · ');

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pedido/enviado`}
      noMainPadding
      onBack={() => push(`/${slug}/assistente`)}
    >
      <div className="flex flex-1 flex-col overflow-auto px-6 pb-5 pt-5">
        <div className="flex flex-col items-center pb-6 pt-5">
          <div className="mb-5 flex h-20 w-20 animate-pop-in items-center justify-center rounded-full border-2 border-success text-[36px] text-success">
            ✓
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-success">
            Enviado para a cozinha
          </div>
          <div className="text-center text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-pretty">
            Seu pedido está a caminho
          </div>
          <div className="mt-2 max-w-[280px] text-center text-[13px] text-mute text-pretty">
            Estamos preparando tudo. Você vai acompanhar o progresso em tempo real.
          </div>
        </div>

        <div className="mb-5 flex items-center gap-4 rounded-[18px] border-[1.5px] border-ink p-[18px]">
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink text-[20px]">
            ◷
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[1.2px] text-mute">
              Tempo estimado
            </div>
            <div className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em] tabular-nums">
              {eta}
            </div>
          </div>
        </div>

        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
          Progresso
        </div>
        <div className="mb-5 pl-1">
          {DEFAULT_STEPS.map((s, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const isLast = i === DEFAULT_STEPS.length - 1;
            return (
              <div key={s.key} className="relative flex gap-3.5">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] text-white ${
                      done
                        ? 'border-ink bg-ink'
                        : active
                          ? 'animate-pulse-dot border-ink bg-bg'
                          : 'border-border-soft bg-bg'
                    }`}
                  >
                    {done && '✓'}
                  </div>
                  {!isLast && (
                    <div
                      className={`min-h-[26px] w-[1.5px] flex-1 ${
                        done ? 'bg-ink' : 'bg-border-soft'
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1 pb-[18px]">
                  <div
                    className={`text-[14px] ${
                      active
                        ? 'font-semibold text-ink'
                        : done
                          ? 'font-medium text-ink'
                          : 'font-medium text-faint'
                    }`}
                  >
                    {s.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-mute">
                    {active ? 'agora' : done ? 'concluído' : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {items.length > 0 && (
          <div className="mb-3 rounded-[14px] border border-border-soft bg-surface p-3.5 text-[12px] leading-[1.6] text-mute">
            <div className="mb-1.5 font-semibold text-ink">
              {items.reduce((s, it) => s + it.quantity, 0)} itens · {fmt(totalCents)}
            </div>
            {summaryLine}
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
        <PillButton onClick={() => push(`/${slug}/cardapio`)} className="flex-1">
          Ver cardápio
        </PillButton>
        <PillButton variant="filled" onClick={() => push(`/${slug}/pedido`)} className="flex-1">
          Acompanhar
        </PillButton>
      </div>
    </AppShell>
  );
}
