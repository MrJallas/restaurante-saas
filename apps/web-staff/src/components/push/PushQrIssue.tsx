'use client';

// PushQrIssue — QR ilegível reportado pelo garçom · gerente recebe.
// Tone warn (mostarda) per docs/design-canvas/handoff/garcom/garcom-qr-issue.jsx.

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushQrIssueProps {
  /** Mesa display label or just "Mesa 14". */
  tableLabel: string;
  reporter?: string;
  description?: string | null;
  time?: string;
  onTap?: () => void;
}

export const PushQrIssue: React.FC<PushQrIssueProps> = ({
  tableLabel,
  reporter,
  description,
  time = 'agora',
  onTap,
}) => (
  <PushCardIOS
    tone="warn"
    title={`QR ilegível · ${tableLabel}`}
    body={`${reporter ? `${reporter} reportou. ` : ''}${description ?? 'Substituir o QR.'}`}
    time={time}
    onTap={onTap}
  />
);

export default PushQrIssue;
