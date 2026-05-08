'use client';

// PushTableMergeInfo — info push pra request de juntar mesas.
// Per docs/features/customer-host-model.md (table-merge cooldown rules).

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushTableMergeInfoProps {
  /** Table number that originated the merge request. */
  originTable: number;
  targetTable: number;
  originHostName: string;
  /** Optional party size combined. */
  combinedPartySize?: number;
  time?: string;
  onTap?: () => void;
}

export const PushTableMergeInfo: React.FC<PushTableMergeInfoProps> = ({
  originTable, targetTable, originHostName, combinedPartySize, time = 'agora', onTap,
}) => (
  <PushCardIOS
    tone="info"
    title={`Juntar mesas ${originTable} + ${targetTable}`}
    body={`${originHostName} pediu pra juntar com a mesa ao lado${combinedPartySize ? ` · grupo de ${combinedPartySize}` : ''}.`}
    time={time}
    onTap={onTap}
  />
);

export default PushTableMergeInfo;
