'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { apiPost, apiGet } from '../../../../lib/api';
import {
  getRecognitionToken,
  setRecognitionToken,
  setSessionToken,
} from '../../../../lib/storage';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { WelcomeModal } from '../../../../components/welcome/WelcomeModal';
import { AppShell } from '../../../../components/layout/AppShell';
import { HomeHero } from '../../../../components/home/HomeHero';
import { PillButton } from '../../../../components/ui/PillButton';
import { LiquidGlassInput } from '../../../../components/ui/LiquidGlassInput';
import { HostApprovalModal } from '../../../../components/host/HostApprovalModal';
import { PendingApprovalScreen } from '../../../../components/host/PendingApprovalScreen';
import { apiGet as apiGetExternal } from '../../../../lib/api';
import { useTableSocket } from '../../../../hooks/useTableSocket';
import type { SessionResponseDto, CustomerWelcomeResponseDto } from '@restaurant/shared-types';

// Hard cap para a splash "Preparando sua experiencia". Se o initSession demorar
// mais que isso, o pageState e forcado para 'welcome' para a UI nao travar.
const SPLASH_MAX_MS = 1500;

type PageState = 'loading' | 'welcome' | 'home' | 'error' | 'pending_approval';

interface ParticipantsResponse {
  participants: {
    customerId: string;
    name: string;
    initial: string;
    color: string;
    status: 'pending' | 'approved' | 'rejected';
    isHost: boolean;
  }[];
}

interface HomeData {
  heroMessage: string;
  restaurantName: string;
  tableLabel: string;
  highlights: {
    id: string;
    name: string;
    shortDescription: string | null;
    priceCents: number;
    imageUrl: string | null;
    badge: string | null;
  }[];
  isReturning: boolean;
  lastVisitSummary: { last_items?: { name: string }[] } | null;
}

interface PublicSettings {
  restaurantName: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  fontHero: string;
  fontBody: string;
  logoUrl: string | null;
}

function getInitials(name: string | null | undefined, fallback = 'TL'): string {
  if (!name) return fallback;
  const words = name.trim().split(/\s+/).slice(0, 2);
  const initials = words.map((w) => w[0]?.toUpperCase() ?? '').join('');
  return initials || fallback;
}

