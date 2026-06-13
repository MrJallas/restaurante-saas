'use client';

// PushComplaint — cliente abriu reclamação (≤2 estrelas ou pediu garçom).
// Per docs/features/complaint-flow-v12.md.

import * as React from 'react';
import { PushCardIOS } from './PushCard';
import type { ComplaintProblemType } from '@restaurant/shared-types';

interface PushComplaintProps {
  tableLabel: string;
  customerName?: string | null;
  problemType?: ComplaintProblemType;
  rating?: number | null;
  description?: string | null;
  time?: string;
  onTap?: () => void;
}

const TYPE_TO_LABEL: Partial<Record<ComplaintProblemType, string>> = {
  demora: 'demora',
  'item-errado': 'item errado',
  'item-faltando': 'item faltando',
  'comida-fria': 'comida fria',
  outro: 'outro',
};

export const PushComplaint: React.FC<PushComplaintProps> = ({
  tableLabel,
  customerName,
  problemType,
  rating,
  description,
  time = 'agora',
  onTap,
}) => {
  const label = problemType ? (TYPE_TO_LABEL[problemType] ?? null) : null;
  const stars = rating ? '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating)) : '';
  const body = description
    ? description.length > 90
      ? `${description.slice(0, 87)}…`
      : description
    : `${customerName ?? 'Cliente'} ${stars ? `· ${stars}` : ''}${label ? ` · ${label}` : ''}`.trim();
  return (
    <PushCardIOS
      tone="danger"
      urgent
      title={`Reclamação · ${tableLabel}`}
      body={body}
      time={time}
      onTap={onTap}
    />
  );
};

export default PushComplaint;
