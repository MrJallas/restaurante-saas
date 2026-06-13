'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { clearContinuationHint, recordContinuationHint } from '../lib/continuationHints';

export interface DraftItem {
  /** stable id for this draft line (not the menu item id) */
  draftId: string;
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
  note?: string;
  /** 'individual' means this item belongs to the current customer's comanda */
  commandMode: 'individual' | 'table';
  /** optional drink customizations */
  size?: string;
  preferences?: string[];
}

interface DraftOrderContextValue {
  items: DraftItem[];
  addItem: (item: Omit<DraftItem, 'draftId'>) => void;
  updateItem: (draftId: string, patch: Partial<Omit<DraftItem, 'draftId'>>) => void;
  removeItem: (draftId: string) => void;
  clear: () => void;
  totalCents: number;
  quantity: number;
}

const DraftOrderContext = createContext<DraftOrderContextValue | null>(null);

function storageKey(sessionId: string | null) {
  return sessionId ? `draft:${sessionId}` : null;
}

function sessionIdFromBundle(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem('session:bundle');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: unknown };
    return typeof parsed.sessionId === 'string' && parsed.sessionId.length > 0
      ? parsed.sessionId
      : null;
  } catch {
    return null;
  }
}

function resolvedStorageKey(sessionId: string | null) {
  return storageKey(sessionId ?? sessionIdFromBundle());
}

function writeDraftNow(key: string | null, nextItems: DraftItem[]) {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(nextItems));
  } catch {
    /* ignore */
  }
}

export function DraftOrderProvider({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const key = resolvedStorageKey(sessionId);
    if (!key) {
      setItems([]);
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftItem[];
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [sessionId]);

  // Persistencia do rascunho — debounce 200ms evita escrever no localStorage a
  // cada keystroke da observacao (textarea do revisar) ou tap rapido de +/-
  // quantidade. Em Safari iOS, writes sincronos na thread principal bloqueiam
  // scroll ate ~8ms cada. 200ms cobre 99% das rajadas humanas.
  //
  // `beforeunload` garante que, se o usuario fechar a aba ou navegar antes do
  // timeout disparar, a ultima versao ainda e gravada. Em Safari iOS o evento e
  // restrito mas dispara o suficiente pros casos praticos (refresh, troca de
  // rota externa); casos residuais perdem no maximo os ultimos 200ms.
  useEffect(() => {
    if (!hydrated) return;
    const key = resolvedStorageKey(sessionId);
    if (!key) return;
    const flush = () => {
      writeDraftNow(key, items);
    };
    const t = window.setTimeout(flush, 200);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('beforeunload', flush);
    };
  }, [items, sessionId, hydrated]);

  const addItem = useCallback<DraftOrderContextValue['addItem']>(
    (item) => {
      recordContinuationHint('abriu_pedido');
      setItems((prev) => {
        const next = [
          ...prev,
          { ...item, draftId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
        ];
        writeDraftNow(resolvedStorageKey(sessionId), next);
        return next;
      });
    },
    [sessionId],
  );

  const updateItem = useCallback<DraftOrderContextValue['updateItem']>(
    (draftId, patch) => {
      setItems((prev) => {
        const next = prev.map((it) => (it.draftId === draftId ? { ...it, ...patch } : it));
        writeDraftNow(resolvedStorageKey(sessionId), next);
        return next;
      });
    },
    [sessionId],
  );

  const removeItem = useCallback<DraftOrderContextValue['removeItem']>(
    (draftId) => {
      setItems((prev) => {
        const next = prev.filter((it) => it.draftId !== draftId);
        writeDraftNow(resolvedStorageKey(sessionId), next);
        return next;
      });
    },
    [sessionId],
  );

  const clear = useCallback(() => {
    clearContinuationHint('abriu_pedido');
    writeDraftNow(resolvedStorageKey(sessionId), []);
    setItems([]);
  }, [sessionId]);

  const totalCents = useMemo(
    () => items.reduce((s, it) => s + it.priceCents * it.quantity, 0),
    [items],
  );
  const quantity = useMemo(() => items.reduce((s, it) => s + it.quantity, 0), [items]);

  const value = useMemo<DraftOrderContextValue>(
    () => ({ items, addItem, updateItem, removeItem, clear, totalCents, quantity }),
    [items, addItem, updateItem, removeItem, clear, totalCents, quantity],
  );

  return <DraftOrderContext.Provider value={value}>{children}</DraftOrderContext.Provider>;
}

export function useDraftOrder() {
  const ctx = useContext(DraftOrderContext);
  if (!ctx) throw new Error('useDraftOrder must be used inside DraftOrderProvider');
  return ctx;
}
