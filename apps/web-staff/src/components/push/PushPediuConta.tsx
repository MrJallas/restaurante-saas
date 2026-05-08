'use client';

// PushPediuConta — push para "cliente pediu a conta".

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushPediuContaProps {
  tableLabel: string;
  totalCents: number;
  partySize?: number;
  time?: string;
  onTap?: () => void;
}

function fmtBRL(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export const PushPediuConta: React.FC<PushPediuContaProps> = ({
  tableLabel, totalCents, partySize, time = 'agora', onTap,
}) => (
  <PushCardIOS
    tone="info"
    title={`${tableLabel} pediu a conta`}
    body={`Total: R$ ${fmtBRL(totalCents)}${partySize != null ? ` · ${partySize} pessoas` : ''}`}
    time={time}
    onTap={onTap}
  />
);

export default PushPediuConta;
