'use client';

import { useState, useCallback } from 'react';
import { CpfInput } from './CpfInput';
import { validateCpf, cleanCpf } from '../../lib/cpf';
import { ApiRequestError, apiPost } from '../../lib/api';
import { captureCustomerLocationSignal } from '../../lib/location';
import { setRecognitionToken } from '../../lib/storage';
import { useSession } from '../../hooks/useSession';
import { PillButton } from '../ui/PillButton';
import type { CustomerWelcomeResponseDto } from '@restaurant/shared-types';

interface WelcomeModalProps {
  slug: string;
  restaurantName: string;
  /** Mesa label visível ao customer ("Mesa 05" / "Varanda · 12") · opcional. */
  tableLabel?: string;
  onComplete: (customer: CustomerWelcomeResponseDto | null) => void;
}

/**
 * Round 4 redesign — agora alinhado ao canon V20 (`cliente-late-arrival.jsx`
 * §FRAME 3 ScreenCustomerIdentifyBeforeJoin). Saiu o card "modal" centralizado
 * com 1.5px border-ink e padding 26 que destoava do resto do app — entrou
 * fullscreen take-over com:
 *   - Mono eyebrow no topo: "MESA N · BEM-VINDO"
 *   - Title 26/700 letterSpacing -0.6 — "Pra começar"
 *   - Body 15/500 mute com leading 1.5
 *   - Inputs com label MonoLabel (10px uppercase tracking 1.5)
 *     + caixa border-[1.6px] border-ink (focused) / border-soft (idle)
 *     + radius 14, padding 16/18
 *   - Helper mono uppercase 9.5px text-faint embaixo do CPF
 *   - PillButton variant=filled fullWidth com seta `→` (canon)
 *   - Backdrop preto 25%, sem blur (Safari iOS performance)
 *
 * O parent ainda consome como modal — o overlay z-50 fixed inset-0 mantém
 * o pattern, só o conteúdo foi re-skinado pra parecer com as outras telas
 * V20 (V13 amber/heavy-border isolado tirado em round 4 §C-NEW-7).
 */
