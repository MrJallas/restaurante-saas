'use client';

// ScreenWaiterCallDetail — canvas garcom-screens-b.jsx (CALL types).
//
// Mostra detalhe de UM chamado (pediu-conta, chamou-garcom, pronto-cozinha).
// CTAs: "A caminho" (acknowledge) / "Voltar".
//
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import { OperationalErrorBanner } from '../../components/OperationalErrorBanner';
import { canMutateWaiterCall, waiterCallTypeFromReason } from '../../lib/waiter-call-state';
import {
  acknowledgeCall,
  resolveCall,
  getCallStaffDetail,
  type WaiterCallStaffDetail,
} from '../../lib/api/waiter';

type CallType = 'pediu-conta' | 'chamou-garcom' | 'pronto-cozinha' | 'mais-bebida';

interface CallVisual {
  title: string;
  reminder?: string;
  primary: string;
  tint: string;
  priority: 'high' | 'med' | 'low';
}

// Auditoria 2026-07-03: a tela era PLACEBO — R$ 612,40, itens e mesa
// hardcoded (garçom levava a maquininha com valor errado). O visual por
// tipo fica; TODO dado (valor, mesa, motivo, tempos) vem do
// GET /waiter-calls/:id/staff-detail.
const VISUAL_BY_TYPE: Record<CallType, CallVisual> = {
  'pediu-conta': {
    title: 'Pediu a conta',
    reminder: 'Lembre-se de levar a maquininha de cartão',
    primary: 'A caminho',
    tint: '#C43A3A',
    priority: 'high',
  },
  'chamou-garcom': {
    title: 'Chamou garçom',
    primary: 'A caminho',
    tint: '#D98E2B',
    priority: 'high',
  },
  'pronto-cozinha': {
    title: 'Pronto · cozinha',
    primary: 'Vou servir',
    tint: '#2F7D4F',
    priority: 'high',
  },
  'mais-bebida': {
    title: 'Pediu bebida',
    primary: 'A caminho',
    tint: '#1F3784',
    priority: 'med',
  },
};

const REASON_LABEL: Record<string, string> = {
  bring_menu: 'Trazer cardápio',
  place_order: 'Fazer pedido',
  serve_drink: 'Servir bebida',
  ask_bill: 'Pedir conta',
  other: 'Outro motivo',
};

const fmtCents = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

export interface ScreenWaiterCallDetailProps {
  dark?: boolean;
  callId: string;
  tenantSlug: string;
  callType?: CallType;
  tableNumber?: number;
  partySize?: number;
}

