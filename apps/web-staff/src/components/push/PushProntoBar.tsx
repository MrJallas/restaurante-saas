'use client';

// PushProntoBar — bebida pronta no bar.

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushProntoBarProps {
  tableLabel: string;
  items: string;
  time?: string;
  onTap?: () => void;
}

export const PushProntoBar: React.FC<PushProntoBarProps> = ({
  tableLabel, items, time = 'agora', onTap,
}) => (
  <PushCardIOS
    tone="success"
    title="Pronto no bar"
    body={`${tableLabel} · ${items}`}
    time={time}
    onTap={onTap}
  />
);

export default PushProntoBar;
