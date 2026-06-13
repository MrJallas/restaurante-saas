'use client';

// ScreenHostLateArrival — visão da recepcionista pra um pedido de chegada
// tardia (per docs/features/customer-host-model.md). Aprovar / rejeitar.
// Cascata host → manager → waiter (60s).

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import { approveLateArrival, getLateArrival, rejectLateArrival } from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';
import type { LateArrivalRequestDto } from '@restaurant/shared-types';

interface ScreenHostLateArrivalProps {
  tenantSlug: string;
  requestId: string;
  onBack?: () => void;
  onResolved?: () => void;
}

function fmtDeadline(iso: string | undefined): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'EXPIRADO';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export const ScreenHostLateArrival: React.FC<ScreenHostLateArrivalProps> = ({
  tenantSlug,
  requestId,
  onBack,
  onResolved,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [request, setRequest] = useState<LateArrivalRequestDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    getLateArrival(tenantSlug, requestId)
      .then((r) => {
        if (alive) setRequest(r);
      })
      .catch((e: unknown) => {
        if (alive) setError((e as Error)?.message ?? 'Erro ao carregar pedido');
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
        await approveLateArrival(tenantSlug, requestId);
      } else {
        await rejectLateArrival(tenantSlug, requestId);
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
        width: '100%',
        height: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title="Chegada tardia"
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div
          style={{
            background: '#9A7212',
            color: '#fff',
            padding: '28px 24px 32px',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            CASCATA · HOST · {expired ? 'EXPIRADO' : fmtDeadline(expiresAt)}
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8, letterSpacing: -0.6 }}>
            {request ? `Mesa ${request.tableNumber}` : '—'}
          </div>
          <div style={{ fontSize: 14, opacity: 0.95, marginTop: 6 }}>
            {request?.requesterName ?? '—'} pediu pra entrar na mesa.
          </div>
        </div>

        <div style={{ padding: '20px 16px' }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: C.mute,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Contexto
          </div>
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: C.surface,
              border: `1px solid ${C.borderFaint}`,
              fontSize: 13,
              color: C.ink,
              lineHeight: 1.5,
            }}
          >
            {request?.visitContext ?? 'Sem contexto adicional. Aprove com cuidado.'}
          </div>

          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              background: '#FFF7E6',
              border: '1px solid #F0DCB6',
              fontSize: 12,
              color: '#7A4D10',
              lineHeight: 1.5,
            }}
          >
            <b>Como funciona</b>
            <br />O cliente-host original não respondeu em 60s. A recepção é a primeira no fallback.
            Se você não responder em mais 60s, o pedido vai pro gerente.
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 10,
                background: C.dangerBg,
                color: C.danger,
                fontSize: 13,
                fontWeight: 600,
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
          borderTop: `1px solid ${C.borderFaint}`,
          background: C.bg,
          display: 'flex',
          gap: 10,
        }}
      >
        <GButton
          kind="secondary"
          dark={dark}
          onClick={() => handle('reject')}
          disabled={submitting || expired}
        >
          Rejeitar
        </GButton>
        <div style={{ flex: 1 }}>
          <GButton
            kind="success"
            full
            dark={dark}
            onClick={() => handle('approve')}
            disabled={submitting || expired}
          >
            {submitting ? 'Enviando...' : 'Aprovar entrada'}
          </GButton>
        </div>
      </div>
    </div>
  );
};

export default ScreenHostLateArrival;
