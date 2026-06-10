'use client';

import { PillButton } from '../../components/ui/PillButton';

interface ScreenCustomerPostMergeApprovedProps {
  originTableNumber?: number | null;
  targetTableNumber?: number | null;
  onViewOrder: () => void;
  onCallWaiter: () => void;
  onViewMenu: () => void;
}

export function ScreenCustomerPostMergeApproved({
  originTableNumber,
  targetTableNumber,
  onViewOrder,
  onCallWaiter,
  onViewMenu,
}: ScreenCustomerPostMergeApprovedProps) {
  const pair =
    originTableNumber && targetTableNumber
      ? `Mesas ${originTableNumber} + ${targetTableNumber}`
      : 'Mesas juntadas';

  return (
    <section
      data-testid="post-merge-approved"
      className="max-w-[92%] self-start rounded-[16px] border border-success/30 bg-success/10 px-4 py-4 text-ink"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-success">
        {pair}
      </span>
      <h2 className="mt-2 text-[20px] font-bold leading-[1.15] tracking-[-0.3px]">
        Agora vocês são uma mesa só
      </h2>
      <p className="mt-2 text-[13px] font-medium leading-[1.45] text-mute">
        A junção foi confirmada pelas duas mesas. Daqui pra frente, vocês podem
        acompanhar o pedido e chamar a equipe pela mesma conversa.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <PillButton variant="filled" onClick={onViewOrder}>
          Ver pedido da mesa
        </PillButton>
        <PillButton variant="outline" onClick={onCallWaiter}>
          Chamar garçom
        </PillButton>
        <PillButton variant="outline" onClick={onViewMenu}>
          Ver cardápio
        </PillButton>
      </div>
    </section>
  );
}
