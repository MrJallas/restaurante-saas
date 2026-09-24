'use client';

// ScreenHostHome — dashboard da recepcionista. Match com docs/design/canvas/
// handoff/garcom/garcom-screens-host.jsx :: ScreenHostHome.
//
// Sumário no topo (4 contadores) + lista de mesas livres (pra liberar) +
// fila de verificação de scan.
//
// NÃO lista chegadas tardias: quem aprova entrada em mesa ocupada é o
// customer-host, dentro da mesa (System A / session_participants), e a decisão
// não escala pra staff (decisão de produto V16). A seção antiga lia
// `late_arrival_requests`, removida na migration 081.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, HSt } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { OperationalErrorBanner } from '../../components/OperationalErrorBanner';
import {
  listHostTables,
  listPendingScanVerifications,
  type HostTableEntry,
} from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';
import { operationalErrorCopy } from '../../lib/operational-error';
import type { ScanVerificationRequestDto, WsEvent } from '@restaurant/shared-types';
import { useHostEvents } from '../../hooks/useHostEvents';

function formatScanDistance(request: ScanVerificationRequestDto): string {
  const meters = request.locationDistanceMeters ?? request.distanceMeters;
  if (typeof meters === 'number' && Number.isFinite(meters)) {
    const value = new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: meters < 10 ? 1 : 0,
      minimumFractionDigits: meters < 10 ? 1 : 0,
    }).format(meters);
    return `${value}m do centro do salão`;
  }
  if (request.locationStatus === 'granted') return 'localização capturada';
  return 'localização sem distância confirmada';
}

interface ScreenHostHomeProps {
  tenantSlug: string;
  hostId: string;
  hostInitials?: string;
  onLiberate?: (tableNumber: number) => void;
  onOpenTableStatus?: (status: HostTableEntry['status']) => void;
  onOpenScanVerification?: (id: string) => void;
  onTabChange?: (tab: string) => void;
}

