'use client';

// ScreenWaiterCallDetail — canvas garcom-screens-b.jsx (CALL types).
//
// Mostra detalhe de UM chamado (pediu-conta, chamou-garcom, pronto-cozinha).
// CTAs: "A caminho" (acknowledge) / "Voltar".
//
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';
import { acknowledgeCall } from '../../lib/api/waiter';

type CallType = 'pediu-conta' | 'chamou-garcom' | 'pronto-cozinha' | 'mais-bebida';

interface CallCopy {
  title: string;
  bigText: string;
  hint: string;
  reminder?: string;
  primary: string;
  tint: string;
  priority: 'high' | 'med' | 'low';
}

const COPY_BY_TYPE: Record<CallType, CallCopy> = {
  'pediu-conta': {
    title: 'Pediu a conta',
    bigText: 'R$ 612,40',
    hint: 'Cliente solicitou pelo cardápio digital. Forma de pagamento ainda não escolhida.',
    reminder: 'Lembre-se de levar a maquininha de cartão',
    primary: 'A caminho',
    tint: '#C43A3A',
    priority: 'high',
  },
  'chamou-garcom': {
    title: 'Chamou garçom',
    bigText: 'há 30s',
    hint: 'Cliente acionou o botão "chamar garçom" pelo cardápio. Sem motivo informado.',
    primary: 'A caminho',
    tint: '#D98E2B',
    priority: 'high',
  },
  'pronto-cozinha': {
    title: 'Pronto · cozinha',
    bigText: '2 pratos',
    hint: 'Risoto de camarão · Filé ao vinho. Bandeja na bancada de retirada.',
    primary: 'Vou servir',
    tint: '#2F7D4F',
    priority: 'high',
  },
  'mais-bebida': {
    title: 'Pediu bebida',
    bigText: '1 drink',
    hint: 'Aperol Spritz · sem azeitona.',
    primary: 'A caminho',
    tint: '#1F3784',
    priority: 'med',
  },
};

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
  callType = 'chamou-garcom',
  tableNumber = 18,
  partySize = 4,
}: ScreenWaiterCallDetailProps) {
  const C = useG(dark);
  const router = useRouter();
  const copy = COPY_BY_TYPE[callType];
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const showToast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 2800);
  };
  const ack = async () => {
    if (acked || submitting) return;
    setSubmitting(true);
    try {
      await acknowledgeCall(tenantSlug, callId);
      setAcked(true);
      showToast('Chamado registrado.');
      setTimeout(() => router.back(), 700);
    } catch (error) {
      console.error('[waiter-call-detail] acknowledge failed', error);
      showToast('Não foi possível registrar o atendimento.');
    } finally {
      setSubmitting(false);
    }
  };

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
            Mesa {tableNumber} · {partySize} pessoas
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
            {copy.bigText}
          </div>
          <div style={{ fontSize: 14, marginTop: 14, lineHeight: 1.5, opacity: 0.95 }}>
            {copy.hint}
          </div>
        </div>

        {/* Lembrete (só pra pediu-conta) */}
        {copy.reminder && (
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
            {[
              ['Aberta há', '64 min'],
              ['Itens lançados', '12'],
              ['Última ação', 'Sobremesa servida há 6 min'],
              ['Forma de pgto', 'A definir'],
            ].map(([k, v], i, a) => (
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
          <GButton kind="primary" dark={dark} full onClick={ack} disabled={acked || submitting}>
            {submitting ? 'Registrando…' : acked ? 'Registrado…' : copy.primary}
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
