'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Pagina de PIN pras TVs Cozinha+Bar. Form simples:
 *  - Recebe PIN
 *  - POST pra /api/tv-unlock
 *  - Em sucesso, redirect pra `next` (default /cozinha/tv)
 *
 * NAO substitui um sistema de auth maduro — e um gate basico pra
 * cobrir o "cliente que digitou /cozinha/tv no celular ve o KDS".
 * P1-F backlog continua pra refactor PIN/JWT real.
 */
function TvUnlockContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/cozinha/tv';

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Desbloquear TV';
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tv-unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        setError('PIN invalido');
        setSubmitting(false);
        return;
      }
      router.replace(next);
    } catch {
      setError('Falha ao verificar PIN');
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b0b14',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Desbloquear TV</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
        Digite o PIN configurado pelo gerente.
      </p>
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 320 }}
      >
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            border: '1.5px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff',
            fontSize: 18,
            fontFamily: 'inherit',
            letterSpacing: 4,
            textAlign: 'center',
          }}
        />
        {error && <div style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={submitting || !pin.trim()}
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            border: 'none',
            background: submitting ? 'rgba(255,255,255,0.3)' : '#fff',
            color: '#0b0b14',
            fontSize: 16,
            fontWeight: 700,
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? 'Verificando…' : 'Desbloquear'}
        </button>
      </form>
    </main>
  );
}

export default function TvUnlockPage() {
  return (
    <Suspense fallback={null}>
      <TvUnlockContent />
    </Suspense>
  );
}
