'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import {
  approveScanVerification,
  getScanVerification,
  rejectScanVerification,
} from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';
import type { ScanVerificationRequestDto } from '@restaurant/shared-types';

interface ScreenHostScanVerificationProps {
  tenantSlug: string;
  requestId: string;
  onBack?: () => void;
  onResolved?: () => void;
}

function fmtDeadline(iso: string | undefined): string {
  if (!iso) return '--';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'EXPIRADO';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatDistance(request: ScanVerificationRequestDto | null): string {
  const meters = request?.locationDistanceMeters ?? request?.distanceMeters;
  if (typeof meters === 'number' && Number.isFinite(meters)) {
    const value = new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: meters < 10 ? 1 : 0,
      minimumFractionDigits: meters < 10 ? 1 : 0,
    }).format(meters);
    return `${value}m do centro do salão`;
  }
  if (request?.locationStatus === 'granted') return 'localização capturada, distância indisponível';
  return 'localização sem distância confirmada';
}

export const ScreenHostScanVerification: React.FC<ScreenHostScanVerificationProps> = ({
  tenantSlug, requestId, onBack, onResolved,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [request, setRequest] = useState<ScanVerificationRequestDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    getScanVerification(tenantSlug, requestId)
      .then((r) => {
        if (alive) setRequest(r);
      })
      .catch((e: unknown) => {
        if (alive) setError((e as Error)?.message ?? 'Erro ao carregar verificacao');
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug, requestId]);

  useEffect(() => {
    const tid = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tid);
  }, []);

  async function handle(action: 'approve' | 'reject') {
    setSubmitting(true);
    setError(null);
    try {
      if (action === 'approve') {
        await approveScanVerification(tenantSlug, requestId);
      } else {
        await rejectScanVerification(tenantSlug, requestId, {
          reason: 'Mesa vazia ou cliente nao localizado na inspecao fisica.',
        });
      }
      onResolved?.();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Erro ao responder');
    } finally {
      setSubmitting(false);
    }
  }

  const expiresAt = request?.expiresAt;
  const expired = expiresAt ? new Date(expiresAt).getTime() <= now : false;

  return (
    <div
      style={{
        width: '100%', height: '100vh', background: C.bg, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title="Verificar QR"
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div
          style={{
            background: '#1E8C5A', color: '#fff', padding: '28px 24px 32px',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700,
              opacity: 0.85,
            }}
          >
            QR FISICO - {expired ? 'EXPIRADO' : fmtDeadline(expiresAt)}
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8, letterSpacing: -0.6 }}>
            {request ? `Mesa ${request.tableNumber}` : '--'}
          </div>
          <div style={{ fontSize: 14, opacity: 0.95, marginTop: 6 }}>
            {request?.requesterName ?? '--'} escaneou o QR da mesa.
          </div>
        </div>

        <div style={{ padding: '20px 16px' }}>
          <div
            style={{
              fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
              color: C.mute, fontWeight: 700, marginBottom: 8,
            }}
          >
            Inspecao
          </div>
          <div
            style={{
              padding: 14, borderRadius: 14,
              background: C.surface, border: `1px solid ${C.borderFaint}`,
              fontSize: 13, color: C.ink, lineHeight: 1.5,
            }}
          >
            Vá até a mesa {request?.tableNumber ?? '--'} e confirme se há cliente
            sentado. CPF {request?.cpfMasked ?? '--'} · {formatDistance(request)}.
            {(request?.locationWithinRestaurant ?? request?.insideRadius) === true && (
              <span
                style={{
                  display: 'inline-flex',
                  marginLeft: 6,
                  padding: '2px 7px',
                  borderRadius: 100,
                  background: '#E2F2E8',
                  color: '#176C45',
                  border: '1px solid #BFE0CA',
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  verticalAlign: 'middle',
                }}
              >
                dentro da área do restaurante
              </span>
            )}
            {request?.locationStatus === 'granted' &&
              (request.locationWithinRestaurant ?? request.insideRadius) === false && (
              <span
                style={{
                  display: 'inline-flex',
                  marginLeft: 6,
                  padding: '2px 7px',
                  borderRadius: 100,
                  background: C.dangerBg,
                  color: C.danger,
                  border: `1px solid ${C.danger}`,
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  verticalAlign: 'middle',
                }}
              >
                fora da área do restaurante
              </span>
            )}
          </div>

          <div
            style={{
              marginTop: 18, padding: 14, borderRadius: 14,
              background: '#F3FBF6', border: '1px solid #CBE8D8',
              fontSize: 12, color: '#176C45', lineHeight: 1.5,
            }}
          >
            <b>Decisao</b><br />
            Aprove se houver cliente fisicamente na mesa. Rejeite se a mesa
            estiver vazia ou se parecer tentativa com foto do QR.
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 14, padding: '10px 12px', borderRadius: 10,
                background: C.dangerBg, color: C.danger, fontSize: 13, fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          borderTop: `1px solid ${C.borderFaint}`, background: C.bg,
          display: 'flex', gap: 10,
        }}
      >
        <GButton kind="secondary" dark={dark} onClick={() => handle('reject')} disabled={submitting || expired}>
          Rejeitar
        </GButton>
        <div style={{ flex: 1 }}>
          <GButton kind="success" full dark={dark} onClick={() => handle('approve')} disabled={submitting || expired}>
            {submitting ? 'Enviando...' : 'Aprovar entrada'}
          </GButton>
        </div>
      </div>
    </div>
  );
};

export default ScreenHostScanVerification;
