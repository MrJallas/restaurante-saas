'use client';

import { useState, useCallback } from 'react';
import { CpfInput } from './CpfInput';
import { validateCpf, cleanCpf } from '../../lib/cpf';
import { apiPost } from '../../lib/api';
import { setRecognitionToken } from '../../lib/storage';
import { useSession } from '../../hooks/useSession';
import type { CustomerWelcomeResponseDto } from '@restaurant/shared-types';

interface WelcomeModalProps {
  slug: string;
  restaurantName: string;
  onComplete: (customer: CustomerWelcomeResponseDto | null) => void;
}

export function WelcomeModal({ slug, restaurantName, onComplete }: WelcomeModalProps) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setCustomer } = useSession();

  const isNameValid = name.trim().length >= 2;
  const isCpfValid = cleanCpf(cpf).length === 11 && validateCpf(cleanCpf(cpf));
  const canSubmit = isNameValid && isCpfValid && !isLoading;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await apiPost<CustomerWelcomeResponseDto>(`/${slug}/customer/welcome`, {
        name: name.trim(),
        cpf: cleanCpf(cpf),
      });

      setRecognitionToken(result.recognitionToken);
      setCustomer({
        customerId: result.customerId,
        visitId: result.visitId,
        name: result.name,
        recognitionToken: result.recognitionToken,
        isReturning: result.isReturning,
      });
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [canSubmit, slug, name, cpf, setCustomer, onComplete]);

  const handleAnonymous = useCallback(() => {
    onComplete(null);
  }, [onComplete]);

  const capitalizeName = (value: string) => {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <h2 className="text-center text-2xl font-hero font-bold text-primary">
          Bem-vindo ao {restaurantName}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Para personalizar sua experiencia, informe seu nome e CPF.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
            <input
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(capitalizeName(e.target.value))}
              className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-lg outline-none transition-colors focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">CPF</label>
            <CpfInput
              value={cpf}
              onChange={(raw) => setCpf(raw)}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-primary py-3 text-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? 'Processando...' : 'Continuar'}
          </button>

          <button
            onClick={handleAnonymous}
            className="w-full py-2 text-sm text-gray-400 underline transition-colors hover:text-gray-600"
          >
            Continuar sem personalizacao
          </button>
        </div>
      </div>
    </div>
  );
}
