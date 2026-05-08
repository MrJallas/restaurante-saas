'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CpfInput } from '../../components/welcome/CpfInput';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { cleanCpf, validateCpf } from '../../lib/cpf';
import { identifyCustomer } from '../../lib/api/customer-host';
import type { CustomerIdentifyResponse } from '@restaurant/shared-types';

interface ScreenCustomerIdentifyBeforeJoinProps {
  slug: string;
  /**
   * Where to go after identify succeeds. Default: the waiting-approval screen,
   * which then triggers the late-arrival request.
   */
  redirectTo?: string;
  /**
   * Optional override for the host name shown in the sub-text. When unset,
   * the screen uses generic "host da mesa".
   */
  hostName?: string | null;
}

/**
 * `ScreenCustomerIdentifyBeforeJoin` · per docs/features/customer-host-model.md
 * (section "Identificação obrigatória pré-late-arrival · nome + CPF").
 *
 * Customer B scanned the QR of an occupied table. Before we create the
 * `late_arrival_request` we force a name+CPF capture so the host (customer A)
 * sees the requester's real name on the approval screen — never an anonymous
 * "?". Returning customers (cookie `recognition_token` present) skip this
 * screen entirely; the auto-recognize path on `/mesa/[tableCode]` handles them.
 *
 * On submit, `POST /:slug/customer/identify` does the lookup:
 *  - CPF found → auto-login, refreshed token (httpOnly cookie); we show a
 *    short toast "Bem-vindo de volta, [canonicalName]" then navigate
 *  - CPF new → row created server-side, fresh token; we just navigate
 */
export function ScreenCustomerIdentifyBeforeJoin({
  slug,
  redirectTo,
  hostName,
}: ScreenCustomerIdentifyBeforeJoinProps) {
  const router = useRouter();
  const { setCustomer, sessionId } = useSession();

  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returningName, setReturningName] = useState<string | null>(null);

  const cleanedCpf = cleanCpf(cpf);
  const isNameValid = name.trim().length >= 2;
  const isCpfValid = cleanedCpf.length === 11 && validateCpf(cleanedCpf);
  const canSubmit = isNameValid && isCpfValid && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result: CustomerIdentifyResponse = await identifyCustomer({
        slug,
        name: name.trim(),
        cpf: cleanedCpf,
        currentSessionId: sessionId ?? undefined,
      });

      // Hidrata SessionContext com o canonicalName retornado, pra o resto do
      // app (host approval screen, chat) usar o nome do banco se for diferente
      // do que o cliente digitou. recognitionToken aqui e' opcional na resposta
      // (o cookie ja foi setado server-side); passamos string vazia quando
      // null pra manter o tipo do setCustomer estavel.
      setCustomer({
        customerId: result.customerId,
        visitId: '',
        name: result.canonicalName,
        recognitionToken: result.recognitionToken ?? '',
        isReturning: result.isReturning,
      });

      // Soft alert "bem-vindo de volta" quando retornante e o nome canonico
      // diverge do digitado. Pequena pausa visual antes de navegar pra que o
      // cliente veja a mensagem (alternativa ao toast: poderia ser passado
      // via query string pra waiting-approval renderizar la, mas isso aqui
      // e simples e suficiente).
      if (result.isReturning && result.canonicalName !== name.trim()) {
        setReturningName(result.canonicalName);
        setTimeout(() => {
          router.push(redirectTo ?? `/${slug}/waiting-approval`);
        }, 1800);
        return;
      }
      router.push(redirectTo ?? `/${slug}/waiting-approval`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao validar seus dados. Tente novamente.',
      );
      setSubmitting(false);
    }
  }, [
    canSubmit,
    slug,
    name,
    cleanedCpf,
    sessionId,
    setCustomer,
    router,
    redirectTo,
  ]);

  // capitalize on blur: roda a cada keystroke quebra autocorrect do iOS
  // (mesmo motivo do WelcomeModal). Mantemos a UX de Title-Case sem brigar
  // com o IME.
  const capitalizeName = (value: string) =>
    value.replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <div className="flex flex-1 flex-col px-[22px] pb-6 pt-[max(env(safe-area-inset-top),20px)]">
        <p className="mb-3.5 mt-2 text-[10px] font-bold uppercase tracking-[1.2px] text-faint">
          Acabou de escanear · alguém já está nesta mesa
        </p>

        <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.6px] text-ink">
          Quem é você?
        </h1>

        <p className="mt-3 max-w-[320px] text-[15px] font-medium leading-[1.5] tracking-[-0.05px] text-mute">
          {hostName ? (
            <>
              <b className="font-semibold text-ink">{hostName}</b> (host da mesa)
              vai ver seu nome pra decidir se você pode entrar.
            </>
          ) : (
            <>
              O host da mesa vai ver seu nome pra decidir se você pode entrar.
            </>
          )}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[1px] text-mute">
              Seu primeiro nome
            </label>
            <input
              type="text"
              placeholder="Seu primeiro nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName((v) => capitalizeName(v))}
              autoCapitalize="words"
              autoComplete="given-name"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className="w-full rounded-[14px] border-[1.6px] border-border-soft bg-white px-[18px] py-4 text-[17px] font-medium tracking-[-0.2px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[1px] text-mute">
              Seu CPF
            </label>
            <CpfInput value={cpf} onChange={(raw) => setCpf(raw)} />
          </div>
        </div>

        <p className="mt-4 text-[10px] font-bold uppercase leading-[1.5] tracking-[0.8px] text-faint">
          Só pra mesa saber quem é · CPF nos ajuda a te reconhecer na próxima
          visita
        </p>

        {error && (
          <p className="mt-4 rounded-[10px] border border-danger/30 bg-danger/5 p-2.5 text-[12px] text-danger">
            {error}
          </p>
        )}

        {returningName && (
          <p className="mt-4 rounded-[10px] border border-ink/15 bg-surface p-3 text-[13px] text-ink">
            Bem-vindo de volta, <b>{returningName}</b>! Já te conheço daqui.
          </p>
        )}

        <div className="flex-1" />

        <PillButton
          variant="filled"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 w-full"
        >
          {submitting ? 'Validando…' : 'Continuar'}
        </PillButton>
      </div>
    </main>
  );
}
