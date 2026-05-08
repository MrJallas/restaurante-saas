'use client';

import { memo } from 'react';
import { animationClass, DOT_PULSE_STAGGER_MS, useReducedMotion } from '../../lib/animations';

/**
 * Categorias canônicas de tool · mirror do canvas v14 (8 categorias) e do
 * AI service. Cada categoria mapeia a um dos 5 buckets visuais abaixo
 * (cart/info/action/lgpd/router) sem perder a semântica do callsite.
 *
 *  menu/order        → bucket `cart`   = warm/mostarda
 *  info              → bucket `info`   = neutral mute
 *  session/staff     → bucket `action` = primary ink
 *  payment           → bucket `action` = primary ink
 *  destructive/lgpd  → bucket `lgpd`   = mostarda
 */
export type ToolCallCategory =
  | 'menu'
  | 'order'
  | 'session'
  | 'info'
  | 'staff'
  | 'payment'
  | 'destructive'
  | 'lgpd';

interface ToolCallIndicatorProps {
  /** Categoria da tool — controla a cor. Default `info` (neutral). */
  category?: ToolCallCategory;
  /**
   * Nome canônico da tool (ex.: `add_to_order`, `lgpd_data_request`). Quando
   * fornecido sem `label`, é renderizado em mono caps no mesmo slot do label.
   */
  name?: string;
  /**
   * Texto pequeno opcional acima/dentro dos dots — ex.: "USANDO add_to_order"
   * ou "ABRINDO MAPA". Quando undefined, cai pro `name`. Se ambos undefined,
   * renderiza só os dots (modo silent).
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
  name,
  label,
}: ToolCallIndicatorProps) {
  const reducedMotion = useReducedMotion();
  // 8 categorias canônicas → 5 buckets visuais. Adicionar categoria nova é
  // 1 linha aqui sem cascata de switch.
  const bucketColor: Record<ToolCallCategory, string> = {
    menu: 'text-warning',
    order: 'text-warning',
    info: 'text-mute',
    session: 'text-ink',
    staff: 'text-ink',
    payment: 'text-ink',
    destructive: 'text-warning',
    lgpd: 'text-warning',
  };
  const display = label ?? name;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={display ? `Executando ${display}` : 'Executando ferramenta'}
      className={`inline-flex items-center gap-2 py-1 ${bucketColor[category]}`}
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
      {display && (
        <span className="font-mono text-[10px] font-medium uppercase tracking-[1.5px]">
          {display}
        </span>
      )}
    </div>
  );
});
