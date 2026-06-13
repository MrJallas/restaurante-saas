'use client';

// PushProntoCozinha — pedido pronto na cozinha.

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushProntoCozinhaProps {
  tableLabel: string;
  /** Free-form list, ex: "Risoto de camarão · Filé ao vinho" */
  items: string;
  time?: string;
  onTap?: () => void;
}

export const PushProntoCozinha: React.FC<PushProntoCozinhaProps> = ({
  tableLabel,
  items,
  time = 'agora',
  onTap,
}) => (
  <PushCardIOS
    tone="success"
    title="Pronto na cozinha"
    body={`${tableLabel} · ${items}`}
    time={time}
    onTap={onTap}
  />
);

export default PushProntoCozinha;
