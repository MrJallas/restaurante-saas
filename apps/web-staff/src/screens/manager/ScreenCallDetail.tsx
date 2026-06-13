'use client';

// Generic chamado / call detail. Extends with `complaint` and `qr-issue`
// variants — but in practice the manager flows through this screen for any
// kind of "call" pulled in via /staff/calls or /complaints.
//
// Variant selection is via the `kind` prop (mirrors the URL query).

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
  MContactClientSheet,
} from '../../components/manager';
import { manager } from '../../lib/api/manager';
import type { ComplaintDto, ComplaintChipAction } from '@restaurant/shared-types';

export type CallDetailKind = 'complaint' | 'qr-issue' | 'generic';

export interface ScreenCallDetailProps {
  dark?: boolean;
  tenantSlug: string;
  tenantId: string;
  id: string;
  kind?: CallDetailKind;
  managerName?: string;
}

export function ScreenCallDetail({
  dark,
  tenantSlug,
  tenantId,
  id,
  kind = 'generic',
  managerName = 'Gerência',
}: ScreenCallDetailProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = manager(tenantSlug);
  const [complaint, setComplaint] = useState<ComplaintDto | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [chipAction, setChipAction] = useState<ComplaintChipAction>('on-the-way');
  const quickReplies: Array<{ id: ComplaintChipAction; label: string; text: string }> = [
    { id: 'on-the-way', label: 'Estou indo', text: 'Estou indo até a mesa agora.' },
    {
      id: 'kitchen-check',
      label: 'Vou ver na cozinha',
      text: 'Vou verificar com a cozinha e já volto com uma resposta.',
    },
    { id: 'courtesy', label: 'Cortesia', text: 'Vou registrar uma cortesia pela espera.' },
  ];

  useEffect(() => {
    if (kind !== 'complaint') return;
    let cancelled = false;
    api.complaints
      .list()
      .then((list) => {
        if (cancelled) return;
        setComplaint(list.find((c) => c.id === id) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind, id, api]);

  const onRespond = async () => {
    if (!complaint || !draft.trim() || busy) return;
    setBusy(true);
    try {
      await api.complaints.respond(complaint.id, { content: draft.trim(), chipAction });
      setDraft('');
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const onResolve = async () => {
    if (!complaint || busy) return;
    setBusy(true);
    try {
      await api.complaints.resolve(complaint.id);
      router.back();
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
        title={kind === 'complaint' ? 'Reclamação' : kind === 'qr-issue' ? 'QR' : 'Chamado'}
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.back()}
            ariaLabel="Voltar"
          />
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 100px' }}>
        {kind === 'complaint' && complaint && (
          <ComplaintDetail
            dark={dark}
            complaint={complaint}
            onContact={() => setContactOpen(true)}
          />
        )}
        {kind === 'complaint' && !complaint && (
          <div style={{ padding: 28, color: C.faint, textAlign: 'center' }}>Carregando…</div>
        )}
        {kind === 'qr-issue' && <QrIssueDetail dark={dark} id={id} />}
        {kind === 'generic' && (
          <div
            style={{
              padding: 28,
              borderRadius: 14,
              border: `1.5px dashed ${C.borderSoft}`,
              color: C.faint,
              textAlign: 'center',
            }}
          >
            Detalhes do chamado #{id}
          </div>
        )}

        {kind === 'complaint' && complaint && complaint.status !== 'resolved' && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              Resposta padrão
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {quickReplies.map((c) => {
                const sel = chipAction === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setChipAction(c.id);
                      setDraft(c.text);
                    }}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '8px 12px',
                      borderRadius: 999,
                      border: `1px solid ${sel ? C.ink : C.borderSoft}`,
                      background: sel ? C.ink : 'transparent',
                      color: sel ? C.bg : C.ink,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 240))}
              maxLength={240}
              rows={3}
              placeholder={`Mensagem pra ${complaint.customerName}…`}
              style={{
                resize: 'none',
                padding: '12px 14px',
                border: `1.3px solid ${C.borderSoft}`,
                borderRadius: 14,
                background: C.bg,
                fontSize: 14,
                fontFamily: G_FONT,
                color: C.ink,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <GButton dark={dark} full kind="ghost" onClick={onResolve} disabled={busy}>
                Marcar como resolvido
              </GButton>
              <GButton
                dark={dark}
                full
                kind="primary"
                onClick={onRespond}
                disabled={!draft.trim() || busy}
              >
                Enviar resposta
              </GButton>
            </div>
          </div>
        )}
      </div>

      {complaint && (
        <MContactClientSheet
          open={contactOpen}
          dark={dark}
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          tableSessionId={complaint.tableSessionId}
          customerId={complaint.customerId}
          customerName={complaint.customerName}
          tableNumber={complaint.tableNumber}
          managerName={managerName}
          onClose={() => setContactOpen(false)}
        />
      )}
    </div>
  );
}

function ComplaintDetail({
  dark,
  complaint,
  onContact,
}: {
  dark?: boolean;
  complaint: ComplaintDto;
  onContact: () => void;
}) {
  const C = useG(!!dark);
  return (
    <>
      <div
        style={{
          background: '#FFF1F1',
          border: '1px solid #F4C7C7',
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            color: '#A12626',
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          MESA {complaint.tableNumber} · {complaint.problemType.toUpperCase()}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: -0.4 }}>
          {complaint.customerName}
        </div>
        {complaint.rating != null && (
          <div style={{ marginTop: 6 }}>
            <MPill tone="warn" dark={dark}>
              Avaliação · {complaint.rating}/5
            </MPill>
          </div>
        )}
      </div>

      <div
        style={{
          padding: 14,
          background: C.bg,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 12,
          marginBottom: 12,
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
          Descrição do problema
        </div>
        <div style={{ fontSize: 14, color: C.ink, fontWeight: 500, lineHeight: 1.5 }}>
          {complaint.description}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <GButton dark={dark} full kind="ghost" onClick={onContact}>
          {Icon.chat(16)} Contactar
        </GButton>
      </div>
    </>
  );
}

function QrIssueDetail({ dark, id }: { dark?: boolean; id: string }) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        padding: 14,
        background: C.bg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
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
        QR · ESCALAÇÃO
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Escalação #{id}</div>
      <div style={{ fontSize: 13, color: C.mute, fontWeight: 500, marginTop: 8 }}>
        Sem detalhes adicionais carregados. Use a aba Operação · Escalações pra ver a cadeia.
      </div>
    </div>
  );
}
