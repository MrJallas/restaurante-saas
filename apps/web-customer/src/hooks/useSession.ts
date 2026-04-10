'use client';

import { useContext } from 'react';
import { SessionContext, SessionContextValue } from '../providers/SessionProvider';

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
