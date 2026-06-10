'use client';

import { C } from './styles';
import {
  deriveStatus,
  getPrimaryActionLabel,
  getQuantityLabel,
  isAlertNote,
  type KdsOrder,
} from './types';

type Variant = 'kitchen' | 'bar';

interface KdsOrderCardProps {
  order: KdsOrder;
  variant: Variant;
  elapsedMin: number;
  pending?: boolean; // true enquanto o PATCH /status esta voando
  onAdvance: () => void;
}

export function KdsOrderCard({
  order,
  variant,
  elapsedMin,
  pending,
  onAdvance,
}: KdsOrderCardProps) {
  const derived = deriveStatus(order, elapsedMin);
  const isLate = derived === 'atrasado';
  const isReady = derived === 'pronto';
  const isNew = derived === 'novo';
  const headerBg = isLate ? C.danger : isReady ? C.success : C.ink;

  // No bar mostramos o total de unidades no header; na cozinha
  // mostramos so "ha X min" porque drinks tendem a ser quantidade
  // alta (4 chopps) e pratos quase sempre 1.
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);

  // Acao do botao primario depende do STATUS RAW (received/in_progress/ready),
  // nao de `derived` — antes um pedido 'received' atrasado caia no else
  // generico "Marcar pronto", confundindo o operador. Estilo (cor de fundo)
  // continua dependendo de `derived` pra manter o destaque vermelho/atrasado.
  const primaryAction = (() => {
    const label = getPrimaryActionLabel(order.status, variant);
    if (order.status === 'ready') {
      return {
        label,
        bg: C.success,
        color: '#fff',
        border: `1.3px solid ${C.success}`,
      };
    }
    if (order.status === 'received' || order.status === 'open') {
      return {
        label,
        bg: C.ink,
        color: '#fff',
        border: `1.3px solid ${C.ink}`,
      };
    }
    return {
      label,
      bg: '#fff',
      color: C.ink,
      border: `1.3px solid ${C.ink}`,
    };
  })();

  const stripLabel = (() => {
    if (isLate) return 'ATRASADO';
    if (isReady) {
      return 'Pronto p/ garçom';
    }
    if (isNew) return 'Novo pedido';
    return variant === 'kitchen' ? 'Em preparo' : 'Preparando';
  })();

  const stripDot = isLate ? C.danger : isReady ? C.success : isNew ? C.ink : C.amber;
  const stripText = isLate ? C.danger : isReady ? C.success : C.ink;

  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${isLate ? C.danger : C.ink}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation: isLate ? 'kdsAlertPulse 1.8s infinite' : 'none',
        opacity: pending ? 0.6 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: headerBg,
          color: '#fff',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              fontWeight: 500,
              letterSpacing: 1,
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>#{order.id.slice(0, 8)}</span>
            {/* Badge da fila (urgência > VIP > normal) — backend ordena,
                o card sinaliza por que o pedido furou a fila. */}
            {order.priority === 'urgent' && (
              <span
                style={{
                  background: '#C43A3A',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  opacity: 1,
                }}
              >
                URGÊNCIA
              </span>
            )}
            {order.priority === 'vip' && (
              <span
                style={{
                  background: '#D98E2B',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  opacity: 1,
                }}
              >
                VIP
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: variant === 'bar' ? 28 : 26,
              fontWeight: 700,
              letterSpacing: -0.6,
              marginTop: -2,
            }}
          >
            {order.table_label}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 0.5 }}>
            {getQuantityLabel(totalQty, variant)}
          </div>
          <div
            style={{
              fontSize: variant === 'bar' ? 28 : 26,
              fontWeight: 700,
              letterSpacing: -0.5,
              fontVariantNumeric: 'tabular-nums',
              marginTop: -2,
              animation: isLate ? 'kdsBlink 1s infinite' : 'none',
            }}
          >
            {elapsedMin} min
          </div>
        </div>
      </div>

      {/* Status strip */}
      <div
        style={{
          padding: '8px 18px',
          background: isLate ? C.lateBg : isReady ? C.readyBg : C.surface,
          borderBottom: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: stripDot,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: stripText,
          }}
        >
          {stripLabel}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: C.mute,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          recebido{' '}
          {new Date(order.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Items */}
      <div style={{ padding: '6px 18px 8px', flex: 1, maxHeight: 720, overflowY: 'auto' }}>
        {order.items.map((it, i) => {
          const alert = isAlertNote(it.notes);
          return (
            <div
              key={it.id}
              style={{
                padding: '14px 0',
                borderBottom: i < order.items.length - 1 ? `1px solid ${C.borderSoft}` : 'none',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  minWidth: variant === 'bar' ? 56 : 44,
                  height: variant === 'bar' ? 56 : 44,
                  padding: '0 8px',
                  borderRadius: variant === 'bar' ? 12 : 10,
                  flexShrink: 0,
                  background: C.ink,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: variant === 'bar' ? 24 : 20,
                  fontWeight: 700,
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {it.quantity}×
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: variant === 'bar' ? 22 : 21,
                    fontWeight: 600,
                    letterSpacing: -0.3,
                    lineHeight: 1.15,
                    marginBottom: variant === 'kitchen' ? 4 : 0,
                  }}
                >
                  {it.name}
                </div>
                {variant === 'kitchen' && it.categoryName && (
                  <div
                    style={{
                      fontSize: 11,
                      color: C.mute,
                      fontWeight: 600,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    {it.categoryName}
                  </div>
                )}
                {it.notes && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: alert ? C.danger : C.noteBg,
                      border: `1.5px solid ${alert ? C.danger : C.noteBorder}`,
                      color: alert ? '#fff' : C.noteText,
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1.35,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                      {alert ? '⚠' : '✎'}
                    </span>
                    <span style={{ flex: 1 }}>
                      {alert && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 10,
                            letterSpacing: 1.5,
                            textTransform: 'uppercase',
                            opacity: 0.85,
                            marginBottom: 2,
                            fontWeight: 700,
                          }}
                        >
                          Atenção · observação importante
                        </span>
                      )}
                      {it.notes}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {order.notes &&
          (() => {
            // Mesma deteccao usada nos items (alergia, intolerancia, etc).
            // Antes esse bloco hardcodava noteBg/noteBorder/noteText, deixando
            // observacoes criticas a nivel de pedido ('ALERGIA NOZES') em
            // fundo bege — indistinguiveis de "sem cebola".
            const orderAlert = isAlertNote(order.notes);
            return (
              <div
                style={{
                  marginTop: 6,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: orderAlert ? C.danger : C.noteBg,
                  border: `1.5px solid ${orderAlert ? C.danger : C.noteBorder}`,
                  color: orderAlert ? '#fff' : C.noteText,
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontWeight: 700 }}>{orderAlert ? '⚠' : '✎'}</span>
                <span>
                  {orderAlert && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 10,
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                        opacity: 0.85,
                        marginBottom: 2,
                        fontWeight: 700,
                      }}
                    >
                      Atenção · observação importante
                    </span>
                  )}
                  Obs do pedido: {order.notes}
                </span>
              </div>
            );
          })()}
      </div>

      {/* Footer / action */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: `1.5px solid ${C.ink}`,
          display: 'flex',
          gap: 8,
          background: '#fafaf8',
        }}
      >
        <button
          type="button"
          onClick={onAdvance}
          disabled={pending}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 10,
            background: primaryAction.bg,
            color: primaryAction.color,
            border: primaryAction.border,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            textAlign: 'center',
            cursor: pending ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {pending ? 'Atualizando…' : primaryAction.label}
        </button>
        {variant === 'kitchen' && (
          <div
            aria-hidden
            style={{
              width: 46,
              padding: '12px 0',
              borderRadius: 10,
              background: '#fff',
              border: `1.3px solid ${C.borderSoft}`,
              fontSize: 18,
              textAlign: 'center',
              color: C.mute,
            }}
          >
            ⋯
          </div>
        )}
      </div>
    </div>
  );
}
