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
  const showSuccess = touched && isValid;

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
        className={`w-full rounded-lg border-2 px-4 py-3 text-lg outline-none transition-colors ${
          showError
            ? 'border-red-500 bg-red-50'
            : showSuccess
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 focus:border-primary'
        }`}
      />
      {showError && (
        <p className="mt-1 text-sm text-red-500">
          CPF invalido. Verifique os numeros digitados.
        </p>
      )}
    </div>
  );
}
