'use client';

import { PillButton } from '../../components/ui/PillButton';

interface ScreenCustomerPostMergeRejectedProps {
  originTableNumber?: number | null;
  targetTableNumber?: number | null;
  onCallHost: () => void;
  onTryAnother: () => void;
  onContinueHere: () => void;
}

export function ScreenCustomerPostMergeRejected({
  originTableNumber,
  targetTableNumber,
  onCallHost,
  onTryAnother,
  onContinueHere,
}: ScreenCustomerPostMergeRejectedProps) {
  const pair =
    originTableNumber && targetTableNumber
      ? `Mesa ${originTableNumber} + Mesa ${targetTableNumber}`
      : 'Junção de mesas';

  return (
    <section
      data-testid="post-merge-rejected"
      className="max-w-[92%] self-start rounded-[16px] border border-border-soft bg-surface px-4 py-4 text-ink"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-faint">
        {pair}
      </span>
      <h2 className="mt-2 text-[20px] font-bold leading-[1.15] tracking-[-0.3px]">
        Vocês seguem separados
      </h2>
      <p className="mt-2 text-[13px] font-medium leading-[1.45] text-mute">
        Tudo certo, a outra mesa preferiu continuar como estava. Ninguém precisa
        fazer nada agora.
      </p>
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
