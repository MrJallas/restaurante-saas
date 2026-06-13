'use client';

// V9 drill-down — CARGA MÉDIA tile (/manager/equipe/carga-media).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:372-567
// (variant `carga-media`). Hero "X,Y" mesas/garçom + bloco distribuição
// agora (cada garçom + mesas) + histórico 4h mono + bloco ações condicional
// (só quando above-target) + Fórmula.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL: GET /:slug/staff?activeOnly=true → conta garçons ativos.
//     Ações navegam para redistribuição, pausa de zona e editor de turnos.

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  Icon,
  MTopBar,
  GIconBtn,
  MBottomNav,
  MAvatar,
} from '../../components/manager';
import { staffRosterApi, type StaffRosterEntry } from '../../lib/api/manager';

export interface ScreenManagerStaffCargaMediaProps {
  dark?: boolean;
  tenantSlug: string;
}

const ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];
const META = 5; // meta < 5 mesas/garçom

interface WaiterLoad {
  id: string;
  name: string;
  color: string;
  tables: number;
  over: boolean;
}

export function ScreenManagerStaffCargaMedia({
  dark,
  tenantSlug,
}: ScreenManagerStaffCargaMediaProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/equipe?slug=${slugQs}` : '/manager/equipe';

  const [waiters, setWaiters] = useState<WaiterLoad[]>([]);

  useEffect(() => {
    let cancelled = false;
    staffRosterApi(tenantSlug)
      .list({ activeOnly: true })
      .then((data: StaffRosterEntry[]) => {
        if (cancelled) return;
        // TODO(round19): wire real `mesas atendidas por garçom`. Mock
        // derived igual à derivação em ScreenManagerStaff (decrescente
        // por índice, primeiro fica sobrecarregado).
        const onlyWaiters = data.filter((s) => s.role === 'waiter');
        const result: WaiterLoad[] = onlyWaiters.slice(0, 6).map((s, i) => {
          const tables = Math.max(0, 7 - i);
          return {
            id: s.id,
            name: s.name,
            color: ROLE_PALETTE[i % ROLE_PALETTE.length],
            tables,
            over: tables >= META,
          };
        });
        setWaiters(result);
      })
      .catch(() => {
        // empty fallback
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const totalTables = waiters.reduce((acc, w) => acc + w.tables, 0);
  const heroNum = waiters.length > 0 ? totalTables / waiters.length : 0;

  const variant = useMemo<'above' | 'within' | 'below' | 'empty'>(() => {
    if (waiters.length === 0) return 'empty';
    if (heroNum >= META) return 'above';
    if (heroNum >= META * 0.7) return 'within';
    return 'below';
  }, [heroNum, waiters.length]);

  const heroStr = heroNum > 0 ? heroNum.toFixed(1).replace('.', ',') : '—';
  const heroAccent = variant === 'above' ? '#A12626' : C.ink;
  const subColor = variant === 'above' ? '#A12626' : variant === 'below' ? '#1E8C5A' : C.faint;
  const subText =
    variant === 'above'
      ? '· ACIMA DA META · REALOCAR'
      : variant === 'below'
        ? '· FOLGADO'
        : variant === 'within'
          ? '· DENTRO DA META'
          : '· SEM DADOS';

  // Render-time `new Date()` causa hydration mismatch (server em UTC,
  // client em Brasília). Placeholder no SSR, atualiza após mount.
  const [updatedAt, setUpdatedAt] = useState<string>('--:--');
  useEffect(() => {
    setUpdatedAt(
      new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, []);

  // Mock histórico — 4 medições da última hora.
  // TODO(round19): wire real histogram endpoint.
  const history =
    variant === 'above'
      ? [
          { t: '15:42', v: '4,1', peak: false, now: false },
          { t: '16:42', v: '4,8', peak: false, now: false },
          { t: '17:42', v: '5,0', peak: true, now: false },
          { t: '18:42', v: heroStr, peak: false, now: true },
        ]
      : [
          { t: '15:42', v: '4,1', peak: false, now: false },
          { t: '16:42', v: '3,8', peak: false, now: false },
          { t: '17:42', v: '4,3', peak: true, now: false },
          { t: '18:42', v: heroStr, peak: false, now: true },
        ];

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
        title="Carga média"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(backHref)}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 100 }}>
        {/* Hero */}
        <div style={{ padding: '20px 16px 18px' }}>
          <div
            style={{
              fontSize: 10.5,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
            }}
          >
            Atualizado às {updatedAt}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: -1,
              color: heroAccent,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {heroStr}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: subColor,
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {subText}
          </div>
          <div
            style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}
          >
            Cada garçom atende <b style={{ color: C.ink, fontWeight: 700 }}>{heroStr}</b> mesas em
            média · meta menor que {META}.
          </div>
        </div>

        {waiters.length > 0 && (
          <>
            <SectionLabel C={C}>Distribuição agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {waiters.map((w) => (
                <DistributionRow key={w.id} C={C} waiter={w} />
              ))}
            </div>

            <SectionLabel C={C}>Histórico das últimas 4 horas</SectionLabel>
            <div style={{ padding: '0 16px' }}>
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid ${C.borderSoft}`,
                  background: C.bg,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {history.map((h, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: h.now ? C.ink : C.faint,
                          fontFamily: MONO_FONT,
                          letterSpacing: 0.5,
                          minWidth: 50,
                        }}
                      >
                        {h.t}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 14.5,
                          fontWeight: 800,
                          color: h.now && variant === 'above' ? '#A12626' : C.ink,
                          fontFamily: MONO_FONT,
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: -0.1,
                        }}
                      >
                        {h.v}
                      </span>
                      {h.peak && !h.now && (
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: 5,
                            background: C.surface,
                            border: `1px solid ${C.borderFaint}`,
                            fontSize: 9,
                            fontWeight: 800,
                            color: C.faint,
                            letterSpacing: 0.6,
                            fontFamily: MONO_FONT,
                          }}
                        >
                          PICO
                        </span>
                      )}
                      {h.now && (
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: 5,
                            background: C.ink,
                            color: C.bg,
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: 0.6,
                            fontFamily: MONO_FONT,
                          }}
                        >
                          AGORA
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {variant === 'above' && (
          <>
            <SectionLabel C={C}>O que fazer agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionPill
                C={C}
                filled
                icon={Icon.table(13)}
                onClick={() =>
                  router.push(
                    slugQs
                      ? `/manager/equipe/sobrecarga?slug=${slugQs}`
                      : '/manager/equipe/sobrecarga',
                  )
                }
              >
                Realocar mesas
              </ActionPill>
              <ActionPill
                C={C}
                icon={Icon.pause(13)}
                onClick={() =>
                  router.push(slugQs ? `/manager/pausa-zona?slug=${slugQs}` : '/manager/pausa-zona')
                }
              >
                Pausar pedidos novos por 5 min
              </ActionPill>
              <ActionPill
                C={C}
                icon={Icon.user(13)}
                onClick={() =>
                  router.push(
                    slugQs ? `/manager/equipe/turnos?slug=${slugQs}` : '/manager/equipe/turnos',
                  )
                }
              >
                Ajustar reforço no turno
              </ActionPill>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Total de mesas abertas dividido pelos funcionários em campo · atualizado a cada 30s · meta{' '}
          <b style={{ color: C.ink, fontWeight: 700 }}>menor que {META}</b> por garçom.
        </Formula>
      </div>

      <MBottomNav active="staff" dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}

// ─── Local shared bits ───────────────────────────────────────────

function SectionLabel({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '18px 16px 8px',
        fontSize: 11,
        color: C.faint,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
      }}
    >
      {children}
    </div>
  );
}