export default function MesaPage() {
  const params = useParams<{ slug: string; tableCode: string }>();
  const { push, prefetch } = useNav();
  const slug = params.slug;
  const tableCode = params.tableCode;

  const {
    setSession,
    setCustomer,
    clearSession,
    isValid,
    customerName,
    customerId,
    tableCode: sessionTableCode,
  } = useSession();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Bug recorrente: usuario cancela um chamado de garcom (ou fecha o
  // bottom sheet) → `router.back()` traz pra ca → isValid ja e true
  // → o effect abaixo retorna cedo → pageState fica em 'loading'
  // PARA SEMPRE → splash "Preparando sua experiencia" trava na tela.
  // Conserto: se ja temos sessao, pula init mas refetcha settings+home
  // pra renderizar a home page imediatamente.
  //
  // CRITICO: so disparamos esse path se `isValid` JA era true no mount.
  // Se isValid transicionou false → true durante o initSession do effect
  // abaixo (mount fresh), os dois effects competiam — esse aqui forcava
  // 'home' antes da recognition completar, deixando o customer sem nome
  // ("Ola, visitante" em vez de "Ola, Caleb"). useRef captura o valor
  // inicial e nao re-renderiza, entao essa guarda nao falsifica em re-runs.
  const initialIsValidRef = useRef(isValid);
  useEffect(() => {
    if (!initialIsValidRef.current) return;
    if (!isValid) return;
    if (homeData && settings) {
      setPageState('home');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [pubSettings, home] = await Promise.all([
          apiGet<PublicSettings>(`/${slug}/settings/public`),
          apiGet<HomeData>(
            `/${slug}/home${customerId ? `?customerId=${customerId}` : ''}`,
          ),
        ]);
        if (cancelled) return;
        setSettings(pubSettings);
        setHomeData(home);
        setPageState('home');
      } catch {
        if (cancelled) return;
        // Se a refetch falhar, ainda assim sai do splash — render com
        // defaults (homeData null) e nome generico e' melhor que travar.
        setPageState('home');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isValid, slug, customerId, homeData, settings]);

  useEffect(() => {
    // Guard em tempo de montagem: se o SessionContext ja foi populado antes
    // (navegacao programatica com sessao ativa), nao reinicia. NAO colocamos
    // `isValid` nas deps porque ele vira true quando chamarmos setSession
    // dentro de initSession — e ai o effect reiniciaria, cancelando a si
    // mesmo antes de terminar a transicao.
    //
    // EXCEÇÃO: se a URL aponta pra outro tableCode que o da sessao atual,
    // o usuario escaneou QR de mesa diferente — invalida a sessao em
    // memoria pra forçar re-init. Sem isso, pedidos iam pra mesa errada
    // silenciosamente (P1-G do bug-hunt).
    if (isValid && sessionTableCode && sessionTableCode !== tableCode) {
      clearSession();
      return; // proximo render, isValid sera false e cai no fluxo normal
    }
    if (isValid) return;

    // Escopo local por mount — em StrictMode o effect roda mount→unmount→mount
    // e cada "vida" tem seu proprio cancelled + timer. Nao da para usar useRef
    // como guarda de "ja iniciei" porque ele persiste entre os dois mounts e
    // trava o segundo para sempre.
    let cancelled = false;
    let transitioned = false;

    const transitionTo = (next: PageState) => {
      if (cancelled || transitioned) return;
      transitioned = true;
      window.clearTimeout(hardCap);
      setPageState(next);
    };

    // Hard cap de 1.5s: se a splash ainda estiver visivel, mostra erro — algo
    // esta muito lento e nao da para cair na WelcomeModal sem o /session/init
    // ter terminado (o backend exige session cookie nos proximos endpoints).
    const hardCap = window.setTimeout(() => {
      if (cancelled || transitioned) return;
      transitioned = true;
      setErrorMessage('Conexão lenta. Toque para tentar novamente.');
      setPageState('error');
    }, SPLASH_MAX_MS);

    async function initSession() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const hmac = urlParams.get('hmac') || '';
        const ts = urlParams.get('ts') || '';

        const session = await apiPost<SessionResponseDto>(`/${slug}/session/init`, {
          tableCode,
          hmacSignature: hmac,
          timestamp: ts,
        });
        if (cancelled) return;

        // Persiste o sessionId para requests posteriores usarem header
        // `x-session-token` (necessario em cross-origin onde o cookie
        // httpOnly nao chega).
        setSessionToken(session.sessionId);

        setSession({
          sessionId: session.sessionId,
          tableCode: session.tableCode,
          tableLabel: session.tableLabel,
          slug,
        });

        // Warm-up do roteador assim que a sessao foi estabelecida: as duas
        // rotas que o usuario mais abre sao /cardapio e /assistente. Em 3G
        // lento o ganho e minimo e o prefetch pode bater o plano de dados,
        // por isso a porta e sempre 4g/wifi. Em browsers sem Network
        // Information API (Safari iOS) deixamos passar — baseline ja e bom.
        type NetConn = { effectiveType?: string };
        const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
          | (Navigator & { connection?: NetConn })
          | undefined;
        const effType = nav?.connection?.effectiveType;
        if (!effType || effType === '4g') {
          prefetch(`/${slug}/cardapio`);
          prefetch(`/${slug}/assistente`);
        }

        const pubSettings = await apiGet<PublicSettings>(`/${slug}/settings/public`);
        if (cancelled) return;
        setSettings(pubSettings);

        const recognitionToken = getRecognitionToken();
        if (recognitionToken) {
          try {
            const customer = await apiPost<CustomerWelcomeResponseDto>(
              `/${slug}/customer/recognize`,
              { recognitionToken },
            );
            if (cancelled) return;
            setRecognitionToken(customer.recognitionToken);
            setCustomer({
              customerId: customer.customerId,
              visitId: customer.visitId,
              name: customer.name,
              recognitionToken: customer.recognitionToken,
              isReturning: customer.isReturning,
            });

            const home = await apiGet<HomeData>(
              `/${slug}/home?customerId=${customer.customerId}`,
            );
            if (cancelled) return;
            setHomeData(home);
            transitionTo('home');
            return;
          } catch {
            /* token invalido, cai pro welcome */
          }
        }

        transitionTo('welcome');
      } catch (err) {
        if (cancelled || transitioned) return;
        transitioned = true;
        window.clearTimeout(hardCap);
        setErrorMessage(humanizeInitError(err));
        setPageState('error');
      }
    }

    initSession();

    return () => {
      cancelled = true;
      window.clearTimeout(hardCap);
    };
    // `isValid` e usado so como guard inicial, por isso fica fora das deps.
  }, [slug, tableCode, setSession, setCustomer]);

  const [hostName, setHostName] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Verifica status do participant atual (apos welcome ou rehydrate).
  // Se status='pending', renderiza PendingApprovalScreen ate o host
  // aprovar via WS. Se rejeitado, mostra mensagem terminal.
  const checkParticipantStatus = useCallback(
    async (cid: string | null): Promise<'approved' | 'pending' | 'rejected' | null> => {
      if (!cid) return null;
      try {
        const res = await apiGetExternal<ParticipantsResponse>(
          `/${slug}/table/participants`,
        );
        const me = res.participants.find((p) => p.customerId === cid);
        const host = res.participants.find((p) => p.isHost);
        setHostName(host?.name ?? null);
        setIsHost(!!me?.isHost);
        return me?.status ?? null;
      } catch {
        return null;
      }
    },
    [slug],
  );

  const handleWelcomeComplete = useCallback(
    async (customer: CustomerWelcomeResponseDto | null) => {
      try {
        const cid = customer?.customerId;
        // Checa status: se pending, host_customer_id ja existe e o
        // customer entrou na fila — mostra tela de espera ate o host
        // decidir.
        const status = await checkParticipantStatus(cid ?? null);
        if (status === 'pending') {
          setPageState('pending_approval');
          return;
        }
        if (status === 'rejected') {
          setErrorMessage(
            'O host da mesa não autorizou sua entrada. Tente outra mesa ou peça ao garçom.',
          );
          setPageState('error');
          return;
        }
        const url = cid ? `/${slug}/home?customerId=${cid}` : `/${slug}/home`;
        const home = await apiGet<HomeData>(url);
        setHomeData(home);
        setPageState('home');
      } catch {
        setPageState('home');
      }
    },
    [slug, checkParticipantStatus],
  );

  const handleAssistantSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      push(`/${slug}/assistente?prefill=${encodeURIComponent(trimmed)}`);
    },
    [slug, push],
  );

  if (pageState === 'loading') {
    return <SplashS1 restaurantName={settings?.restaurantName ?? null} tableLabel={null} />;
  }

  if (pageState === 'error') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-[15px] text-danger">{errorMessage}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border-[1.3px] border-ink bg-bg px-6 py-2.5 text-[14px] font-semibold text-ink"
        >
          Tentar novamente
        </button>
        <p className="text-[12px] text-mute">Ou escaneie o QR Code novamente.</p>
      </main>
    );
  }

  if (pageState === 'pending_approval') {
    return (
      <PendingApprovalScreen
        hostName={hostName}
        onApproved={async () => {
          // Quando aprovado, recarrega home com customerId.
          try {
            const url = customerId
              ? `/${slug}/home?customerId=${customerId}`
              : `/${slug}/home`;
            const home = await apiGet<HomeData>(url);
            setHomeData(home);
          } catch {
            /* ignore */
          }
          setPageState('home');
        }}
      />
    );
  }

  if (pageState === 'welcome') {
    return (
      <main className="min-h-dvh bg-bg">
        <WelcomeModal
          slug={slug}
          restaurantName={settings?.restaurantName || 'Restaurante'}
          onComplete={handleWelcomeComplete}
        />
      </main>
    );
  }

  const restaurantName =
    settings?.restaurantName || homeData?.restaurantName || 'Restaurante';
  const tableLabel = homeData?.tableLabel || '';
  const isReturning = homeData?.isReturning;
  const lastItems = homeData?.lastVisitSummary?.last_items ?? [];
  const firstName = customerName?.split(' ')[0] ?? 'visitante';

  const heroMessage = homeData?.heroMessage ?? defaultHeroMessage(firstName, restaurantName);

  const returningHighlight =
    isReturning && lastItems.length > 0
      ? buildReturningMessage(firstName, lastItems)
      : null;

  return (
    <AppShell
      slug={slug}
      restaurantName={restaurantName}
      logoUrl={settings?.logoUrl || null}
      tableLabel={tableLabel}
      variant="default"
      activeHref={`/${slug}/mesa/${tableCode}`}
      noMainPadding
    >
      {/* Modal flutuante so pra host: lista pendentes e oferece
          aprovar/rejeitar. Desaparece sozinho quando nao tem
          ninguem pendente. */}
      {isHost && <HostApprovalModal slug={slug} />}
      <div className="flex flex-1 flex-col justify-center gap-3.5 px-6 pb-8">
        <div className="flex flex-col items-center gap-3">
          <PillButton onClick={() => push(`/${slug}/garcom/chamar`)}>
            Chamar garçom
          </PillButton>
          <PillButton onClick={() => push(`/${slug}/cardapio`)}>
            Ver cardápio
          </PillButton>
          {isReturning && lastItems.length > 0 && (
            <PillButton
              variant="filled"
              onClick={() => push(`/${slug}/cardapio?repeat=1`)}
            >
              ↻ Repetir última visita
            </PillButton>
          )}
        </div>

        <HomeHero
          message={returningHighlight ?? heroMessage}
          kicker={isReturning ? 'Assistente · reconheceu você' : 'Assistente'}
        />
      </div>

      <div className="px-6 pb-safe pb-8">
        <LiquidGlassInput
          placeholder="Digite aqui"
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleAssistantSubmit}
        />
      </div>
    </AppShell>
  );
}

