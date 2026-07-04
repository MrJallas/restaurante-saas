'use client';

// V9 drill-down — CARGA MÉDIA tile (/manager/equipe/carga-media).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:372-567
// (variant `carga-media`). Hero "X,Y" mesas/garçom + bloco distribuição
// agora (cada garçom + carga real) + bloco ações condicional (só quando
// above-target) + Fórmula.
//
// Backend wiring (2026-07-04 — zone-assignments):
//   • REAL: GET /:slug/staff/zone-assignments → por garçom atribuído
//     HOJE, carga = soma das mesas ocupadas das zonas dele (table_sessions
//     ativas) / soma do total de mesas dessas zonas. Hero = média de
//     mesas ocupadas por garçom atribuído.
//   • Sem garçom atribuído a zonas → empty-state apontando pra tela
//     Equipe (anti-placebo: nada de número inventado). O histórico 4h
//     mock saiu — sem fonte real, sem gráfico.

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { zoneAssignmentsApi } from '../../lib/api/manager';

export interface ScreenManagerStaffCargaMediaProps {
  dark?: boolean;
  tenantSlug: string;
}

const ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];
const META = 5; // meta < 5 mesas ocupadas/garçom
const OVERLOAD_RATIO = 0.8; // 80%+ das mesas das zonas dele ocupadas

interface WaiterLoad {
  id: string;
  name: string;
  color: string;
  /** Mesas ocupadas AGORA nas zonas atribuídas a ele hoje. */
  occupied: number;
  /** Total de mesas das zonas atribuídas a ele hoje. */
  total: number;
  zoneNames: string[];
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
  const equipeHref = backHref;

  const [waiters, setWaiters] = useState<WaiterLoad[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>('--:--');

  const load = useCallback(async () => {
    try {
      const { zones } = await zoneAssignmentsApi(tenantSlug).list();
      const byStaff = new Map<
        string,
        { name: string; occupied: number; total: number; zoneNames: string[] }
      >();
      for (const z of zones) {
        for (const w of z.waiters) {
          const cur = byStaff.get(w.staffId) ?? {
            name: w.name,
            occupied: 0,
            total: 0,
            zoneNames: [],
          };
          cur.occupied += z.occupiedTables;
          cur.total += z.totalTables;
          cur.zoneNames.push(z.zoneName);
          byStaff.set(w.staffId, cur);
        }
      }
      setWaiters(
        Array.from(byStaff.entries()).map(([id, w], i) => ({
          id,
          name: w.name,
          color: ROLE_PALETTE[i % ROLE_PALETTE.length],
          occupied: w.occupied,
          total: w.total,
          zoneNames: w.zoneNames,
          over: w.total > 0 && w.occupied / w.total >= OVERLOAD_RATIO,
        })),
      );
      setLoadError(false);
      // Horário do fetch real — não relógio decorativo.
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // Erro visível (anti-placebo) — nunca distribuição fabricada.
      setLoadError(true);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const assigned = waiters ?? [];
  const heroNum =
    assigned.length > 0 ? assigned.reduce((acc, w) => acc + w.occupied, 0) / assigned.length : 0;

  const variant = useMemo<'above' | 'within' | 'below' | 'empty'>(() => {
    if (assigned.length === 0) return 'empty';
    if (heroNum >= META) return 'above';
    if (heroNum >= META * 0.7) return 'within';
    return 'below';
  }, [heroNum, assigned.length]);

  const heroStr = assigned.length > 0 ? heroNum.toFixed(1).replace('.', ',') : '—';
  const heroAccent = variant === 'above' ? '#A12626' : C.ink;
  const subColor = variant === 'above' ? '#A12626' : variant === 'below' ? '#1E8C5A' : C.faint;
  const subText = loadError
    ? '· ERRO AO CARREGAR'
    : waiters === null
      ? '· CARREGANDO'
      : variant === 'above'
        ? '· ACIMA DA META · REALOCAR'
        : variant === 'below'
          ? '· FOLGADO'
          : variant === 'within'
            ? '· DENTRO DA META'
            : '· SEM ATRIBUIÇÕES HOJE';

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
              color: loadError ? '#A12626' : subColor,
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
            {assigned.length > 0 ? (
              <>
                Cada garçom atribuído tem <b style={{ color: C.ink, fontWeight: 700 }}>{heroStr}</b>{' '}
                mesas ocupadas em média nas zonas dele · meta menor que {META}.
              </>
            ) : (
              <>
                Média de mesas ocupadas por garçom atribuído a zonas hoje · meta menor que {META}.
              </>
            )}
          </div>
        </div>

        {loadError && (
          <div style={{ padding: '0 16px' }}>
            <div
              role="alert"
              style={{
                padding: '16px 14px',
                borderRadius: 12,
                border: '1px solid #E7BFBF',
                background: '#FBEFEF',
                fontSize: 12.5,
                color: '#7A1818',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ flex: 1 }}>Não deu pra carregar as atribuições de zona.</span>
              <button
                type="button"
                onClick={() => void load()}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: '#A12626',
                  color: '#fff',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                Tentar de novo
              </button>
            </div>
          </div>
        )}

        {!loadError && waiters !== null && assigned.length === 0 && (
          <div style={{ padding: '0 16px' }}>
            <div
              style={{
                padding: '24px 18px',
                textAlign: 'center',
                background: C.bg,
                border: `1.5px dashed ${C.borderSoft}`,
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.faint,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontFamily: MONO_FONT,
                }}
              >
                Nenhum garçom atribuído a zonas hoje
              </div>
              <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 6 }}>
                Atribua na tela Equipe (seção Zonas de hoje) pra ver a carga real por garçom.
              </div>
              <button
                type="button"
                onClick={() => router.push(equipeHref)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  marginTop: 12,
                  padding: '9px 14px',
                  borderRadius: 10,
                  background: C.ink,
                  color: C.bg,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: -0.1,
                }}
              >
                Ir pra tela Equipe
              </button>
            </div>
          </div>
        )}

        {assigned.length > 0 && (
          <>
            <SectionLabel C={C}>Distribuição agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {assigned.map((w) => (
                <DistributionRow key={w.id} C={C} waiter={w} />
              ))}
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
                Ver quem está sobrecarregado
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
          Pra cada garçom atribuído a zonas hoje (tela Equipe · Zonas de hoje), somamos as mesas
          ocupadas agora nas zonas dele. A média é essa soma dividida pelo número de garçons
          atribuídos · meta <b style={{ color: C.ink, fontWeight: 700 }}>menor que {META}</b> por
          garçom.
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
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
            fontSize: 10,
            color: C.faint,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            fontFamily: MONO_FONT,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {waiter.zoneNames.join(' · ')}
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: waiter.over ? '#A12626' : C.ink,
          fontFamily: MONO_FONT,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 0.2,
          whiteSpace: 'nowrap',
        }}
      >
        {waiter.occupied}/{waiter.total}{' '}
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
