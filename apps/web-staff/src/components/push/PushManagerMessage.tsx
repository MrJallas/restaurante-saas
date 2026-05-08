'use client';

// PushManagerMessage — gerente mandou mensagem direta pra staff (V9).
// Tap → ScreenStaffMessageThread (deep link via senderId).

import * as React from 'react';
import { PushCardIOS } from './PushCard';

interface PushManagerMessageProps {
  /** Display name, ex: "Renata". */
  senderName: string;
  preview: string;
  time?: string;
  onTap?: () => void;
}

export const PushManagerMessage: React.FC<PushManagerMessageProps> = ({
  senderName, preview, time = 'agora', onTap,
}) => (
  <PushCardIOS
    tone="info"
    title={`${senderName} mandou uma mensagem`}
    body={preview}
    time={time}
    onTap={onTap}
  />
);

export default PushManagerMessage;
