'use client';

// ScreenManagerNotifications — destino da campainha (rota /manager/notifications,
// /host/notifications, /waiter/notifications via `persona`). Round 18 placebo
// fix do sino (audit-report Onda 18). Lê o feed do módulo `alerts`
// (`GET /:slug/alerts?status=open`), agrupa por severidade
// (crítica → atenção → info) e renderiza cada row com ações inline parseadas
// do JSONB `alerts.actions`.
//
// Estrutura V9 canon sticky-footer:
//   height: 100dvh + flex column
//   ├─ MTopBar (back chevron + título "Notificações")
//   ├─ middle (flex:1 overflow:auto minHeight:0)
//   │   ├─ Section "Crítica" (se houver)
//   │   ├─ Section "Atenção" (se houver)
//   │   ├─ Section "Info" (se houver)
//   │   └─ Empty state se total=0
//   └─ MBottomNav (manager) OU HBottomNav (host)
//
// WS: qualquer evento manager-wide dispara re-fetch (convergência
// garantida sem precisar incluir `alert.created` na lista hard-coded
// de event-names do hook).

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  Icon,
  GIconBtn,
  MTopBar,
  MBottomNav,
  MPill,
} from '../../components/manager';
import { GBottomNav, HBottomNav } from '../../components/waiter/Primitives';
import {
  manager,
  type AlertRow,
  type AlertSeverity,
  type AlertActionDescriptor,
} from '../../lib/api/manager';
import { useManagerEvents } from '../../hooks/useManagerEvents';

export interface ScreenManagerNotificationsProps {
  /** Multi-tenant slug. */
  tenantSlug: string;
  /** Persona controla bottom-nav + destino do back chevron. */
  persona?: 'manager' | 'host' | 'waiter';
  dark?: boolean;
}

const SEV_LABEL: Record<AlertSeverity, string> = {
  'crítica': 'Crítica',
  'atenção': 'Atenção',
  'info': 'Info',
};

const SEV_ORDER: AlertSeverity[] = ['crítica', 'atenção', 'info'];

