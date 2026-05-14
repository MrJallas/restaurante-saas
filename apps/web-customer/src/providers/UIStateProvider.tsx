'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type MenuOverlayTab = 'comida' | 'bebidas';

interface UIStateContextValue {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  // Round 4 §C16 — sheet "Chamar garçom" sobre a Home (canvas V20 §F07).
  callWaiterSheetOpen: boolean;
  openCallWaiterSheet: () => void;
  closeCallWaiterSheet: () => void;
  // Round 21 — overlay "Cardápio" sobre a Home/Chat (canvas V20 §F05). Antes
  // era rota dedicada `/[slug]/cardapio`. Agora a tool `view_menu` da IA
  // abre essa sheet em vez de navegar — preserva o contexto do chat sem
  // perder histórico. A rota antiga continua funcionando pra deep-links
  // (Drawer, search engines, etc).
  //
  // Round 21 §G: tool `view_menu` agora pode passar `category` (ex:
  // 'bebidas'). FE mapeia pra `tab=bebidas` na URL do iframe, e o
  // cardapio/page abre na aba correta — fix do bug "user pediu bebidas
  // e veio cardápio completo".
  menuOverlayOpen: boolean;
  menuOverlayTab: MenuOverlayTab | null;
  openMenuOverlay: (opts?: { tab?: MenuOverlayTab }) => void;
  closeMenuOverlay: () => void;
}

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [callWaiterSheetOpen, setCallWaiterSheetOpen] = useState(false);
  const [menuOverlayOpen, setMenuOverlayOpen] = useState(false);
  const [menuOverlayTab, setMenuOverlayTab] = useState<MenuOverlayTab | null>(null);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((s) => !s), []);
  const openCallWaiterSheet = useCallback(() => setCallWaiterSheetOpen(true), []);
  const closeCallWaiterSheet = useCallback(() => setCallWaiterSheetOpen(false), []);
  const openMenuOverlay = useCallback((opts?: { tab?: MenuOverlayTab }) => {
    setMenuOverlayTab(opts?.tab ?? null);
    setMenuOverlayOpen(true);
  }, []);
  const closeMenuOverlay = useCallback(() => {
    setMenuOverlayOpen(false);
    setMenuOverlayTab(null);
  }, []);

  const value = useMemo(
    () => ({
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      callWaiterSheetOpen,
      openCallWaiterSheet,
      closeCallWaiterSheet,
      menuOverlayOpen,
      menuOverlayTab,
      openMenuOverlay,
      closeMenuOverlay,
    }),
    [
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      callWaiterSheetOpen,
      openCallWaiterSheet,
      closeCallWaiterSheet,
      menuOverlayOpen,
      menuOverlayTab,
      openMenuOverlay,
      closeMenuOverlay,
    ],
  );
  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}

export function useUIState() {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error('useUIState must be used inside UIStateProvider');
  return ctx;
}
