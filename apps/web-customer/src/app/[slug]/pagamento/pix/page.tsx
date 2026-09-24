'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPatch } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';
import { QRPattern } from '../../../../components/ui/QRPattern';
import { PIX_INITIAL_LOAD_ERROR, resolvePixGate, type PixLoadStatus } from './pixLoadState';
import { serviceFeeCopy } from './serviceFeeCopy';

/**
 * ⚠️ PIX É UM STUB DE DEMONSTRAÇÃO — NÃO É BUG. Ver docs/produto/funcionalidades/pagamento-pix.md.
 *
 * Esta tela mostra um QR/copia-e-cola de DEMONSTRAÇÃO: o `pixCopyPaste` que ela
 * renderiza é uma string gerada localmente no backend, NÃO um BR Code emitido
 * por um banco/PSP — o app de banco real não o honra. Não há webhook nem
 * integração de PSP; em produção o pagamento nunca chega a 'confirmed' (fica em
 * 'awaiting_settlement'). Isso é uma DECISÃO DE PRODUTO do Caleb (2026-07-04):
 * o Pix real só será implementado depois que houver um cliente fechado. NÃO
 * "conserte" isso gerando QR real nem religando auto-confirm — o caminho de
 * implementação (PSP + webhook = a verificação de que o Pix chegou) está em
 * docs/produto/funcionalidades/pagamento-pix.md. A tela é mantida como está de propósito, pra demo.
 */

