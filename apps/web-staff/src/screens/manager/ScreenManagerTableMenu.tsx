'use client';

// V5 ScreenManagerTableMenu — manager actions for a table.
//
// Hero (table number + status) + 3 editable attributes (party, observation,
// client) + manager action list (Cortesia, Contactar, Timeline, Imprimir,
// Transferir, Fechar). VIP toggle lives in the MoreSheet of this screen
// (per docs/features/vip-customer.md).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MTopBar,
  MPill,
  GIconBtn,
  MContactClientSheet,
} from '../../components/manager';
import { manager } from '../../lib/api/manager';
import type { SessionFlag, SessionFlagToggleResponseDto } from '@restaurant/shared-types';

export interface ScreenManagerTableMenuProps {
  dark?: boolean;
  tenantSlug: string;
  tenantId: string;
  tableSessionId: string;
  tableNumber: number;
  /** Initial flags from the table session (used for the VIP toggle). */
  initialFlags?: SessionFlag[];
  party?: number;
  seats?: number;
  observation?: string;
  customerId?: string;
  customerName?: string;
  ticketCents?: number;
  minutesOpen?: number;
  status?: 'ok' | 'warn' | 'crit' | 'new';
  managerName?: string;
  onClose?: () => void;
}

export function ScreenManagerTableMenu({
  dark,
  tenantSlug,
  tenantId,
  tableSessionId,
  tableNumber,
  initialFlags = [],
  party = 4,
  seats = 4,
  observation,
  customerId,
  customerName,
  ticketCents,
  minutesOpen = 0,
  status = 'ok',
  managerName = 'Gerência',
  onClose,
}: ScreenManagerTableMenuProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = manager(tenantSlug);
  const [flags, setFlags] = useState<SessionFlag[]>(initialFlags);
  const [moreOpen, setMoreOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Round 18 (Onda 2A): stub feedback pra ações ainda sem backend
  // (Imprimir / Transferir / Fechar / Ver timeline / Reportar / Auditoria).
  // Antes os ActionRows nao tinham onClick — clique era completamente
  // silencioso. Agora abre toast curto explicando que esta em desenvolvimento.
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const showStub = (action: string) => {
    setStubMsg(`${action} · em desenvolvimento (Onda 3 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  // Round 18 (Onda 2A): "Mandar cortesia" agora navega pra
  // /manager/compensate com mesa pre-selecionada via query params.
  // Antes era placebo (sem onClick).
  const goToCompensate = () => {
    const qs = new URLSearchParams({
      slug: tenantSlug,
      tableNumber: String(tableNumber),
      tableSessionId,
    }).toString();
    router.push(`/manager/compensate?${qs}`);
  };

  // Re-sync flags from API on mount (in case caller passed stale prop)
  useEffect(() => {
    let cancelled = false;
    api.sessionFlags
      .list(tableSessionId)
      .then((r) => {
        if (!cancelled) setFlags(r.flags ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tableSessionId, api]);

  const isVip = flags.includes('vip');

  const toggleVip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.sessionFlags.toggle(tableSessionId, {
        flag: 'vip',
        action: isVip ? 'remove' : 'add',
      });
      const r = res as SessionFlagToggleResponseDto;
      setFlags(r.flags ?? []);
      setMoreOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = { ok: 'Em andamento', warn: 'Lenta', crit: 'Crítica', new: 'Nova' }[status];
  const statusTone = { ok: 'success', warn: 'warn', crit: 'danger', new: 'info' }[status] as
    | 'success'
    | 'warn'
    | 'danger'
    | 'info';

  const ticketTxt = ticketCents != null ? `R$ ${(ticketCents / 100).toFixed(2).replace('.', ',')}` : null;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
        position: 'relative',
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 28 }}>
        <MTopBar
          dark={dark}
          title={`Mesa ${tableNumber}`}
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onClose} ariaLabel="Voltar" />}
          right={<GIconBtn dark={dark} icon={Icon.more(20)} onClick={() => setMoreOpen(true)} ariaLabel="Mais ações" />}
        />

        <div style={{ padding: '16px 16px 4px' }}>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              padding: '14px 14px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 24,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: -0.6,
                    lineHeight: 1.05,
                  }}
                >
                  Mesa {tableNumber}
                </h2>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.faint,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    marginTop: 6,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {party} pessoas · aberta há {minutesOpen}m
                  {ticketTxt ? ` · total ${ticketTxt}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <MPill tone={statusTone} dark={dark}>
                  {statusLabel}
                </MPill>
                {isVip && (
                  <MPill tone="warn" dark={dark}>
                    VIP
                  </MPill>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px 4px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
              paddingLeft: 4,
            }}
          >
            Esta mesa
          </div>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <AttrRow label="Pessoas na mesa" value={`${party}`} sub={`Mesa comporta ${seats}`} dark={dark} />
            <Divider dark={dark} />
            <AttrRow label="Observação" value={observation ?? '—'} dark={dark} />
            <Divider dark={dark} />
            <AttrRow label="Cliente" value={customerName ?? '—'} dark={dark} />
          </div>
        </div>

        <div style={{ padding: '14px 16px 24px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
              paddingLeft: 4,
            }}
          >
            Ações
          </div>
          <div
            style={{
              background: C.bg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <ActionRow
              dark={dark}
              icon={Icon.gift(18)}
              label="Mandar cortesia"
              sub="Sobremesa, drink, desconto ou só uma mensagem"
              onClick={goToCompensate}
            />
            <ActionRow
              dark={dark}
              icon={Icon.chat(18)}
              label="Contactar cliente"
              sub="Mandar mensagem rápida — sugestões inteligentes"
              onClick={() => setContactOpen(true)}
              disabled={!customerId}
            />
            <ActionRow
              dark={dark}
              icon={Icon.history(18)}
              label="Ver timeline da mesa"
              sub="Diagnóstico · ações sugeridas · histórico"
              onClick={() => showStub('Ver timeline da mesa')}
            />
            <ActionRow
              dark={dark}
              icon={Icon.receipt(18)}
              label="Imprimir conta"
              sub="Conta detalhada · vai pra impressora do salão"
              onClick={() => showStub('Imprimir conta')}
            />
            <ActionRow
              dark={dark}
              icon={Icon.arrow(18)}
              label="Transferir mesa"
              sub="Mover pra outra mesa · pedidos vão junto"
              onClick={() => showStub('Transferir mesa')}
            />
            <ActionRow
              dark={dark}
              icon={Icon.x(18)}
              label="Fechar mesa"
              sub="Encerra a sessão · só com conta paga"
              danger
              last
              onClick={() => showStub('Fechar mesa')}
            />
          </div>
        </div>
      </div>

      {moreOpen && (
        <MoreSheet
          dark={dark}
          title={`Mesa ${tableNumber} · mais ações`}
          actions={[
            {
              icon: Icon.flame(18),
              label: 'Reportar problema com a mesa',
              sub: 'Cadeira quebrada, lâmpada queimada — marca pra manutenção',
              onClick: () => {
                setMoreOpen(false);
                showStub('Reportar problema');
              },
            },
            {
              icon: Icon.sparkle(18),
              label: isVip ? 'Remover VIP dessa sessão' : 'Marcar como VIP nessa sessão',
              sub: isVip
                ? 'Volta para prioridade normal'
                : 'Puxa pra prioridade alta dos chamados',
              onClick: toggleVip,
              tone: isVip ? 'danger' : 'default',
            },
            {
              icon: Icon.history(18),
              label: 'Ver auditoria',
              sub: 'Quem abriu, fechou ou transferiu a mesa',
              onClick: () => {
                setMoreOpen(false);
                showStub('Ver auditoria');
              },
            },
          ]}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {contactOpen && customerId && (
        <MContactClientSheet
          open={contactOpen}
          dark={dark}
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          tableSessionId={tableSessionId}
          customerId={customerId}
          customerName={customerName}
          tableNumber={tableNumber}
          managerName={managerName}
          onClose={() => setContactOpen(false)}
        />
      )}

      {stubMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 32,
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '12px 18px',
            borderRadius: 999,
            background: C.ink,
            color: C.bg,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.1,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {stubMsg}
        </div>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────

function Divider({ dark }: { dark?: boolean }) {
  const C = useG(!!dark);
  return <div style={{ height: 1, background: C.borderSoft }} />;
}

function AttrRow({
  label,
  value,
  sub,
  dark,
}: {
  label: string;
  value: string;
  sub?: string;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 60 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: C.faint,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: value === '—' ? C.faint : C.ink,
            fontStyle: value === '—' ? 'italic' : 'normal',
            letterSpacing: -0.2,
            marginTop: 4,
          }}
        >
          {value}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginTop: 3,
            }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionRow({
  dark,
  icon,
  label,
  sub,
  danger,
  last,
  onClick,
  disabled,
}: {
  dark?: boolean;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  danger?: boolean;
  last?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const C = useG(!!dark);
  const fg = danger ? '#A12626' : C.ink;
  const tintBg = danger ? '#FFF1F1' : C.surface;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderBottom: last ? 'none' : `1px solid ${C.borderFaint}`,
        background: C.bg,
        opacity: disabled ? 0.5 : 1,
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: tintBg,
          color: fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: fg, letterSpacing: -0.1 }}>
          {label}
        </span>
        {sub && (
          <span
            style={{
              display: 'block',
              fontSize: 11.5,
              color: danger ? '#A12626' : C.faint,
              fontWeight: 500,
              marginTop: 2,
              lineHeight: 1.35,
              opacity: danger ? 0.85 : 1,
            }}
          >
            {sub}
          </span>
        )}
      </span>
      <span style={{ color: C.faint, opacity: 0.5, flexShrink: 0 }}>{Icon.arrow(16)}</span>
    </button>
  );
}

function MoreSheet({
  dark,
  title,
  actions,
  onClose,
}: {
  dark?: boolean;
  title: string;
  actions: Array<{ icon: React.ReactNode; label: string; sub?: string; onClick?: () => void; tone?: 'default' | 'danger' }>;
  onClose: () => void;
}) {
  const C = useG(!!dark);
  // Round 18 (Onda 2A): drag-to-dismiss state. Antes o handle visual era
  // afordância falsa.
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const onDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    setDragOffsetY(Math.max(0, e.clientY - dragStartY.current));
  };
  const onDragPointerUp = () => {
    if (dragStartY.current == null) return;
    const dy = dragOffsetY;
    dragStartY.current = null;
    if (dy > 120) onClose();
    else setDragOffsetY(0);
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.42)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          paddingTop: 0,
          paddingBottom: 24,
          transform: `translateY(${dragOffsetY}px)`,
          transition: dragOffsetY === 0 ? 'transform 180ms cubic-bezier(.2,.8,.2,1)' : 'none',
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
            padding: '12px 0 8px',
            cursor: 'grab',
            touchAction: 'none',
          }}
          aria-label="Arraste para fechar"
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: dark ? '#3a3a40' : '#dcdcdc',
            }}
          />
        </div>
        <div
          style={{
            padding: '4px 22px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: C.faint,
          }}
        >
          {title}
        </div>
        <div
          style={{
            margin: '0 14px',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            overflow: 'hidden',
          }}
        >
          {actions.map((a, i) => {
            const isDanger = a.tone === 'danger';
            const fg = isDanger ? C.danger : C.ink;
            return (
              <button
                key={i}
                onClick={a.onClick}
                aria-label={a.label}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderBottom: i < actions.length - 1 ? `1px solid ${C.borderFaint}` : 'none',
                  background: C.bg,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: isDanger ? C.dangerBg : C.surface,
                    color: fg,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {a.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: fg }}>
                    {a.label}
                  </span>
                  {a.sub && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: C.faint,
                        fontWeight: 500,
                        marginTop: 2,
                      }}
                    >
                      {a.sub}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'block',
            margin: '10px 14px 0',
            padding: '14px',
            borderRadius: 14,
            border: `1px solid ${C.borderSoft}`,
            background: C.surface,
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            width: 'calc(100% - 28px)',
            boxSizing: 'border-box',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
