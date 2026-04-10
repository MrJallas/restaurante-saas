'use client';

import { createContext, useState, useCallback, ReactNode } from 'react';

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
    recognitionToken: string;
    isReturning: boolean;
  }) => void;
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
  setSession: () => {},
  setCustomer: () => {},
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

  const setSession = useCallback(
    (data: { sessionId: string; tableCode: string; tableLabel: string; slug: string }) => {
      setSessionId(data.sessionId);
      setTableCode(data.tableCode);
      setTableLabel(data.tableLabel);
      setSlug(data.slug);
    },
    [],
  );

  const setCustomer = useCallback(
    (data: {
      customerId: string;
      visitId: string;
      name: string;
      recognitionToken: string;
      isReturning: boolean;
    }) => {
      setCustomerId(data.customerId);
      setVisitId(data.visitId);
      setCustomerName(data.name);
      setRecognitionToken(data.recognitionToken);
      setIsReturning(data.isReturning);
    },
    [],
  );

  return (
    <SessionContext.Provider
      value={{
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
        setSession,
        setCustomer,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
