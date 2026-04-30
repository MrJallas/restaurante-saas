'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface UIStateContextValue {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((s) => !s), []);
  const value = useMemo(
    () => ({ drawerOpen, openDrawer, closeDrawer, toggleDrawer }),
    [drawerOpen, openDrawer, closeDrawer, toggleDrawer],
  );
  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}

export function useUIState() {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error('useUIState must be used inside UIStateProvider');
  return ctx;
}
