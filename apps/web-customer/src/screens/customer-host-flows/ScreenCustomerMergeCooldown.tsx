'use client';

import { useEffect, useState } from 'react';
import { PillButton } from '../../components/ui/PillButton';

interface ScreenCustomerMergeCooldownProps {
  targetTableNumber?: number | null;
  cooldownEndsAt: string;
  message?: string | null;
  onCallHost: () => void;
  onTryAnother: () => void;
  onContinueHere: () => void;
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}min ${rest.toString().padStart(2, '0')}s`;
}

export function ScreenCustomerMergeCooldown({
  targetTableNumber,
  cooldownEndsAt,
  message,
  onCallHost,
  onTryAnother,
  onContinueHere,
}: ScreenCustomerMergeCooldownProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const target = new Date(cooldownEndsAt).getTime();
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownEndsAt]);

  return (
    <section
      data-testid="merge-cooldown"
      className="max-w-[92%] self-start rounded-[16px] border border-warning/40 bg-warning/10 px-4 py-4 text-ink"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-faint">
        Repetir tentativa
      </span>
      <h2 className="mt-2 text-[20px] font-bold leading-[1.15] tracking-[-0.3px]">
        Tente de novo em {formatRemaining(secondsLeft)}
      </h2>
      <p className="mt-2 text-[13px] font-medium leading-[1.45] text-mute">
        {message ||
          (targetTableNumber
            ? `A junção com a mesa ${targetTableNumber} entrou em pausa por alguns minutos.`
            : 'Essa junção entrou em pausa por alguns minutos.')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <PillButton variant="filled" onClick={onCallHost}>
          Chamar recepcionista
        </PillButton>
        <PillButton variant="outline" onClick={onTryAnother} disabled={secondsLeft > 0}>
          Tentar de novo
        </PillButton>
        <PillButton variant="outline" onClick={onContinueHere}>
          Continuar aqui
        </PillButton>
      </div>
    </section>
  );
}
