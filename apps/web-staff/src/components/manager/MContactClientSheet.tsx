'use client';

// Bottom sheet · "Contatar cliente da Mesa X" with smart-suggestion chips.
//
// Smart-suggestions integration:
//   On open (`state === 'idle'` first render) we POST /smart-suggestions to the
//   AI service with `{ tenantId, surface: 'manager_contact_client', customerId }`.
//   The returned chips are rendered as the suggestion list. Falls back to
//   static chips if the AI service is unreachable (handled in
//   `lib/api/manager.ts → fetchSmartSuggestions`).
//
// On send: POSTs to `/staff-messages` (kind=`direct_reply` by default).
// State machine: idle → selected → sent.

import { useEffect, useState, useCallback } from 'react';
import { useG, G_FONT, MONO_FONT } from './tokens';
import { Icon } from './Icons';
import { GButton } from './primitives';
import {
  fetchSmartSuggestions,
  staffMessagesApi,
  type SmartSuggestionChip,
} from '../../lib/api/manager';

export interface MContactClientSheetProps {
  open: boolean;
  dark?: boolean;
  tenantSlug: string;
  tenantId: string;
  tableSessionId: string;
  customerId: string;
  customerName?: string;
  tableNumber?: number;
  /** Optional waiting context shown as the eyebrow ("esperando há 22 min..."). */
  waitingContext?: string;
  /** Order/menu hint shown under the title. */
  orderHint?: string;
  managerName?: string;
  onClose?: () => void;
  onSent?: (preview: string) => void;
  /** Optional: linked routes (e.g. courtesy chip). */
  onLinkTo?: (route: string) => void;
}

const ICON_FOR: Record<string, (s?: number) => React.ReactNode> = {
  history: Icon.history,
  clock: Icon.clock,
  user: Icon.user,
  gift: Icon.gift,
  flame: Icon.flame,
  chat: Icon.chat,
  sparkle: Icon.sparkle,
  default: Icon.chat,
};

