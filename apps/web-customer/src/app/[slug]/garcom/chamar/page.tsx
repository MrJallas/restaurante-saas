'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiPost } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { PillButton } from '../../../../components/ui/PillButton';

type Reason =
  | 'bring_menu'
  | 'place_order'
  | 'serve_drink'
  | 'ask_bill'
  | 'other';

const REASONS: { key: Reason; label: string }[] = [
  { key: 'bring_menu', label: 'Trazer o cardápio' },
  { key: 'place_order', label: 'Fazer um pedido' },
  { key: 'serve_drink', label: 'Servir bebida / vinho' },
  { key: 'ask_bill', label: 'Pedir a conta' },
  { key: 'other', label: 'Outro motivo' },
];

interface WaiterCallResponse {
  callId: string;
  waiterName?: string;
  etaMinutes?: number;
}

export default function ChamarGarcomPage() {
  const params = useParams();
  const router = useRouter();
  const { push } = useNav();
  const { visitId, customerId } = useSession();
  const slug = params.slug as string;

  const [selected, setSelected] = useState<Reason>('place_order');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCall = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiPost<WaiterCallResponse>(`/${slug}/waiter-calls`, {
        reason: selected,
        visitId: visitId || undefined,
        customerId: customerId || undefined,
      });
      push(`/${slug}/garcom/chamando?callId=${res.callId}&reason=${selected}`);
    } catch (e) {
      const msg =
        e instanceof Error && e.message.toLowerCase().includes('avisado')
          ? 'O garçom já foi avisado. Aguarde ou fale direto com ele.'
          : 'Não foi possível chamar o garçom. Tente novamente.';
      setErrorMsg(msg);
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  return (
    // Bottom sheet em tela cheia. Antes a sheet ficava `mt-auto` num
    // container `relative` e o backdrop era `absolute inset-0` — em iOS
    // Safari, a ordem de pintura CSS (positioned > in-flow) deixava o
    // backdrop *sobre* a sheet, e o tap em "Chamar agora" caia no botao
    // de fechar. Sintoma reportado: "chamar garcom nao funciona".
    // Agora: container `fixed inset-0` (cobre a viewport mesmo com scroll
    // externo), backdrop `absolute inset-0 z-0` e sheet `relative z-10`
    // — z-index explicito garante hit-test correto.
    <div className="fixed inset-0 z-50 flex flex-col text-ink">
      <button
        type="button"
        aria-label="Fechar"
        onClick={handleClose}
        className="absolute inset-0 z-0 bg-ink/40"
      />
      <div className="relative z-10 mt-auto flex flex-col rounded-t-[28px] border-[1.5px] border-b-0 border-ink bg-bg px-6 pb-safe pt-2.5 pb-[30px]">
        <div className="mx-auto mb-[18px] h-[5px] w-11 rounded-[3px] bg-border-soft" />
        <div className="mb-1.5 text-center text-[22px] font-semibold tracking-[-0.02em]">
          Chamar garçom
        </div>
        <div className="mb-[22px] text-center text-[13px] text-mute text-pretty">
          Avise-nos do que você precisa para agilizar o atendimento.
        </div>

        <div className="mb-4 flex flex-col gap-2">
          {REASONS.map((r) => {
            const sel = selected === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setSelected(r.key)}
                className={`flex items-center gap-3 rounded-[14px] border-[1.3px] bg-bg px-4 py-[13px] text-left ${
                  sel ? 'border-ink' : 'border-border-soft'
                }`}
              >
                <div
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    sel ? 'border-ink bg-ink' : 'border-border-soft bg-transparent'
                  }`}
                >
                  {sel && <div className="h-2 w-2 rounded-full bg-bg" />}
                </div>
                <span className="text-[14px] font-medium">{r.label}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mb-3 rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger"
          >
            {errorMsg}
          </div>
        )}
        <PillButton variant="filled" fullWidth onClick={handleCall} disabled={submitting}>
          {submitting ? 'Chamando…' : 'Chamar agora'}
        </PillButton>
        <button
          type="button"
          onClick={handleClose}
          className="mt-1.5 w-full p-2.5 text-[12px] text-mute underline underline-offset-[3px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
