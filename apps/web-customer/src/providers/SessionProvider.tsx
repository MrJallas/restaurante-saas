'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';

// Bundle mantido no sessionStorage para sobreviver a refresh/hard-reload da
// mesma aba. Sem isso, o SessionContext fica null apos F5 e o MenuDrawer (que
// depende de `sessionId`) some. O token HTTP continua em `session_token`
// (usado por lib/api.ts como fallback cross-origin).
const SESSION_BUNDLE_KEY = 'session:bundle';

interface SessionBundle {
  sessionId: string;
  tableCode: string;
  tableLabel: string;
  slug: string;
  // Customer fields opcionais — preenchidos apos welcome/recognize.
  // Antes nao eram salvos: hard reload ou navegacao back perdia
  // customerId/customerName e o /home era chamado sem customerId,
  // resultando em hero "visitante, bem-vindo!" no lugar do nome real.
  customerId?: string;
  visitId?: string;
  customerName?: string;
  isReturning?: boolean;
}

function readBundle(): SessionBundle | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_BUNDLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionBundle>;
    if (!parsed.sessionId || !parsed.tableCode || !parsed.slug) return null;
    return {
      sessionId: parsed.sessionId,
      tableCode: parsed.tableCode,
      tableLabel: parsed.tableLabel ?? '',
      slug: parsed.slug,
      customerId: parsed.customerId,
      visitId: parsed.visitId,
      customerName: parsed.customerName,
      isReturning: parsed.isReturning,
    };
  } catch {
    return null;
  }
}

function writeBundle(bundle: SessionBundle): void {
  if (typeof window === 'undefined') return;
  try {
    // Merge com valores ja existentes pra nao perder customer fields
    // quando setSession e chamado depois do setCustomer (e vice-versa).
    const prev = readBundle();
    const merged: SessionBundle = { ...(prev ?? {}), ...bundle };
    window.sessionStorage.setItem(SESSION_BUNDLE_KEY, JSON.stringify(merged));
  } catch {
    /* storage bloqueado (private mode) — seguimos sem persistir */
  }
}

function clearBundle(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_BUNDLE_KEY);
    window.sessionStorage.removeItem('session:startedAt');
  } catch {
    /* ignore */
  }
}

export interface TableParticipant {
  customerId: string;
  name: string;
  initial: string;
  color: string;
  // Status pra fluxo de host de mesa (migration 017): primeiro entra
  // como approved+host; demais como pending ate o host aprovar.
  status?: 'pending' | 'approved' | 'rejected';
  isHost?: boolean;
}

export type CommandMode = 'individual' | 'table' | null;

export interface SessionContextValue {
  sessionId: string | null;
  tableCode: string | null;
  tableLabel: string | null;
  slug: string | null;
  customerId: string | null;
  visitId: string | null;
  customerName: string | null;
  recognitionToken: string | null;
  isReturning: boolean;
  isValid: boolean;
  participants: TableParticipant[];
  commandMode: CommandMode;
  setSession: (data: {
    sessionId: string;
    tableCode: string;
    tableLabel: string;
    slug: string;
  }) => void;
  setCustomer: (data: {
    customerId: string;
    visitId: string;
    name: string;
    recognitionToken?: string;
    isReturning: boolean;
  }) => void;
  setParticipants: (list: TableParticipant[]) => void;
  setCommandMode: (mode: CommandMode, remember?: boolean) => void;
  /**
   * Apaga session em memoria + sessionStorage. Usado quando usuario
   * escaneia QR de mesa diferente — sem isso, isValid permanece true
   * e a pagina mesa/[tableCode] ignorava a mudanca de URL (P1-G).
   */
  clearSession: () => void;
}

