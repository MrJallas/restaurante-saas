'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CpfInput } from '../../components/welcome/CpfInput';
import { PillButton } from '../../components/ui/PillButton';
import { useSession } from '../../hooks/useSession';
import { cleanCpf, validateCpf } from '../../lib/cpf';
import { toTenantInternalPath } from '../../lib/safe-internal-path';
import { identifyCustomer } from '../../lib/api/customer-host';
import type { CustomerIdentifyResponse } from '@restaurant/shared-types';

/**
 * Esta tela é o GATE DE CPF e nada mais: um cliente que JÁ ESTÁ sentado prova
 * quem é para alcançar outra tela (feedback, /eu, histórico, o assistente via
 * `?next=`). O bounce vem de `useRequireCustomerId` / ScreenCustomerMe /
 * assistente quando `customerId` sumiu do bundle. Submeter APENAS identifica e
 * roteia para `next`/`redirectTo`.
 *
 * A tela NÃO abre pedido de entrada em mesa ocupada. Esse fluxo (chegada
 * tardia) é o System A: o cliente escaneia o QR da mesa, vira um
 * `session_participant` pendente e o host da mesa decide — nunca o staff
 * (decisão de produto V16). A variante `intent='late-arrival'`, que criava um
 * `late_arrival_request` e caía na waiting-approval, saiu junto com o System B
 * (migration 081); nada no app jamais produziu esse parâmetro.
 */
interface ScreenCustomerIdentifyBeforeJoinProps {
  slug: string;
  /**
   * Destino pretendido (a tela que bouncou o cliente pra cá). Aceita path
   * absoluto (`/slug/foo`) ou segmento slug-relativo (`assistente`).
   */
  redirectTo?: string;
  /**
   * Onde voltar depois de identificar. Escrito pelo caller que bouncou
   * (ex.: `?next=assistente`). Path absoluto ou segmento relativo ao slug.
   */
  next?: string;
}

/**
 * `ScreenCustomerIdentifyBeforeJoin` · gate de CPF.
 *
 * Forçamos nome+CPF pra reidratar a identidade do cliente antes de liberar as
 * telas pessoais (perfil, histórico, reclamações, assistente). Clientes
 * retornantes (cookie `recognition_token` presente) nunca chegam aqui.
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
  next,
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

      // Gate-de-CPF: o cliente já está sentado e só precisa provar o CPF pra
      // alcançar outra tela (feedback, /eu, histórico, assistente via
      // `?next=`). Roteamos pro destino pretendido (`next`/`redirectTo`),
      // sempre normalizado pra um path interno. Fallback: home do slug.
      const destination = resolveGateDestination({ slug, next, redirectTo });

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
  }, [canSubmit, slug, name, cleanedCpf, sessionId, setCustomer, router, redirectTo, next]);

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
            Só um instante · confirme quem é você
          </span>

          <h1 className="mt-[14px] text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink text-pretty">
            Quem é você?
          </h1>

          <p className="mt-[12px] max-w-[320px] text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute text-pretty">
            Confirme seu nome e CPF pra acessar seu perfil e histórico.
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
            Confirmação rápida · CPF nos ajuda a te reconhecer na próxima visita
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
 * Resolve pra onde o gate-de-CPF deve navegar depois de identificar. Preferência: `next` (o destino que o caller que bouncou o
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
  // Path absoluto → só se resolver na MESMA origin. Fecha open-redirect POR
  // CONSTRUÇÃO (via toInternalPath): `//host`, `/\host`, `\/host`, `http(s)://`
  // — a classe inteira — caem no fallback slug home. Não é denylist de padrões.
  if (raw.startsWith('/')) return toTenantInternalPath(raw, input.slug) ?? `/${input.slug}`;
  // Segmento relativo → prefixa o slug (sempre same-origin por construção).
  const relative = `/${input.slug}/${raw.replace(/^\/+/, '')}`;
  return toTenantInternalPath(relative, input.slug) ?? `/${input.slug}`;
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
