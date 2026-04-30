'use client';

import { useState, useCallback } from 'react';
import { formatCpf, cleanCpf, validateCpf } from '../../lib/cpf';

interface CpfInputProps {
  value: string;
  onChange: (raw: string, formatted: string) => void;
}

export function CpfInput({ value, onChange }: CpfInputProps) {
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
    <div>
      <input
        type="text"
        inputMode="numeric"
        placeholder="000.000.000-00"
        value={formatCpf(value)}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        maxLength={14}
        className={`w-full rounded-[14px] bg-bg px-4 py-3 text-[15px] text-ink outline-none transition-colors tabular-nums border-[1.3px] ${
          showError ? 'border-danger' : 'border-ink focus:border-ink'
        }`}
      />
      {showError && (
        <p className="mt-1.5 text-[11px] text-danger">
          CPF inválido. Verifique os números digitados.
        </p>
      )}
    </div>
  );
}
