'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiPost } from '../../../../lib/api';
import { getRecognitionToken, setRecognitionToken } from '../../../../lib/storage';
import { SessionProvider } from '../../../../providers/SessionProvider';
import { useSession } from '../../../../hooks/useSession';
import { WelcomeModal } from '../../../../components/welcome/WelcomeModal';
import type { SessionResponseDto, CustomerWelcomeResponseDto } from '@restaurant/shared-types';

type PageState = 'loading' | 'welcome' | 'home' | 'error';

function MesaPageInner() {
  const params = useParams<{ slug: string; tableCode: string }>();
  const slug = params.slug;
  const tableCode = params.tableCode;

  const { setSession, setCustomer, isValid } = useSession();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isValid) return; // Sessao ja iniciada

    async function initSession() {
      try {
        // Extrair HMAC da URL (query params)
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

        // Verifica se tem recognition token
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

            setPageState('home');
            return;
          } catch {
            // Token invalido — mostra modal
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
    (_customer: CustomerWelcomeResponseDto | null) => {
      setPageState('home');
    },
    [],
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
          restaurantName="Restaurante"
          onComplete={handleWelcomeComplete}
        />
      </main>
    );
  }

  // pageState === 'home'
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-hero font-bold">Home do restaurante</h1>
      <p className="mt-2 text-gray-500">Sprint 2 implementara esta tela.</p>
    </main>
  );
}

export default function MesaPage() {
  return (
    <SessionProvider>
      <MesaPageInner />
    </SessionProvider>
  );
}
