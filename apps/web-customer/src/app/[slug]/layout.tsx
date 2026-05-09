'use client';

import { ReactNode, useContext } from 'react';
import { SessionProvider, SessionContext } from '../../providers/SessionProvider';
import { UIStateProvider, useUIState } from '../../providers/UIStateProvider';
import { DraftOrderProvider } from '../../providers/DraftOrderProvider';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { CallWaiterSheet } from '../../components/ui/CallWaiterSheet';

function DraftBridge({ children }: { children: ReactNode }) {
  const { sessionId } = useContext(SessionContext);
  return <DraftOrderProvider sessionId={sessionId}>{children}</DraftOrderProvider>;
}

function ThemeBridge({ children }: { children: ReactNode }) {
  const { slug } = useContext(SessionContext);
  return <ThemeProvider slug={slug}>{children}</ThemeProvider>;
}

/**
 * Round 4 §C16 — host único da CallWaiterSheet. Renderizado no nível
 * do layout pra que qualquer Home ou tela acionando `openCallWaiterSheet()`
 * via `useUIState()` veja a sheet sobre o conteúdo (em vez de navegar).
 */
function CallWaiterSheetHost() {
  const { slug } = useContext(SessionContext);
  const { callWaiterSheetOpen, closeCallWaiterSheet } = useUIState();
  if (!slug) return null;
  return (
    <CallWaiterSheet
      open={callWaiterSheetOpen}
      onClose={closeCallWaiterSheet}
      slug={slug}
    />
  );
}

export default function SlugLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeBridge>
        <UIStateProvider>
          <DraftBridge>
            {children}
            <CallWaiterSheetHost />
          </DraftBridge>
        </UIStateProvider>
      </ThemeBridge>
    </SessionProvider>
  );
}