function DistributionRow({ C, waiter }: { C: ReturnType<typeof useG>; waiter: WaiterLoad }) {
  const init = waiter.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${waiter.over ? '#E7BFBF' : C.borderSoft}`,
        background: waiter.over ? '#FBEFEF' : C.bg,
      }}
    >
      <MAvatar name={waiter.name} init={init} color={waiter.color} size={30} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: 600,
          color: waiter.over ? '#7A1818' : C.ink,
          letterSpacing: -0.1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {waiter.name}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: waiter.over ? '#A12626' : C.ink,
          fontFamily: MONO_FONT,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 0.2,
        }}
      >
        {waiter.tables}{' '}
        <span style={{ color: C.faint, fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>
          MESAS
        </span>
      </div>
    </div>
  );
}

function ActionPill({
  C,
  filled,
  accent,
  icon,
  children,
  onClick,
}: {
  C: ReturnType<typeof useG>;
  filled?: boolean;
  accent?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        padding: '12px 14px',
        borderRadius: 12,
        border: filled ? 'none' : `1px solid ${C.borderSoft}`,
        background: filled ? accent || C.ink : 'transparent',
        color: filled ? '#fff' : C.ink,
        fontSize: 13.5,
        fontWeight: 700,
        letterSpacing: -0.1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 10,
      }}
    >
      {icon && (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: filled ? 'rgba(255,255,255,0.18)' : C.surface,
            color: filled ? '#fff' : C.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

function Formula({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: '0 16px',
        padding: 14,
        borderRadius: 12,
        background: C.surface,
        border: `1px solid ${C.borderFaint}`,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: C.faint,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontFamily: MONO_FONT,
          marginBottom: 8,
        }}
      >
        Como esse número é calculado
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}
