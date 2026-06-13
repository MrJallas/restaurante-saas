'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { HostInboxItemDto, HostInboxKind } from '@restaurant/shared-types';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { listHostInbox } from '../../lib/api/host';
import { alertsApi } from '../../lib/api/manager';
import { useHostEvents } from '../../hooks/useHostEvents';
import { playBeep } from '../../lib/sound';
import { useStaffTheme } from '../../lib/theme';

interface ScreenHostNotificationsProps {
  tenantSlug: string;
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
}

const KIND_LABEL: Record<HostInboxKind, string> = {
  late_arrival_consumed: 'Chegada tardia',
  merge_consumed: 'Junção de mesas',
  complaint: 'Reclamação',
  zone_pause_started: 'Pausa iniciada',
  zone_pause_ended: 'Pausa encerrada',
  host_assist: 'Pediu a recepção',
};

/** Janela em que um pedido de recepção ainda ganha o destaque "AGORA". */
const FRESH_ASSIST_MS = 2 * 60 * 1000;

export const ScreenHostNotifications: React.FC<ScreenHostNotificationsProps> = ({
  tenantSlug,
  onBack,
  onTabChange,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [items, setItems] = useState<HostInboxItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFriendlyError, setHasFriendlyError] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!tenantSlug) {
      setLoading(false);
      return;
    }
    try {
      const data = await listHostInbox(tenantSlug);
      setItems(data);
      setHasFriendlyError(false);
    } catch {
      setItems([]);
      setHasFriendlyError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    refresh();
    const tid = setInterval(refresh, 15_000);
    return () => clearInterval(tid);
  }, [refresh]);

  // Realtime "Mesa X pediu a recepção" (prompt 100 §5.5): o backend emite
  // `host.assist_requested` no room tenant:slug:host. Beep + refresh
  // imediato — sem esperar o polling de 15s.
  const { on } = useHostEvents({ tenantSlug });
  useEffect(
    () =>
      on((evt) => {
        if (evt.event !== 'host.assist_requested') return;
        playBeep(620);
        refresh();
      }),
    [on, refresh],
  );

  // "Resolver" do pedido de recepção — POST /:slug/alerts/:id/resolve
  // (mesmo backend dos alerts do manager; o papel host pode agir em
  // alerts host_* via ensureRoleCanActOnAlert).
  const resolveAssist = React.useCallback(
    async (alertId: string) => {
      if (!tenantSlug || resolvingId) return;
      setResolvingId(alertId);
      try {
        await alertsApi(tenantSlug).resolve(alertId);
        await refresh();
      } catch {
        setHasFriendlyError(true);
      } finally {
        setResolvingId(null);
      }
    },
    [tenantSlug, resolvingId, refresh],
  );

  const grouped = useMemo(() => {
    const today = new Date().toDateString();
    return {
      now: items.filter((item) => new Date(item.at).toDateString() === today),
      previous: items.filter((item) => new Date(item.at).toDateString() !== today),
    };
  }, [items]);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: C.surface,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title="Notificações"
        sub={items.length > 0 ? `${items.length} aviso(s) do turno` : 'Avisos do salão'}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 80px' }}>
        {loading ? (
          <div style={{ padding: 28, color: C.faint, fontSize: 12, textAlign: 'center' }}>
            Carregando...
          </div>
        ) : items.length === 0 ? (
          <EmptyState dark={dark} hasFriendlyError={hasFriendlyError} />
        ) : (
          <>
            <Section title="Hoje" count={grouped.now.length} dark={dark}>
              {grouped.now.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  dark={dark}
                  resolving={resolvingId === item.refId}
                  onResolve={item.kind === 'host_assist' ? resolveAssist : undefined}
                />
              ))}
            </Section>
            {grouped.previous.length > 0 && (
              <Section title="Anteriores" count={grouped.previous.length} dark={dark}>
                {grouped.previous.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    dark={dark}
                    resolving={resolvingId === item.refId}
                    onResolve={item.kind === 'host_assist' ? resolveAssist : undefined}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      <HBottomNav active="inbox" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

function Section({
  title,
  count,
  dark,
  children,
}: {
  title: string;
  count: number;
  dark: boolean;
  children: React.ReactNode;
}) {
  const C = useG(dark);
  if (count === 0) return null;
  return (
    <section style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
          color: C.faint,
          fontSize: 11,
          fontWeight: 800,
          textTransform: 'uppercase',
        }}
      >
        <span>{title}</span>
        <span>{count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  );
}

function NotificationRow({
  item,
  dark,
  resolving,
  onResolve,
}: {
  item: HostInboxItemDto;
  dark: boolean;
  resolving?: boolean;
  /** Presente só pra kinds acionáveis (host_assist) — CTA real de resolve. */
  onResolve?: (alertId: string) => void;
}) {
  const C = useG(dark);
  const tone = toneForKind(item.kind);
  // Destaque do pedido de recepção recém-chegado: badge AGORA + sombra.
  const isFreshAssist =
    item.kind === 'host_assist' && Date.now() - Date.parse(item.at) < FRESH_ASSIST_MS;
  return (
    <div
      data-testid={item.kind === 'host_assist' ? 'host-assist-row' : undefined}
      style={{
        padding: 12,
        borderRadius: 12,
        background: C.bg,
        border: `1.5px solid ${tone.border}`,
        borderLeft: `4px solid ${tone.dot}`,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        boxShadow: isFreshAssist ? `0 0 0 2px ${tone.border}` : undefined,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: tone.bg,
          color: tone.dot,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {iconForKind(item.kind)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <div style={{ fontSize: 10, color: tone.dot, fontWeight: 800, textTransform: 'uppercase' }}>
            {KIND_LABEL[item.kind]}
          </div>
          {isFreshAssist && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: '#fff',
                background: tone.dot,
                borderRadius: 100,
                padding: '2px 7px',
              }}
            >
              Agora
            </span>
          )}
          <div style={{ marginLeft: 'auto', color: C.faint, fontSize: 11, fontWeight: 700 }}>
            {formatRelative(item.at)}
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginTop: 4 }}>
          {item.title}
        </div>
        {item.subtitle && (
          <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.4, marginTop: 2 }}>
            {item.subtitle}
          </div>
        )}
        {onResolve && (
          <button
            type="button"
            onClick={() => onResolve(item.refId)}
            disabled={resolving}
            style={{
              all: 'unset',
              cursor: resolving ? 'default' : 'pointer',
              marginTop: 10,
              padding: '7px 14px',
              borderRadius: 100,
              background: resolving ? C.surface : C.ink,
              color: resolving ? C.faint : C.bg,
              fontSize: 12,
              fontWeight: 700,
              border: `1.3px solid ${resolving ? C.borderSoft : C.ink}`,
            }}
          >
            {resolving ? 'Resolvendo…' : 'Marcar resolvido'}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ dark, hasFriendlyError }: { dark: boolean; hasFriendlyError: boolean }) {
  const C = useG(dark);
  return (
    <div
      style={{
        marginTop: 18,
        border: `1.5px dashed ${C.borderSoft}`,
        borderRadius: 14,
        padding: 30,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 16,
          background: C.surface,
          color: C.faint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${C.borderSoft}`,
        }}
      >
        {Icon.bell(24)}
      </div>
      <div style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: 'uppercase' }}>
        Sem notificações
      </div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, maxWidth: 280 }}>
        {hasFriendlyError
          ? 'Não consegui carregar os avisos agora. Tente novamente em instantes.'
          : 'Tudo no ritmo. Quando algo precisar da sua atenção, vai cair aqui.'}
      </div>
    </div>
  );
}

function toneForKind(kind: HostInboxKind): { dot: string; bg: string; border: string } {
  // Pedido de recepção é o item acionável do inbox — tom mais quente que
  // os passivos pra puxar o olho (destaque do prompt 100 §5.5).
  if (kind === 'host_assist') return { dot: '#B4541E', bg: '#FFF1E8', border: '#F2CBB1' };
  if (kind === 'complaint') return { dot: '#C43A3A', bg: '#FFF1F1', border: '#F4C7C7' };
  if (kind === 'late_arrival_consumed' || kind === 'merge_consumed') {
    return { dot: '#D98E2B', bg: '#FFF7E8', border: '#F0DCB6' };
  }
  return { dot: '#1E8C5A', bg: '#E9F4ED', border: '#C9E2D2' };
}

function iconForKind(kind: HostInboxKind): React.ReactElement {
  if (kind === 'host_assist') return Icon.bell(17);
  if (kind === 'complaint') return Icon.bell(17);
  if (kind === 'merge_consumed') return Icon.table(17);
  if (kind === 'zone_pause_started' || kind === 'zone_pause_ended') return Icon.pause(17);
  return Icon.user(17);
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'agora';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  const d = Math.floor(hr / 24);
  return `${d} d`;
}

export default ScreenHostNotifications;
