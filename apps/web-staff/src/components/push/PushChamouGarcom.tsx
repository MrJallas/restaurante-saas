'use client';

// PushChamouGarcom — push lockscreen para "cliente chamou garçom".
// Tap → routes para o detalhe do chamado (route owner provides handler).

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushChamouGarcomProps {
  /** Mesa display label (ex: "Mesa 18"). */
  tableLabel: string;
  time?: string;
  onTap?: () => void;
  urgent?: boolean;
}

export const PushChamouGarcom: React.FC<PushChamouGarcomProps> = ({
  tableLabel, time = 'agora', onTap, urgent = true,
}) => (
  <PushCardIOS
    tone="danger"
    title={`${tableLabel} chamou`}
    body="Cliente acionou o botão de chamar garçom."
    time={time}
    urgent={urgent}
    onTap={onTap}
  />
);

export default PushChamouGarcom;