export function ScreenWaiterCallDetail({
  dark = false,
  callId,
  tenantSlug,
}: ScreenWaiterCallDetailProps) {
  const C = useG(dark);
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<WaiterCallStaffDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const showToast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 2800);
  };
  useEffect(() => {
    let stop = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setAcked(false);
    setResolved(false);
    getCallStaffDetail(tenantSlug, callId)
      .then((d) => {
        if (stop) return;
        setDetail(d);
        // Um chamado já 'acknowledged' abre direto no estágio "Atendido" —
        // e um já 'resolved' abre concluído (não re-oferece as ações).
        if (d.status === 'acknowledged' || d.status === 'resolved') setAcked(true);
        if (d.status === 'resolved') setResolved(true);
      })
      .catch((error) => {
        console.error('[waiter-call-detail] detail load failed', error);
        if (!stop) {
          setDetailError('Não foi possível carregar os dados do chamado.');
        }
      })
      .finally(() => {
        if (!stop) setDetailLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [tenantSlug, callId, reloadKey]);

  const visualType = detail ? waiterCallTypeFromReason(detail.reason) : null;
  const copy = visualType
    ? VISUAL_BY_TYPE[visualType]
    : {
        title: detailLoading ? 'Carregando chamado' : 'Chamado indisponível',
        primary: 'A caminho',
        tint: '#59636E',
        priority: 'low' as const,
      };
  const isBill = visualType === 'pediu-conta';
  const bigText = detail
    ? isBill
      ? fmtCents(detail.bill.totalCents)
      : elapsedLabel(detail.createdAt)
    : detailError
      ? '—'
      : '…';
  const reasonLabel = detail ? (REASON_LABEL[detail.reason] ?? detail.reason) : null;
  const hint = detail
    ? isBill
      ? `Cliente pediu a conta pelo cardápio digital. Total já inclui a taxa de serviço (${String(detail.bill.serviceFeePct).replace('.', ',')}%).`
      : `Motivo: ${reasonLabel}. Chamado aberto ${elapsedLabel(detail.createdAt)}.`
    : detailError
      ? 'Não consegui carregar os detalhes — tente novamente antes de atender.'
      : 'Carregando detalhes do chamado…';
  const tableLine = detail
    ? detail.tableLabel
    : detailLoading
      ? 'Confirmando mesa…'
      : 'Mesa não confirmada';
  const mutationAllowed = canMutateWaiterCall({
    hasDetail: detail !== null,
    loadFailed: detailError !== null,
    submitting,
    resolved,
  });

  // Estágio 1: "A caminho" (acknowledge). NÃO navega mais de volta na hora —
  // o garçom precisa poder concluir o chamado ('resolved') depois de atender,
  // senão o chamado morre em 'acknowledged' e a sheet do cliente trava (P1).
  const ack = async () => {
    if (!detail || detailError || acked || submitting) return;
    setSubmitting(true);
    try {
      await acknowledgeCall(tenantSlug, callId);
      setAcked(true);
      showToast('A caminho. Conclua quando atender a mesa.');
    } catch (error) {
      console.error('[waiter-call-detail] acknowledge failed', error);
      showToast('Não foi possível registrar o atendimento.');
    } finally {
      setSubmitting(false);
    }
  };

  // Estágio 2: "Atendido" (resolve). Move o chamado pra 'resolved' (terminal)
  // e o backend emite `waiter:resolved` — a sheet do cliente destrava.
  const resolve = async () => {
    if (!detail || detailError || resolved || submitting) return;
    setSubmitting(true);
    try {
      await resolveCall(tenantSlug, callId);
      setResolved(true);
      showToast('Chamado concluído.');
      setTimeout(() => router.back(), 700);
    } catch (error) {
      console.error('[waiter-call-detail] resolve failed', error);
      showToast('Não foi possível concluir o chamado.');
    } finally {
      setSubmitting(false);
    }
  };

  // Label + ação do CTA primário dependem do estágio: antes de atender,
  // "A caminho"; depois, "Atendido" (conclui).
  const primaryLabel = submitting
    ? acked
      ? 'Concluindo…'
      : 'Registrando…'
    : detailLoading
      ? 'Carregando…'
      : detailError
        ? 'Indisponível'
        : resolved
          ? 'Concluído'
          : acked
            ? 'Atendido'
            : copy.primary;
  const onPrimary = acked ? resolve : ack;

  return (
    <div
      style={{
        height: '100dvh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.back()} />}
        title="Chamado"
      />

      {detailError && (
        <OperationalErrorBanner
          dark={dark}
          message={detailError}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Hero */}
        <div
          style={{
            background: copy.tint,
            color: '#fff',
            padding: '28px 24px 32px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                fontWeight: 700,
                opacity: 0.85,
                fontFamily: MONO_FONT,
              }}
            >
              {copy.title}
            </div>
            {copy.priority === 'high' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 100,
                  background: '#fff',
                  color: copy.tint,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontFamily: MONO_FONT,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: copy.tint,
                  }}
                />
                Prioridade alta
              </div>
            )}
          </div>
          <div style={{ fontSize: 14, marginTop: 14, opacity: 0.85, fontWeight: 500 }}>
            {tableLine}
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: -1.5,
              marginTop: 8,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {bigText}
          </div>
          <div style={{ fontSize: 14, marginTop: 14, lineHeight: 1.5, opacity: 0.95 }}>{hint}</div>
        </div>

        {/* Lembrete (só pra pediu-conta) */}
        {detail && copy.reminder && (
          <div
            style={{
              margin: '14px 16px 0',
              padding: '12px 14px',
              borderRadius: 12,
              background: '#FFF7E6',
              border: '1.5px solid #F0DCB6',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                flexShrink: 0,
                background: '#D98E2B',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon.receipt(15)}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: '#8a6a13',
                  fontFamily: MONO_FONT,
                }}
              >
                Lembrete
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.ink,
                  marginTop: 2,
                  lineHeight: 1.35,
                }}
              >
                {copy.reminder}
              </div>
            </div>
          </div>
        )}

        {/* Resumo da mesa */}
        <div style={{ padding: '20px 16px' }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: C.mute,
              fontWeight: 700,
              marginBottom: 10,
              fontFamily: MONO_FONT,
            }}
          >
            Resumo da mesa
          </div>
          <div
            style={{
              border: `1.5px solid ${C.borderSoft}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            {(detail
              ? [
                  ['Subtotal', fmtCents(detail.bill.subtotalCents)],
                  [
                    `Taxa ${String(detail.bill.serviceFeePct).replace('.', ',')}%`,
                    fmtCents(detail.bill.serviceFeeCents),
                  ],
                  ['Total da mesa', fmtCents(detail.bill.totalCents)],
                  ['Chamado aberto', elapsedLabel(detail.createdAt)],
                ]
              : [
                  ['Subtotal', '—'],
                  ['Taxa de serviço', '—'],
                  ['Total da mesa', '—'],
                  ['Chamado aberto', '—'],
                ]
            ).map(([k, v], i, a) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderBottom: i < a.length - 1 ? `1px solid ${C.borderFaint}` : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: C.mute }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${C.borderFaint}`,
          padding: '12px 16px 14px',
          display: 'flex',
          gap: 10,
          background: C.bg,
          flexShrink: 0,
        }}
      >
        <GButton kind="secondary" dark={dark} onClick={() => router.back()}>
          Voltar
        </GButton>
        <div style={{ flex: 1 }}>
          <GButton kind="primary" dark={dark} full onClick={onPrimary} disabled={!mutationAllowed}>
            {primaryLabel}
          </GButton>
        </div>
      </div>

      {toastMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 90,
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '12px 18px',
            borderRadius: 999,
            background: C.ink,
            color: C.bg,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