export function ScreenManagerNotifications({
  tenantSlug,
  persona = 'manager',
  dark = false,
}: ScreenManagerNotificationsProps) {
  const C = useG(dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [stubMsg, setStubMsg] = useState<string | null>(null);

  // Fetch driver — usado tanto pelo initial load quanto pelo WS refresh.
  const refresh = React.useCallback(async () => {
    if (!tenantSlug) {
      setLoading(false);
      return;
    }
    try {
      const rows = await api.alerts.list({ status: 'open' });
      setAlerts(rows);
      setError(null);
    } catch (err) {
      // Backend `/:slug/alerts` pode não estar reachable ainda — o screen
      // continua usável caindo no empty state (não bloqueia a UX do sino).
      setAlerts([]);
      setError(
        err instanceof Error ? err.message : 'Falha ao carregar notificações.',
      );
    } finally {
      setLoading(false);
    }
  }, [api, tenantSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // WS live-update — qualquer evento da subscription manager pode sinalizar
  // mudança no feed de alertas; refazemos o fetch pra garantir convergência.
  useManagerEvents(tenantSlug, () => {
    refresh();
  });

  // Auto-dismiss do stub toast.
  useEffect(() => {
    if (!stubMsg) return;
    const t = setTimeout(() => setStubMsg(null), 2400);
    return () => clearTimeout(t);
  }, [stubMsg]);

  const grouped = useMemo(() => {
    const map: Record<AlertSeverity, AlertRow[]> = {
      'crítica': [],
      'atenção': [],
      'info': [],
    };
    for (const a of alerts) {
      if (map[a.sev]) map[a.sev].push(a);
    }
    return map;
  }, [alerts]);

  async function handleDismiss(id: string) {
    setPendingId(id);
    const before = alerts;
    // Optimistic remove · rollback (via refresh) em caso de erro.
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.alerts.dismiss(id);
    } catch {
      setAlerts(before);
      refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function handleAction(alert: AlertRow, action: AlertActionDescriptor) {
    const label = action.label.toLowerCase();
    const route =
      action.route ??
      (alert.kind.includes('kitchen') || label.includes('cozinha') || label.includes('fila')
        ? `/manager/kitchen-reorder?slug=${tenantSlug}`
        : alert.kind.includes('payment') || label.includes('pag')
          ? `/manager/financeiro?slug=${tenantSlug}`
          : label.includes('garçom') || label.includes('garcom') || label.includes('equipe')
            ? `/manager/equipe?slug=${tenantSlug}`
            : null);

    if (route) {
      router.push(route);
      return;
    }

    setPendingId(alert.id);
    const before = alerts;
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    try {
      await api.alerts.resolve(alert.id);
    } catch {
      setAlerts(before);
      refresh();
    } finally {
      setPendingId(null);
    }
  }

  const backTo = persona === 'host' ? '/host' : persona === 'waiter' ? '/waiter' : '/manager';
  const total = alerts.length;

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Notificações"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(backTo)}
            ariaLabel="Voltar"
          />
        }
      />

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          paddingBottom: 24,
        }}
      >
        {loading && total === 0 ? (
          <LoadingState dark={dark} />
        ) : total === 0 ? (
          <EmptyState dark={dark} error={error} />
        ) : (
          SEV_ORDER.map((sev) => {
            const rows = grouped[sev];
            if (!rows || rows.length === 0) return null;
            return (
              <Section
                key={sev}
                label={SEV_LABEL[sev]}
                count={rows.length}
                dark={dark}
              >
                {rows.map((a) => (
                  <NotificationRow
                    key={a.id}
                    alert={a}
                    dark={dark}
                    busy={pendingId === a.id}
                    onDismiss={() => handleDismiss(a.id)}
                    onAction={(action) => handleAction(a, action)}
                  />
                ))}
              </Section>
            );
          })
        )}
      </div>

      {/* Stub toast (mesmo padrão de ScreenManagerStaff). */}
      {stubMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 84,
            transform: 'translateX(-50%)',
            background: C.ink,
            color: C.bg,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 600,
            zIndex: 50,
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            maxWidth: 340,
            textAlign: 'center',
          }}
        >
          {stubMsg}
        </div>
      )}

      {persona === 'host' ? (
        <HBottomNav
          active="me"
          dark={dark}
          onTabChange={(id) => {
            if (id === 'tables') router.push('/host');
            else if (id === 'waitlist') router.push('/host/waitlist');
            else if (id === 'reserva') router.push('/host/reservations');
            else if (id === 'inbox') router.push('/host/notifications');
            else if (id === 'me') router.push('/host/profile');
          }}
        />
      ) : persona === 'waiter' ? (
        <GBottomNav
          active="calls"
          dark={dark}
          onNewEntry={() => router.push(`/waiter/new-entry?tenant=${tenantSlug}`)}
          onTabChange={(id) => {
            if (id === 'home') router.push(`/waiter?tenant=${tenantSlug}`);
            else if (id === 'calls') router.push(`/waiter/chamados?tenant=${tenantSlug}`);
            else if (id === 'shift') router.push(`/waiter/eu?tenant=${tenantSlug}&focus=shift`);
            else if (id === 'me') router.push(`/waiter/eu?tenant=${tenantSlug}`);
          }}
        />
      ) : (
        <MBottomNav
          active="home"
          dark={dark}
          onTo={(r) => router.push(r)}
        />
      )}
    </div>
  );
}

