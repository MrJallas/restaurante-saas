'use client';

// ScreenManagerCourtesies — V5 canon (canvas garcom-screens-c.jsx:2086).
//
// Pareou com o link em `ScreenManagerProfile` (Eu > Cortesias) que ate
// round 17 caia em 404 — `/manager/cortesias` simplesmente nao existia.
//
// Layout V5:
//   • MTopBar "Cortesias" + back
//   • MTab segmentado: Histórico (count) · Nova cortesia
//   • Tab Histórico:
//       - 3 KPI tiles: Hoje (neutro) · Aceitas (verde) · Pendentes (warn)
//       - Lista de cortesias (mesa + horario eyebrow / tipo / item / status pill / autor / response time)
//   • Tab Nova:
//       - Hero "Nova cortesia" + sub
//       - Footer CTA "Abrir compositor" -> /manager/compensate (Onda 2)
//   • MBottomNav active='me' (cortesias vive sob o perfil do gerente)
//
// Backend: `GET /staff/courtesies?today=true` ainda nao existe. Mock
// data inline ate o endpoint shipar — quando shipar, troca MOCK por
// `useEffect + manager.courtesies.list()`.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  MTab,
  MBottomNav,
  GIconBtn,
  Icon,
} from '../../components/manager';
import { manager, type CourtesyEntry } from '../../lib/api/manager';

export type CourtesiesTab = 'history' | 'new';

export type CourtesyStatus = 'aceita' | 'pendente' | 'recusada';

export interface CourtesyRecord {
  id: string;
  table: number;
  type: string;
  item: string;
  status: CourtesyStatus;
  manager: string;
  when: string;
  responseSec: number | null;
}

