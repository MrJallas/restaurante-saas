'use client';

import { useState } from 'react';
import { SoftInput } from './SoftInput';
import { PillButton } from './PillButton';
import { animationClass, useReducedMotion } from '../../lib/animations';

interface ContextualInputExpandProps {
  /** Placeholder dentro do input (geralmente vem do chip que abriu o expand). */
  placeholder?: string;
  /**
   * Texto inicial — quando o caller já tem `chip.payload` como sugestão,
   * passa aqui pro usuário só editar. Default vazio (digitação livre).
   */
  defaultValue?: string;
  /** Limite de chars — default 240 (canvas v14). */
  maxLength?: number;
  /** Label do CTA, default "Confirmar e enviar". */
  ctaLabel?: string;
  /** Callback quando usuário toca CTA com input válido. */
  onSubmit: (text: string) => void;
  /** Callback quando usuário toca X — volta pros chips. */
  onCancel?: () => void;
  /** Mostra contador de caracteres no canto inferior direito. Default true. */
  showCounter?: boolean;
}

/**
 * Overlay de input contextual — abre quando usuário toca um chip do tipo
 * `expand` (que precisa de texto adicional, ex.: "contar pro restaurante
 * o que aconteceu" → texto livre da reclamação).
 *
 * Animação de entrada: `liquid-morph` 580ms cubic-bezier(0.4, 0, 0.2, 1)
 * — clip-path do meio pra fora dá o efeito Apple Music card transition
 * (cliente-tokens.jsx v14 linha 612-616). Sem framer-motion: clip-path em
 * CSS nativo é GPU-friendly em Safari iOS, framer adicionaria peso
 * desnecessário pra um efeito puramente visual.
 *
 * Composição: container morphing + textarea grande (não usa SoftInput
 * direto pq SoftInput é input pill compacto; aqui precisamos de área
 * multiline com counter visível). O CTA full-width filled aparece após
 * 280ms (overlap com a parte final do morph) com `cCtaFade` 200ms.
 *
 * NB: `prefers-reduced-motion` desliga o morph — o container aparece
 * imediato (sem clip-path animado). globals.css já zera animation-duration
 * globalmente; aqui pulamos a class também pra reduzir invalidação.
 */
export function ContextualInputExpand({
  placeholder = 'Conta o que aconteceu...',
  defaultValue = '',
  maxLength = 240,
  ctaLabel = 'Confirmar e enviar',
  onSubmit,
  onCancel,
  showCounter = true,
}: ContextualInputExpandProps) {
  const [text, setText] = useState(defaultValue);
  const reducedMotion = useReducedMotion();
  const len = text.length;
  const ctaDisabled = len === 0 || len > maxLength;

  const morphClass = reducedMotion ? '' : animationClass.liquidMorph;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className={`mt-3.5 ${morphClass}`} role="dialog" aria-label="Input expandido">
      <div className="relative rounded-[14px] border border-border-soft bg-surface px-3.5 pb-3 pt-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_14px_rgba(0,0,0,0.04)]">
        {/* X discreto pra reverter pro estado de chips. Quando consumidor
            não passa onCancel, escondemos — caso de uso raro mas evita
            botão "morto". */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar e voltar"
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-faint transition-colors hover:text-ink"
          >
            <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* Textarea — Inter 14/500. Usamos `<textarea>` em vez do SoftInput
            pq aqui o usuário pode escrever 240 chars que precisam wrap em
            múltiplas linhas. SoftInput é pill single-line. */}
        <textarea
          value={text}
          onChange={(e) => {
            const v = e.target.value.slice(0, maxLength);
            setText(v);
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus
          rows={3}
          aria-label={placeholder}
          className="block w-full resize-none bg-transparent pr-6 text-[14px] font-medium leading-[1.45] tracking-[-0.005em] text-ink outline-none placeholder:text-faint"
        />

        {showCounter && (
          <div className="absolute bottom-2 right-3 font-mono text-[9.5px] tracking-[0.5px] text-faint">
            {len}/{maxLength}
          </div>
        )}
      </div>

      <div className="mt-2.5">
        <PillButton
          variant="filled"
          fullWidth
          disabled={ctaDisabled}
          onClick={handleSubmit}
        >
          {ctaLabel}
        </PillButton>
      </div>
    </div>
  );
}

/**
 * Re-export `SoftInput` como conveniência de discoverability — alguns
 * callsites vão querer um SoftInput pill em vez do textarea morphing.
 * Não muda o default-export do SoftInput.tsx, só facilita import único.
 */
export { SoftInput };