export const ScreenHostHome: React.FC<ScreenHostHomeProps> = ({
  tenantSlug,
  hostId,
  hostInitials = 'EU',
  onLiberate,
  onOpenTableStatus,
  onOpenScanVerification,
  onTabChange,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const router = useRouter();
  const [tables, setTables] = useState<HostTableEntry[]>([]);
  const [scanVerifications, setScanVerifications] = useState<ScanVerificationRequestDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const { on } = useHostEvents({ tenantSlug, hostId });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [t, sv] = await Promise.all([
          listHostTables(tenantSlug),
          listPendingScanVerifications(tenantSlug),
        ]);
        if (!alive) return;
        setTables(t);
        setScanVerifications(sv);
        setHasLoaded(true);
        setLoadError(null);
      } catch (error) {
        if (alive) setLoadError(operationalErrorCopy(error, 'o salão'));
      }
    }
    load();
    const tid = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(tid);
    };
  }, [retryKey, tenantSlug]);

  useEffect(() => {
    const off = on((event: WsEvent) => {
      if (
        event.event === 'scan_verification.created' ||
        event.event === 'scan_verification.escalated'
      ) {
        listPendingScanVerifications(tenantSlug)
          .then(setScanVerifications)
          .catch((error: unknown) =>
            setLoadError(operationalErrorCopy(error, 'as verificações de mesa')),
          );
      } else if (event.event === 'scan_verification.resolved') {
        setScanVerifications((prev) => prev.filter((sv) => sv.id !== event.payload.requestId));
      }
    });
    return () => {
      off();
    };
  }, [on, tenantSlug]);

  const counts = tables.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const livres = counts.livre ?? 0;
  const ocupadas = counts.ocupada ?? 0;
  const liberadas = counts.liberada ?? 0;
  const alerta = counts.alerta ?? 0;
  const livresList = tables
    .filter((t) => t.status === 'livre')
    .sort((a, b) => a.capacity - b.capacity);

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
        left={
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#7A4FBE',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {hostInitials}
          </div>
        }
        title="Salão"
        sub={
          !hasLoaded
            ? loadError
              ? 'DADOS INDISPONÍVEIS'
              : 'CARREGANDO SALÃO'
            : `${livres} LIVRES · ${ocupadas} EM USO`
        }
        right={
          <GIconBtn
            icon={Icon.bell(20)}
            dark={dark}
            badge={alerta > 0 ? String(alerta) : undefined}
            onClick={() => router.push(`/host/notifications?tenant=${tenantSlug}&hostId=${hostId}`)}
            ariaLabel="Notificações"
          />
        }
      />

      {loadError && (
        <OperationalErrorBanner
          message={loadError}
          onRetry={() => setRetryKey((key) => key + 1)}
          dark={dark}
          hasStaleData={tables.length > 0 || scanVerifications.length > 0}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 80px' }}>
        {/* Sumário · 4 contadores */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            { label: 'Atenção', count: alerta, st: 'alerta' as const },
            { label: 'Liberadas', count: liberadas, st: 'liberada' as const },
            { label: 'Em uso', count: ocupadas, st: 'ocupada' as const },
            { label: 'Livres', count: livres, st: 'livre' as const },
          ].map((s) => {
            const t = HSt[s.st];
            return (
              <button
                key={s.st}
                type="button"
                onClick={() => onOpenTableStatus?.(s.st)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  background: t.bg,
                  border: `${t.dashed ? '1.5px dashed' : '1.5px solid'} ${t.bd}`,
                  borderRadius: 12,
                  padding: '10px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: t.dot,
                    animation: t.pulse ? 'gPulse 1.4s infinite' : 'none',
                  }}
                />
                <span style={{ fontSize: 22, fontWeight: 800, color: t.fg, lineHeight: 1 }}>
                  {s.count}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: t.fg,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Late-arrival approvals */}
        {scanVerifications.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: C.ink,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Verificar mesa escaneada ({scanVerifications.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scanVerifications.map((sv) => (
                <button
                  key={sv.id}
                  type="button"
                  onClick={() => onOpenScanVerification?.(sv.id)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: '#F3FBF6',
                    border: '1px solid #CBE8D8',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#1E8C5A',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {Icon.user(20)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: '#176C45',
                        letterSpacing: 0.7,
                        textTransform: 'uppercase',
                        fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
                      }}
                    >
                      QR FÍSICO · VERIFICAR PRESENÇA
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1c19', marginTop: 2 }}>
                      Mesa {sv.tableNumber} · {sv.requesterName}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#176C45',
                        fontWeight: 500,
                        marginTop: 2,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      <span>
                        {formatScanDistance(sv)} · CPF {sv.cpfMasked ?? '—'}
                      </span>
                      {(sv.locationWithinRestaurant ?? sv.insideRadius) === true && (
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: 100,
                            background: '#E2F2E8',
                            color: '#176C45',
                            border: '1px solid #BFE0CA',
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                          }}
                        >
                          dentro da área do restaurante
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: '#176C45', flexShrink: 0 }}>{Icon.arrow(16)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mesas livres pra liberar */}
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: C.ink,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Pra liberar ({livresList.length})
        </div>
        {livresList.length === 0 ? (
          <div style={{ padding: '20px 16px', color: C.mute, fontSize: 13, textAlign: 'center' }}>
            {!hasLoaded && !loadError
              ? 'Carregando mesas…'
              : loadError
                ? 'Não foi possível confirmar as mesas livres.'
                : 'Sem mesas livres no momento.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {livresList.map((t) => (
              <div
                key={t.number}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: C.bg,
                  border: `1.5px solid ${C.borderSoft}`,
                  borderRadius: 14,
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 12,
                    background: C.surface,
                    border: `1.5px solid ${C.borderSoft}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: C.ink,
                  }}
                >
                  <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
                    {t.number}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Mesa {t.number}</div>
                  <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 2 }}>
                    {t.sector} · {t.capacity} {t.capacity === 1 ? 'lugar' : 'lugares'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLiberate?.(t.number)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '11px 16px',
                    background: '#1E8C5A',
                    color: '#fff',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: -0.1,
                    flexShrink: 0,
                  }}
                >
                  Liberar {Icon.arrow(14)}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <HBottomNav
        active="tables"
        dark={dark}
        inboxBadge={scanVerifications.length}
        onTabChange={(id) => onTabChange?.(id)}
      />
    </div>
  );
};

export default ScreenHostHome;
