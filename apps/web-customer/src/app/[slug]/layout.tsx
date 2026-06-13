'use client';

import { ReactNode, useContext } from 'react';
import { SessionProvider, SessionContext } from '../../providers/SessionProvider';
import { UIStateProvider, useUIState } from '../../providers/UIStateProvider';
import { DraftOrderProvider } from '../../providers/DraftOrderProvider';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { CallWaiterSheet } from '../../components/ui/CallWaiterSheet';
import { MenuOverlay } from '../../components/ui/MenuOverlay';

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
  return <CallWaiterSheet open={callWaiterSheetOpen} onClose={closeCallWaiterSheet} slug={slug} />;
}

/**
 * Round 21 §A — host único do MenuOverlay (cardápio como sheet bottom-up
 * em vez de rota). Renderizado no layout pra que qualquer tela acionando
 * `openMenuOverlay()` via `useUIState()` veja o overlay sobre o conteúdo
 * (preservando contexto do chat, draft order, sessão).
 */
function MenuOverlayHost() {
  const { slug } = useContext(SessionContext);
  const { menuOverlayOpen, menuOverlayCategory, closeMenuOverlay } = useUIState();
  if (!slug) return null;
  return (
    <MenuOverlay
      open={menuOverlayOpen}
      onClose={closeMenuOverlay}
      slug={slug}
      category={menuOverlayCategory}
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
            <MenuOverlayHost />
          </DraftBridge>
        </UIStateProvider>
      </ThemeBridge>
    </SessionProvider>
  );
}