export function WelcomeModal({
  slug,
  restaurantName,
  tableLabel,
  onComplete,
}: WelcomeModalProps) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [cpfFocused, setCpfFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setCustomer, clearSession } = useSession();

  const isNameValid = name.trim().length >= 2;
  const isCpfValid = cleanCpf(cpf).length === 11 && validateCpf(cleanCpf(cpf));
  const canSubmit = isNameValid && isCpfValid && !isLoading;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      const location = await captureCustomerLocationSignal({
        prompt: true,
        timeoutMs: 4000,
      });
      if (location.status !== 'granted') {
        clearSession();
        setError('Permita a localização para entrar no app do restaurante.');
        setIsLoading(false);
        return;
      }
      const result = await apiPost<CustomerWelcomeResponseDto>(
        `/${slug}/customer/welcome`,
        {
          name: name.trim(),
          cpf: cleanCpf(cpf),
          location,
        },
      );

      if (result.recognitionToken) setRecognitionToken(result.recognitionToken);
      setCustomer({
        customerId: result.customerId,
        visitId: result.visitId,
        name: result.name,
        recognitionToken: result.recognitionToken,
        isReturning: result.isReturning,
      });
      onComplete(result);
    } catch (err) {
      if (err instanceof ApiRequestError && err.statusCode === 403) {
        clearSession();
      }
      setError(err instanceof Error ? err.message : 'Erro ao processar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [canSubmit, slug, name, cpf, setCustomer, clearSession, onComplete]);

  /**
   * Title-case so no blur. Rodar a cada keystroke (regex /\b\w/g sobre o
   * value todo) deformava o input enquanto o usuario digita — aplicar onBlur
   * mantem a UX de capitalizar pro usuario sem brigar com o IME.
   */
  const capitalizeName = (value: string) => {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const handleNameBlur = () => {
    setNameFocused(false);
    setName((current) => capitalizeName(current));
  };

  const eyebrow = (tableLabel ? `${tableLabel.toUpperCase()} · ` : '') + 'BEM-VINDO';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-bg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      data-testid="welcome-modal"
    >
      {/* Conteúdo centralizado vertical e horizontalmente. min-h-dvh + flex
          justify-center mantém o eyebrow + form + CTA agrupados no centro do
          viewport — funciona com teclado iOS aberto (dvh shrink) e com
          desktop wide. Sem flex-1 spacer separando o CTA, ele fica colado
          no form igual canon V20 IdentifyBeforeJoin.

          items-center força que o card max-w-[420px] fique no eixo
          horizontal central. min-h-dvh + justify-center alinha
          verticalmente; em viewports menores que o content, padding y-8
          mantém respiro. */}
      <div className="relative grid h-[100dvh] min-h-dvh w-full place-items-center px-[22px] py-8">
        <div className="w-full max-w-[420px]">
          <span className="block font-mono text-[10px] uppercase tracking-[1.5px] text-faint">
            {eyebrow}
          </span>

          <h2
            id="welcome-title"
            className="mt-[14px] text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink text-pretty"
          >
            Pra começar, quem é você?
          </h2>

          <p className="mt-[12px] max-w-[320px] text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute text-pretty">
            Estamos no <b className="font-semibold text-ink">{restaurantName}</b>.
            Seu nome ajuda a personalizar o atendimento. CPF é só pra te
            reconhecer na próxima visita.
          </p>

          <div className="mt-[24px] flex flex-col gap-[18px]">
            <FieldShell label="Seu nome" focused={nameFocused}>
              <input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setNameFocused(true)}
                onBlur={handleNameBlur}
                autoCapitalize="words"
                autoComplete="given-name"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                className="w-full bg-transparent text-[17px] font-medium tracking-[-0.012em] text-ink outline-none placeholder:text-faint"
              />
            </FieldShell>

            <FieldShell label="Seu CPF" focused={cpfFocused} hint="cpf">
              <CpfInput
                value={cpf}
                onChange={(raw) => setCpf(raw)}
                onFocusChange={setCpfFocused}
              />
            </FieldShell>
          </div>

          <p className="mt-[14px] font-mono text-[10px] font-bold uppercase leading-[1.5] tracking-[0.8px] text-faint text-pretty">
            Só pra mesa saber quem é · CPF nos ajuda a te reconhecer na próxima visita
          </p>

          {error && (
            <div
              role="alert"
              className="mt-3 rounded-[12px] border border-danger/30 bg-danger/5 px-3 py-2.5 text-[12px] leading-[1.5] text-danger"
            >
              {error}
            </div>
          )}

          <PillButton
            variant="filled"
            fullWidth
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-[28px] py-4 text-[15.5px]"
            data-testid="welcome-submit"
          >
            <span className="inline-flex items-center gap-1.5">
              {isLoading ? 'Processando…' : 'Continuar'}
              {!isLoading && <span aria-hidden>→</span>}
            </span>
          </PillButton>
        </div>
      </div>
    </div>
  );
}

interface FieldShellProps {
  label: string;
  focused: boolean;
  /** `'cpf'` aplica `font-variant-numeric: tabular-nums` no shell. */
  hint?: 'cpf';
  children: React.ReactNode;
}

/**
 * Caixa do campo (label mono em cima + container border outline).
 * Encapsula o pattern que o V20 IdentifyBeforeJoin canon usa pra que
 * nome/CPF compartilhem visualmente o mesmo "shell" — só o input dentro
 * muda (input simples × CpfInput com mask).
 */
function FieldShell({ label, focused, hint, children }: FieldShellProps) {
  return (
    <div>
      <span
        className={`mb-[8px] block font-mono text-[10px] font-bold uppercase tracking-[1.5px] transition-colors ${
          focused ? 'text-ink' : 'text-mute'
        }`}
      >
        {label}
      </span>
      <div
        className={`flex min-h-[56px] items-center rounded-[14px] border-[1.6px] bg-bg px-[18px] py-[14px] transition-colors ${
          focused ? 'border-ink' : 'border-border-soft'
        } ${hint === 'cpf' ? 'tabular-nums' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}
