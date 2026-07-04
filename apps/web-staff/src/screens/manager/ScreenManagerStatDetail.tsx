'use client';

// Stat / event detail screen — 7 variants (one per kind).
//
// Variants:
//   • late-arrival, merge, complaint, escalation, zone-pause, qr-issue, generic-call
//
// Picks layout via `kind` prop. Tappable from MStat help buttons + the
// MInProgressCard items in the Painel + Operações lists.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, Icon, MTopBar, GIconBtn, GButton, MPill } from '../../components/manager';
import { manager } from '../../lib/api/manager';
import type {
  LateArrivalRequestDto,
  TableMergeRequestDto,
  ComplaintDto,
  ZonePauseDto,
  LgpdRequestDto,
} from '@restaurant/shared-types';

export type StatKind =
  | 'late-arrival'
  | 'merge'
  | 'complaint'
  | 'escalation'
  | 'zone-pause'
  | 'qr-issue'
  | 'generic-call'
  | 'lgpd';

export interface ScreenManagerStatDetailProps {
  dark?: boolean;
  tenantSlug: string;
  kind: StatKind;
  id: string;
}

export function ScreenManagerStatDetail({
  dark,
  tenantSlug,
  kind,
  id,
}: ScreenManagerStatDetailProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        let res: unknown = null;
        if (kind === 'late-arrival') {
          const list = await api.lateArrival.list();
          res = list.find((r) => r.id === id) ?? null;
        } else if (kind === 'merge') {
          const list = await api.tableMerge.list();
          res = list.find((r) => r.id === id) ?? null;
        } else if (kind === 'complaint') {
          const list = await api.complaints.list();
          res = list.find((r) => r.id === id) ?? null;
        } else if (kind === 'zone-pause') {
          const list = await api.zonePauses.list();
          res = list.find((r) => r.id === id) ?? null;
        } else if (kind === 'lgpd') {
          const list = await api.lgpd.list();
          res = list.find((r) => r.id === id) ?? null;
        }
        setData(res);
      } finally {
        setLoading(false);
      }
    })();
  }, [kind, id, api]);

  const titleByKind: Record<StatKind, string> = {
    'late-arrival': 'Chegada Tardia',
    merge: 'Junção de Mesas',
    complaint: 'Reclamação',
    escalation: 'Escalação',
    'zone-pause': 'Zona Pausada',
    'qr-issue': 'Problema no QR',
    'generic-call': 'Chamado',
    lgpd: 'Solicitação LGPD',
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
        title={titleByKind[kind]}
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.back()}
            ariaLabel="Voltar"
          />
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.faint }}>Carregando…</div>
        ) : !data ? (
          <div
            style={{
              padding: 28,
              borderRadius: 14,
              border: `1.5px dashed ${C.borderSoft}`,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Não encontrado.
          </div>
        ) : (
          <DetailContent
            kind={kind}
            data={data}
            dark={dark}
            slug={tenantSlug}
            onBack={() => router.back()}
          />
        )}
      </div>
    </div>
  );
}