// ─── Section — eyebrow mono + count à direita + filhos ───────────
function Section({
  label,
  count,
  children,
  dark,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <section style={{ marginTop: 14 }}>
      <div
        style={{
          padding: '0 16px 8px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.faint,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            fontFamily: MONO_FONT,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.faint,
            fontFamily: MONO_FONT,
            letterSpacing: 0.6,
          }}
        >
          {count}
        </div>
      </div>
      <div
        style={{
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ─── NotificationRow — eyebrow + title + sub + ações inline + × ──
function NotificationRow({
  alert,
  dark,
  busy,
  onDismiss,
  onAction,
}: {
  alert: AlertRow;
  dark?: boolean;
  busy?: boolean;
  onDismiss: () => void;
  onAction: (action: AlertActionDescriptor) => void;
}) {
  const C = useG(!!dark);
  const isCrit = alert.sev === 'crítica';
  const isWarn = alert.sev === 'atenção';
  const accent = isCrit ? '#C43A3A' : isWarn ? '#D98E2B' : C.faint;
  const accentSoft = isCrit ? '#F4C7C7' : isWarn ? '#F0DCB6' : C.borderSoft;
  const relTime = formatRelative(alert.created_at);
  const sevPillTone: 'danger' | 'warn' | 'info' = isCrit
    ? 'danger'
    : isWarn
    ? 'warn'
    : 'info';

  return (
    <div
      style={{
        borderRadius: 12,
        position: 'relative',
        border: `1px solid ${accentSoft}`,
        background: C.bg,
        borderLeft: `3px solid ${accent}`,
        padding: '10px 12px',
        opacity: busy ? 0.55 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      <button
        type="button"
        title="Dispensar"
        aria-label="Dispensar notificação"
        onClick={onDismiss}
        disabled={busy}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 24,
          height: 24,
          borderRadius: 12,
          background: 'transparent',
          color: C.faint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: busy ? 'not-allowed' : 'pointer',
          padding: 0,
        }}
      >
        {Icon.x(13)}
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingRight: 28,
        }}
      >
        <MPill tone={sevPillTone} dark={dark} dot>
          {SEV_LABEL[alert.sev]}
        </MPill>
        <span
          style={{
            fontSize: 10,
            color: C.faint,
            fontWeight: 700,
            letterSpacing: 0.6,
            fontFamily: MONO_FONT,
            textTransform: 'uppercase',
          }}
        >
          {relTime}
        </span>
      </div>

      <div
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: C.ink,
          letterSpacing: -0.1,
          lineHeight: 1.35,
          marginTop: 6,
          paddingRight: 28,
        }}
      >
        {alert.title}
      </div>

      {alert.sub && (
        <div
          style={{
            fontSize: 11.5,
            color: C.mute,
            marginTop: 2,
            fontWeight: 500,
            lineHeight: 1.35,
            paddingRight: 28,
          }}
        >
          {alert.sub}
        </div>
      )}

      {Array.isArray(alert.actions) && alert.actions.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 10,
            flexWrap: 'wrap',
          }}
        >
          {alert.actions.map((action, idx) => (
            <button
              key={`${alert.id}-act-${idx}`}
              type="button"
              onClick={() => onAction(action)}
              disabled={busy}
              style={{
                all: 'unset',
                cursor: busy ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: -0.1,
                background: action.kind === 'primary' ? C.ink : 'transparent',
                color: action.kind === 'primary' ? C.bg : C.ink,
                border:
                  action.kind === 'primary'
                    ? 'none'
                    : `1px solid ${C.borderSoft}`,
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EmptyState — mono eyebrow + ícone neutro ────────────────────
function EmptyState({
  dark,
  error,
}: {
  dark?: boolean;
  error?: string | null;
}) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        margin: '32px 16px',
        border: `1px dashed ${C.borderSoft}`,
        borderRadius: 14,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: C.bg,
          border: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.faint,
        }}
      >
        {Icon.bell(24)}
      </div>
      <div
        style={{
          fontSize: 10,
          color: C.faint,
          fontWeight: 700,
          letterSpacing: 1.5,
          fontFamily: MONO_FONT,
          textTransform: 'uppercase',
        }}
      >
        Sem notificações.
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: C.mute,
          fontWeight: 500,
          lineHeight: 1.5,
          maxWidth: 280,
        }}
      >
        Tudo no ritmo. Quando algo precisar da sua atenção, vai cair aqui.
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: '8px 12px',
            borderRadius: 10,
            background: '#FBE7E7',
            color: '#8C2A2A',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.4,
            maxWidth: 300,
          }}
        >
          Não foi possível carregar notificações agora.
        </div>
      )}
    </div>
  );
}

// ─── LoadingState ────────────────────────────────────────────────
function LoadingState({ dark }: { dark?: boolean }) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        height: '100%',
        minHeight: 240,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.faint,
        fontSize: 12,
        fontFamily: MONO_FONT,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
      }}
    >
      Carregando…
    </div>
  );
}

// ─── formatRelative — "agora", "há 3 min", "há 2 h", "há 1 d" ────
function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'agora';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const d = Math.floor(hr / 24);
  return `há ${d} d`;
}

export default ScreenManagerNotifications;
