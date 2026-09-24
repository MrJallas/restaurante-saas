'use client';

// Stat / event detail screen.
//
// Kinds com fonte real aqui: merge, complaint, zone-pause, lgpd.
// Chegada tardia saiu com o System B (migration 081): quem aprova entrada em
// mesa ocupada é o customer-host, dentro da mesa, e não vira card de gerente.
// qr-issue e generic-call têm tela própria em /manager/chamado/[id]
// (ScreenCallDetail + QrIssueDetail); escalation não tem detalhe dedicado —
// só existe como card in-progress. Antes esses 3 caíam num dump JSON dead-code
// que nunca renderizava (data ficava null → "Não encontrado" enganoso).
// Anti-placebo (P2 re-scan): sem fonte aqui, mensagem honesta em vez de dump.
//
// Picks layout via `kind` prop. Tappable from MStat help buttons + the
// MInProgressCard items in the Painel + Operações lists.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, Icon, MTopBar, GIconBtn, GButton, MPill } from '../../components/manager';
import { manager } from '../../lib/api/manager';
import type {
  TableMergeRequestDto,
  ComplaintDto,
  ZonePauseDto,
  LgpdRequestDto,
} from '@restaurant/shared-types';

export type StatKind =
  | 'merge'
  | 'complaint'
  | 'escalation'
  | 'zone-pause'
  | 'qr-issue'
  | 'generic-call'
  | 'lgpd';

// Kinds que esta tela realmente carrega e renderiza. Fora daqui não há fonte.
const SUPPORTED_KINDS: ReadonlySet<StatKind> = new Set<StatKind>([
  'merge',
  'complaint',
  'zone-pause',
  'lgpd',
]);

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

  const supported = SUPPORTED_KINDS.has(kind);

  useEffect(() => {
    if (!supported) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        let res: unknown = null;
        if (kind === 'merge') {
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
  }, [kind, id, api, supported]);

  const titleByKind: Record<StatKind, string> = {
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
        ) : !supported ? (
          <div
            style={{
              padding: 28,
              borderRadius: 14,
              border: `1.5px dashed ${C.borderSoft}`,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {kind === 'qr-issue' || kind === 'generic-call'
              ? 'Chamados e problemas de QR abrem em Chamado (na tela de operações), não aqui.'
              : 'Este tipo de evento não tem detalhe próprio — acompanhe pelo card em Em curso.'}
          </div>
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
  const api = manager(slug);

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

  // Kinds sem fonte aqui (qr-issue/escalation/generic-call) nunca chegam neste
  // ponto — são barrados por SUPPORTED_KINDS antes de renderizar DetailContent.
  return null;
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