function SplashS1({
  restaurantName,
  tableLabel,
}: {
  restaurantName: string | null;
  tableLabel: string | null;
}) {
  const initials = getInitials(restaurantName, 'TL');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-bg px-6 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] border-[1.5px] border-ink text-[24px] font-bold tracking-[-1px]">
        {initials}
      </div>
      <div>
        <div className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
          {restaurantName ?? 'Restaurante'}
        </div>
        {tableLabel && (
          <div className="mt-1 text-[11px] uppercase tracking-[2px] text-mute">
            {tableLabel}
          </div>
        )}
      </div>
      <div className="mt-5">
        <div className="mb-3.5 flex justify-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="inline-block h-[7px] w-[7px] animate-bounce-dot rounded-full bg-ink"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <p className="text-[13px] text-mute">Preparando sua experiência</p>
      </div>
    </main>
  );
}

/**
 * Traduz erros do init session para copy humano. O backend retorna mensagens
 * cruas do class-validator (ex.: "hmacSignature should not be empty,
 * timestamp should not be empty") que vazariam pro usuario se enviassemos
 * `err.message` direto. Mapeamos os casos conhecidos pra texto curto em pt-BR.
 */
function humanizeInitError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : 'Erro ao iniciar sessão.';
  const isValidatorBag =
    /should not be empty/i.test(raw) ||
    /must be a string/i.test(raw) ||
    /must be longer/i.test(raw) ||
    /hmacSignature|timestamp/i.test(raw);
  if (isValidatorBag) {
    return 'QR Code invalido. Escaneie novamente o codigo da mesa.';
  }
  if (/QR Code invalido|expirado/i.test(raw)) {
    return raw;
  }
  if (/Mesa inativa|Mesa nao encontrada/i.test(raw)) {
    return raw;
  }
  if (/Conexão lenta|Conexao lenta/i.test(raw)) {
    return raw;
  }
  // Fallback genérico — não vaza nada técnico.
  return 'Não foi possível iniciar a sessão. Tente novamente.';
}

function defaultHeroMessage(firstName: string, restaurantName: string) {
  return `Olá, ${firstName}. Seja bem-vindo ao ${restaurantName}. Posso ajudar com sugestões, ingredientes, pedido e pagamento.`;
}

function buildReturningMessage(firstName: string, lastItems: { name: string }[]) {
  const primary = lastItems[0]?.name ?? '';
  const secondary = lastItems[1]?.name;
  if (primary && secondary) {
    return `Bem-vindo de volta, ${firstName}. Da última vez você escolheu ${primary} e ${secondary}. Posso sugerir algo parecido ou mostrar novidades.`;
  }
  if (primary) {
    return `Bem-vindo de volta, ${firstName}. Da última vez você escolheu ${primary}. Posso sugerir algo parecido ou mostrar novidades.`;
  }
  return `Bem-vindo de volta, ${firstName}. Posso sugerir algo parecido à sua última visita ou mostrar novidades.`;
}
