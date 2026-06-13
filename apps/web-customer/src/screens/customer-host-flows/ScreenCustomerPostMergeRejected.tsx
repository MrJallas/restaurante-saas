'use client';

import { PillButton } from '../../components/ui/PillButton';

interface ScreenCustomerPostMergeRejectedProps {
  originTableNumber?: number | null;
  targetTableNumber?: number | null;
  /**
   * Quem encerrou o convite: 'b' = a outra mesa recusou; 'timeout' =
   * ninguém respondeu a tempo; 'a' = o próprio solicitante cancelou (esse
   * caso nem renderiza este card — o handler WS filtra; fica aqui só por
   * completude de copy).
   */
  rejectedBy?: 'a' | 'b' | 'timeout' | null;
  onCallHost: () => void;
  onTryAnother: () => void;
  onContinueHere: () => void;
}

const COPY: Record<'a' | 'b' | 'timeout' | 'default', { title: string; body: string }> = {
  b: {
    title: 'Vocês seguem separados',
    body: 'Tudo certo, a outra mesa preferiu continuar como estava. Ninguém precisa fazer nada agora.',
  },
  timeout: {
    title: 'Ninguém respondeu a tempo',
    body: 'O convite expirou sem resposta da outra mesa. Vocês seguem como estavam — dá pra tentar de novo quando quiser.',
  },
  a: {
    title: 'Convite cancelado',
    body: 'Você cancelou o pedido de junção. Tudo segue como estava.',
  },
  default: {
    title: 'Vocês seguem separados',
    body: 'A junção não aconteceu desta vez. Ninguém precisa fazer nada agora.',
  },
};

export function ScreenCustomerPostMergeRejected({
  originTableNumber,
  targetTableNumber,
  rejectedBy = null,
  onCallHost,
  onTryAnother,
  onContinueHere,
}: ScreenCustomerPostMergeRejectedProps) {
  const pair =
    originTableNumber && targetTableNumber
      ? `Mesa ${originTableNumber} + Mesa ${targetTableNumber}`
      : 'Junção de mesas';
  const copy = COPY[rejectedBy ?? 'default'] ?? COPY.default;

  return (
    <section
      data-testid="post-merge-rejected"
      className="max-w-[92%] self-start rounded-[16px] border border-border-soft bg-surface px-4 py-4 text-ink"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-faint">
        {pair}
      </span>
      <h2 className="mt-2 text-[20px] font-bold leading-[1.15] tracking-[-0.3px]">{copy.title}</h2>
      <p className="mt-2 text-[13px] font-medium leading-[1.45] text-mute">{copy.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <PillButton variant="filled" onClick={onCallHost}>
          Chamar recepcionista
        </PillButton>
        <PillButton variant="outline" onClick={onTryAnother}>
          Tentar outra mesa
        </PillButton>
        <PillButton variant="outline" onClick={onContinueHere}>
          Continuar aqui
        </PillButton>
      </div>
    </section>
  );
}
