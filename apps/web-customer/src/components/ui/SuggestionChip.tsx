'use client';

import { memo } from 'react';
import type { ContextualChip } from '@restaurant/shared-types';

interface SuggestionChipProps {
  /**
   * Match `ContextualChip` do shared-types — chip vem do backend (LLM ou
   * pool de smart_suggestions) com action + payload pré-decididos.
   * Aceita o objeto inteiro pra reduzir prop-drilling no callsite.
   */
  chip: ContextualChip;
  /**
   * Callback dispatchado no tap. O caller decide o que fazer baseado em
   * `chip.action`:
   *  - 'send'     → injetar `chip.payload` como mensagem do usuário
   *  - 'navigate' → router.push(chip.payload)
   *  - 'expand'   → prepara o campo de texto sem enviar mensagem direta
   *
   * Mantemos a prop callback única (não 3 callbacks separadas) pra que
   * a integração no AssistantBlock seja `<SuggestionChip onTap={dispatch} />`
   * sem if/else no markup.
   */
  onTap?: (chip: ContextualChip) => void;
  /** Desabilita o chip enquanto a action correspondente está em-flight. */
  disabled?: boolean;
}

/**
 * Chip de sugestão da IA — pill outline 1.2px borderSoft (default) ou ink
 * filled (primary). Aparece sob bubbles do assistente como atalho 1-tap
 * pro usuário não precisar digitar.
 *
 * Por que é separado da `ContextualChip` shared-type? O shared-type é o
 * contrato de dados (vem do LLM); o `SuggestionChip` é a UI que renderiza
 * esse contrato. Mantemos 1 componente UI pra todos os casos `send | navigate
 * | expand` — a diferença visual entre eles fica nos icons trailing (ver
 * `requiresText` chip no canvas v14, que ganha um ícone de 3 linhas).
 *
 * Pode ser estendido com `category` no futuro (ex.: chips destrutivos LGPD
 * em ink-filled, chips primários em ink-filled também) sem breaking change.
 */
export const SuggestionChip = memo(function SuggestionChip({
  chip,
  onTap,
  disabled = false,
}: SuggestionChipProps) {
  const isPrimary = chip.primary === true;
  const requiresText = chip.action === 'expand';

  // Visual: outline pill ↔ filled pill (canvas v13/v14 ContextualChip).
  const tone = isPrimary
    ? 'bg-ink text-white border-ink'
    : 'bg-bg text-ink border-border-soft hover:border-ink/40';

  return (
    <button
      type="button"
      onClick={() => onTap?.(chip)}
      disabled={disabled}
      // aria-label leva o label do chip + flag opcional pra screen reader
      // saber que "expand" abre input. Ajuda usuários screen-reader a entender
      // que o tap NÃO envia direto — precisa input adicional.
      aria-label={requiresText ? `${chip.label} (abre campo de texto)` : chip.label}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.2px] px-3.5 py-2 text-[13px] font-medium tracking-[-0.005em] transition-[colors,transform] duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      {chip.label}
      {requiresText && (
        // Ícone "3 linhas" indica que o chip abre input — afordância visual
        // que o canvas v14 trouxe (cliente-tokens.jsx ContextualChip props).
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="opacity-60">
          <path
            d="M2 2h6M2 5h4M2 8h6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
});