// ─── Helpers pra converter API entry -> visual record ──────────
function relativeTime(iso: string): string {
  const dt = new Date(iso);
  const diffMin = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h ${String(diffMin % 60).padStart(2, '0')}`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'ontem';
  return `há ${diffD}d`;
}

const STATUS_FROM_API: Record<CourtesyEntry['status'], CourtesyStatus> = {
  pendente: 'pendente',
  aceita: 'aceita',
  recusada: 'recusada',
};

function entryToRecord(e: CourtesyEntry): CourtesyRecord {
  return {
    id: e.id,
    table: e.table_number ?? 0,
    type: e.type,
    item: e.item,
    status: STATUS_FROM_API[e.status],
    manager: e.manager_name,
    when: relativeTime(e.created_at),
    responseSec: e.response_seconds,
  };
}

export interface ScreenManagerCourtesiesProps {
  dark?: boolean;
  tab?: CourtesiesTab;
  /** Tenant slug pra API. Default lê de NEXT_PUBLIC_TENANT_SLUG ou ?slug. */
  tenantSlug?: string;
  /** Override pra tests. Default = fetch da API. */
  records?: CourtesyRecord[];
}

export function ScreenManagerCourtesies({
  dark = false,
  tab = 'history',
  tenantSlug,
  records: recordsOverride,
}: ScreenManagerCourtesiesProps) {
  const C = useG(dark);
  const router = useRouter();

  const slug =
    tenantSlug ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('slug') ?? undefined
      : undefined) ??
    process.env.NEXT_PUBLIC_TENANT_SLUG ??
    'demo';

  const [records, setRecords] = useState<CourtesyRecord[] | null>(
    recordsOverride ?? null,
  );
  const [loading, setLoading] = useState<boolean>(!recordsOverride);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (recordsOverride) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    manager(slug)
      .courtesies.list({ today: true, limit: 50 })
      .then((rows) => {
        if (cancelled) return;
        setRecords(rows.map(entryToRecord));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg((e as Error).message || 'Erro ao carregar cortesias.');
        setRecords([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, recordsOverride]);

  const recs = records ?? [];
  const aceitas = recs.filter((c) => c.status === 'aceita').length;
  const pendentes = recs.filter((c) => c.status === 'pendente').length;
  const totalToday = recs.length;

  const goToTab = (t: CourtesiesTab) => router.push(`/manager/cortesias?tab=${t}`);
  const back = () => router.push('/manager/configuracoes');

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
        title="Cortesias"
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={back} ariaLabel="Voltar" />}
      />

      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${C.borderSoft}`,
          background: C.bg,
        }}
        role="tablist"
      >
        <MTab dark={dark} active={tab === 'history'} count={totalToday} onClick={() => goToTab('history')}>
          Histórico
        </MTab>
        <MTab dark={dark} active={tab === 'new'} onClick={() => goToTab('new')}>
          Nova cortesia
        </MTab>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: tab === 'new' ? 0 : 24 }}>
        {tab === 'history' ? (
          loading ? (
            <div
              style={{
                padding: '40px 24px',
                textAlign: 'center',
                fontSize: 13,
                color: C.faint,
              }}
            >
              Carregando…
            </div>
          ) : errorMsg ? (
            <div
              role="alert"
              style={{
                margin: '14px 16px',
                padding: 14,
                borderRadius: 12,
                background: '#FFF1F1',
                border: '1px solid #F4C7C7',
                color: '#A12626',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {errorMsg}
            </div>
          ) : (
            <HistoryTab
              C={C}
              records={recs}
              totalToday={totalToday}
              aceitas={aceitas}
              pendentes={pendentes}
            />
          )
        ) : (
          <NewTab C={C} />
        )}
      </div>

      {tab === 'new' && (
        <div
          style={{
            padding: '12px 16px 18px',
            background: C.bg,
            borderTop: `1px solid ${C.borderSoft}`,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => router.push('/manager/compensate')}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'center',
              padding: '14px 16px',
              borderRadius: 12,
              background: C.ink,
              color: C.bg,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: -0.1,
              fontFamily: G_FONT,
            }}
          >
            Abrir compositor
          </button>
        </div>
      )}

      <MBottomNav
        active="me"
        dark={dark}
        onTo={(r) => router.push(r)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────

function HistoryTab({
  C,
  records,
  totalToday,
  aceitas,
  pendentes,
}: {
  C: ReturnType<typeof useG>;
  records: CourtesyRecord[];
  totalToday: number;
  aceitas: number;
  pendentes: number;
}) {
  return (
    <>
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
        <KpiTile label="Hoje" value={totalToday} />
        <KpiTile label="Aceitas" value={aceitas} tone="success" />
        <KpiTile label="Pendentes" value={pendentes} tone="warn" />
      </div>

      <div
        style={{
          padding: '14px 16px 6px',
          fontSize: 11.5,
          color: C.faint,
          fontWeight: 500,
          lineHeight: 1.4,
        }}
      >
        Últimas cortesias enviadas · ordenadas por mais recente.
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {records.map((c) => (
          <CourtesyCard key={c.id} C={C} c={c} />
        ))}
        {records.length === 0 && (
          <div
            style={{
              padding: 24,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              background: C.bg,
              color: C.faint,
              textAlign: 'center',
              fontSize: 13,
            }}
          >
            Nenhuma cortesia hoje.
          </div>
        )}
      </div>
    </>
  );
}

function NewTab({ C }: { C: ReturnType<typeof useG> }) {
  return (
    <div style={{ padding: '32px 16px 0' }}>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: C.ink,
          letterSpacing: -0.4,
          lineHeight: 1.15,
        }}
      >
        Nova cortesia
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: C.mute,
          marginTop: 6,
          lineHeight: 1.45,
        }}
      >
        Escolha uma mesa e mande um mimo — sobremesa, drink, desconto ou só
        uma mensagem.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warn';
}) {
  const styles =
    tone === 'success'
      ? { bg: '#EFF5EC', border: '#C0DEC9', fg: '#0F5A37' }
      : tone === 'warn'
      ? { bg: '#FFF7E6', border: '#F0DCB6', fg: '#7A4D10' }
      : { bg: '#ffffff', border: '#e5e5e5', fg: '#0a0a0a' };
  return (
    <div
      style={{
        flex: 1,
        padding: 12,
        border: `1px solid ${styles.border}`,
        borderRadius: 12,
        background: styles.bg,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: tone ? styles.fg : '#a3a3a3',
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontFamily: MONO_FONT,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginTop: 2,
          color: styles.fg,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CourtesyCard({ C, c }: { C: ReturnType<typeof useG>; c: CourtesyRecord }) {
  return (
    <div
      style={{
        padding: 14,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        background: C.bg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              color: C.faint,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 4,
              fontFamily: MONO_FONT,
            }}
          >
            Mesa {c.table} · {c.when}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: -0.2,
            }}
          >
            {c.type}
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.mute,
              fontWeight: 500,
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {c.item}
          </div>
        </div>
        <StatusPill status={c.status} />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 8,
          marginTop: 6,
          borderTop: `1px solid ${C.borderFaint}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: C.faint,
            fontWeight: 600,
            letterSpacing: 0.1,
          }}
        >
          por <b style={{ color: C.ink, fontWeight: 700 }}>{c.manager}</b>
        </div>
        {c.responseSec != null && (
          <div
            style={{
              fontSize: 10,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            resposta · {c.responseSec}s
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: CourtesyStatus }) {
  const map = {
    aceita: { bg: '#EFF5EC', fg: '#0F5A37', label: 'aceita' },
    pendente: { bg: '#FFF7E6', fg: '#7A4D10', label: 'pendente' },
    recusada: { bg: '#FFF1F1', fg: '#A12626', label: 'recusada' },
  } as const;
  const s = map[status];
  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}
