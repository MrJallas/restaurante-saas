'use client';

// Registry COMPARTILHADO de socket staff (auditoria 2026-07-03): o padrão
// bom vivia só no useWaiterEvents — manager e host abriam um socket NOVO
// por tela (layout + tela = 2 handshakes por device) e não re-tentavam
// após 'io server disconnect' (rejeição do gateway não dispara o
// auto-reconnect do socket.io — realtime morria até reload). Extraído
// daqui pra os três hooks usarem o mesmo trilho: 1 socket por
// (url|tenant|staff|role) com refcount + retry com backoff.

import { io, type Socket } from 'socket.io-client';

export type StaffSocketRole = 'waiter' | 'manager' | 'host' | 'cook';

export function resolveStaffSocketUrl(configuredUrl: string | undefined, origin: string): string {
  const configured = configuredUrl?.trim();
  return configured || origin;
}

export function resolveWsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const explicit = (window as { __WS_URL__?: string }).__WS_URL__ || process.env.NEXT_PUBLIC_WS_URL;
  // Same-origin por padrão: o Next repassa /socket.io para a API. Assim um
  // iPhone/terminal só precisa alcançar a porta 3002 do app e o cookie de
  // sessão permanece no mesmo origin. Deploy separado ainda pode sobrescrever.
  return resolveStaffSocketUrl(explicit, window.location.origin);
}

export function readStaffId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    // remember=false guarda o staffId em sessionStorage (lib/api
    // saveStaffSession) — ler só localStorage gerava handshake rejeitado.
    return (
      window.localStorage.getItem('staffId') ??
      window.sessionStorage.getItem('staffId') ??
      undefined
    );
  } catch {
    return undefined;
  }
}

export interface SharedSocketEntry {
  socket: Socket;
  refCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
}

const socketRegistry = new Map<string, SharedSocketEntry>();

function registryKey(wsUrl: string, tenantSlug: string, staffId: string, role: StaffSocketRole) {
  return `${wsUrl}|${tenantSlug}|${staffId}|${role}`;
}

export function acquireStaffSocket(
  wsUrl: string,
  tenantSlug: string,
  staffId: string,
  role: StaffSocketRole,
): SharedSocketEntry | null {
  const key = registryKey(wsUrl, tenantSlug, staffId, role);
  const existing = socketRegistry.get(key);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  // Ciclo 2 (decisão Caleb 2026-07-04): o WS autentica pelo COOKIE de sessão
  // `staff_token` (setado no login pelo proxy), não mais pela key no bundle.
  // `withCredentials: true` faz o cookie subir no handshake same-origin e o
  // Next o preserva ao repassar pra API. staffId/tenantSlug/role seguem no `auth` só pra
  // os join:* rooms; a IDENTIDADE quem prova é o token verificado no gateway.
  let socket: Socket;
  try {
    socket = io(wsUrl, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: true,
      autoConnect: false,
      withCredentials: true,
      auth: {
        staffId,
        tenantSlug,
        staffRole: role,
        role,
      },
    });
  } catch {
    return null;
  }

  const entry: SharedSocketEntry = { socket, refCount: 1, retryTimer: null, retryAttempt: 0 };

  socket.on('connect', () => {
    entry.retryAttempt = 0;
    // A room operacional da cozinha se chama `kitchen`; a identidade
    // autenticada no token/handshake continua sendo `cook`.
    socket.emit('join:tenant', { slug: tenantSlug, role: role === 'cook' ? 'kitchen' : role });
    socket.emit('join:staff', { staffId });
    if (role === 'manager') {
      socket.emit('join:manager', { managerId: staffId });
    }
  });
  socket.on('disconnect', (reason) => {
    // 'io server disconnect' (rate-limit/rejeição do gateway) não dispara o
    // auto-reconnect do socket.io — sem isso o realtime morria até reload.
    if (reason === 'io server disconnect' && entry.refCount > 0 && !entry.retryTimer) {
      const delay = Math.min(60_000, 5_000 * 2 ** entry.retryAttempt) + Math.random() * 2_000;
      entry.retryAttempt += 1;
      entry.retryTimer = setTimeout(() => {
        entry.retryTimer = null;
        if (entry.refCount > 0) socket.connect();
      }, delay);
    }
  });
  socket.connect();

  socketRegistry.set(key, entry);
  return entry;
}

export function releaseStaffSocket(
  wsUrl: string,
  tenantSlug: string,
  staffId: string,
  role: StaffSocketRole,
) {
  const key = registryKey(wsUrl, tenantSlug, staffId, role);
  const entry = socketRegistry.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    try {
      entry.socket.disconnect();
    } catch {
      /* ignore */
    }
    socketRegistry.delete(key);
  }
}
