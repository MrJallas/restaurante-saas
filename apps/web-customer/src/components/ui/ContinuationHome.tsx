'use client';

import { ReactNode, memo } from 'react';
import type { ContinuationMessage } from '@restaurant/shared-types';
import { HomeHero } from '../home/HomeHero';
import { animationClass, useReducedMotion } from '../../lib/animations';

interface ContinuationHomeProps {
  /**
   * Continuation vinda do Redis pool (kind = pos_rating_*, pos_reclamacao,
   * pos_join_approved, pos_merge_approved, idle_nudge). Quando undefined,
   * cai pro HomeHero default sem warm-back.
   */
  continuationMessage?: ContinuationMessage;
  /**
   * Quando o backend já preencheu os slots do template, passa o texto
   * resolvido aqui (ex.: "Pelo {customerName}!" → "Pelo Caleb!").
   * O componente NÃO faz template resolution sozinho — isso é
   * responsabilidade do ai-service no backend (ver `ContinuationMessage.template`).
   */
  resolvedText?: string;
  /**
   * Slot adicional renderizado abaixo do hero — tipicamente uma row de
   * SuggestionChip vinda do `continuationMessage.chips`. C2/C3 compõem
   * `<SuggestionChipRow>` aqui.
   */
  children?: ReactNode;
  /** Kicker do HomeHero, default "Assistente". */
  kicker?: string;
}

/**
 * Bloco de home que aparece quando o usuário volta mid-conversation —
 * compõe o HomeHero existente + slot de chips/continuação.
 *
 * Diferença vs HomeHero puro:
 *  - text não anima typewriter (já é continuação, não primeira impressão)
 *  - aceita ContinuationMessage do shared-types como fonte do texto
 *  - tem slot de children pra chips/CTA contextuais (warmback flow)
 *
 * Por que NÃO recriar HomeHero? `HomeHero` já tem TypingInline + animate
 * + kicker; aqui aproveitamos passando `animate={false}` (continuação
 * não anima — usuário tá retornando, não onboarding pela primeira vez).
 *
 * Exemplo de uso (callsite C2):
 *   <ContinuationHome
 *     continuationMessage={cm}
 *     resolvedText="Bem-vindo de volta, Caleb! Como tá indo o jantar?"
 *   >
 *     <SuggestionChipRow>
 *       {cm.chips?.map(c => <SuggestionChip chip={c} onTap={...} />)}
 *     </SuggestionChipRow>
 *   </ContinuationHome>
 */
export const ContinuationHome = memo(function ContinuationHome({
  continuationMessage,
  resolvedText,
  children,
  kicker = 'Assistente',
}: ContinuationHomeProps) {
  const reducedMotion = useReducedMotion();
  // Decisão de fallback: se backend não passou resolvedText E não passou
  // continuationMessage, renderiza nada — caller deveria ter passado pelo
  // menos um. Não vamos inventar copy default pra evitar mensagens
  // genéricas surgindo silenciosamente.
  const text = resolvedText ?? continuationMessage?.template ?? '';
  if (!text) return null;

  return (
    <div
      className={reducedMotion ? '' : animationClass.fadeInUp}
      role="region"
      aria-label="Continuação da conversa"
    >
      {/* HomeHero não anima typewriter — pra continuação, animar sería
          performative pq o usuário já viu typing antes na sessão.
          `animate={false}` mostra o texto direto + cursor estático. */}
      <HomeHero message={text} kicker={kicker} animate={false} />
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
});
