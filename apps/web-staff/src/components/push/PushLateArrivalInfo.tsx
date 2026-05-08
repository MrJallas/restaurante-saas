'use client';

// PushLateArrivalInfo — info push pra pedido de chegada tardia.
// Per docs/features/customer-host-model.md (cascade host → manager → waiter).

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushLateArrivalInfoProps {
  tableNumber: number;
  requesterName: string;
  /** Optional context excerpt. */
  context?: string;
  time?: string;
  /** When tone="warn", we render the "host fallback" variant; default "info". */
  fallback?: boolean;
  onTap?: () => void;
}

export const PushLateArrivalInfo: React.FC<PushLateArrivalInfoProps> = ({
  tableNumber, requesterName, context, time = 'agora', fallback, onTap,
}) => (
  <PushCardIOS
    tone={fallback ? 'warn' : 'info'}
    urgent={fallback}
    title={`Chegada tardia · Mesa ${tableNumber}`}
    body={`${requesterName} pediu pra entrar${context ? ` · ${context}` : ''}.`}
    time={time}
    onTap={onTap}
  />
);

export default PushLateArrivalInfo;
