'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '../../hooks/useSession';
import { useDraftOrder } from '../../providers/DraftOrderProvider';
import { ContinuationHome } from '../../components/ui/ContinuationHome';
import { SuggestionChip } from '../../components/ui/SuggestionChip';
import { apiPost } from '../../lib/api';
import { clearDeliveredContinuationHint } from '../../lib/continuationHints';
import { tenantNavigationDestination } from '../../lib/customer-navigation';

interface ContinuationChip {
  id: string;
  label: string;
  action: 'send' | 'navigate' | 'expand';
  // shared-types `ContextualChip.payload` é `unknown` (LLM podia mandar
  // qualquer thing). Aqui sempre tratamos como string ao consumir, com
  // fallback pro label.
  payload: unknown;
  primary?: boolean;
}

interface ContinuationGetResponse {
  message: { id?: string; kind?: string; template?: string; subtitle?: string } | null;
  rendered: string | null;
  chips?: ContinuationChip[];
  subtitle?: string | null;
  primary_cta?: { label: string; action: ContinuationChip['action']; payload: string } | null;
}

interface ContinuationPostResponse {
  kind: string;
  text: string;
  chips?: ContinuationChip[];
  meta?: {
    subtitle?: unknown;
    primary_cta?: unknown;
  };
}

function primaryCta(value: unknown): ContinuationGetResponse['primary_cta'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label : '';
  const action = typeof record.action === 'string' ? record.action : '';
  const payload = typeof record.payload === 'string' ? record.payload : '';
  if (!label || !['send', 'navigate', 'expand'].includes(action)) return null;
  return {
    label,
    action: action as ContinuationChip['action'],
    payload,
  };
}

function chipPayloadText(chip: ContinuationChip): string {
  if (typeof chip.payload === 'string' && chip.payload.length > 0) return chip.payload;
  return chip.label;
}

/**
 * Round 3 Cat 5: ContinuationHome wirado pra tela landing pós-mesa.
 *
 * Quando o customer já tem session ativa (returning), buscamos um
 * continuation message do ai-service (5 kinds canônicos do canvas v20:
 * viu_menu, chamou_garcom, abriu_pedido, pagou, voltou_sem_acao). O kind
 * vem por query param `?cont=…` quando o caller decide explicitamente
 * (apps/api home.service detectaria via DB state em produção); senão,
 * cai no segment-based default (idle_nudge).
 *
 * Customer novo (sem session) cai no copy clássico "Escaneie o QR da mesa".
 */
export default function SlugIndex() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const session = useSession();
  const { items: draftItems } = useDraftOrder();
  const [cont, setCont] = useState<ContinuationGetResponse | null>(null);

  // Pega kind via query param (apps/api home.service decide)
  const kindFromUrl =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('cont') : null;

  useEffect(() => {
    if (!session.customerId || !session.sessionId) return;
    (async () => {
      try {
        const res = await apiPost<ContinuationPostResponse>(`/${params?.slug}/continuation`, {
          tableSessionId: session.sessionId,
          customerId: session.customerId ?? undefined,
          clientKindHint: kindFromUrl ?? undefined,
          hasDraftOrder: draftItems.length > 0,
          isReturning: session.isReturning ?? false,
        });
        if (res?.text)
          setCont({
            message: { kind: res.kind },
            rendered: res.text,
            chips: res.chips ?? [],
            subtitle: typeof res.meta?.subtitle === 'string' ? res.meta.subtitle : null,
            primary_cta: primaryCta(res.meta?.primary_cta),
          });
        clearDeliveredContinuationHint(res?.kind);
      } catch {
        /* silently fail — continuation é progressive enhancement */
      }
    })();
  }, [
    params?.slug,
    session.customerId,
    session.sessionId,
    session.isReturning,
    kindFromUrl,
    draftItems.length,
  ]);

  if (!session.hydrated) {
    return (
      <div
        className="grid min-h-dvh place-items-center bg-bg"
        role="status"
        aria-label="Carregando sessão"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
      </div>
    );
  }

  // Customer novo · sem session · copy clássico de QR
  if (!session.customerId) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-bg">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-6xl">📱</div>
          <h1 className="text-xl font-semibold text-ink">Escaneie o QR da mesa</h1>
          <p className="text-sm text-ink/70">
            Para fazer seu pedido, escaneie o QR Code que está na sua mesa.
          </p>
          <p className="text-xs text-ink/50 pt-4">Restaurante: {params?.slug}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-6 bg-bg gap-4">
      {cont?.subtitle && (
        <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-faint">
          {cont.subtitle}
        </span>
      )}
      <ContinuationHome
        resolvedText={
          cont?.rendered ?? `Olá${session.customerName ? `, ${session.customerName}` : ''}!`
        }
        kicker="Assistente"
      >
        {cont?.chips && cont.chips.length > 0 && (
          <div className="-mx-1 flex flex-wrap gap-2 pt-2">
            {cont.chips.map((chip) => (
              <SuggestionChip
                key={chip.id}
                chip={chip}
                onTap={(c) => {
                  const txt = chipPayloadText(c as ContinuationChip);
                  if (c.action === 'navigate') {
                    router.push(tenantNavigationDestination(params.slug, txt));
                  } else {
                    // send / expand → vai pro chat com prefill
                    router.push(`/${params?.slug}/assistente?prefill=${encodeURIComponent(txt)}`);
                  }
                }}
              />
            ))}
          </div>
        )}
      </ContinuationHome>
      {cont?.primary_cta && (
        <button
          type="button"
          onClick={() => {
            const cta = cont.primary_cta!;
            if (cta.action === 'navigate') {
              router.push(tenantNavigationDestination(params.slug, cta.payload));
            } else {
              const text = cta.payload || cta.label;
              router.push(`/${params.slug}/assistente?prefill=${encodeURIComponent(text)}`);
            }
          }}
          className="mt-2 self-start rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white"
        >
          {cont.primary_cta.label}
        </button>
      )}
    </div>
  );
}
