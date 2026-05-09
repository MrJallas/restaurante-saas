'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface UIStateContextValue {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  // Round 4 §C16 — sheet "Chamar garçom" sobre a Home (canvas V20 §F07).
  callWaiterSheetOpen: boolean;
  openCallWaiterSheet: () => void;
  closeCallWaiterSheet: () => void;
}

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [callWaiterSheetOpen, setCallWaiterSheetOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((s) => !s), []);
  const openCallWaiterSheet = useCallback(() => setCallWaiterSheetOpen(true), []);
  const closeCallWaiterSheet = useCallback(() => setCallWaiterSheetOpen(false), []);
  const value = useMemo(
    () => ({
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      callWaiterSheetOpen,
      openCallWaiterSheet,
      closeCallWaiterSheet,
    }),
    [
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      callWaiterSheetOpen,
      openCallWaiterSheet,
      closeCallWaiterSheet,
    ],
  );
  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}

export function useUIState() {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error('useUIState must be used inside UIStateProvider');
  return ctx;
}
