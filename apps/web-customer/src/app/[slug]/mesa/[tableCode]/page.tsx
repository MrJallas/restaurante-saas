'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiPost, apiGet } from '../../../../lib/api';
import { getRecognitionToken, setRecognitionToken } from '../../../../lib/storage';
import { SessionProvider } from '../../../../providers/SessionProvider';
import { useSession } from '../../../../hooks/useSession';
import { WelcomeModal } from '../../../../components/welcome/WelcomeModal';
import { AppShell } from '../../../../components/layout/AppShell';
import { AiMessageHero } from '../../../../components/home/AiMessageHero';
import { QuickActionButtons } from '../../../../components/home/QuickActionButtons';
import { HighlightCards } from '../../../../components/home/HighlightCards';
import { LastVisitBanner } from '../../../../components/home/LastVisitBanner';
import type { SessionResponseDto, CustomerWelcomeResponseDto } from '@restaurant/shared-types';

type PageState = 'loading' | 'welcome' | 'home' | 'error';

interface HomeData {
  heroMessage: string;
  restaurantName: string;
  tableLabel: string;
  highlights: { id: string; name: string; shortDescription: string | null; priceCents: number; imageUrl: string | null; badge: string | null }[];
  quickActions: { id: string; label: string; icon: string; href: string }[];
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

function MesaPageInner() {
  const params = useParams<{ slug: string; tableCode: string }>();
  const slug = params.slug;
  const tableCode = params.tableCode;

  const { setSession, setCustomer, isValid } = useSession();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => {
    if (isValid) return;

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

        setSession({
          sessionId: session.sessionId,
          tableCode: session.tableCode,
          tableLabel: session.tableLabel,
          slug,
        });

        // Carrega settings
        const pubSettings = await apiGet<PublicSettings>(`/${slug}/settings/public`);
        setSettings(pubSettings);

        // Aplica theme
        const root = document.documentElement;
        root.style.setProperty('--color-primary', pubSettings.colorPrimary);
        root.style.setProperty('--color-secondary', pubSettings.colorSecondary);
        root.style.setProperty('--color-accent', pubSettings.colorAccent);
        root.style.setProperty('--font-hero', `'${pubSettings.fontHero}', sans-serif`);
        root.style.setProperty('--font-body', `'${pubSettings.fontBody}', sans-serif`);

        // Verifica recognition token
        const recognitionToken = getRecognitionToken();
        if (recognitionToken) {
          try {
            const customer = await apiPost<CustomerWelcomeResponseDto>(
              `/${slug}/customer/recognize`,
              { recognitionToken },
            );
            setRecognitionToken(customer.recognitionToken);
            setCustomer({
              customerId: customer.customerId,
              visitId: customer.visitId,
              name: customer.name,
              recognitionToken: customer.recognitionToken,
              isReturning: customer.isReturning,
            });

            // Carrega home com customer
            const home = await apiGet<HomeData>(
              `/${slug}/home?customerId=${customer.customerId}`,
            );
            setHomeData(home);
            setPageState('home');
            return;
          } catch {
            // Token invalido
          }
        }

        setPageState('welcome');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Erro ao iniciar sessao.');
        setPageState('error');
      }
    }

    initSession();
  }, [slug, tableCode, isValid, setSession, setCustomer]);

  const handleWelcomeComplete = useCallback(
    async (customer: CustomerWelcomeResponseDto | null) => {
      try {
        const cid = customer?.customerId;
        const url = cid ? `/${slug}/home?customerId=${cid}` : `/${slug}/home`;
        const home = await apiGet<HomeData>(url);
        setHomeData(home);
        setPageState('home');
      } catch {
        setPageState('home');
      }
    },
    [slug],
  );

  if (pageState === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
        <p className="mt-4 text-lg text-white/80">Preparando sua experiencia...</p>
      </main>
    );
  }

  if (pageState === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-lg text-red-600">{errorMessage}</p>
        <p className="mt-2 text-sm text-gray-500">Escaneie o QR Code novamente.</p>
      </main>
    );
  }

  if (pageState === 'welcome') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-primary">
        <WelcomeModal
          slug={slug}
          restaurantName={settings?.restaurantName || 'Restaurante'}
          onComplete={handleWelcomeComplete}
        />
      </main>
    );
  }

  // Home
  return (
    <AppShell
      slug={slug}
      restaurantName={settings?.restaurantName || homeData?.restaurantName || 'Restaurante'}
      logoUrl={settings?.logoUrl || null}
      tableLabel={homeData?.tableLabel || ''}
    >
      <div className="space-y-5">
        {homeData?.heroMessage && (
          <AiMessageHero
            message={homeData.heroMessage}
            onTypingComplete={() => setTypingDone(true)}
          />
        )}

        {homeData?.quickActions && (
          <QuickActionButtons
            actions={homeData.quickActions}
            visible={typingDone}
            slug={slug}
          />
        )}

        {homeData?.isReturning && homeData?.lastVisitSummary?.last_items && (
          <LastVisitBanner
            lastItems={homeData.lastVisitSummary.last_items}
            slug={slug}
          />
        )}

        {homeData?.highlights && (
          <HighlightCards items={homeData.highlights} slug={slug} />
        )}
      </div>
    </AppShell>
  );
}

export default function MesaPage() {
  return (
    <SessionProvider>
      <MesaPageInner />
    </SessionProvider>
  );
}
