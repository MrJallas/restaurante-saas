'use client';

// ScreenManagerAlertsAll — lista real de alertas operacionais.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  MStat,
  MPill,
  MBottomNav,
  Icon,
} from '../../components/manager';
import {
  manager,
  type AlertActionDescriptor,
  type AlertRow,
  type AlertSeverity,
} from '../../lib/api/manager';

type FilterTab = 'todos' | 'criticos' | 'medios' | 'cozinha';

function relativeMinutes(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}

export function ScreenManagerAlertsAll({
  dark = false,
  tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo',
}: {
  dark?: boolean;
  tenantSlug?: string;
}) {
  const C = useG(dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [resolved, setResolved] = useState<AlertRow[]>([]);
  const [filter, setFilter] = useState<FilterTab>('todos');
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      try {
        const [openRows, resolvedRows] = await Promise.all([
          api.alerts.list({ status: 'open', limit: 100 }),
          api.alerts.list({ status: 'resolved', limit: 12 }).catch(() => []),
        ]);
        setAlerts(openRows);
        setResolved(resolvedRows);
        setErrorMsg(null);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar alertas.');
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    load();
  }, [load]);

  const high = alerts.filter((a) => a.sev === 'crítica').length;
  const med = alerts.filter((a) => a.sev === 'atenção').length;

  // "Resolvidos hoje" precisa ser DE HOJE e usar resolved_at (não created_at):
  // filtra por resolved_at no dia local corrente. Rows sem resolved_at (ou de
  // outro dia) ficam de fora. (P2 re-scan)
  const todayKey = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
  const resolvedToday = resolved.filter(
    (r) =>
      r.resolved_at != null && new Date(r.resolved_at).toLocaleDateString('en-CA') === todayKey,
  );

  const filtered =
    filter === 'todos'
      ? alerts
      : filter === 'criticos'
        ? alerts.filter((a) => a.sev === 'crítica')
        : filter === 'medios'
          ? alerts.filter((a) => a.sev === 'atenção')
          : alerts.filter((a) => a.kind.includes('kitchen') || a.kind.includes('cozinha'));

  const tabs: { id: FilterTab; lbl: string; count: number }[] = [
    { id: 'todos', lbl: 'Todos', count: alerts.length },
    { id: 'criticos', lbl: 'Críticos', count: high },
    { id: 'medios', lbl: 'Médios', count: med },
    {
      id: 'cozinha',
      lbl: 'Cozinha',
      count: alerts.filter((a) => a.kind.includes('kitchen') || a.kind.includes('cozinha')).length,
    },
  ];

  const sevDecor: Record<
    AlertSeverity,
    { bar: string; tone: 'danger' | 'warn' | 'mute'; label: string }
  > = {
    crítica: { bar: '#C43A3A', tone: 'danger', label: 'CRÍTICO' },
    atenção: { bar: '#D98E2B', tone: 'warn', label: 'ATENÇÃO' },
    info: { bar: C.faint, tone: 'mute', label: 'AVISO' },
  };

  const dismiss = async (id: string) => {
    const before = alerts;
    setPendingId(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.alerts.dismiss(id);
    } catch (err) {
      setAlerts(before);
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao dispensar alerta.');
    } finally {
      setPendingId(null);
    }
  };

  const resolveActionRoute = (alert: AlertRow, action: AlertActionDescriptor): string | null => {
    const label = action.label.toLowerCase();
    return (
      action.route ??
      (alert.kind.includes('kitchen') || label.includes('cozinha') || label.includes('fila')
        ? `/manager/kitchen-reorder?slug=${tenantSlug}`
        : alert.kind.includes('payment') || label.includes('pag')
          ? `/manager/financeiro?slug=${tenantSlug}`
          : label.includes('garçom') || label.includes('garcom') || label.includes('equipe')
            ? `/manager/equipe?slug=${tenantSlug}`
            : null)
    );
  };

  const runAction = async (alert: AlertRow, action: AlertActionDescriptor) => {
    const route = resolveActionRoute(alert, action);
    if (route) {
      router.push(route);
      return;
    }
    setPendingId(alert.id);
    const before = alerts;
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    try {
      await api.alerts.resolve(alert.id);
      await load();
    } catch (err) {
      setAlerts(before);
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao resolver alerta.');
    } finally {
      setPendingId(null);
    }
  };

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
        title="Atenção · agora"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(`/manager/operacoes?slug=${tenantSlug}`)}
            ariaLabel="Voltar"
          />
        }
        right={<GIconBtn dark={dark} icon={Icon.search(20)} onClick={load} ariaLabel="Atualizar" />}
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
          <MStat
            dark={dark}
            label="Críticos"
            value={String(high)}
            sub="resolver agora"
            accent={high > 0 ? '#C43A3A' : undefined}
          />
          <MStat
            dark={dark}
            label="Atenção"
            value={String(med)}
            sub="próximos 10 min"
            accent={med > 0 ? '#9A7212' : undefined}
          />
        </div>

        <div
          data-hide-scrollbar
          style={{ padding: '14px 16px 4px', display: 'flex', gap: 6, overflowX: 'auto' }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              aria-pressed={filter === t.id}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 100,
                border: `1px solid ${filter === t.id ? C.ink : C.borderSoft}`,
                background: filter === t.id ? C.ink : 'transparent',
                color: filter === t.id ? C.bg : C.ink,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {t.lbl} · {t.count}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div
            role="alert"
            style={{
              margin: '10px 16px',
              padding: 12,
              borderRadius: 10,
              border: '1px solid #F0DCB6',
              background: '#FFF7E6',
              color: '#7A4D10',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {errorMsg}
          </div>
        )}

        <div
          style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {loading ? (
            <div style={{ padding: 24, color: C.faint, fontSize: 13, textAlign: 'center' }}>
              Carregando alertas…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 24,
                border: `1px dashed ${C.borderSoft}`,
                borderRadius: 12,
                textAlign: 'center',
                color: C.faint,
                fontSize: 13,
              }}
            >
              Sem alertas nessa categoria · tudo no ritmo.
            </div>
          ) : (
            filtered.map((a) => {
              const sc = sevDecor[a.sev];
              return (
                <div
                  key={a.id}
                  style={{
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderLeft: `4px solid ${sc.bar}`,
                    background: C.bg,
                  }}
                >
                  <div style={{ padding: 12 }}>
                    <div style={{ marginBottom: 4 }}>
                      <MPill tone={sc.tone} dark={dark}>
                        {sc.label} · {relativeMinutes(a.created_at)}
                      </MPill>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1.3,
                        letterSpacing: -0.1,
                      }}
                    >
                      {a.title}
                    </div>
                    {a.sub && (
                      <div
                        style={{
                          fontSize: 12,
                          color: C.faint,
                          fontWeight: 500,
                          marginTop: 2,
                          lineHeight: 1.4,
                        }}
                      >
                        {a.sub}
                      </div>
                    )}
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.actions.map((action, idx) => (
                        <button
                          key={`${a.id}-${idx}`}
                          type="button"
                          onClick={() => runAction(a, action)}
                          disabled={pendingId === a.id}
                          style={{
                            all: 'unset',
                            cursor: pendingId === a.id ? 'not-allowed' : 'pointer',
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: idx === 0 ? C.ink : 'transparent',
                            color: idx === 0 ? C.bg : C.ink,
                            border: idx === 0 ? 'none' : `1px solid ${C.borderSoft}`,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => dismiss(a.id)}
                        disabled={pendingId === a.id}
                        style={{
                          all: 'unset',
                          cursor: pendingId === a.id ? 'not-allowed' : 'pointer',
                          padding: '8px 10px',
                          borderRadius: 8,
                          color: C.faint,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Dispensar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: '0 16px 24px' }}>
          <div
            style={{
              fontSize: 11,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
              fontFamily: MONO_FONT,
            }}
          >
            Resolvidos hoje · {resolvedToday.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {resolvedToday.map((h) => (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: C.surface,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: C.faint,
                    fontWeight: 700,
                    width: 46,
                    fontFamily: MONO_FONT,
                  }}
                >
                  {relativeMinutes(h.resolved_at ?? h.created_at)}
                </div>
                <div style={{ flex: 1, fontSize: 12, color: C.ink, fontWeight: 500 }}>
                  {h.title}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={alerts.length} />
    </div>
  );
}
