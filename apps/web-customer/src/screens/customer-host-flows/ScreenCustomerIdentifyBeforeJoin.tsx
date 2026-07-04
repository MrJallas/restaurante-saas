'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CpfInput } from '../../components/welcome/CpfInput';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { cleanCpf, validateCpf } from '../../lib/cpf';
import { identifyCustomer, createLateArrivalRequest } from '../../lib/api/customer-host';
import type { CustomerIdentifyResponse } from '@restaurant/shared-types';

/**
 * Two distinct reasons the customer can land on this CPF gate:
 *
 *  - `'late-arrival'` — customer B genuinely scanned an occupied table and
 *    wants to JOIN it. Submitting creates a `late_arrival_request` and sends
 *    them to `/waiting-approval` so a host can approve (the P1-K flow).
 *
 *  - `'gate'` (DEFAULT) — a customer who is ALREADY seated just needs to prove
 *    their CPF to reach some other screen (feedback, /eu, histórico, o
 *    assistente via `?next=`). The bounce came from `useRequireCustomerId` /
 *    ScreenCustomerMe / assistente because `customerId` was missing from the
 *    bundle. Submitting must ONLY identify + route to `next`; it must NOT
 *    create a late_arrival_request nor land on waiting-approval — doing so
 *    stranded the customer waiting for a phantom host and spawned an orphan
 *    request that escalated to the manager after the 60s TTL (regression the
 *    re-scan flagged on P1-K commit 1c84355).
 */
export type IdentifyIntent = 'late-arrival' | 'gate';

interface ScreenCustomerIdentifyBeforeJoinProps {
  slug: string;
  /**
   * Which flow this gate is serving. Defaults to `'gate'` — the common,
   * safe case (prove CPF, then continue). Only `'late-arrival'` (or a
   * `redirectTo` that explicitly points at a waiting-approval path) opts into
   * creating the late_arrival_request + waiting-approval routing.
   */
  intent?: IdentifyIntent;
  /**
   * Where to go after identify succeeds.
   *  - late-arrival flow: destino da waiting-approval (default
   *    `/${slug}/waiting-approval`).
   *  - gate flow: destino pretendido (a tela que bouncou o cliente pra cá).
   * Aceita path absoluto (`/slug/foo`) ou segmento slug-relativo (`assistente`).
   */
  redirectTo?: string;
  /**
   * Onde voltar depois de identificar no fluxo `gate`. Escrito pelo caller que
   * bouncou (ex.: `?next=assistente`). Path absoluto ou segmento relativo ao
   * slug. Ignorado no fluxo late-arrival (lá o destino é a waiting-approval).
   */
  next?: string;
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
  intent,
  redirectTo,
  next,
  hostName,
}: ScreenCustomerIdentifyBeforeJoinProps) {
  const router = useRouter();
  const { setCustomer, sessionId } = useSession();

  // Distingue o late-arrival REAL do gate-de-CPF. Só entra no fluxo
  // late-arrival (cria request + waiting-approval) quando há sinal EXPLÍCITO:
  // `intent==='late-arrival'` OU um `redirectTo` que aponta de propósito pra
  // uma waiting-approval. Qualquer outra chegada (o caso comum: cliente
  // sentado que só precisa provar CPF) é tratada como `gate` — a intenção
  // default e segura.
  const isLateArrival =
    intent === 'late-arrival' ||
    (!!redirectTo && /(?:^|\/)waiting-approval(?:\/|\?|$)/.test(redirectTo));

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

      // Decide o destino a partir da INTENÇÃO, não incondicionalmente.
      let destination: string;

      if (isLateArrival) {
        // Fluxo late-arrival REAL (o que o P1-K consertou — preservado):
        // cria a late_arrival_request de verdade (o backend deriva customerId
        // do cookie recognition_token e tableSessionId da session — o body só
        // precisa satisfazer o @IsUUID customerId do DTO) e roteia com o `id`
        // + `expiresAt` que o create devolve (LateArrivalRequestDto), pra que
        // a waiting-approval case o requestId nos eventos WS `late_arrival.*`
        // e dirija o countdown. Sem isso a tela ficava presa em "aguardando
        // host" pra sempre.
        const request = await createLateArrivalRequest({
          slug,
          customerId: result.customerId,
        });

        destination = buildWaitingUrl({
          base: redirectTo ?? `/${slug}/waiting-approval`,
          requestId: request.id,
          expiresAt: request.expiresAt,
          hostName,
        });
      } else {
        // Gate-de-CPF (caso comum): o cliente já está sentado e só precisa
        // provar o CPF pra alcançar outra tela (feedback, /eu, histórico,
        // assistente via `?next=`). NÃO criamos late_arrival_request nem vamos
        // pra waiting-approval — isso deixava o cliente preso esperando um host
        // fantasma e gerava um pedido órfão que escalava pro gerente após o
        // TTL. Roteamos pro destino pretendido (`next`/`redirectTo`), honrando
        // o `?next=` que antes era ignorado. Fallback: home do slug.
        destination = resolveGateDestination({ slug, next, redirectTo });
      }

      // Soft alert "bem-vindo de volta" quando retornante e o nome canonico
      // diverge do digitado. Pequena pausa visual antes de navegar pra que o
      // cliente veja a mensagem.
      if (result.isReturning && result.canonicalName !== name.trim()) {
        setReturningName(result.canonicalName);
        setTimeout(() => {
          router.push(destination);
        }, 1800);
        return;
      }
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar seus dados. Tente novamente.');
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
    isLateArrival,
    redirectTo,
    next,
    hostName,
  ]);

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

/**
 * Resolve pra onde o gate-de-CPF (não-late-arrival) deve navegar depois de
 * identificar. Preferência: `next` (o destino que o caller que bouncou o
 * cliente escreveu, ex.: `?next=assistente`) → `redirectTo` → home do slug.
 *
 * `next`/`redirectTo` podem ser um path absoluto (`/slug/foo`, usado como
 * está) ou um segmento slug-relativo (`assistente` → `/${slug}/assistente`),
 * porque o assistente hoje escreve `?next=assistente` (sem slug nem barra).
 * Só aceitamos destinos internos (começando com `/` após normalizar) pra não
 * virar um open-redirect.
 */
function resolveGateDestination(input: {
  slug: string;
  next?: string;
  redirectTo?: string;
}): string {
  const raw = (input.next ?? input.redirectTo ?? '').trim();
  if (!raw) return `/${input.slug}`;
  // Path absoluto interno → usa como está. Bloqueia `//host` e `http(s)://`
  // (open-redirect) caindo no fallback slug-relativo.
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  // Segmento relativo → prefixa o slug, removendo barra inicial redundante.
  return `/${input.slug}/${raw.replace(/^\/+/, '')}`;
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
