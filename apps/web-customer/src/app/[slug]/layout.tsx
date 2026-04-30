'use client';

import { ReactNode, useContext } from 'react';
import { SessionProvider, SessionContext } from '../../providers/SessionProvider';
import { UIStateProvider } from '../../providers/UIStateProvider';
import { DraftOrderProvider } from '../../providers/DraftOrderProvider';
import { ThemeProvider } from '../../providers/ThemeProvider';

function DraftBridge({ children }: { children: ReactNode }) {
  const { sessionId } = useContext(SessionContext);
  return <DraftOrderProvider sessionId={sessionId}>{children}</DraftOrderProvider>;
}

function ThemeBridge({ children }: { children: ReactNode }) {
  const { slug } = useContext(SessionContext);
  return <ThemeProvider slug={slug}>{children}</ThemeProvider>;
}

export default function SlugLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeBridge>
        <UIStateProvider>
          <DraftBridge>{children}</DraftBridge>
        </UIStateProvider>
      </ThemeBridge>
    </SessionProvider>
  );
}