interface PaymentData {
  paymentId: string;
  status: string;
  amountCents: number;
  pixQrCode?: string;
  pixCopyPaste?: string;
  expiresAt?: string;
  serviceFeeCents?: number;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function PagamentoPixPage() {
  const params = useParams();
  const router = useRouter();
  const { push } = useNav();
  const searchParams = useSearchParams();
  const { tableLabel } = useSession();
  const slug = params.slug as string;
  const paymentId = searchParams.get('paymentId') ?? '';

  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [serviceFeePct, setServiceFeePct] = useState<number | null>(null);
  const [loadStatus, setLoadStatus] = useState<PixLoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!slug || paymentId) return;
    router.replace(`/${slug}/pagamento`);
  }, [paymentId, router, slug]);

  useEffect(() => {
    if (!paymentId || !slug) return;
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    setPayment(null);
    setLoadStatus('loading');
    setLoadError(null);

    const load = async (initial: boolean): Promise<boolean> => {
      try {
        const data = await apiGet<PaymentData>(`/${slug}/payments/${paymentId}`);
        if (stop) return false;
        if (
          data.paymentId !== paymentId ||
          !Number.isFinite(data.amountCents) ||
          typeof data.status !== 'string'
        ) {
          throw new Error('PAYMENT_RESPONSE_INVALID');
        }

        setPayment(data);
        setLoadStatus('ready');
        setLoadError(null);
        if (data.status === 'confirmed') {
          router.replace(`/${slug}/pagamento/feedback?paymentId=${encodeURIComponent(paymentId)}`);
          return false;
        } else if (data.status === 'failed' || data.status === 'expired') {
          router.replace(`/${slug}/pagamento/erro?reason=${data.status}`);
          return false;
        }

        return true;
      } catch {
        if (stop) return false;
        setLoadError(
          initial
            ? PIX_INITIAL_LOAD_ERROR
            : 'Não consegui atualizar o status desta demonstração. Tente novamente.',
        );
        if (initial) {
          setPayment(null);
          setLoadStatus('error');
        }
        return false;
      }
    };

    void (async () => {
      const shouldPoll = await load(true);
      if (!stop && shouldPoll) {
        timer = setInterval(() => void load(false), 4000);
      }
    })();

    return () => {
      stop = true;
      if (timer) clearInterval(timer);
    };
  }, [paymentId, retryNonce, router, slug]);

  useEffect(() => {
    if (!slug || !paymentId) return;
    let stop = false;
    apiGet<{ serviceFeePct?: number }>(`/${slug}/orders/bill?mode=table`)
      .then((bill) => {
        if (
          !stop &&
          typeof bill.serviceFeePct === 'number' &&
          Number.isFinite(bill.serviceFeePct)
        ) {
          setServiceFeePct(bill.serviceFeePct);
        }
      })
      .catch(() => {
        // O valor continua sem percentual; nunca caímos num 10% inventado.
      });
    return () => {
      stop = true;
    };
  }, [paymentId, slug]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expiresAtMs = payment?.expiresAt ? new Date(payment.expiresAt).getTime() : 0;
  const remainingMs = expiresAtMs - now;
  const remaining = formatCountdown(remainingMs);
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  const copyCode = payment?.pixCopyPaste ?? '';
  const gate = resolvePixGate(paymentId, loadStatus, payment !== null);

  const handleCopy = async () => {
    if (!copyCode) return;
    // navigator.clipboard exige contexto seguro (HTTPS) — em dev/lan
    // sobre HTTP o iOS Safari rejeita. Fallback pra textarea +
    // execCommand('copy') que ainda funciona em qualquer contexto.
    let ok = false;
    try {
      if (
        typeof window !== 'undefined' &&
        window.isSecureContext &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(copyCode);
        ok = true;
      }
    } catch {
      /* fallback abaixo */
    }
    if (!ok && typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = copyCode;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.setAttribute('readonly', 'true');
      document.body.appendChild(textarea);
      textarea.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(textarea);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCancel = async () => {
    if (cancelling || !paymentId) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await apiPatch(`/${slug}/payments/${paymentId}/cancel`, {});
    } catch {
      // Falha no cancelamento: fica na tela e mostra erro visível —
      // navegar aqui fingiria sucesso (anti-placebo).
      setCancelError('Não consegui cancelar agora. Tente novamente.');
      setCancelling(false);
      return;
    }
    // router.back() vai pra /assistente quando o usuario abriu /pix
    // direto via URL compartilhada (history vazio). Fallback explicito
    // pra /pagamento — evita confusao do bug-hunt.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/${slug}/pagamento`);
    }
  };

  const handleRetryLoad = () => {
    setPayment(null);
    setLoadStatus('loading');
    setLoadError(null);
    setRetryNonce((current) => current + 1);
  };

  if (gate !== 'ready' || !payment) {
    const isMissingPayment = gate === 'missing-payment';
    const isLoadError = gate === 'load-error';

    return (
      <AppShell
        slug={slug}
        restaurantName="Demonstração Pix"
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pagamento`}
        noMainPadding
        onBack={() => push(`/${slug}/pagamento`)}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 text-center">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
            Demonstração de pagamento
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
            {isMissingPayment
              ? 'Pagamento não iniciado'
              : isLoadError
                ? 'Não foi possível carregar o Pix'
                : 'Carregando demonstração de Pix…'}
          </h1>
          <p
            role={isLoadError ? 'alert' : undefined}
            className="mt-2 max-w-sm text-[13px] leading-[1.5] text-mute text-pretty"
          >
            {isMissingPayment
              ? 'Este link não identifica um pagamento. Você será levado de volta para a conta.'
              : isLoadError
                ? loadError
                : 'Aguarde enquanto confirmamos os dados desta demonstração.'}
          </p>
          {(isMissingPayment || isLoadError) && (
            <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5">
              {isLoadError && (
                <PillButton fullWidth onClick={handleRetryLoad}>
                  Tentar novamente
                </PillButton>
              )}
              <PillButton
                fullWidth
                variant={isLoadError ? 'outline' : 'filled'}
                onClick={() => router.replace(`/${slug}/pagamento`)}
              >
                Voltar para a conta
              </PillButton>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  const amount = payment.amountCents;

  return (
    <AppShell
      slug={slug}
      restaurantName="Demonstração Pix"
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pagamento`}
      noMainPadding
      onBack={() => push(`/${slug}/pagamento`)}
    >
      <div className="flex flex-1 flex-col overflow-auto px-6 pb-3">
        <div className="pb-4 pt-1">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
            Demonstração de pagamento
          </div>
          <div className="text-[24px] font-semibold tracking-[-0.02em]">QR Code ilustrativo</div>
          <div className="mt-1 text-[13px] text-mute text-pretty">
            Este código demonstra a etapa e não funciona no app do seu banco.
          </div>
          {/* Decisão Caleb 2026-07-04 (gate 1D): demo honesta — o QR é
              simulado (sem PSP) e o cliente fica sabendo. */}
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border-soft px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1px] text-faint">
            Pagamento simulado · nenhum valor será cobrado
          </div>
        </div>

        <div className="mb-4 flex justify-center">
          <div className="relative h-[230px] w-[230px] rounded-[16px] border-[1.5px] border-ink bg-bg p-3.5">
            <QRPattern seedString={paymentId} />
            <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[8px] border-[1.5px] border-ink bg-bg text-[10px] font-bold tracking-[0.5px]">
              PIX
            </div>
          </div>
        </div>

        {expiresAtMs > 0 && (
          <div className="mb-4 flex items-center justify-center gap-1.5 text-[12px] text-mute">
            <span className="h-2 w-2 animate-blink rounded-full bg-ink" />
            <span>
              Código expira em <b className="text-ink tabular-nums">{remaining}</b>
            </span>
          </div>
        )}

        <div className="mb-3.5 flex items-center justify-between rounded-[14px] border-[1.3px] border-border-soft p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[1px] text-mute">
              Valor a pagar
            </div>
            <div className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em] tabular-nums">
              {fmt(amount)}
            </div>
          </div>
          <div className="text-right text-[11px] leading-[1.4] text-mute">
            Sua parte
            <br />({serviceFeeCopy(serviceFeePct)})
          </div>
        </div>

        {copyCode && (
          <div className="mb-2 flex items-center gap-2.5 rounded-[12px] border-[1.3px] border-border-soft bg-surface px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
                Código demonstrativo
              </div>
              <div className="truncate font-mono text-[11px] text-ink">{copyCode}</div>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-full border-[1.2px] border-ink px-3 py-1.5 text-[11px] font-semibold"
            >
              {copied ? 'Copiado' : 'Copiar demo'}
            </button>
          </div>
        )}

        <div className="mt-2 text-center text-[10px] leading-[1.5] text-faint">
          Esta versão não cobra nem confirma pagamentos automaticamente.
          <br />
          Use esta tela apenas para demonstrar o fluxo.
        </div>
      </div>

      <div className="shrink-0 px-[22px] pb-safe pb-6 pt-2.5">
        {loadError && (
          <div role="alert" className="mb-2 text-center text-[12px] text-red-600">
            {loadError}{' '}
            <button type="button" className="underline" onClick={handleRetryLoad}>
              Tentar novamente
            </button>
          </div>
        )}
        {cancelError && (
          <div role="alert" className="mb-2 text-center text-[12px] text-red-600">
            {cancelError}
          </div>
        )}
        <PillButton fullWidth onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Encerrando…' : 'Encerrar demonstração'}
        </PillButton>
      </div>
    </AppShell>
  );
}
