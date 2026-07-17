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
  /** Resposta já voltou do backend: troca animação de execução por confirmação estática. */
  completed?: boolean;
}

type ToolCallPhase = 'running' | 'completed';

const TOOL_CALL_LABELS: Record<string, Record<ToolCallPhase, string>> = {
  recommend_dish: { running: 'Buscando sugestões', completed: 'Sugestões encontradas' },
  view_menu: { running: 'Abrindo cardápio', completed: 'Cardápio consultado' },
  search_dish: { running: 'Buscando no cardápio', completed: 'Busca concluída' },
  check_allergens: { running: 'Checando ingredientes', completed: 'Ingredientes conferidos' },
  compare_dishes: { running: 'Comparando opções', completed: 'Comparação concluída' },
  add_to_order: { running: 'Adicionando ao pedido', completed: 'Pedido atualizado' },
  view_order: { running: 'Consultando pedido', completed: 'Pedido consultado' },
  confirm_order: { running: 'Confirmando pedido', completed: 'Pedido confirmado' },
  place_order: { running: 'Enviando pedido', completed: 'Pedido enviado' },
  change_order: { running: 'Atualizando pedido', completed: 'Pedido atualizado' },
  remove_from_cart: { running: 'Removendo item', completed: 'Item removido' },
  cancel_order: { running: 'Cancelando pedido', completed: 'Pedido cancelado' },
  call_waiter: { running: 'Chamando a equipe', completed: 'Equipe avisada' },
  send_complaint: { running: 'Enviando relato', completed: 'Relato enviado' },
  send_message_to_manager: { running: 'Avisando a gerência', completed: 'Gerência avisada' },
  request_bill: { running: 'Pedindo a conta', completed: 'Conta solicitada' },
  open_payment_screen: { running: 'Abrindo pagamento', completed: 'Pagamento aberto' },
  split_bill: { running: 'Preparando divisão', completed: 'Divisão preparada' },
  pay_individual: { running: 'Preparando pagamento', completed: 'Pagamento preparado' },
  pay_full: { running: 'Preparando pagamento', completed: 'Pagamento preparado' },
  request_table_merge: { running: 'Pedindo junção de mesas', completed: 'Solicitação enviada' },
  lgpd_data_request: { running: 'Registrando solicitação', completed: 'Solicitação registrada' },
};

/** Nunca expõe nomes internos/underscores quando uma tool nova chega ao cliente. */
export function toolCallStatusLabel(name: string | undefined, phase: ToolCallPhase): string | null {
  if (!name?.trim()) return null;
  return (
    TOOL_CALL_LABELS[name.trim().toLowerCase()]?.[phase] ??
    (phase === 'running' ? 'Consultando informações' : 'Consulta concluída')
  );
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
  completed = false,
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
  const phase: ToolCallPhase = completed ? 'completed' : 'running';
  const display = label ?? toolCallStatusLabel(name, phase);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={
        completed
          ? display
            ? `Concluído: ${display}`
            : 'Ação concluída'
          : display
            ? `Executando: ${display}`
            : 'Executando ferramenta'
      }
      data-testid={name ? `tool-indicator-${name}` : 'tool-indicator'}
      className={`inline-flex items-center gap-2 py-1 ${bucketColor[category]}`}
    >
      {completed ? (
        <span aria-hidden className="text-[11px] font-bold leading-none">
          ✓
        </span>
      ) : (
        <span className="inline-flex gap-[3px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`block h-[3px] w-[3px] rounded-full bg-current ${
                reducedMotion ? 'opacity-60' : animationClass.dotPulse
              }`}
              style={
                reducedMotion ? undefined : { animationDelay: `${i * DOT_PULSE_STAGGER_MS}ms` }
              }
            />
          ))}
        </span>
      )}
      {display && (
        <span className="font-mono text-[10px] font-medium uppercase tracking-[1.5px]">
          {display}
        </span>
      )}
    </div>
  );
});
