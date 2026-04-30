'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPatch } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';

type Reason = 'bring_menu' | 'place_order' | 'serve_drink' | 'ask_bill' | 'other';

const REASON_LABELS: Record<Reason, string> = {
  bring_menu: 'Trazer o cardápio',
  place_order: 'Fazer um pedido',
  serve_drink: 'Servir bebida ou vinho',
  ask_bill: 'Pedir a conta',
  other: 'Outro motivo',
};

interface WaiterCall {
  id: string;
  status: string;
  waiterName?: string;
  etaMinutes?: number;
}

export default function GarcomChamandoPage() {
  const params = useParams();
  const router = useRouter();
  const { push, replace } = useNav();
  const searchParams = useSearchParams();
  const { tableLabel } = useSession();
  const slug = params.slug as string;
  const callId = searchParams.get('callId') ?? '';
  const reason = (searchParams.get('reason') ?? 'place_order') as Reason;

  const [call, setCall] = useState<WaiterCall | null>(null);
  const [dots, setDots] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!callId || !slug) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await apiGet<WaiterCall>(`/${slug}/waiter-calls/${callId}`);
        if (stop) return;
        setCall(data);
        if (data.status === 'resolved') {
          router.replace(`/${slug}/cardapio`);
        }
      } catch {
        /* ignore */
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [callId, slug, router]);

  const handleCancel = useCallback(async () => {
    if (cancelling || !callId) return;
    setCancelling(true);
    try {
      await apiPatch(`/${slug}/waiter-calls/${callId}/cancel`, {});
    } catch {
      /* ignore */
    }
    // replace em vez de push: assim o swipe-back do iOS Safari nao
    // traz o usuario de volta pra tela "CHAMADO RECEBIDO" de um chamado
    // ja cancelado (ghost screen do bug-hunt).
    replace(`/${slug}/assistente`);
  }, [cancelling, callId, replace, slug]);

  const isAcknowledged = call?.status === 'acknowledged';
  const waiterName = call?.waiterName;
  const eta = call?.etaMinutes;

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/garcom`}
      noMainPadding
      onBack={() => push(`/${slug}/assistente`)}
    >
      <div className="flex flex-1 flex-col overflow-auto px-6 pb-5 pt-2.5">
        <div className="flex flex-col items-center pb-[26px] pt-[30px]">
          <div className="relative mb-[22px] flex h-[100px] w-[100px] items-center justify-center rounded-full border-2 border-ink">
            <div
              className="pointer-events-none absolute -inset-2 animate-ripple rounded-full border-2 border-ink opacity-[0.15]"
              style={{ animationDelay: '0s' }}
            />
            <div
              className="pointer-events-none absolute -inset-4 animate-ripple rounded-full border-2 border-ink opacity-[0.1]"
              style={{ animationDelay: '0.5s' }}
            />
            <span className="text-[44px]">◔</span>
          </div>
          {isAcknowledged ? (
            <>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-success">
                Chamado confirmado
              </div>
              <div className="text-center text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-pretty">
                Um garçom está a caminho!
              </div>
              <div className="mx-auto mt-2.5 max-w-[300px] text-center text-[13px] leading-[1.5] text-mute text-pretty">
                Ele já está se dirigindo à sua mesa.
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-mute">
                Aguardando confirmação
              </div>
              <div className="text-center text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-pretty">
                Chamando garçom{'.'.repeat(dots)}
              </div>
              <div className="mx-auto mt-2.5 max-w-[300px] text-center text-[13px] leading-[1.5] text-mute text-pretty">
                O chamado foi enviado. Aguarde a confirmação do garçom.
              </div>
            </>
          )}
        </div>

        {isAcknowledged && waiterName && (
          <div className="mb-3.5 flex items-center gap-3.5 rounded-[18px] border-[1.3px] border-ink p-4">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[1.2px] border-ink bg-surface text-[18px] font-semibold">
              {waiterName[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[1px] text-mute">
                Seu garçom
              </div>
              <div className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em]">
                {waiterName}
              </div>
              {eta != null && (
                <div className="mt-0.5 text-[11px] text-mute">
                  Tempo estimado: {eta} min
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-3.5 flex items-start gap-2.5 rounded-[12px] border border-border-soft bg-surface p-3.5 text-[12px] leading-[1.5] text-ink text-pretty">
          <span className="text-[14px]">✦</span>
          <div>
            <b>Motivo:</b> {REASON_LABELS[reason]}.
            <br />
            <span className="text-mute">
              Enquanto espera, você pode continuar navegando pelo cardápio.
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
        <PillButton onClick={handleCancel} disabled={cancelling} className="flex-1">
          Cancelar chamado
        </PillButton>
        <PillButton
          variant="filled"
          onClick={() => push(`/${slug}/cardapio`)}
          className="flex-1"
        >
          Ver cardápio
        </PillButton>
      </div>
    </AppShell>
  );
}