function DetailContent({
  kind,
  data,
  dark,
  slug,
  onBack,
}: {
  kind: StatKind;
  data: unknown;
  dark?: boolean;
  slug: string;
  onBack: () => void;
}) {
  const C = useG(!!dark);
  const api = manager(slug);

  if (kind === 'late-arrival') {
    const r = data as LateArrivalRequestDto;
    return (
      <>
        <Hero
          dark={dark}
          kicker={`MESA ${r.tableNumber}`}
          title={`${r.requesterName} pediu pra entrar`}
        />
        <Field dark={dark} label="Status">
          <MPill
            tone={r.status === 'pending' ? 'warn' : r.status === 'approved' ? 'success' : 'danger'}
            dark={dark}
          >
            {r.status}
          </MPill>
        </Field>
        {r.visitContext && (
          <Field dark={dark} label="Contexto">
            {r.visitContext}
          </Field>
        )}
        <Field dark={dark} label="Criada em">
          {new Date(r.createdAt).toLocaleString('pt-BR')}
        </Field>
        <Field dark={dark} label="Expira em">
          {new Date(r.expiresAt).toLocaleString('pt-BR')}
        </Field>

        {/* Decisão Caleb 2026-07-04 (gate 1D): late-arrival NÃO vai pro
            staff como aprovação ativa — quem aprova é o customer-host da
            mesa (doutrina 2026-06-09). Os botões Aprovar/Rejeitar davam
            401 sempre (o controller usa guard de cliente) e saíram; o
            manager vê como notificação passiva. */}
        {r.status === 'pending' && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px dashed ${C.borderSoft}`,
              color: C.faint,
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            Aguardando decisão do anfitrião da mesa — chegada tardia é aprovada pelo cliente, não
            pela equipe.
          </div>
        )}
      </>
    );
  }

  if (kind === 'merge') {
    const m = data as TableMergeRequestDto;
    return (
      <>
        <Hero
          dark={dark}
          kicker={`MESA ${m.originTableNumber} → ${m.targetTableNumber}`}
          title={`${m.originHostName} quer juntar`}
        />
        <Field dark={dark} label="Status">
          <MPill
            tone={m.status === 'pending' ? 'warn' : m.status === 'approved' ? 'success' : 'danger'}
            dark={dark}
          >
            {m.status}
          </MPill>
        </Field>
        <Field dark={dark} label="Pessoas (origem)">
          {m.originPartySize}
        </Field>
        <Field dark={dark} label="Pessoas (destino)">
          {m.targetPartySize}
        </Field>
        {m.targetHostName && (
          <Field dark={dark} label="Host destino">
            {m.targetHostName}
          </Field>
        )}
        <Field dark={dark} label="Expira em">
          {new Date(m.expiresAt).toLocaleString('pt-BR')}
        </Field>

        {m.status === 'pending' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <GButton
              dark={dark}
              full
              kind="ghost"
              onClick={() => api.tableMerge.reject(m.id).then(onBack)}
            >
              Rejeitar
            </GButton>
            <GButton
              dark={dark}
              full
              kind="primary"
              onClick={() => api.tableMerge.approve(m.id).then(onBack)}
            >
              Aprovar
            </GButton>
          </div>
        )}
      </>
    );
  }

  if (kind === 'complaint') {
    const c = data as ComplaintDto;
    return (
      <>
        <Hero
          dark={dark}
          kicker={`MESA ${c.tableNumber} · ${c.problemType.toUpperCase()}`}
          title={c.customerName}
        />
        <Field dark={dark} label="Status">
          <MPill
            tone={c.status === 'created' ? 'danger' : c.status === 'responded' ? 'warn' : 'success'}
            dark={dark}
          >
            {c.status}
          </MPill>
        </Field>
        {c.rating != null && (
          <Field dark={dark} label="Avaliação">
            {c.rating} ★
          </Field>
        )}
        <Field dark={dark} label="Descrição">
          {c.description}
        </Field>
        <Field dark={dark} label="Aberta em">
          {new Date(c.createdAt).toLocaleString('pt-BR')}
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {c.status !== 'resolved' && (
            <GButton
              dark={dark}
              full
              kind="ghost"
              onClick={() => api.complaints.resolve(c.id).then(onBack)}
            >
              Resolver
            </GButton>
          )}
          <GButton dark={dark} full kind="primary" onClick={onBack}>
            Voltar
          </GButton>
        </div>
      </>
    );
  }

  if (kind === 'zone-pause') {
    const p = data as ZonePauseDto;
    const remaining = Math.max(0, Math.floor((new Date(p.endsAt).getTime() - Date.now()) / 1000));
    const mm = Math.floor(remaining / 60)
      .toString()
      .padStart(2, '0');
    const ss = (remaining % 60).toString().padStart(2, '0');
    return (
      <>
        <Hero dark={dark} kicker="ZONA PAUSADA" title={p.waiterName} />
        <Field dark={dark} label="Status">
          <MPill tone={p.active ? 'warn' : 'mute'} dark={dark}>
            {p.active ? 'Ativa' : 'Encerrada'}
          </MPill>
        </Field>
        <Field dark={dark} label="Tempo restante">
          {p.active ? `${mm}:${ss}` : '—'}
        </Field>
        <Field dark={dark} label="Iniciada em">
          {new Date(p.startedAt).toLocaleString('pt-BR')}
        </Field>
        <Field dark={dark} label="Encerra em">
          {new Date(p.endsAt).toLocaleString('pt-BR')}
        </Field>
        <Field dark={dark} label="Iniciada por">
          {p.startedByName}
        </Field>
        {p.reason && (
          <Field dark={dark} label="Motivo">
            {p.reason}
          </Field>
        )}

        {p.active && (
          <div style={{ marginTop: 16 }}>
            <GButton
              dark={dark}
              full
              kind="primary"
              onClick={() => api.zonePauses.end(p.id).then(onBack)}
            >
              Encerrar agora
            </GButton>
          </div>
        )}
      </>
    );
  }

  if (kind === 'lgpd') {
    const l = data as LgpdRequestDto;
    return (
      <>
        <Hero dark={dark} kicker={l.protocolNumber} title={`Solicitação LGPD · ${l.type}`} />
        <Field dark={dark} label="Status">
          <MPill
            tone={
              l.status === 'fulfilled' ? 'success' : l.status === 'rejected' ? 'danger' : 'warn'
            }
            dark={dark}
          >
            {l.status}
          </MPill>
        </Field>
        <Field dark={dark} label="Aberta em">
          {new Date(l.createdAt).toLocaleString('pt-BR')}
        </Field>
        {l.fulfilledAt && (
          <Field dark={dark} label="Atendida em">
            {new Date(l.fulfilledAt).toLocaleString('pt-BR')}
          </Field>
        )}
      </>
    );
  }

  // qr-issue / escalation / generic-call → minimalist render
  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        fontSize: 12,
        color: C.mute,
        fontFamily: 'monospace',
        padding: 12,
        background: C.bg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function Hero({ kicker, title, dark }: { kicker: string; title: string; dark?: boolean }) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          color: C.faint,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: C.ink,
          letterSpacing: -0.4,
          lineHeight: 1.15,
        }}
      >
        {title}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  dark,
}: {
  label: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        padding: '10px 14px',
        background: C.bg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: C.faint,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.ink, fontWeight: 500, lineHeight: 1.45 }}>
        {children}
      </div>
    </div>
  );
}
