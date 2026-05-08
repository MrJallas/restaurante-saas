'use client';

import { memo } from 'react';
import { animationClass, DOT_PULSE_STAGGER_MS, useReducedMotion } from '../../lib/animations';

/**
 * Categorias de tool — mirror das cores do canvas (cliente-tokens.jsx
 * `TOOL_CATEGORY_COLORS`):
 *  - cart   = warm/mostarda (add_to_order, finalize_order, send_order)
 *  - info   = neutral mute (view_chat_history, restaurant_info)
 *  - action = primary ink (request_table_merge, call_waiter)
 *  - lgpd   = mostarda discreta (lgpd_data_request, show_lgpd_notice)
 *  - router = mute opaco (show_lgpd_notice quando router-only)
 *
 * O canvas v14 mapeia 8 categorias (menu/order/session/info/staff/
 * payment/destructive/lgpd) — agrupei em 5 buckets visuais aqui pra
 * casar com o brief Phase 3 (cart/info/action/lgpd/router) sem perder
 * a separação semântica que importa pro usuário ver.
 */
export type ToolCallCategory = 'cart' | 'info' | 'action' | 'lgpd' | 'router';

interface ToolCallIndicatorProps {
  /** Categoria da tool — controla a cor. Default `info` (neutral). */
  category?: ToolCallCategory;
  /**
   * Texto pequeno opcional acima/dentro dos dots — ex.: "USANDO add_to_order"
   * ou "ABRINDO MAPA". Quando undefined, renderiza só os dots (modo silent).
   */
  label?: string;
}

/**
 * Indicador inline de "tool em execução" — 3 dots animados em pulse stagger
 * + label opcional em mono caps tiny. Usado dentro de AssistantBlock,
 * abaixo do AssistantText, enquanto o backend resolve uma tool.
 *
 * A estética é deliberadamente discreta: pulse 1.4s, dots 3px, text 10px
 * mono uppercase tracking 1.5 — não compete com o conteúdo principal da
 * mensagem da IA. (Inspirado no `cToolFade` + `cDotPulse` do canvas v14.)
 *
 * `prefers-reduced-motion`: dots ficam estáticos (renderiza opacity 0.6
 * sem animação) — globals.css já zera animation-duration; aqui também
 * paramos de aplicar a class pra economizar repaint em iOS antigo.
 */
export const ToolCallIndicator = memo(function ToolCallIndicator({
  category = 'info',
  label,
}: ToolCallIndicatorProps) {
  const reducedMotion = useReducedMotion();
  // Mapeia categoria → classe Tailwind. Mantemos como objeto pra que adicionar
  // categoria nova seja 1 linha sem cascata de switch.
  const colorClass: Record<ToolCallCategory, string> = {
    cart: 'text-warning',
    info: 'text-mute',
    action: 'text-ink',
    lgpd: 'text-warning',
    router: 'text-faint',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ? `Executando ${label}` : 'Executando ferramenta'}
      className={`inline-flex items-center gap-2 py-1 ${colorClass[category]}`}
    >
      <span className="inline-flex gap-[3px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block h-[3px] w-[3px] rounded-full bg-current ${
              reducedMotion ? 'opacity-60' : animationClass.dotPulse
            }`}
            style={
              reducedMotion
                ? undefined
                : { animationDelay: `${i * DOT_PULSE_STAGGER_MS}ms` }
            }
          />
        ))}
      </span>
      {label && (
        <span className="font-mono text-[10px] font-medium uppercase tracking-[1.5px]">
          {label}
        </span>
      )}
    </div>
  );
});
