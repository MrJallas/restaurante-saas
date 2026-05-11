'use client';

// Pause/unpause zones screen + summary view of paused.
//
// On Pause:
//   1. Manager picks a waiter (the zone he covers) + duration (5/10/15/30 min)
//   2. Confirms — POST /staff/zone-pauses
//   3. Lands on the active list (state=running) with countdowns + end-now CTAs
//
// On End-now:
//   • POST /staff/zone-pauses/:id/end → list refreshes; if all gone → Summary

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MTopBar,
  GIconBtn,
  GButton,
  MPill,
  MAvatar,
  MOpSummary,
} from '../../components/manager';
import { manager, staffRosterApi } from '../../lib/api/manager';
import type { ZonePauseDto, ZonePauseDurationMinutes } from '@restaurant/shared-types';
import { useManagerEvents } from '../../hooks/useManagerEvents';

const DURATIONS: ZonePauseDurationMinutes[] = [5, 10, 15, 30];

export interface ScreenManagerOrdersPauseProps {
  dark?: boolean;
  tenantSlug: string;
  /** Optional pre-selected waiter (e.g. when arriving from sobrecarga StatDetail). */
  preselectedWaiterId?: string;
  /** Show the summary screen for `id` instead of the create flow. */
  summaryForId?: string;
}

interface WaiterOpt {
  id: string;
  name: string;
  init: string;
  color: string;
}

// P1 #32 — empty until /staff loads. Picker shows "no waiters" until then.
const WAITERS_FALLBACK: WaiterOpt[] = [];

const PAUSE_ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];

export function ScreenManagerOrdersPause({
  dark,
  tenantSlug,
  preselectedWaiterId,
  summaryForId,
}: ScreenManagerOrdersPauseProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = manager(tenantSlug);
  const [waiterId, setWaiterId] = useState<string>(preselectedWaiterId ?? '');
  const [duration, setDuration] = useState<ZonePauseDurationMinutes>(5);
  const [reason, setReason] = useState('');
  const [pauses, setPauses] = useState<ZonePauseDto[]>([]);
  const [waiters, setWaiters] = useState<WaiterOpt[]>(WAITERS_FALLBACK);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const refresh = async () => {
    const r = await api.zonePauses.list({ active: true }).catch(() => []);
    setPauses(r);
  };

  useEffect(() => {
    refresh();
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    const r = setInterval(refresh, 30000);
    return () => {
      clearInterval(i);
      clearInterval(r);
    };
  }, [tenantSlug]);

  // Try fetching staff for the picker (P1 #14, #32)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await staffRosterApi(tenantSlug).list({ role: 'waiter', activeOnly: true });
        if (cancelled || !data.length) return;
        const list = data.map((s, i) => ({
          id: s.id,
          name: s.name,
          init: s.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
          color: PAUSE_ROLE_PALETTE[i % PAUSE_ROLE_PALETTE.length],
        }));
        if (list.length) setWaiters(list);
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  useManagerEvents(tenantSlug, (e) => {
    if (e.event === 'zone_pause.started' || e.event === 'zone_pause.ended') refresh();
  });

  if (summaryForId) {
    return (
      <MOpSummary
        dark={dark}
        topbarTitle="Resumo da pausa"
        hero={{
          kicker: 'PAUSA TERMINOU',
          title: 'Zona retomou normalmente',
        }}
        kpis={[
          { label: 'Duração', value: `${duration} min`, accent: 'success' },
        ]}
        timeline={[]}
        primaryCta={{ label: 'Voltar pro Painel', onClick: () => router.push('/manager') }}
        onBack={() => router.back()}
      />
    );
  }

  const onCreate = async () => {
    if (!waiterId || busy) return;
    setBusy(true);
    try {
      await api.zonePauses.create({
        waiterId,
        durationMinutes: duration,
        reason: reason.trim() || undefined,
      });
      setReason('');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Pausar zona"
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.back()} ariaLabel="Voltar" />}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 24px' }}>
        {pauses.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginBottom: 10,
              }}
            >
              Pausas ativas · {pauses.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {pauses.map((p) => {
                const remaining = Math.max(
                  0,
                  Math.floor((new Date(p.endsAt).getTime() - Date.now()) / 1000),
                );
                const mm = Math.floor(remaining / 60).toString().padStart(2, '0');
                const ss = (remaining % 60).toString().padStart(2, '0');
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: `1px solid #F0DCB6`,
                      borderLeft: `3px solid #9A7212`,
                      background: '#FFF7E6',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <MPill tone="warn" dark={dark}>
                        Ativa
                      </MPill>
                      <span style={{ fontSize: 13, color: '#7A4D10', fontWeight: 700 }}>
                        {p.waiterName}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 800,
                        color: '#7A4D10',
                        letterSpacing: -1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {mm}:{ss}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <GButton dark={dark} kind="primary" onClick={() => api.zonePauses.end(p.id).then(refresh)}>
                        Encerrar agora
                      </GButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.faint,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: 10,
          }}
        >
          Nova pausa
        </div>

        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.mute,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            Garçom
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {waiters.map((w) => {
              const sel = waiterId === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setWaiterId(w.id)}
                  aria-pressed={sel}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    border: `1px solid ${sel ? C.ink : C.borderSoft}`,
                    borderRadius: 999,
                    background: sel ? C.ink : 'transparent',
                    color: sel ? C.bg : C.ink,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <MAvatar name={w.name} init={w.init} color={w.color} size={22} />
                  {w.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.mute,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            Duração
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DURATIONS.map((d) => {
              const sel = duration === d;
              return (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  aria-pressed={sel}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    flex: 1,
                    textAlign: 'center',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `1px solid ${sel ? C.ink : C.borderSoft}`,
                    background: sel ? C.ink : 'transparent',
                    color: sel ? C.bg : C.ink,
                    fontSize: 13,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {d} min
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.mute,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            Motivo (opcional)
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 240))}
            maxLength={240}
            rows={2}
            placeholder="Ex: cozinha sobrecarregada"
            style={{
              resize: 'none',
              width: '100%',
              boxSizing: 'border-box',
              border: `1.3px solid ${C.borderSoft}`,
              borderRadius: 14,
              background: C.bg,
              padding: '10px 12px',
              fontSize: 13,
              fontFamily: G_FONT,
              color: C.ink,
            }}
          />
        </div>

        <GButton dark={dark} full kind="primary" onClick={onCreate} disabled={!waiterId || busy}>
          {busy ? 'Iniciando…' : `Pausar por ${duration} min`}
        </GButton>
      </div>
    </div>
  );
}
