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
      const result = await apiPost<CustomerWelcomeResponseDto>(
        `/${slug}/customer/welcome`,
        {
          name: name.trim(),
          cpf: cleanCpf(cpf),
        },
      );

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

  /**
   * Title-case so no blur. Rodar a cada keystroke (regex /\b\w/g sobre o
   * value todo) deformava o input enquanto o usuario digita ("joao da
   * silva" virava "Joao Da Silva" em tempo real, conflitando com o
   * autocorrect/autofill do iOS Safari e produzindo lixo tipo "QAQA Test"
   * quando o teclado de hardware injeta caracteres rapido). Aplicar onBlur
   * mantem a UX de capitalizar pro usuario sem brigar com o IME.
   */
  const capitalizeName = (value: string) => {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const handleNameBlur = () => {
    setName((current) => capitalizeName(current));
  };

  return (
    // Container precisa SCROLLAR quando o teclado iOS sobe — `flex items-center`
    // sem overflow deixa o botao "Continuar" escondido atras do toolbar do
    // teclado em iPhones menores (15/SE). Solucao: wrapper com overflow-y-auto
    // e min-h-full, modal alinhado em items-start com padding vertical e
    // pb-safe pra respeitar safe-area + viewport com keyboard.
    // Backdrop solido (sem blur). App roda em Safari iOS direto, nao
    // PWA — backdrop-filter era custoso e causava jank no teclado.
    // Politica do projeto: zero blur. Mantemos so o overlay escuro
    // pra dar contraste com o modal branco.
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      <div className="flex min-h-full w-full items-start justify-center px-[18px] pb-[max(env(safe-area-inset-bottom),24px)] pt-[max(env(safe-area-inset-top),24px)]">
      <div
        className="w-full max-w-[420px] rounded-[24px] border-[1.5px] border-ink bg-bg p-[26px]"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}
      >
        <h2 className="text-center text-[22px] font-semibold tracking-[-0.02em] text-ink text-pretty">
          Bem-vindo ao {restaurantName}
        </h2>
        <p className="mt-1.5 text-center text-[13px] leading-[1.45] text-mute text-pretty">
          Para personalizar sua experiência, informe seu nome e CPF.
        </p>

        <div className="mt-[22px] space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.3px] text-mute">
              Nome
            </label>
            <input
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              autoCapitalize="words"
              autoComplete="name"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className="w-full rounded-[14px] border-[1.3px] border-ink bg-bg px-4 py-3 text-[15px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.3px] text-mute">
              CPF
            </label>
            <CpfInput value={cpf} onChange={(raw) => setCpf(raw)} />
          </div>

          {error && (
            <p className="rounded-[10px] border border-danger/30 bg-danger/5 p-2.5 text-[12px] text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-[10px] w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white transition-opacity disabled:opacity-40"
          >
            {isLoading ? 'Processando...' : 'Continuar'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
