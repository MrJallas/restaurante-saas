import { io, type Socket } from 'socket.io-client';
import { getSessionToken } from './storage';

/**
 * Socket.IO COMPARTILHADO do customer — um socket por (wsUrl|sessionToken),
 * com refcount e desconexão preguiçosa.
 *
 * Por quê (prompt 100 §6/§7, achado do e2e): cada page montava o próprio
 * socket (useTableSocket + useCustomerHostEvents), o StrictMode do dev
 * dobra as montagens e cada navegação derrubava/recriava tudo — um único
 * cliente gerava dezenas de handshakes e estourava o rate-limit do gateway
 * (30 handshakes/60s POR IP — num restaurante todos os clientes saem pelo
 * mesmo IP). O staff já tinha migrado pra socket compartilhado por
 * (tenant|staffId) pelo mesmo motivo (useWaiterEvents, MEMORY.md); este
 * módulo é o espelho customer-side.
 *
 * - `acquire` reaproveita o socket vivo e cancela o linger.
 * - `release` NÃO desconecta na hora: espera IDLE_LINGER_MS — transições
 *   de rota desmontam/remontam em milissegundos e derrubar o socket nesse
 *   vão era também a fonte do console.error "WebSocket is closed before
 *   the connection is established" no WebKit (badge "1 error" do dev).
 * - Rooms (session/customer) ficam registrados e são re-joinados em todo
 *   `connect` (cobre reconexão do socket.io).
 * - Rejeição forçada do gateway ('io server disconnect', ex.: rate-limit)
 *   não dispara o auto-reconnect do socket.io — retry manual com backoff,
 *   mesmo pattern do useWaiterEvents.
 */

interface CustomerSocketEntry {
  socket: Socket;
  refCount: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  joinedSessions: Set<string>;
  joinedCustomers: Set<string>;
  key: string;
}

const registry = new Map<string, CustomerSocketEntry>();
const IDLE_LINGER_MS = 5_000;

function resolveWsUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WS_URL ||
    `${window.location.protocol}//${window.location.hostname}:3001`
  );
}

export function acquireCustomerSocket(): CustomerSocketEntry | null {
  if (typeof window === 'undefined') return null;
  const sessionToken = getSessionToken();
  const wsUrl = resolveWsUrl();
  const key = `${wsUrl}|${sessionToken ?? 'anon'}`;

  const existing = registry.get(key);
  if (existing) {
    existing.refCount += 1;
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer);
      existing.idleTimer = null;
    }
    return existing;
  }

  // Hint de tenant pro gateway escopar o rate-limit de handshake por
  // tenant+IP (restaurante inteiro sai pelo mesmo NAT). As rotas do
  // customer são sempre /:slug/... — o slug do path basta como hint.
  const tenantSlug =
    typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || undefined : undefined;

  const socket: Socket = io(wsUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelayMax: 10_000,
    auth: sessionToken ? { sessionToken, tenantSlug } : tenantSlug ? { tenantSlug } : undefined,
    // Manda o cookie httpOnly `recognition_token` também no transporte de
    // polling (no upgrade WS o browser já manda sozinho) — é a identidade
    // POR PARTICIPANTE no gateway (decisão 2026-06-12): cada cliente da
    // mesa entra no próprio room `customer:<id>` mesmo com o token de
    // sessão compartilhado.
    withCredentials: true,
  });

  const entry: CustomerSocketEntry = {
    socket,
    refCount: 1,
    idleTimer: null,
    retryTimer: null,
    retryAttempt: 0,
    joinedSessions: new Set(),
    joinedCustomers: new Set(),
    key,
  };

  socket.on('connect', () => {
    entry.retryAttempt = 0;
    for (const sessionId of entry.joinedSessions) {
      socket.emit('join:session', { sessionId });
    }
    for (const customerId of entry.joinedCustomers) {
      socket.emit('join:customer', { customerId });
    }
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' && entry.refCount > 0 && !entry.retryTimer) {
      const delay = Math.min(60_000, 5_000 * 2 ** entry.retryAttempt) + Math.random() * 2_000;
      entry.retryAttempt += 1;
      entry.retryTimer = setTimeout(() => {
        entry.retryTimer = null;
        if (entry.refCount > 0) socket.connect();
      }, delay);
    }
  });

  registry.set(key, entry);
  return entry;
}

/** Entra (e mantém) o room da sessão — idempotente, re-join em reconexão. */
export function joinSessionRoom(entry: CustomerSocketEntry, sessionId: string): void {
  if (!entry.joinedSessions.has(sessionId)) {
    entry.joinedSessions.add(sessionId);
    if (entry.socket.connected) {
      entry.socket.emit('join:session', { sessionId });
    }
  }
}

/** Entra (e mantém) o room privado do customer — idempotente. */
export function joinCustomerRoom(entry: CustomerSocketEntry, customerId: string): void {
  if (!entry.joinedCustomers.has(customerId)) {
    entry.joinedCustomers.add(customerId);
    if (entry.socket.connected) {
      entry.socket.emit('join:customer', { customerId });
    }
  }
}

export function releaseCustomerSocket(entry: CustomerSocketEntry): void {
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => {
    if (entry.refCount > 0) return;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    try {
      entry.socket.disconnect();
    } catch {
      /* ignore */
    }
    registry.delete(entry.key);
  }, IDLE_LINGER_MS);
}
