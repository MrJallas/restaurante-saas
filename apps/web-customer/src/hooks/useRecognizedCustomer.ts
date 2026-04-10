'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiPost } from '../lib/api';
import { getRecognitionToken } from '../lib/storage';
import type { CustomerWelcomeResponseDto } from '@restaurant/shared-types';

interface UseRecognizedCustomerResult {
  isRecognized: boolean;
  customer: CustomerWelcomeResponseDto | null;
  isLoading: boolean;
  error: string | null;
}

export function useRecognizedCustomer(slug: string | null): UseRecognizedCustomerResult {
  const [isRecognized, setIsRecognized] = useState(false);
  const [customer, setCustomer] = useState<CustomerWelcomeResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error] = useState<string | null>(null);

  const tryRecognize = useCallback(async () => {
    if (!slug) {
      setIsLoading(false);
      return;
    }

    const token = getRecognitionToken();

    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await apiPost<CustomerWelcomeResponseDto>(`/${slug}/customer/recognize`, {
        recognitionToken: token,
      });
      setCustomer(result);
      setIsRecognized(true);
    } catch {
      // Token invalido ou expirado — nao e erro, so nao reconheceu
      setIsRecognized(false);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    tryRecognize();
  }, [tryRecognize]);

  return { isRecognized, customer, isLoading, error };
}
