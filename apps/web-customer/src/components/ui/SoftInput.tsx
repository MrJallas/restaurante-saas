'use client';

import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { PlayIcon } from './PlayIcon';

interface SoftInputProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  onSubmit?: (v: string) => void;
  onFocusChange?: (focused: boolean) => void;
  onPlayClick?: () => void;
  disabled?: boolean;
  multiline?: boolean;
  scrollOnFocus?: boolean;
  /**
   * Limite de caracteres no input. Bate com o @MaxLength do DTO no
   * backend pra que o usuario veja o limite na UI antes de submeter
   * — sem isso ele digitava 5000 chars e recebia erro generico no
   * chat (P2 do bug-hunt).
   */
  maxLength?: number;
}

/**
 * Input pill ancorado no rodape do chat / home / assistente. Superficie
 * solida com sombra sutil — sem backdrop-filter porque o app roda em
 * Safari iOS direto (nao e PWA) e o blur era caro / causava jank ao
 * abrir teclado.
 */
export function SoftInput({
  placeholder = 'Digite aqui',
  value,
  defaultValue,
  onChange,
  onSubmit,
  onFocusChange,
  onPlayClick,
  disabled,
  multiline = false,
  scrollOnFocus = true,
  maxLength,
}: SoftInputProps) {
  const [internal, setInternal] = useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  const handleChange = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  const submitCurrent = () => {
    const trimmed = (current ?? '').trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    if (!isControlled) setInternal('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitCurrent();
  };

  const handleTextKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    submitCurrent();
  };

  const multilineRows = useMemo(() => {
    const text = current ?? '';
    if (text.length > 96 || text.includes('\n')) return 3;
    if (text.length > 48) return 2;
    return 1;
  }, [current]);

  const fieldClassName =
    'relative flex-1 bg-transparent text-[16px] font-normal leading-[1.35] tracking-[-0.01em] text-ink outline-none placeholder:text-mute';

  const handleFocus = (el: HTMLElement) => {
    onFocusChange?.(true);
    if (!scrollOnFocus) return;
    // Scroll suave ate o bottom assim que o teclado abre. rAF evita
    // disputar frame com o resize do visualViewport.
    requestAnimationFrame(() => el.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative flex items-center gap-3 border border-transparent bg-surface p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 focus-within:border-ink/20 ${
        multiline ? 'rounded-[28px]' : 'rounded-full'
      }`}
    >
      {/* Botao de audio so aparece quando o consumidor passa onPlayClick.
          Deixar visivel sem handler era pegadinha de UX — bug-hunter
          relatou que o usuario tocava e nada acontecia. Quando a feature
          de gravacao de audio for implementada, basta passar a prop. */}
      {onPlayClick && (
        <button
          type="button"
          onClick={onPlayClick}
          disabled={disabled}
          aria-label="Enviar áudio"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center transition-transform duration-100 active:scale-95 focus:outline-none"
        >
          <PlayIcon size={42} />
        </button>
      )}
      {multiline ? (
        <textarea
          value={current ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleTextKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          maxLength={maxLength}
          rows={multilineRows}
          onFocus={(e) => handleFocus(e.currentTarget)}
          onBlur={() => onFocusChange?.(false)}
          className={`${fieldClassName} max-h-[112px] min-h-[42px] resize-none py-[10px]`}
        />
      ) : (
        <input
          type="text"
          inputMode="text"
          value={current ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          maxLength={maxLength}
          onFocus={(e) => handleFocus(e.currentTarget)}
          onBlur={() => onFocusChange?.(false)}
          className={fieldClassName}
        />
      )}
      <button
        type="submit"
        disabled={disabled || !(current ?? '').trim()}
        aria-label="Enviar"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-transform duration-100 active:scale-95 disabled:text-faint disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M3 9h12m0 0-4-4m4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}
