'use client';

import { FormEvent, useState } from 'react';
import { PlayIcon } from './PlayIcon';

interface SoftInputProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  onSubmit?: (v: string) => void;
  onPlayClick?: () => void;
  disabled?: boolean;
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
  onPlayClick,
  disabled,
  maxLength,
}: SoftInputProps) {
  const [internal, setInternal] = useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  const handleChange = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = (current ?? '').trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    if (!isControlled) setInternal('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative flex items-center gap-3 rounded-full border border-transparent bg-surface p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 focus-within:border-ink/20"
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
          className="shrink-0 transition-transform duration-100 active:scale-95 focus:outline-none"
        >
          <PlayIcon size={42} />
        </button>
      )}
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
        // Scroll suave ate o bottom assim que o teclado abre. rAF evita
        // disputar frame com o resize do visualViewport.
        onFocus={(e) => {
          const el = e.currentTarget;
          requestAnimationFrame(() =>
            el.scrollIntoView({ block: 'end', behavior: 'smooth' }),
          );
        }}
        className="relative flex-1 bg-transparent text-[16px] font-normal tracking-[-0.01em] text-ink outline-none placeholder:text-mute"
      />
      <button
        type="submit"
        disabled={disabled || !(current ?? '').trim()}
        aria-label="Enviar"
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-ink transition-transform duration-100 active:scale-95 disabled:text-faint disabled:opacity-50"
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
