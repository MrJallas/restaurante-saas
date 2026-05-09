'use client';

import { useState, useCallback } from 'react';
import { formatCpf, cleanCpf, validateCpf } from '../../lib/cpf';

interface CpfInputProps {
  value: string;
  onChange: (raw: string, formatted: string) => void;
  /**
   * Round 4 §C-NEW-7 redesign: o WelcomeModal V20 envolve o input num
   * shell externo que reage ao focus pra trocar a cor do border. O CpfInput
   * sinaliza pra cima quando ganha/perde foco em vez de gerenciar a cor
   * sozinho — assim 1 single source-of-truth pro `border-ink` vs
   * `border-soft` do shell pai.
   */
  onFocusChange?: (focused: boolean) => void;
}

export function CpfInput({ value, onChange, onFocusChange }: CpfInputProps) {
  const [touched, setTouched] = useState(false);

  const raw = cleanCpf(value);
  const isComplete = raw.length === 11;
  const isValid = isComplete && validateCpf(raw);
  const showError = touched && isComplete && !isValid;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatCpf(e.target.value);
      const rawValue = cleanCpf(formatted);
      onChange(rawValue, formatted);
    },
    [onChange],
  );

  return (
    <div className="w-full">
      <input
        type="text"
        inputMode="numeric"
        placeholder="000.000.000-00"
        value={formatCpf(value)}
        onChange={handleChange}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => {
          setTouched(true);
          onFocusChange?.(false);
        }}
        maxLength={14}
        autoComplete="off"
        className="w-full bg-transparent text-[17px] font-medium tracking-[-0.012em] text-ink outline-none tabular-nums placeholder:text-faint"
      />
      {showError && (
        <p className="mt-[6px] font-mono text-[10px] font-bold uppercase tracking-[0.8px] text-danger">
          CPF inválido. Confira os números.
        </p>
      )}
    </div>
  );
}
