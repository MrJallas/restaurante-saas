'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, KeyRound, Save } from 'lucide-react';
import { defaultTenantSlug, staffAuthResetPin } from '../../../lib/api';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export default function StaffForgotResetPage() {
  const router = useRouter();
  const tenantSlug = useMemo(() => defaultTenantSlug(), []);
  const [resetToken, setResetToken] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = window.sessionStorage.getItem('staffResetToken') ?? '';
    setResetToken(token);
    if (!token) router.replace('/forgot');
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (pin !== confirmPin) {
      setError('Os PINs não conferem.');
      return;
    }
    setSubmitting(true);
    try {
      await staffAuthResetPin(tenantSlug, { resetToken, pin });
      window.sessionStorage.removeItem('staffResetToken');
      window.sessionStorage.removeItem('staffRecoveryCpf');
      window.sessionStorage.setItem('staffLoginFlash', 'PIN atualizado.');
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o PIN.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
      <section className="w-full max-w-[420px] rounded-lg border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/forgot/verify"
            aria-label="Voltar"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400 text-zinc-950">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal text-white">Novo PIN</h1>
            <p className="text-sm text-zinc-400">Equipe · {tenantSlug}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">PIN</span>
            <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 focus-within:border-cyan-300">
              <KeyRound className="h-4 w-4 text-zinc-500" />
              <input
                value={pin}
                onChange={(event) => setPin(onlyDigits(event.target.value).slice(0, 6))}
                inputMode="numeric"
                type={showPin ? 'text' : 'password'}
                className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
                placeholder="1234"
              />
              <button
                type="button"
                onClick={() => setShowPin((value) => !value)}
                aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">Confirmar PIN</span>
            <input
              value={confirmPin}
              onChange={(event) => setConfirmPin(onlyDigits(event.target.value).slice(0, 6))}
              inputMode="numeric"
              type={showPin ? 'text' : 'password'}
              className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-cyan-300"
              placeholder="1234"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || pin.length < 4 || confirmPin.length < 4}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Salvando...' : 'Salvar PIN'}
          </button>
        </form>
      </section>
    </main>
  );
}
