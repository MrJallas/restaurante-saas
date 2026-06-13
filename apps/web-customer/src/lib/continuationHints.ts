export type ContinuationKindHint =
  | 'viu_menu'
  | 'abriu_pedido'
  | 'chamou_garcom'
  | 'pagou'
  | 'voltou_sem_acao';

const HINT_KEY = 'continuation:kind-hint';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const PRIORITY: Record<ContinuationKindHint, number> = {
  pagou: 5,
  abriu_pedido: 4,
  chamou_garcom: 3,
  viu_menu: 2,
  voltou_sem_acao: 1,
};

interface StoredHint {
  kind: ContinuationKindHint;
  expiresAt: number;
}

function isContinuationKindHint(value: unknown): value is ContinuationKindHint {
  return (
    value === 'viu_menu' ||
    value === 'abriu_pedido' ||
    value === 'chamou_garcom' ||
    value === 'pagou' ||
    value === 'voltou_sem_acao'
  );
}

export function recordContinuationHint(kind: ContinuationKindHint, ttlMs = DEFAULT_TTL_MS): void {
  if (typeof window === 'undefined') return;
  try {
    const currentRaw = window.sessionStorage.getItem(HINT_KEY);
    if (currentRaw) {
      const current = JSON.parse(currentRaw) as Partial<StoredHint>;
      if (
        isContinuationKindHint(current.kind) &&
        typeof current.expiresAt === 'number' &&
        current.expiresAt >= Date.now() &&
        PRIORITY[current.kind] > PRIORITY[kind]
      ) {
        return;
      }
    }
    const stored: StoredHint = {
      kind,
      expiresAt: Date.now() + ttlMs,
    };
    window.sessionStorage.setItem(HINT_KEY, JSON.stringify(stored));
  } catch {
    /* ignore */
  }
}

export function clearContinuationHint(kind?: ContinuationKindHint): void {
  if (typeof window === 'undefined') return;
  try {
    if (!kind) {
      window.sessionStorage.removeItem(HINT_KEY);
      return;
    }
    const raw = window.sessionStorage.getItem(HINT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<StoredHint>;
    if (parsed.kind === kind) {
      window.sessionStorage.removeItem(HINT_KEY);
    }
  } catch {
    /* ignore */
  }
}

function currentContinuationHint(): ContinuationKindHint | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredHint>;
    if (!isContinuationKindHint(parsed.kind)) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
      window.sessionStorage.removeItem(HINT_KEY);
      return null;
    }
    return parsed.kind;
  } catch {
    return null;
  }
}

export function clearDeliveredContinuationHint(kind: unknown): void {
  if (kind === 'viu_cardapio') {
    clearContinuationHint('viu_menu');
    return;
  }
  if (isContinuationKindHint(kind)) {
    clearContinuationHint(kind);
  }
}

function currentSessionId(): string | null {
  try {
    const raw = window.sessionStorage.getItem('session:bundle');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string };
    return typeof parsed.sessionId === 'string' ? parsed.sessionId : null;
  } catch {
    return null;
  }
}

function draftOrderQuantity(): number {
  if (typeof window === 'undefined') return 0;
  const sessionId = currentSessionId();
  if (!sessionId) return 0;
  try {
    const raw = window.localStorage.getItem(`draft:${sessionId}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Array<{ quantity?: unknown }>;
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((sum, item) => {
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      return sum + Math.max(1, qty);
    }, 0);
  } catch {
    return 0;
  }
}

export function continuationRequestHeaders(path: string): Record<string, string> {
  if (!/\/[^/]+\/(?:home|continuation)(?:[/?]|$)/.test(path)) return {};

  const headers: Record<string, string> = {};
  const hint = currentContinuationHint();
  if (hint) {
    headers['x-continuation-kind-hint'] = hint;
  }

  const draftQty = draftOrderQuantity();
  if (draftQty > 0) {
    headers['x-draft-order-count'] = String(draftQty);
  }
  return headers;
}
