'use client';

import * as React from 'react';

export type StaffThemeMode = 'light' | 'dark' | 'auto';

export const STAFF_THEME_STORAGE_KEY = 'host:appearance';

function isThemeMode(value: string | null): value is StaffThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

function readStoredThemeMode(): StaffThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = window.localStorage.getItem(STAFF_THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'light';
  } catch {
    return 'light';
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveStaffThemeDark(mode: StaffThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return systemPrefersDark();
}

export function writeStaffThemeMode(mode: StaffThemeMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STAFF_THEME_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent('staff-theme-change', { detail: mode }));
}

function applyThemeToDocument(mode: StaffThemeMode, dark: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.staffTheme = dark ? 'dark' : 'light';
  document.documentElement.dataset.staffThemeMode = mode;
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function useStaffTheme(): {
  mode: StaffThemeMode;
  dark: boolean;
  setMode: (mode: StaffThemeMode) => void;
} {
  const [mode, setModeState] = React.useState<StaffThemeMode>('light');
  const [systemDark, setSystemDark] = React.useState(() => systemPrefersDark());

  React.useEffect(() => {
    setModeState(readStoredThemeMode());
  }, []);

  React.useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const onChange = () => setSystemDark(media.matches);
    onChange();
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STAFF_THEME_STORAGE_KEY) {
        setModeState(isThemeMode(event.newValue) ? event.newValue : 'light');
      }
    };
    const onCustom = (event: Event) => {
      const next = (event as CustomEvent<StaffThemeMode>).detail;
      if (isThemeMode(next)) setModeState(next);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('staff-theme-change', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('staff-theme-change', onCustom);
    };
  }, []);

  const dark = mode === 'auto' ? systemDark : mode === 'dark';

  React.useEffect(() => {
    applyThemeToDocument(mode, dark);
  }, [mode, dark]);

  const setMode = React.useCallback((next: StaffThemeMode) => {
    writeStaffThemeMode(next);
    setModeState(next);
  }, []);

  return { mode, dark, setMode };
}
