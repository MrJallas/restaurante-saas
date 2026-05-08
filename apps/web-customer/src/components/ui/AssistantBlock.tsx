'use client';

import { ReactNode, memo } from 'react';
import { animationClass, useReducedMotion } from '../../lib/animations';

interface AssistantBlockProps {
  /** Texto / nodes do assistente — bubble principal + tool indicators + chips. */
  children: ReactNode;
  /**
   * Kicker em mono caps tiny acima do bloco. Default "Assistente" (igual
   * ao HomeHero), mas pode virar "Assistente · Trattoria Luna" quando
   * customizado pelo tenant.
   */
  kicker?: string;
  /** Aplica a animação de entrada (fade-up). Default true. */
  animate?: boolean;
}

/**
 * Bloco da fala da IA — composição livre (children), com kicker mono caps
 * tiny no topo. Diferente de `Bubble` (que é um container fechado de uma
 * única mensagem), `AssistantBlock` é o **wrapper de turn inteiro**: pode
 * conter:
 *   - 1+ `<AssistantText>` (texto puro)
 *   - 1+ `<ToolCallIndicator>` (tools em execução)
 *   - chips no final (`<SuggestionChip>` row)
 *   - eventualmente um `<ContextualInputExpand>` quando chip exige texto
 *
 * Padrão de uso (callsite C2/C3):
 *   <AssistantBlock kicker="Assistente">
 *     <AssistantText>Posso adicionar mais alguma coisa?</AssistantText>
 *     <ToolCallIndicator category="cart" label="add_to_order" />
 *     <SuggestionChipRow chips={chips} onTap={...} />
 *   </AssistantBlock>
 *
 * O `kicker` mono caps tiny (Inter weight 500 tracking 1px — alinha
 * `HomeHero.tsx` linha 23-24) substitui o avatar+name do canvas v14
 * quando o turn é inline (não bubble fechado). Mantém eyebrow consistente
 * em home + chat sem duplicar styling.
 */
export const AssistantBlock = memo(function AssistantBlock({
  children,
  kicker = 'Assistente',
  animate = true,
}: AssistantBlockProps) {
  const reducedMotion = useReducedMotion();
  const animClass = animate && !reducedMotion ? animationClass.fadeInUp : '';

  return (
    <div className={`flex flex-col gap-2 ${animClass}`} role="group" aria-label={kicker}>
      <div className="text-[11px] font-medium uppercase tracking-[1px] text-mute">
        {kicker}
      </div>
      {children}
    </div>
  );
});

interface AssistantTextProps {
  children: ReactNode;
  /** Tamanho — `hero` 20px (homecard) vs `body` 15px (in-chat). Default body. */
  size?: 'hero' | 'body';
}

/**
 * Texto inline do assistente, sub-componente de `AssistantBlock`. Não tem
 * bubble container — é só o texto, com line-height + tracking certos pra
 * casar com a tipografia print-magazine do canvas v14 (cliente-tokens.jsx
 * AssistantBlock linha 397-402).
 *
 * `size='hero'` é o caso da home (TypingText acompanha esse tamanho);
 * `size='body'` é o caso de in-chat onde o turn é menor mas ainda inline.
 */
export const AssistantText = memo(function AssistantText({
  children,
  size = 'body',
}: AssistantTextProps) {
  const sizeClass =
    size === 'hero'
      ? 'text-[20px] leading-[1.4] tracking-[-0.015em] max-w-[320px]'
      : 'text-[15px] leading-[1.5] tracking-[-0.005em] max-w-[86%]';
  return (
    <div className={`text-ink ${sizeClass}`} style={{ textWrap: 'pretty' as never }}>
      {children}
    </div>
  );
});

interface SuggestionChipRowProps {
  children: ReactNode;
}

/**
 * Container horizontal scrollable pros chips abaixo do AssistantText.
 * Default 2-4 chips inline; se o conteúdo overflow, scroll horizontal
 * sem barra (touch-friendly). Espelha `ContextualChips` do canvas
 * (cliente-tokens.jsx linha 480-489).
 */
export const SuggestionChipRow = memo(function SuggestionChipRow({
  children,
}: SuggestionChipRowProps) {
  return (
    <div
      role="group"
      aria-label="Sugestões"
      className="-mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pb-1"
      // Hide scrollbar mantendo scroll funcional (Safari iOS)
      style={{ scrollbarWidth: 'none' }}
    >
      {children}
    </div>
  );
});