export function MContactClientSheet({
  open,
  dark,
  tenantSlug,
  tenantId,
  tableSessionId,
  customerId,
  customerName,
  tableNumber,
  waitingContext,
  orderHint,
  managerName = 'Gerência',
  onClose,
  onSent,
  onLinkTo,
}: MContactClientSheetProps) {
  const C = useG(!!dark);
  const [suggestions, setSuggestions] = useState<SmartSuggestionChip[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'selected' | 'sent'>('idle');
  const [sending, setSending] = useState(false);

  const loadSuggestions = useCallback(async () => {
    try {
      const r = await fetchSmartSuggestions({
        tenantId,
        customerId,
        surface: 'manager_contact_client',
      });
      setSuggestions(r.suggestions);
    } catch {
      setSuggestions([]);
    }
  }, [tenantId, customerId]);

  useEffect(() => {
    if (open) {
      loadSuggestions();
      setSelectedIdx(-1);
      setDraft('');
      setState('idle');
    }
  }, [open, loadSuggestions]);

  const onPickChip = (i: number) => {
    setSelectedIdx(i);
    const chip = suggestions[i];
    if (chip) {
      setDraft(chip.text);
      setState('selected');
      if (chip.linksTo) {
        onLinkTo?.(chip.linksTo);
      }
    }
  };

  const onSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await staffMessagesApi(tenantSlug).send({
        tableSessionId,
        customerId,
        content: draft.trim(),
        kind: 'direct_reply',
      });
      setState('sent');
      onSent?.(draft.trim());
    } catch {
      // Stay on selected; toast surfacing is the screen's job.
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const sheetH = state === 'sent' ? 360 : 660;
  const eyebrow = waitingContext
    ? `Mesa ${tableNumber ?? '?'} · ${customerName ?? 'cliente'} · ${waitingContext}`
    : `Mesa ${tableNumber ?? '?'} · ${customerName ?? 'cliente'}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mensagem para Mesa ${tableNumber ?? ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(15,12,10,0.32)',
        fontFamily: G_FONT,
        color: C.ink,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          height: sheetH,
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 36px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'height 220ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 6px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.borderSoft }} />
        </div>

        {state !== 'sent' ? (
          <div style={{ padding: '8px 18px 14px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: C.faint,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: MONO_FONT,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.ink,
                letterSpacing: -0.5,
                marginBottom: 4,
              }}
            >
              Mensagem para Mesa {tableNumber ?? ''}
            </div>
            {orderHint && (
              <div style={{ fontSize: 13, color: C.mute, fontWeight: 500, lineHeight: 1.45 }}>
                {orderHint}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '8px 18px 14px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: '#1E8C5A',
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: MONO_FONT,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#1E8C5A' }} />
              Enviado
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
              Mesa {tableNumber ?? ''} · {customerName ?? ''}
            </div>
          </div>
        )}

        {state !== 'sent' && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0 18px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontFamily: MONO_FONT,
                marginBottom: 10,
              }}
            >
              Sugestões · contexto
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="listbox">
              {suggestions.length === 0 && (
                <div
                  style={{
                    padding: 14,
                    border: `1.3px dashed ${C.borderSoft}`,
                    borderRadius: 14,
                    fontSize: 13,
                    color: C.faint,
                    textAlign: 'center',
                  }}
                >
                  Carregando sugestões…
                </div>
              )}
              {suggestions.map((s, i) => {
                const sel = i === selectedIdx;
                const isCourtesy = s.linksTo === 'mgr-compensate' || s.linksTo === '/manager/cortesia';
                const Ico = ICON_FOR[s.icon ?? 'default'] ?? ICON_FOR.default;
                return (
                  <button
                    key={s.id}
                    onClick={() => onPickChip(i)}
                    role="option"
                    aria-selected={sel}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      padding: '14px 14px',
                      border: `1.3px solid ${sel ? C.ink : C.borderSoft}`,
                      borderRadius: 14,
                      background: sel ? C.ink : C.surface,
                      color: sel ? C.bg : C.ink,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 28,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        flexShrink: 0,
                        background: sel
                          ? 'rgba(255,255,255,0.14)'
                          : isCourtesy
                          ? '#EFF5EC'
                          : C.bg,
                        color: sel ? C.bg : isCourtesy ? '#2F7D4F' : C.faint,
                        border: sel
                          ? '1px solid rgba(255,255,255,0.2)'
                          : `1px solid ${C.borderSoft}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {Ico(14)}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: -0.15,
                        lineHeight: 1.35,
                        textAlign: 'left',
                      }}
                    >
                      {s.text}
                    </span>
                    {isCourtesy && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: sel ? C.bg : '#2F7D4F',
                          fontFamily: MONO_FONT,
                          flexShrink: 0,
                        }}
                      >
                        ↗ cortesia
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '20px 0 12px',
              }}
            >
              <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: C.faint,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  fontFamily: MONO_FONT,
                }}
              >
                ou escreva uma mensagem
              </div>
              <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
            </div>

            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.slice(0, 240));
                setState(e.target.value ? 'selected' : 'idle');
                setSelectedIdx(-1);
              }}
              placeholder={`Pessoal pra ${customerName ?? 'cliente'}…`}
              maxLength={240}
              rows={3}
              aria-label="Texto da mensagem"
              style={{
                resize: 'none',
                width: '100%',
                boxSizing: 'border-box',
                border: `1.3px solid ${C.borderSoft}`,
                borderRadius: 14,
                background: C.surface,
                padding: '12px 14px',
                minHeight: 64,
                fontFamily: G_FONT,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.4,
                color: C.ink,
                letterSpacing: -0.1,
              }}
            />
            <div
              style={{
                marginTop: 4,
                textAlign: 'right',
                fontSize: 9.5,
                fontWeight: 700,
                color: C.faint,
                fontFamily: MONO_FONT,
                letterSpacing: 0.3,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {draft.length} / 240
            </div>

            <div style={{ height: 14 }} />
          </div>
        )}

        {state === 'sent' && (
          <div
            style={{
              padding: '4px 18px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              flex: 1,
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                background: C.surface,
                borderLeft: `3px solid ${C.ink}`,
                border: `1px solid ${C.borderSoft}`,
                borderTopRightRadius: 12,
                borderBottomRightRadius: 12,
                borderTopLeftRadius: 4,
                borderBottomLeftRadius: 4,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: C.ink,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                  fontFamily: MONO_FONT,
                }}
              >
                {managerName}
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: C.ink,
                  fontWeight: 500,
                  letterSpacing: -0.1,
                }}
              >
                {draft}
              </div>
            </div>

            <span
              style={{
                display: 'inline-flex',
                alignSelf: 'flex-start',
                padding: '6px 12px',
                borderRadius: 100,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                fontFamily: MONO_FONT,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#D98E2B',
                }}
              />
              Aguardando leitura…
            </span>

            <div style={{ flex: 1 }} />
          </div>
        )}

        <div
          style={{
            padding: '12px 18px 28px',
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          {state === 'sent' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <GButton dark={dark} full kind="ghost" onClick={onClose}>
                Voltar
              </GButton>
              <GButton dark={dark} full kind="primary" onClick={() => setState('selected')}>
                Reenviar
              </GButton>
            </div>
          ) : (
            <GButton
              dark={dark}
              full
              kind="primary"
              onClick={onSend}
              disabled={!draft.trim() || sending}
            >
              {sending ? 'Enviando…' : `Enviar como ${managerName.split(' ')[0]}`}
            </GButton>
          )}
        </div>
      </div>
    </div>
  );
}
