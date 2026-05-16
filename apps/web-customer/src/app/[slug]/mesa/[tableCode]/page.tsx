'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { apiPost, apiGet } from '../../../../lib/api';
import { clearDeliveredContinuationHint } from '../../../../lib/continuationHints';
import { recordCustomerEvent } from '../../../../lib/customerEvents';
import { setSessionToken } from '../../../../lib/storage';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { useTableSocket } from '../../../../hooks/useTableSocket';
import { useUIState } from '../../../../providers/UIStateProvider';
import { useZonePause } from '../../../../hooks/useZonePause';
import { WelcomeModal } from '../../../../components/welcome/WelcomeModal';
import { AppShell } from '../../../../components/layout/AppShell';
import { HomeHero } from '../../../../components/home/HomeHero';
import { PillButton } from '../../../../components/ui/PillButton';
import { SoftInput } from '../../../../components/ui/SoftInput';
import { HostApprovalModal } from '../../../../components/host/HostApprovalModal';
import { HostJoinRequestBanner } from '../../../../components/host/HostJoinRequestBanner';
import { ScreenCustomerWaitingApproval } from '../../../../screens/customer-host-flows/ScreenCustomerWaitingApproval';
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
  continuationMessage?: {
    id?: string;
    kind?: string;
    template?: string;
    rendered?: string;
    subtitle?: string | null;
  } | null;
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
  // Identidade visual e monocromatica (preto+branco). Tenants so
  // customizam colorAccent; colorPrimary/colorSecondary deixaram de
  // ser aplicados no DOM ha tempos.
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
  const { openCallWaiterSheet } = useUIState();
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
    tableLabel: sessionTableLabel,
  } = useSession();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [homeInputFocused, setHomeInputFocused] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [reclaimBanner, setReclaimBanner] = useState(false);
  const [sessionResetNonce, setSessionResetNonce] = useState(0);

  // P1 #21: zone-pause active no DB ja era invisivel no customer side
  // (sem WS scoped ao session room nem polling). Ativamos polling de
  // 30s so depois que tem sessao + customer (i.e., pageState === 'home')
  // pra nao bater no endpoint enquanto o welcome modal nao fechou.
  const activePause = useZonePause(slug, {
    enabled: pageState === 'home',
  });

  useEffect(() => {
    if (pageState !== 'home') return;
    recordCustomerEvent(slug, 'session_resumed', {
      tableCode,
      customerId: customerId ?? null,
    });
  }, [pageState, slug, tableCode, customerId]);

  useEffect(() => {
    if (!homeInputFocused || typeof window === 'undefined') {
      setKeyboardInset(0);
      return;
    }

    const viewport = window.visualViewport;
    const updateKeyboardInset = () => {
      const nextInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setKeyboardInset(Math.round(nextInset));
    };

    updateKeyboardInset();
    viewport?.addEventListener('resize', updateKeyboardInset);
    viewport?.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('resize', updateKeyboardInset);

    return () => {
      viewport?.removeEventListener('resize', updateKeyboardInset);
      viewport?.removeEventListener('scroll', updateKeyboardInset);
      window.removeEventListener('resize', updateKeyboardInset);
    };
  }, [homeInputFocused]);

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
    if (sessionTableCode && sessionTableCode !== tableCode) return;
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
        // Round 21 §G: defesa contra heroMessage vazio do BE. Antes,
        // qualquer falha de template render ou timeout silencioso
        // resultava em fallback `defaultHeroMessage` (sempre a mesma
        // string) — user via "Olá, Caleb! Posso ajudar..." TODAS as
        // vezes em vez do pool de 35 templates rotativos.
        if (!home || !home.heroMessage || home.heroMessage.trim().length === 0) {
          // eslint-disable-next-line no-console
          console.warn('[mesa] /home retornou heroMessage vazio — caindo no fallback estático', { home });
        }
        setHomeData(home);
        clearDeliveredContinuationHint(home?.continuationMessage?.kind);
        setPageState('home');
      } catch (err) {
        if (cancelled) return;
        // Antes (silent catch) o user nunca sabia que o /home falhou —
        // a tela mostrava texto genérico forever. Agora logamos no
        // console pro dev pegar via Safari Web Inspector.
        // eslint-disable-next-line no-console
        console.error('[mesa] /home failed — usando defaultHeroMessage:', err);
        setPageState('home');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isValid, slug, customerId, homeData, settings, sessionTableCode, tableCode]);

  useEffect(() => {
    // Guard em tempo de montagem: se o SessionContext ja foi populado antes
    // (navegacao programatica com sessao ativa), nao reinicia. Usamos o valor
    // inicial em ref para o init nao ser cancelado pelo proprio setSession.
    if (initialIsValidRef.current && sessionResetNonce === 0) return;

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

        // Auto-recognize via httpOnly cookie (server reads req.cookies)
        {
          try {
            const customer = await apiPost<CustomerWelcomeResponseDto>(
              `/${slug}/customer/recognize`,
              {},
            );
            if (cancelled) return;
            if (!customer || !customer.customerId) {
              throw new Error('not recognized');
            }
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
            clearDeliveredContinuationHint(home?.continuationMessage?.kind);
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
  }, [slug, tableCode, setSession, setCustomer, prefetch, sessionResetNonce]);

  useEffect(() => {
    // Se a URL aponta pra outro tableCode que o da sessao atual, o usuario
    // escaneou QR de mesa diferente: invalida a sessao e força novo init.
    if (!isValid || !sessionTableCode || sessionTableCode === tableCode) return;
    initialIsValidRef.current = false;
    clearSession();
    setPageState('loading');
    setSessionResetNonce((n) => n + 1);
  }, [clearSession, isValid, sessionTableCode, tableCode]);

  const [hostName, setHostName] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Verifica status do participant atual (apos welcome ou rehydrate).
  // Se status='pending', renderiza PendingApprovalScreen ate o host
  // aprovar via WS. Se rejeitado, mostra mensagem terminal.
  const checkParticipantStatus = useCallback(
    async (cid: string | null): Promise<'approved' | 'pending' | 'rejected' | null> => {
      if (!cid) return null;
      try {
        const res = await apiGet<ParticipantsResponse>(
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
        if (customer?.wasReclaim) {
          setReclaimBanner(true);
          setTimeout(() => setReclaimBanner(false), 5000);
        }
        const url = cid ? `/${slug}/home?customerId=${cid}` : `/${slug}/home`;
        const home = await apiGet<HomeData>(url);
        setHomeData(home);
        clearDeliveredContinuationHint(home?.continuationMessage?.kind);
        setPageState('home');
      } catch {
        setPageState('home');
      }
    },
    [slug, checkParticipantStatus],
  );

  // Round 19 — bug fix: on the recognize path (returning customer cookie),
  // the original flow set `pageState='home'` without ever calling
  // `checkParticipantStatus`. Result: the host wouldn't see the join
  // request banner (or the legacy HostApprovalModal) on reload, because
  // `isHost` was never set, and a non-host returning customer with
  // status='pending' would skip past `pending_approval` straight to home.
  //
  // This effect runs whenever the recognize path hands us a customerId
  // but the participant status hasn't been resolved yet (isHost still
  // false AND hostName null). It re-evaluates and either redirects into
  // the waiting screen or unlocks the host UI.
  useEffect(() => {
    if (pageState !== 'home') return;
    if (!customerId) return;
    // Re-check only when we haven't already determined host/non-host.
    // After the first run isHost flips true OR hostName populates;
    // either way we don't loop.
    if (isHost || hostName) return;
    let cancelled = false;
    (async () => {
      const status = await checkParticipantStatus(customerId);
      if (cancelled) return;
      if (status === 'pending') {
        setPageState('pending_approval');
      } else if (status === 'rejected') {
        setErrorMessage(
          'O host da mesa não autorizou sua entrada. Tente outra mesa ou peça ao garçom.',
        );
        setPageState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageState, customerId, isHost, hostName, checkParticipantStatus]);

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
    // Round 19 — V20 canon LOCKED waiting screen (ScreenCustomerWaitingApproval)
    // substitui o legacy `PendingApprovalScreen` (V13 dots + título "Aguardando
    // aprovação"). Per user ask: "a tela de espera do outro cliente tentando
    // entrar na mesa tambem tem que existir". Mode='late-arrival' usa o copy
    // canon ("Esperando aprovação · {host} foi avisado").
    //
    // System A (participant) não emite `late_arrival.approved` — usa
    // `participant:decision`. Logo, este wrapper escuta via useTableSocket
    // diretamente e força `setPageState('home')` quando o decision chegar.
    return (
      <PendingApprovalWrapper
        slug={slug}
        hostName={hostName}
        onApproved={async () => {
          try {
            const url = customerId
              ? `/${slug}/home?customerId=${customerId}`
              : `/${slug}/home`;
            const home = await apiGet<HomeData>(url);
            setHomeData(home);
            clearDeliveredContinuationHint(home?.continuationMessage?.kind);
          } catch {
            /* ignore */
          }
          setPageState('home');
        }}
        onRejected={() => {
          setErrorMessage(
            'O host da mesa não autorizou sua entrada. Tente outra mesa ou peça ao garçom.',
          );
          setPageState('error');
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
          tableLabel={sessionTableLabel || undefined}
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
  const continuationMessage = homeData?.continuationMessage;
  const continuationText =
    typeof continuationMessage?.rendered === 'string' && continuationMessage.rendered.trim()
      ? continuationMessage.rendered
      : typeof continuationMessage?.template === 'string' && continuationMessage.template.trim()
        ? continuationMessage.template
        : null;
  const homeHeroMessage = continuationText ?? returningHighlight ?? heroMessage;
  const homeHeroKicker = continuationMessage?.subtitle
    ? `Assistente · ${continuationMessage.subtitle}`
    : isReturning
      ? 'Assistente · reconheceu você'
      : 'Assistente';
  const keyboardAccessoryOffset =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
      ? 112
      : 0;
  const focusedInputBottom = `calc(${Math.max(
    keyboardInset,
    keyboardAccessoryOffset,
  )}px + max(env(safe-area-inset-bottom), 12px))`;

  return (
    <AppShell
      slug={slug}
      restaurantName={restaurantName}
      tableLabel={tableLabel}
      variant="default"
      activeHref={`/${slug}/mesa/${tableCode}`}
      noMainPadding
    >
      {/* Round 19 — banner clicável V20 ("X quer entrar · →") pra deep-link
          na tela cheia /host/approve/participant. Modal bottom legacy fica
          como atalho inline pra hosts que preferem decidir sem deixar a
          home. Os dois rendem o mesmo dado (`/table/participants`) e
          escutam o mesmo WS — ambos somem quando não há pendentes. */}
      {isHost && <HostJoinRequestBanner slug={slug} />}
      {/* Modal flutuante so pra host: lista pendentes e oferece
          aprovar/rejeitar. Desaparece sozinho quando nao tem
          ninguem pendente. */}
      {isHost && <HostApprovalModal slug={slug} />}
      {reclaimBanner && (
        // Round 4: amber/yellow do V13 trocado pelo discreet hint canon V20
        // (border-soft + surface + mono eyebrow). Mantém a mesma intenção
        // — alertar customer caso reclaim do CPF não foi ele — sem o tom
        // de error que o amber dava.
        <div
          role="status"
          data-testid="reclaim-banner"
          className="mx-[22px] mt-3 flex items-start gap-2.5 rounded-[12px] border border-border-soft bg-surface px-3.5 py-3 text-[12px] leading-[1.5] text-ink text-pretty"
        >
          <span
            aria-hidden
            className="mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.2px] border-ink/60 text-[11px] font-semibold leading-none text-ink/70"
          >
            !
          </span>
          <span className="flex-1">
            <span className="block font-mono text-[10px] uppercase tracking-[1.5px] text-mute">
              Conta reconhecida
            </span>
            <span className="mt-1 block">
              Bem-vindo de volta. Se não foi você quem fez login agora, é só
              avisar o garçom.
            </span>
          </span>
        </div>
      )}
      <div className="flex flex-1 flex-col justify-center gap-3.5 px-6 pb-8">
        <div className="flex flex-col items-center gap-3">
          <PillButton onClick={openCallWaiterSheet}>
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
          message={homeHeroMessage}
          kicker={homeHeroKicker}
        />
      </div>

      <div className="px-6 pb-safe pb-8">
        <div
          className={
            homeInputFocused
              ? 'fixed inset-x-0 z-40 mx-auto w-full max-w-[420px] px-6 transition-[bottom] duration-150 ease-out'
              : undefined
          }
          style={
            homeInputFocused
              ? {
                  bottom: focusedInputBottom,
                }
              : undefined
          }
        >
          <SoftInput
            placeholder={
              homeInputFocused ? 'Escreva sua mensagem...' : 'Digite aqui'
            }
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleAssistantSubmit}
            onFocusChange={setHomeInputFocused}
            multiline
            scrollOnFocus={false}
            maxLength={2000}
          />
        </div>
        {homeInputFocused && <div aria-hidden className="h-[88px]" />}
        {activePause && (
          // Hint sub-banner discreto (mono caps tiny) — alinhado ao
          // contrato do spec (silent ETA inflation; sem badge ou banner
          // chamativo) mas garante que QA pode observar a feature
          // funcionando ao inves de "nada renderiza" como antes.
          <div className="mt-3 text-center text-[9.5px] font-semibold uppercase tracking-[1.5px] text-faint">
            Pedidos com tempo de preparo um pouco maior agora
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Round 19 wrapper · monta o V20 canon `ScreenCustomerWaitingApproval`
 * (mode='late-arrival') em cima do contrato WS do System A (participants).
 * Listens para `participant:decision` e bridgea pro callback do mount —
 * o V20 canon LOCKED não pode ser editado pra reconhecer
 * `participant:decision` diretamente, então mantemos o wiring aqui.
 */
function PendingApprovalWrapper({
  slug,
  hostName,
  onApproved,
  onRejected,
}: {
  slug: string;
  hostName: string | null;
  onApproved: () => void;
  onRejected: () => void;
}) {
  const { sessionId, customerId } = useSession();

  useTableSocket(sessionId, (event, data) => {
    if (event !== 'participant:decision') return;
    const payload = data as { customerId: string; status: string };
    if (payload.customerId !== customerId) return;
    if (payload.status === 'approved') onApproved();
    else if (payload.status === 'rejected') onRejected();
  });

  // Fallback poll: same 8s cadência do legacy PendingApprovalScreen.
  // Useful pra casos onde o WS dropou silenciosamente.
  useEffect(() => {
    if (!sessionId || !customerId) return;
    const tick = setInterval(async () => {
      try {
        const res = await apiGet<{
          participants: { customerId: string; status: string }[];
        }>(`/${slug}/table/participants`);
        const me = res.participants.find((p) => p.customerId === customerId);
        if (me?.status === 'approved') onApproved();
        else if (me?.status === 'rejected') onRejected();
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(tick);
  }, [slug, sessionId, customerId, onApproved, onRejected]);

  return (
    <ScreenCustomerWaitingApproval
      slug={slug}
      mode="late-arrival"
      hostName={hostName}
      // Sem requestId nem expiresAt: o System A não tem TTL (host pode
      // demorar). O ScreenCustomerWaitingApproval cai num eyebrow sem
      // contagem ("Aguardando host da mesa") quando expiresAt é null —
      // o canon V20 já cobre esse cenário (linhas 158-181 do screen).
      requestId={null}
      expiresAt={null}
    />
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
