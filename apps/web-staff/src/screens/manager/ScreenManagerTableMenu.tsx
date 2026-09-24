'use client';

// V5 ScreenManagerTableMenu — manager actions for a table.
//
// Hero (table number + status) + 3 editable attributes (party, observation,
// client) + manager action list (Cortesia, Contactar, Timeline, Imprimir,
// Transferir, Fechar). VIP toggle lives in the MoreSheet of this screen
// (per docs/produto/funcionalidades/cliente-vip.md).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { manager, type KitchenQueueOrder } from '../../lib/api/manager';
import {
  liberateTable,
  listHostTables,
  swapTable,
  updateHostTableSession,
} from '../../lib/api/host';
import type { SessionFlag, SessionFlagToggleResponseDto } from '@restaurant/shared-types';
import { useDialogFocus } from '../../hooks/useDialogFocus';

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
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [flags, setFlags] = useState<SessionFlag[]>(initialFlags);
  const [moreOpen, setMoreOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [partyCount, setPartyCount] = useState(party);
  const [note, setNote] = useState(observation ?? '');
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);

  const flash = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 2800);
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

  // P1-W (re-scan): "Ver timeline" saía da tela pra mesa que já COMEU tudo.
  // A fonte era `kitchen.queue()`, que exclui pedidos 'delivered' — mesa
  // sem pedido ativo perdia o botão inteiro. Fix: se há um pedido ativo na
  // fila abre a timeline granular dele; se não (tudo entregue mas sessão
  // ainda ativa/pagando) cai na timeline da SESSÃO, que inclui os eventos
  // de todos os pedidos (order.status_changed vem de order_status_history,
  // não da fila). Assim o botão nunca é um beco sem saída.
  const goToTimeline = () => {
    if (timelineOrderId) {
      const qs = new URLSearchParams({
        slug: tenantSlug,
        tableNumber: String(tableNumber),
      }).toString();
      router.push(`/manager/timeline/${timelineOrderId}?${qs}`);
    } else {
      goToSessionTimeline();
    }
  };

  // Fatia M7 — timeline da SESSÃO inteira (event store M6), irmã da
  // per-pedido acima. Não depende de pedido ativo: usa o tableSessionId
  // que esta tela já recebe.
  const goToSessionTimeline = () => {
    const qs = new URLSearchParams({ slug: tenantSlug }).toString();
    router.push(`/manager/session-timeline/${tableSessionId}?${qs}`);
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

  useEffect(() => {
    let cancelled = false;
    listHostTables(tenantSlug)
      .then((tables) => {
        if (cancelled) return;
        const table = tables.find(
          (row) => row.active_session_id === tableSessionId || row.number === tableNumber,
        );
        if (!table) return;
        const nextParty = table.party ?? table.seats;
        if (nextParty != null) setPartyCount(nextParty);
        setNote(table.observation ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, tableSessionId, tableNumber]);

  useEffect(() => {
    let cancelled = false;
    setTimelineLoading(true);
    setTimelineOrderId(null);
    api.kitchen
      .queue()
      .then((orders) => {
        if (cancelled) return;
        const latest = orders
          .filter(
            (order: KitchenQueueOrder) =>
              order.table_session_id === tableSessionId ||
              (tableNumber > 0 && order.table_number === tableNumber),
          )
          .sort(
            (a: KitchenQueueOrder, b: KitchenQueueOrder) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )[0];
        setTimelineOrderId(latest?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setTimelineOrderId(null);
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, tableNumber, tableSessionId]);

  const saveTableEdit = async (nextParty: number, nextNote: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const table = await updateHostTableSession(tenantSlug, tableNumber, {
        sessionId: tableSessionId,
        party: nextParty,
        note: nextNote,
      });
      setPartyCount(table.party ?? table.seats ?? nextParty);
      setNote(table.observation ?? nextNote);
      setEditOpen(false);
      flash('Dados da mesa salvos.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Não foi possível atualizar a mesa.');
    } finally {
      setBusy(false);
    }
  };

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

  const addPerson = () => {
    void saveTableEdit(Math.min(99, partyCount + 1), note);
  };

  const closeTable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await liberateTable(tenantSlug, tableNumber);
      flash('Mesa fechada e sessão liberada.');
      setCloseConfirmOpen(false);
      setTimeout(() => {
        router.push(`/manager/operacoes/mesas-ativas?slug=${tenantSlug}`);
      }, 650);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Não foi possível fechar a mesa.');
    } finally {
      setBusy(false);
    }
  };

  const transferTable = async (targetTable: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await swapTable(tenantSlug, {
        fromTable: tableNumber,
        toTable: targetTable,
        sessionId: tableSessionId,
      });
      flash(`Mesa transferida para ${targetTable}.`);
      setTransferOpen(false);
      setTimeout(() => {
        router.push(`/manager/mesa/${targetTable}?slug=${tenantSlug}`);
      }, 650);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Não foi possível transferir a mesa.');
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

  const ticketTxt =
    ticketCents != null ? `R$ ${(ticketCents / 100).toFixed(2).replace('.', ',')}` : null;

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
          right={
            <GIconBtn
              dark={dark}
              icon={Icon.more(20)}
              onClick={() => setMoreOpen(true)}
              ariaLabel="Mais ações"
            />
          }
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
                  {partyCount} pessoas · aberta há {minutesOpen}m
                  {ticketTxt ? ` · total ${ticketTxt}` : ''}
                </div>
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}
              >
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
            <AttrRow
              label="Pessoas na mesa"
              value={`${partyCount}`}
              sub={`Mesa comporta ${seats}`}
              dark={dark}
            />
            <Divider dark={dark} />
            <AttrRow label="Observação" value={note.trim() || '—'} dark={dark} />
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
              icon={Icon.plus(18)}
              label="Adicionar pessoa"
              sub="Atualiza a contagem desta mesa"
              onClick={addPerson}
            />
            <ActionRow
              dark={dark}
              icon={Icon.table(18)}
              label="Editar mesa"
              sub="Pessoas e observação operacional"
              onClick={() => setEditOpen(true)}
            />
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
              sub={
                customerId
                  ? 'Mandar mensagem rápida · sugestões inteligentes'
                  : 'Cliente não identificado nesta mesa'
              }
              onClick={() => setContactOpen(true)}
              disabled={!customerId}
            />
            <ActionRow
              dark={dark}
              icon={Icon.history(18)}
              label="Ver timeline"
              sub={
                timelineLoading
                  ? 'Buscando pedido ativo desta mesa'
                  : timelineOrderId
                    ? 'Histórico real do pedido ativo'
                    : 'Sem pedido ativo · abre a timeline da sessão'
              }
              onClick={goToTimeline}
              disabled={timelineLoading}
            />
            <ActionRow
              dark={dark}
              icon={Icon.history(18)}
              label="Timeline da sessão"
              sub="Tudo que aconteceu na mesa · pedidos, chamados, conta"
              onClick={goToSessionTimeline}
            />
            <ActionRow
              dark={dark}
              icon={Icon.arrow(18)}
              label="Transferir mesa"
              sub="Mover pra outra mesa · pedidos vão junto"
              onClick={() => setTransferOpen(true)}
            />
            <ActionRow
              dark={dark}
              icon={Icon.x(18)}
              label="Fechar mesa"
              sub="Encerra a sessão · só com conta paga"
              danger
              last
              onClick={() => setCloseConfirmOpen(true)}
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
              icon: Icon.sparkle(18),
              label: isVip ? 'Remover VIP dessa sessão' : 'Marcar como VIP nessa sessão',
              sub: isVip ? 'Volta para prioridade normal' : 'Puxa pra prioridade alta dos chamados',
              onClick: toggleVip,
              tone: isVip ? 'danger' : 'default',
            },
          ]}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {editOpen && (
        <EditTableSheet
          C={C}
          initialParty={partyCount}
          initialNote={note}
          seats={seats}
          busy={busy}
          onClose={() => setEditOpen(false)}
          onSave={(nextParty, nextNote) => {
            void saveTableEdit(nextParty, nextNote);
          }}
        />
      )}

      {transferOpen && (
        <TransferSheet
          C={C}
          currentTable={tableNumber}
          busy={busy}
          onClose={() => setTransferOpen(false)}
          onTransfer={transferTable}
        />
      )}

      {closeConfirmOpen && (
        <ConfirmSheet
          C={C}
          title={`Fechar mesa ${tableNumber}?`}
          body="Confirme apenas se a conta já foi paga. A sessão ativa será encerrada e a mesa volta para o mapa como livre."
          confirmLabel={busy ? 'Fechando...' : 'Fechar mesa'}
          danger
          busy={busy}
          onCancel={() => setCloseConfirmOpen(false)}
          onConfirm={closeTable}
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

      {feedback && (
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
          {feedback}
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
    <div
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
      }}
    >
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
        <span
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 700,
            color: fg,
            letterSpacing: -0.1,
          }}
        >
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

function EditTableSheet({
  C,
  initialParty,
  initialNote,
  seats,
  busy,
  onClose,
  onSave,
}: {
  C: ReturnType<typeof useG>;
  initialParty: number;
  initialNote: string;
  seats: number;
  busy: boolean;
  onClose: () => void;
  onSave: (party: number, note: string) => void;
}) {
  const [party, setParty] = useState(initialParty);
  const [note, setNote] = useState(initialNote);
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          borderRadius: '18px 18px 0 0',
          background: C.bg,
          color: C.ink,
          padding: '18px 16px 20px',
        }}
      >
        <div id={titleId} style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
          Editar mesa
        </div>
        <div style={{ marginTop: 14 }}>
          <div
            style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: 'uppercase' }}
          >
            Pessoas
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setParty(Math.max(1, party - 1))}
              style={stepBtnStyle(C)}
            >
              -
            </button>
            <div
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                border: `1px solid ${C.borderSoft}`,
                display: 'grid',
                placeItems: 'center',
                fontSize: 18,
                fontWeight: 900,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {party}
            </div>
            <button
              type="button"
              onClick={() => setParty(Math.min(99, party + 1))}
              style={stepBtnStyle(C)}
            >
              +
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: C.faint, fontWeight: 600 }}>
            Capacidade cadastrada: {seats}
          </div>
        </div>
        <label style={{ display: 'block', marginTop: 16 }}>
          <span
            style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: 'uppercase' }}
          >
            Observação
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={180}
            rows={3}
            style={{
              marginTop: 8,
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              background: C.surface,
              color: C.ink,
              padding: 12,
              fontSize: 14,
              fontWeight: 600,
              resize: 'none',
              outline: 'none',
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} disabled={busy} style={sheetSecondaryStyle(C)}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(party, note)}
            style={{
              ...sheetPrimaryStyle(C),
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.62 : 1,
            }}
          >
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferSheet({
  C,
  currentTable,
  busy,
  onClose,
  onTransfer,
}: {
  C: ReturnType<typeof useG>;
  currentTable: number;
  busy: boolean;
  onClose: () => void;
  onTransfer: (targetTable: number) => void;
}) {
  const [value, setValue] = useState('');
  const target = parseInt(value, 10);
  const valid = Number.isFinite(target) && target > 0 && target !== currentTable;
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          borderRadius: '18px 18px 0 0',
          background: C.bg,
          color: C.ink,
          padding: '18px 16px 20px',
        }}
      >
        <div id={titleId} style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
          Transferir mesa
        </div>
        <label style={{ display: 'block', marginTop: 14 }}>
          <span
            style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: 'uppercase' }}
          >
            Mesa de destino
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            placeholder="Ex: 12"
            style={{
              marginTop: 8,
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              background: C.surface,
              color: C.ink,
              padding: '13px 12px',
              fontSize: 18,
              fontWeight: 900,
              outline: 'none',
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} disabled={busy} style={sheetSecondaryStyle(C)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => valid && onTransfer(target)}
            disabled={!valid || busy}
            style={{
              ...sheetPrimaryStyle(C),
              opacity: valid && !busy ? 1 : 0.52,
              cursor: valid && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Transferindo...' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmSheet({
  C,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  C: ReturnType<typeof useG>;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onCancel);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          borderRadius: '18px 18px 0 0',
          background: C.bg,
          color: C.ink,
          padding: '18px 16px 20px',
        }}
      >
        <div id={titleId} style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
          {title}
        </div>
        <div
          id={descriptionId}
          style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45, color: C.mute, fontWeight: 500 }}
        >
          {body}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={sheetSecondaryStyle(C)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              ...sheetPrimaryStyle(C),
              background: danger ? '#A12626' : C.ink,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function stepBtnStyle(C: ReturnType<typeof useG>): React.CSSProperties {
  return {
    all: 'unset',
    cursor: 'pointer',
    width: 42,
    height: 42,
    borderRadius: 10,
    border: `1px solid ${C.borderSoft}`,
    display: 'grid',
    placeItems: 'center',
    fontSize: 22,
    fontWeight: 900,
    background: C.surface,
    color: C.ink,
  };
}

function sheetSecondaryStyle(C: ReturnType<typeof useG>): React.CSSProperties {
  return {
    all: 'unset',
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center',
    padding: '13px 10px',
    borderRadius: 12,
    border: `1px solid ${C.borderSoft}`,
    color: C.ink,
    fontSize: 14,
    fontWeight: 800,
  };
}

function sheetPrimaryStyle(C: ReturnType<typeof useG>): React.CSSProperties {
  return {
    all: 'unset',
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center',
    padding: '13px 10px',
    borderRadius: 12,
    background: C.ink,
    color: C.bg,
    fontSize: 14,
    fontWeight: 800,
  };
}

function MoreSheet({
  dark,
  title,
  actions,
  onClose,
}: {
  dark?: boolean;
  title: string;
  actions: Array<{
    icon: React.ReactNode;
    label: string;
    sub?: string;
    onClick?: () => void;
    tone?: 'default' | 'danger';
  }>;
  onClose: () => void;
}) {
  const C = useG(!!dark);
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);
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
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
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
          id={titleId}
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
