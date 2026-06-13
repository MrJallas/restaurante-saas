'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import {
  createDirectTableOrder,
  listWaiterMenuItems,
  type WaiterMenuItem,
} from '../../lib/api/waiter';

const REVIEW_SECONDS = 15;

interface DraftLine {
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
  notes?: string;
}

interface ScreenWaiterQuickOrderProps {
  tenantSlug: string;
  tableRef: string;
  tableNumber?: number;
}

function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function ScreenWaiterQuickOrder({
  tenantSlug,
  tableRef,
  tableNumber,
}: ScreenWaiterQuickOrderProps) {
  const dark = false;
  const C = useG(dark);
  const router = useRouter();
  const [items, setItems] = useState<WaiterMenuItem[]>([]);
  const [draft, setDraft] = useState<Record<string, DraftLine>>({});
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'pick' | 'review'>('pick');
  const [seconds, setSeconds] = useState(REVIEW_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listWaiterMenuItems(tenantSlug)
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .catch(() => {
        if (alive) setError('Não foi possível carregar o cardápio.');
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug]);

  const draftLines = useMemo(() => Object.values(draft), [draft]);
  const subtotalCents = draftLines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 48);
    return items
      .filter((item) => {
        const hay =
          `${item.name} ${item.short_description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 48);
  }, [items, query]);

  const updateQty = (item: WaiterMenuItem, delta: number) => {
    setDraft((prev) => {
      const current = prev[item.id];
      const nextQty = Math.max(0, (current?.quantity ?? 0) + delta);
      const next = { ...prev };
      if (nextQty === 0) {
        delete next[item.id];
        return next;
      }
      next[item.id] = {
        menuItemId: item.id,
        name: item.name,
        priceCents: item.price_cents,
        quantity: nextQty,
        notes: current?.notes,
      };
      return next;
    });
  };

  const submit = useCallback(async () => {
    if (busy || draftLines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await createDirectTableOrder(tenantSlug, {
        tableRef,
        items: draftLines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          notes: line.notes,
        })),
      });
      const target = tableNumber
        ? `/waiter/table/${encodeURIComponent(tableRef)}?tenant=${tenantSlug}&tableNumber=${tableNumber}&newOrder=${response.orderId}`
        : `/waiter/table/${encodeURIComponent(tableRef)}?tenant=${tenantSlug}&newOrder=${response.orderId}`;
      router.replace(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar pedido.');
      setBusy(false);
      setMode('pick');
      setSeconds(REVIEW_SECONDS);
    }
  }, [busy, draftLines, router, tableNumber, tableRef, tenantSlug]);

  useEffect(() => {
    if (mode !== 'review' || busy) return;
    if (seconds <= 0) {
      void submit();
      return;
    }
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [mode, seconds, busy, submit]);

  const title = tableNumber ? `Mesa ${String(tableNumber).padStart(2, '0')}` : 'Mesa';

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
      }}
    >
      <GAppHeader
        dark={dark}
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.back()}
            ariaLabel="Voltar"
          />
        }
        title={mode === 'review' ? 'Revisar pedido' : 'Pedido direto'}
        sub={title}
        right={<GIconBtn dark={dark} icon={Icon.fork(20)} ariaLabel="Pedido direto" />}
      />

      {mode === 'pick' ? (
        <>
          <div style={{ padding: '12px 16px 8px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 46,
                borderRadius: 12,
                border: `1px solid ${C.borderSoft}`,
                background: C.surface,
                padding: '0 12px',
              }}
            >
              <span style={{ color: C.faint }}>{Icon.search(18)}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar item"
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: C.ink,
                  fontFamily: G_FONT,
                  fontSize: 14,
                }}
              />
            </label>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 96px' }}>
            {filteredItems.length === 0 ? (
              <div
                style={{
                  marginTop: 20,
                  border: `1px dashed ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 24,
                  textAlign: 'center',
                  color: C.faint,
                  fontSize: 13,
                }}
              >
                Nenhum item encontrado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredItems.map((item) => {
                  const line = draft[item.id];
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        alignItems: 'center',
                        border: `1px solid ${line ? C.ink : C.borderSoft}`,
                        borderRadius: 12,
                        padding: 12,
                        background: line ? C.surface : C.bg,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: -0.1 }}>
                          {item.name}
                        </div>
                        <div
                          style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.35 }}
                        >
                          {item.short_description || 'Cardápio'}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: C.ink,
                            marginTop: 6,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {fmtBRL(item.price_cents)}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '34px 30px 34px',
                          alignItems: 'center',
                          gap: 2,
                        }}
                      >
                        <QtyButton
                          C={C}
                          label="Diminuir"
                          disabled={!line}
                          icon={Icon.minus(16)}
                          onClick={() => updateQty(item, -1)}
                        />
                        <div
                          style={{
                            textAlign: 'center',
                            fontSize: 14,
                            fontWeight: 800,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {line?.quantity ?? 0}
                        </div>
                        <QtyButton
                          C={C}
                          label="Adicionar"
                          icon={Icon.plus(16)}
                          onClick={() => updateQty(item, 1)}
                          filled
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: '14px 16px 0' }}>
            <div
              style={{
                height: 4,
                borderRadius: 4,
                background: C.borderSoft,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${((REVIEW_SECONDS - seconds) / REVIEW_SECONDS) * 100}%`,
                  background: C.ink,
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 100px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO_FONT,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: C.faint,
                    textTransform: 'uppercase',
                  }}
                >
                  Antes de enviar
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginTop: 4 }}>
                  {seconds}s para editar
                </div>
              </div>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  border: `2px solid ${C.ink}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {seconds}
              </div>
            </div>

            <div style={{ marginTop: 18, borderTop: `1px solid ${C.borderFaint}` }}>
              {draftLines.map((line) => (
                <div
                  key={line.menuItemId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '34px 1fr auto',
                    gap: 12,
                    alignItems: 'baseline',
                    padding: '13px 0',
                    borderBottom: `1px solid ${C.borderFaint}`,
                  }}
                >
                  <div
                    style={{
                      height: 30,
                      borderRadius: 15,
                      background: C.ink,
                      color: C.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {line.quantity}x
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{line.name}</div>
                    <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>
                      {fmtBRL(line.priceCents)} cada
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtBRL(line.priceCents * line.quantity)}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginTop: 16,
                paddingTop: 16,
                borderTop: `1.5px solid ${C.ink}`,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800 }}>Subtotal</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {fmtBRL(subtotalCents)}
              </div>
            </div>
          </div>
        </>
      )}

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '12px 16px max(env(safe-area-inset-bottom), 18px)',
          borderTop: `1px solid ${C.borderFaint}`,
          background: C.bg,
          display: 'flex',
          gap: 10,
        }}
      >
        {mode === 'pick' ? (
          <>
            <GButton kind="secondary" dark={dark} onClick={() => router.back()}>
              Cancelar
            </GButton>
            <div style={{ flex: 1 }}>
              <GButton
                kind="primary"
                dark={dark}
                full
                disabled={draftLines.length === 0}
                onClick={() => {
                  setMode('review');
                  setSeconds(REVIEW_SECONDS);
                }}
              >
                Revisar pedido · {fmtBRL(subtotalCents)}
              </GButton>
            </div>
          </>
        ) : (
          <>
            <GButton
              kind="secondary"
              dark={dark}
              disabled={busy}
              onClick={() => {
                setMode('pick');
                setSeconds(REVIEW_SECONDS);
              }}
            >
              Editar
            </GButton>
            <div style={{ flex: 1 }}>
              <GButton kind="primary" dark={dark} full disabled={busy} onClick={submit}>
                {busy ? 'Enviando...' : 'Enviar agora'}
              </GButton>
            </div>
          </>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 'calc(82px + max(env(safe-area-inset-bottom), 18px))',
            borderRadius: 12,
            background: '#7a1f1f',
            color: '#fff',
            padding: '12px 14px',
            fontSize: 13,
            fontWeight: 700,
            zIndex: 50,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function QtyButton({
  C,
  icon,
  label,
  onClick,
  disabled,
  filled,
}: {
  C: ReturnType<typeof useG>;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: `1px solid ${filled ? C.ink : C.borderSoft}`,
        background: filled ? C.ink : C.bg,
        color: filled ? C.bg : C.ink,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      {icon}
    </button>
  );
}

export default ScreenWaiterQuickOrder;