export const SessionContext = createContext<SessionContextValue>({
  sessionId: null,
  tableCode: null,
  tableLabel: null,
  slug: null,
  customerId: null,
  visitId: null,
  customerName: null,
  recognitionToken: null,
  isReturning: false,
  isValid: false,
  participants: [],
  commandMode: null,
  setSession: () => {},
  setCustomer: () => {},
  setParticipants: () => {},
  setCommandMode: () => {},
  clearSession: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tableCode, setTableCode] = useState<string | null>(null);
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [recognitionToken, setRecognitionToken] = useState<string | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [participants, setParticipantsState] = useState<TableParticipant[]>([]);
  const [commandMode, setCommandModeState] = useState<CommandMode>(null);

  const setSession = useCallback(
    (data: { sessionId: string; tableCode: string; tableLabel: string; slug: string }) => {
      setSessionId(data.sessionId);
      setTableCode(data.tableCode);
      setTableLabel(data.tableLabel);
      setSlug(data.slug);
      writeBundle(data);
      try {
        window.sessionStorage.setItem('session:startedAt', new Date().toISOString());
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Rehidrata do sessionStorage no primeiro mount para sobreviver a F5/hard
  // reload — sem isso o MenuDrawer somia depois de um refresh em /cardapio
  // (ou qualquer rota que nao seja /mesa) porque ele depende de `sessionId`.
  // Tambem rehidrata customer fields (customerId/visitId/customerName) — sem
  // isso o /home era chamado sem customerId apos qualquer navegacao saindo
  // de /mesa, e o backend devolvia "visitante, bem-vindo!" no hero.
  useEffect(() => {
    const bundle = readBundle();
    if (!bundle) return;
    setSessionId((current) => current ?? bundle.sessionId);
    setTableCode((current) => current ?? bundle.tableCode);
    setTableLabel((current) => current ?? bundle.tableLabel);
    setSlug((current) => current ?? bundle.slug);
    if (bundle.customerId) {
      setCustomerId((current) => current ?? bundle.customerId ?? null);
    }
    if (bundle.visitId) {
      setVisitId((current) => current ?? bundle.visitId ?? null);
    }
    if (bundle.customerName) {
      setCustomerName((current) => current ?? bundle.customerName ?? null);
    }
    if (typeof bundle.isReturning === 'boolean') {
      setIsReturning((current) => current || (bundle.isReturning ?? false));
    }
  }, []);

  const setCustomer = useCallback(
    (data: {
      customerId: string;
      visitId: string;
      name: string;
      recognitionToken?: string;
      isReturning: boolean;
    }) => {
      setCustomerId(data.customerId);
      setVisitId(data.visitId);
      setCustomerName(data.name);
      if (data.recognitionToken) {
        setRecognitionToken(data.recognitionToken);
      }
      setIsReturning(data.isReturning);
      // Persistir tambem no bundle: depois de welcome/recognize, hard
      // reload nao pode mais perder os campos do cliente (P1: hero
      // ficava "visitante, bem-vindo" em vez do nome real).
      const prev = readBundle();
      if (prev) {
        writeBundle({
          ...prev,
          customerId: data.customerId,
          visitId: data.visitId,
          customerName: data.name,
          isReturning: data.isReturning,
        });
      }
    },
    [],
  );

  const setParticipants = useCallback((list: TableParticipant[]) => {
    setParticipantsState(list);
  }, []);

  const clearSession = useCallback(() => {
    setSessionId(null);
    setTableCode(null);
    setTableLabel(null);
    setSlug(null);
    setCustomerId(null);
    setVisitId(null);
    setCustomerName(null);
    setRecognitionToken(null);
    setIsReturning(false);
    setParticipantsState([]);
    setCommandModeState(null);
    clearBundle();
    // Tambem limpa o session_token armazenado em sessionStorage
    // (lib/storage.ts) pra que a proxima request POST /session/init
    // nao mande header de mesa antiga.
    try {
      window.sessionStorage.removeItem('session_token');
    } catch {
      /* ignore */
    }
  }, []);

  const setCommandMode = useCallback(
    (mode: CommandMode, remember?: boolean) => {
      setCommandModeState(mode);
      if (sessionId) {
        try {
          const key = `commandMode:${sessionId}`;
          if (remember && mode) {
            window.localStorage.setItem(key, mode);
          } else {
            window.localStorage.removeItem(key);
          }
        } catch {
          /* ignore */
        }
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (!sessionId) return;
    try {
      const saved = window.localStorage.getItem(`commandMode:${sessionId}`);
      if (saved === 'individual' || saved === 'table') {
        setCommandModeState(saved);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const value = useMemo<SessionContextValue>(
    () => ({
      sessionId,
      tableCode,
      tableLabel,
      slug,
      customerId,
      visitId,
      customerName,
      recognitionToken,
      isReturning,
      isValid: !!sessionId,
      participants,
      commandMode,
      setSession,
      setCustomer,
      setParticipants,
      setCommandMode,
      clearSession,
    }),
    [
      sessionId,
      tableCode,
      tableLabel,
      slug,
      customerId,
      visitId,
      customerName,
      recognitionToken,
      isReturning,
      participants,
      commandMode,
      setSession,
      setCustomer,
      setParticipants,
      setCommandMode,
      clearSession,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
