'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CpfInput } from '../../components/welcome/CpfInput';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { cleanCpf, validateCpf } from '../../lib/cpf';
import { identifyCustomer, createLateArrivalRequest } from '../../lib/api/customer-host';
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
 *
 * Round 4 §C-NEW-10 redesign — agora segue o mesmo canon V20 do WelcomeModal:
 *   - grid place-items-center centraliza vertical e horizontal
 *   - FieldShell wraps name/CPF inputs com focus tracking
 *   - Label "Seu nome" (V13 era "Seu primeiro nome", trocado pra ficar com
 *     a mesma copy da Welcome após user feedback)
 *   - Mono eyebrow + title 26/700 + body mute + helper mono uppercase
 *   - PillButton filled lg com seta canon `→`
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
  const [nameFocused, setNameFocused] = useState(false);
  const [cpfFocused, setCpfFocused] = useState(false);
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

      // P1-K (re-scan): identify só rodava o lookup e navegava pra
      // /waiting-approval SEM criar a late_arrival_request no backend —
      // `createLateArrivalRequest` tinha 0 call-sites. Resultado: a tela de
      // espera renderizava "aguardando host" permanentemente porque não havia
      // request nenhum pra o host aprovar nem `requestId`/`expiresAt` pra
      // rastrear via WS. Aqui criamos o pedido de verdade (o backend deriva
      // customerId do cookie recognition_token e tableSessionId da session —
      // o body só precisa satisfazer o @IsUUID customerId do DTO) e roteamos
      // com o `id` + `expiresAt` que o create realmente devolve
      // (LateArrivalRequestDto), não um campo `next`/`redirect` inexistente.
      const request = await createLateArrivalRequest({
        slug,
        customerId: result.customerId,
      });

      const waitingUrl = buildWaitingUrl({
        base: redirectTo ?? `/${slug}/waiting-approval`,
        requestId: request.id,
        expiresAt: request.expiresAt,
        hostName,
      });

      // Soft alert "bem-vindo de volta" quando retornante e o nome canonico
      // diverge do digitado. Pequena pausa visual antes de navegar pra que o
      // cliente veja a mensagem (alternativa ao toast: poderia ser passado
      // via query string pra waiting-approval renderizar la, mas isso aqui
      // e simples e suficiente).
      if (result.isReturning && result.canonicalName !== name.trim()) {
        setReturningName(result.canonicalName);
        setTimeout(() => {
          router.push(waitingUrl);
        }, 1800);
        return;
      }
      router.push(waitingUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar seus dados. Tente novamente.');
      setSubmitting(false);
    }
  }, [canSubmit, slug, name, cleanedCpf, sessionId, setCustomer, router, redirectTo, hostName]);

  // capitalize on blur: roda a cada keystroke quebra autocorrect do iOS
  // (mesmo motivo do WelcomeModal). Mantemos a UX de Title-Case sem brigar
  // com o IME.
  const capitalizeName = (value: string) => value.replace(/\b\w/g, (char) => char.toUpperCase());

  const handleNameBlur = () => {
    setNameFocused(false);
    setName((v) => capitalizeName(v));
  };

  return (
    <main className="bg-bg" data-testid="identify-before-join">
      <div className="relative grid h-[100dvh] min-h-dvh w-full place-items-center px-[22px] py-8">
        <div className="w-full max-w-[420px]">
          <span className="block font-mono text-[10px] uppercase tracking-[1.5px] text-faint">
            Acabou de escanear · alguém já está nesta mesa
          </span>

          <h1 className="mt-[14px] text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink text-pretty">
            Quem é você?
          </h1>

          <p className="mt-[12px] max-w-[320px] text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute text-pretty">
            {hostName ? (
              <>
                <b className="font-semibold text-ink">{hostName}</b> (host da mesa) vai ver seu nome
                pra decidir se você pode entrar.
              </>
            ) : (
              <>O host da mesa vai ver seu nome pra decidir se você pode entrar.</>
            )}
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
              <CpfInput value={cpf} onChange={(raw) => setCpf(raw)} onFocusChange={setCpfFocused} />
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

          {returningName && (
            <div className="mt-3 rounded-[12px] border border-border-soft bg-surface px-3 py-2.5 text-[13px] leading-[1.5] text-ink">
              Bem-vindo de volta, <b className="font-semibold">{returningName}</b>! Já te conheço
              daqui.
            </div>
          )}

          <PillButton
            variant="filled"
            fullWidth
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-[28px] py-4 text-[15.5px]"
          >
            <span className="inline-flex items-center gap-1.5">
              {submitting ? 'Validando…' : 'Continuar'}
              {!submitting && <span aria-hidden>→</span>}
            </span>
          </PillButton>
        </div>
      </div>
    </main>
  );
}

/**
 * Anexa `requestId`/`expiresAt`/`hostName` ao destino da waiting-approval sem
 * pisar em query params que o caller já tenha posto no `redirect`. A tela
 * `/waiting-approval` lê exatamente essas chaves (page.tsx) e as repassa pro
 * `ScreenCustomerWaitingApproval`, que casa o `requestId` nos eventos WS
 * `late_arrival.*` e usa o `expiresAt` pra dirigir o countdown. Sem esses
 * params a tela ficava presa em "aguardando host" pra sempre (P1-K).
 */
function buildWaitingUrl(input: {
  base: string;
  requestId: string;
  expiresAt?: string | null;
  hostName?: string | null;
}): string {
  const [path, existingQuery = ''] = input.base.split('?');
  const params = new URLSearchParams(existingQuery);
  params.set('requestId', input.requestId);
  if (input.expiresAt) params.set('expiresAt', input.expiresAt);
  if (input.hostName) params.set('hostName', input.hostName);
  return `${path}?${params.toString()}`;
}

interface FieldShellProps {
  label: string;
  focused: boolean;
  hint?: 'cpf';
  children: React.ReactNode;
}

/**
 * Caixa do campo (label mono em cima + container border outline) — mesma
 * implementação do WelcomeModal pra que ambos compartilhem visual canon
 * V20. Idealmente: extrair pra `components/ui/FieldShell.tsx` num PR de
 * cleanup; por ora inline aqui pra não bloquear C-NEW-10.
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
