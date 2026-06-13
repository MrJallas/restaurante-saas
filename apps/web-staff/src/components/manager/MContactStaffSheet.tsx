'use client';

// Bottom sheet · "Mensagem pra equipe" — quick chips + free text. Mirror of
// MContactClientSheet, but the destination is a fellow staff member.
//
// Round 18 (Onda 1 wiring fix): path estava `/staff-messages/staff`
// (404 — nao existe) com fields `{toStaffId, content}` que tambem nao
// batiam com o DTO `{recipientStaffId, body}`. O catch silencioso
// (`catch { setState('sent') }`) escondia o 404 do user e fingia
// sucesso. Agora chama o endpoint canonico `POST /staff-messages` e
// surface erros via setError.

import { useEffect, useRef, useState } from 'react';
import { useG, G_FONT, MONO_FONT } from './tokens';
import { Icon } from './Icons';
import { GButton, MAvatar } from './primitives';
import { staffPost } from '../../lib/api';

export interface ManagerStaffTarget {
  staffId: string;
  name: string;
  init?: string;
  color?: string;
  role?: string;
  contextHint?: string;
}

export interface MContactStaffSheetProps {
  open: boolean;
  dark?: boolean;
  tenantSlug: string;
  target: ManagerStaffTarget;
  managerName?: string;
  onClose?: () => void;
  onSent?: (preview: string) => void;
  /** Quick-suggestion chips. Manager screen passes pre-baked text per context. */
  suggestions?: {
    id: string;
    icon?: 'chat' | 'user' | 'pause' | 'table' | 'flame';
    text: string;
    linksTo?: string;
  }[];
}

const ICONS = {
  chat: Icon.chat,
  user: Icon.user,
  pause: Icon.pause,
  table: Icon.table,
  flame: Icon.flame,
} as const;

const DEFAULT_SUGGESTIONS = [
  { id: 's1', icon: 'chat' as const, text: 'Como tá indo? Precisa de ajuda?' },
  { id: 's2', icon: 'user' as const, text: 'Vou te mandar reforço · 5 min' },
  { id: 's3', icon: 'pause' as const, text: 'Pause os pedidos novos das suas mesas por 5 min' },
  { id: 's4', icon: 'table' as const, text: 'Foca nas mesas críticas · resto eu cuido' },
];

export function MContactStaffSheet({
  open,
  dark,
  tenantSlug,
  target,
  managerName = 'Gerência',
  onClose,
  onSent,
  suggestions,
}: MContactStaffSheetProps) {
  const C = useG(!!dark);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'sent'>('idle');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drag-to-dismiss state (vaul-style). Round 18 add — antes o handle
  // visual era afordância falsa (parecia arrastável mas não tinha
  // pointer listeners).
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  useEffect(() => {
    if (open) {
      setDraft('');
      setState('idle');
      setErrorMsg(null);
      setDragOffsetY(0);
    }
  }, [open]);

  const chips = suggestions ?? DEFAULT_SUGGESTIONS;

  const onSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    setErrorMsg(null);
    try {
      // Round 18 fix: endpoint canonico `POST /staff-messages` com fields
      // do DTO real (recipientStaffId/body). Antes batia em
      // `/staff-messages/staff` (404) e o catch silencioso fingia sucesso.
      await staffPost(`/${tenantSlug}/staff-messages`, {
        recipientStaffId: target.staffId,
        body: draft.trim(),
      });
      setState('sent');
      onSent?.(draft.trim());
    } catch (e) {
      const msg = (e as Error).message || 'Erro ao enviar mensagem.';
      setErrorMsg(msg);
    } finally {
      setSending(false);
    }
  };

  // ─── Drag-to-dismiss handlers ─────────────────────────────────
  const onDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (state === 'sent') return;
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    setDragOffsetY(Math.max(0, dy));
  };
  const onDragPointerUp = () => {
    if (dragStartY.current == null) return;
    const dy = dragOffsetY;
    dragStartY.current = null;
    if (dy > 120) {
      // Threshold: arrastou mais que 120px pra baixo → fecha
      onClose?.();
    } else {
      setDragOffsetY(0);
    }
  };

  if (!open) return null;

  const sheetH = state === 'sent' ? 360 : 660;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mensagem pra ${target.name}`}
      onClick={onClose}
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
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          height: sheetH,
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 36px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${dragOffsetY}px)`,
          transition:
            dragOffsetY === 0
              ? 'height 220ms cubic-bezier(.2,.8,.2,1), transform 180ms cubic-bezier(.2,.8,.2,1)'
              : 'height 220ms cubic-bezier(.2,.8,.2,1)',
          touchAction: 'pan-y',
        }}
      >
        <div
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '12px 0 10px',
            cursor: 'grab',
            touchAction: 'none',
          }}
          aria-label="Arraste para fechar"
        >
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
              Mensagem pra {target.name} · {target.role ?? 'staff'}
              {target.contextHint ? ` · ${target.contextHint}` : ''}
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
              Mensagem para {target.name}
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 18px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <MAvatar name={target.name} init={target.init} color={target.color} size={36} />
            <div style={{ flex: 1 }}>
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
                {target.name}
              </div>
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
              {chips.map((s) => {
                const Ico = ICONS[s.icon ?? 'chat'];
                const isPause = s.icon === 'pause';
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setDraft(s.text);
                    }}
                    role="option"
                    aria-selected={draft === s.text}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      padding: '14px 14px',
                      border: `1.3px solid ${C.borderSoft}`,
                      borderRadius: 14,
                      background: C.surface,
                      color: C.ink,
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
                        background: isPause ? '#FFF7E6' : C.bg,
                        color: isPause ? '#9A7212' : C.faint,
                        border: `1px solid ${isPause ? '#F0DCB6' : C.borderSoft}`,
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
                ou escreva algo
              </div>
              <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 240))}
              placeholder={`Pessoal pra ${target.name}…`}
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
          {errorMsg && (
            <div
              role="alert"
              style={{
                marginBottom: 10,
                padding: '8px 10px',
                background: '#FFF1F1',
                border: '1px solid #F4C7C7',
                borderRadius: 10,
                fontSize: 12,
                color: '#A12626',
                fontWeight: 500,
                lineHeight: 1.4,
              }}
            >
              {errorMsg}
            </div>
          )}
          {state === 'sent' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <GButton dark={dark} full kind="ghost" onClick={onClose}>
                Fechar
              </GButton>
              <GButton dark={dark} full kind="primary" onClick={() => setState('idle')}>
                Outra mensagem
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
