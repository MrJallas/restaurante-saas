'use client';

// ScreenTableDetail — waiter detail screen pra UMA mesa.
// Canvas: garcom-screens-b.jsx:9 (V12 with payment progress + timeline).
//
// Pra Onda 3 (round 18), versão pragmática:
//   • Hero card preto com total da conta + progresso de pagamento (mock)
//   • Lista de itens pendentes/servidos
//   • CTAs: "Chamar atendimento" (stub) · "Marcar todos servidos" (stub)
//
// Backend (TODO Onda 4):
//   • GET /tables/:id → mesa + pessoas + tempo aberto
//   • GET /tables/:id/orders → lista itens
//   • GET /tables/:id/payments → progresso pagamento
//   • PATCH /orders/:id/served → marca item servido
//
// Por enquanto mock data inline. Quando o backend shipar, FE só troca
// o useState mock por useEffect com fetch + setMock(...).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
} from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../components/waiter/Primitives';

type ItemStatus = 'preparando' | 'pronto' | 'servido';

interface Item {
  id: string;
  qty: number;
  name: string;
  note?: string;
  station: 'Cozinha' | 'Bar';
  status: ItemStatus;
}

const MOCK_ITEMS: Item[] = [
  { id: 'i1', qty: 1, name: 'Risoto de camarão', note: 'sem cebola', station: 'Cozinha', status: 'pronto' },
  { id: 'i2', qty: 1, name: 'Bruschetta caprese', station: 'Cozinha', status: 'pronto' },
  { id: 'i3', qty: 2, name: 'Filé ao vinho', note: 'um mal passado · um ao ponto', station: 'Cozinha', status: 'pronto' },
  { id: 'i4', qty: 2, name: 'Aperol Spritz', note: 'sem azeitona', station: 'Bar', status: 'preparando' },
  { id: 'i5', qty: 1, name: 'Suco de limão', station: 'Bar', status: 'preparando' },
  { id: 'i6', qty: 4, name: 'Couvert da casa', station: 'Cozinha', status: 'servido' },
];

export interface ScreenTableDetailProps {
  dark?: boolean;
  tableId: string;
  tableNumber?: number;
}

export function ScreenTableDetail({
  dark = false,
  tableId: _tableId,
  tableNumber = 12,
}: ScreenTableDetailProps) {
  const C = useG(dark);
  const router = useRouter();
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const showStub = (m: string) => {
    setStubMsg(`${m} · em desenvolvimento (Onda 4 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  // Mock totals
  const totalConta = 287.5;
  const totalPago = 143.76;
  const restante = totalConta - totalPago;
  const pessoas = 4;
  const pagaram = 2;
  const processando = 1;

  const pendentes = MOCK_ITEMS.filter((i) => i.status !== 'servido');

  const fmt = (v: number) => v.toFixed(2).replace('.', ',');

  const statusTint: Record<ItemStatus, { bg: string; fg: string; label: string }> = {
    pronto: { bg: '#E8F3EC', fg: '#1E8C5A', label: 'Pronto · servir' },
    preparando: { bg: '#FDF3D8', fg: '#7A4D10', label: 'Preparando' },
    servido: { bg: '#F4F0E8', fg: '#666', label: 'Servido' },
  };

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.back()} />}
        title={`Mesa ${tableNumber}`}
        sub={`${pessoas} PESSOAS · ABERTA HÁ 42 MIN`}
        right={<GIconBtn dark={dark} icon={Icon.more(20)} onClick={() => showStub('Mais ações')} />}
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Bill hero */}
        <div
          style={{
            margin: '14px 16px',
            padding: 18,
            borderRadius: 16,
            background: C.ink,
            color: C.bg,
          }}
        >
          <div
            style={{
              fontSize: 11,
              opacity: 0.6,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
            }}
          >
            Total da conta
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: -0.8,
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
              lineHeight: 1.05,
            }}
          >
            R$ {fmt(totalConta)}
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            R$ {fmt(totalConta / pessoas)} por pessoa · {pessoas} pessoas
          </div>

          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                opacity: 0.85,
                marginBottom: 8,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>Pago · R$ {fmt(totalPago)}</span>
              <span>Falta · R$ {fmt(restante)}</span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 99,
                background: 'rgba(255,255,255,0.18)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(totalPago / totalConta) * 100}%`,
                  background: C.bg,
                  borderRadius: 99,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: C.bg,
                  }}
                />
                <span style={{ opacity: 0.85 }}>{pagaram} pagaram</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.4)',
                  }}
                />
                <span style={{ opacity: 0.85 }}>{processando} processando</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    border: '1.5px solid rgba(255,255,255,0.5)',
                  }}
                />
                <span style={{ opacity: 0.85 }}>
                  {pessoas - pagaram - processando} pendente
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Itens pendentes */}
        <div style={{ padding: '8px 16px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.mute,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 10,
              fontFamily: MONO_FONT,
            }}
          >
            Itens · {pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK_ITEMS.map((item) => {
              const st = statusTint[item.status];
              return (
                <div
                  key={item.id}
                  style={{
                    padding: 12,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                    background: item.status === 'servido' ? C.surface : C.bg,
                    opacity: item.status === 'servido' ? 0.7 : 1,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.ink,
                          letterSpacing: -0.1,
                        }}
                      >
                        {item.qty}× {item.name}
                      </div>
                      {item.note && (
                        <div
                          style={{
                            fontSize: 12,
                            color: C.mute,
                            marginTop: 3,
                            lineHeight: 1.4,
                          }}
                        >
                          {item.note}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 10.5,
                          color: C.faint,
                          marginTop: 4,
                          fontWeight: 700,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          fontFamily: MONO_FONT,
                        }}
                      >
                        {item.station}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: st.bg,
                        color: st.fg,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        fontFamily: MONO_FONT,
                        flexShrink: 0,
                      }}
                    >
                      {st.label}
                    </span>
                  </div>
                  {item.status === 'pronto' && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => showStub('Marcar como servido')}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: C.ink,
                          color: C.bg,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Marcar servido
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div
            style={{
              margin: '12px 0',
              padding: '10px 12px',
              border: '1px dashed #F0DCB6',
              borderRadius: 10,
              background: '#FFF7E6',
              fontSize: 11,
              color: '#7A4D10',
              fontWeight: 500,
              fontFamily: MONO_FONT,
            }}
          >
            DADOS MOCK · backend de orders+payments chega na Onda 4
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          borderTop: `1px solid ${C.borderFaint}`,
          background: C.bg,
          display: 'flex',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <GButton kind="secondary" dark={dark} onClick={() => router.back()}>
          Voltar
        </GButton>
        <div style={{ flex: 1 }}>
          <GButton kind="primary" dark={dark} full onClick={() => showStub('Chamar reforço')}>
            Chamar reforço
          </GButton>
        </div>
      </div>

      {stubMsg && (
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
            letterSpacing: -0.1,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {stubMsg}
        </div>
      )}
    </div>
  );
}
