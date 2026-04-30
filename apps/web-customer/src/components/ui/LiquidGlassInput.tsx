'use client';

import { FormEvent, useState } from 'react';
import { PlayIcon } from './PlayIcon';

interface LiquidGlassInputProps {
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
 * Input ancorado no rodape do chat / home. O nome historico vem do "liquid
 * glass" do design inicial, mas como o app roda em Safari (nao e PWA), o
 * backdrop-filter era caro e causava jank ao abrir teclado. Substituimos por
 * superficie solida com sombra sutil — identidade pill preservada, sem o
 * custo de GPU do blur. Veja `SoftInput` (mesmo componente, nome novo).
 */
export function LiquidGlassInput({
  placeholder = 'Digite aqui',
  value,
  defaultValue,
  onChange,
  onSubmit,
  onPlayClick,
  disabled,
  maxLength,
}: LiquidGlassInputProps) {
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
      <button
        type="button"
        onClick={onPlayClick}
        disabled={disabled}
        aria-label="Enviar áudio"
        className="shrink-0 transition-transform duration-100 active:scale-95 focus:outline-none"
      >
        <PlayIcon size={42} />
      </button>
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

/**
 * Nome novo do componente apos a remocao do liquid-glass. Use `SoftInput` em
 * arquivos novos; o alias `LiquidGlassInput` continua funcionando pra nao
 * quebrar imports existentes ate o rename fisico em um PR futuro.
 */
export const SoftInput = LiquidGlassInput;
