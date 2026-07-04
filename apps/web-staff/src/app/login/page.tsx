'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound, LogIn, UserRound } from 'lucide-react';
import {
  defaultTenantSlug,
  homeForStaffRole,
  readStaffSession,
  saveStaffSession,
  staffAuthLogin,
} from '../../lib/api';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export default function StaffLoginPage() {
  const router = useRouter();
  const tenantSlug = useMemo(() => defaultTenantSlug(), []);
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const session = readStaffSession();
    if (session) router.replace(homeForStaffRole(session.staffRole));
    const flash = window.sessionStorage.getItem('staffLoginFlash');
    if (flash) {
      setNotice(flash);
      window.sessionStorage.removeItem('staffLoginFlash');
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await staffAuthLogin(tenantSlug, {
        cpf: onlyDigits(cpf),
        pin,
      });
      saveStaffSession(
        {
          staffId: result.headers.staffId,
          staffRole: result.headers.staffRole,
          staffName: result.staff.name,
        },
        remember,
      );
      // Reset do gerente (TROCAR-PIN 2026-07-04): PIN temporário obriga a
      // troca antes de liberar o app — o backend também manda nextPath
      // '/trocar-pin', mas a flag é o contrato explícito.
      if (result.mustChangePin) {
        router.replace('/trocar-pin');
        return;
      }
      router.replace(result.nextPath || homeForStaffRole(result.staff.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
      <section className="w-full max-w-[420px] rounded-lg border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
            <LogIn className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal text-white">Entrar</h1>
            <p className="text-sm text-zinc-400">Equipe · {tenantSlug}</p>
          </div>
        </div>

        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">CPF</span>
            <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 focus-within:border-emerald-400">
              <UserRound className="h-4 w-4 text-zinc-500" />
              <input
                value={cpf}
                onChange={(event) => setCpf(onlyDigits(event.target.value).slice(0, 11))}
                inputMode="numeric"
                autoComplete="username"
                className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
                placeholder="90000000001"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">PIN</span>
            <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 focus-within:border-emerald-400">
              <KeyRound className="h-4 w-4 text-zinc-500" />
              <input
                value={pin}
                onChange={(event) => setPin(onlyDigits(event.target.value).slice(0, 6))}
                inputMode="numeric"
                autoComplete="current-password"
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

          <div className="flex items-center justify-between gap-3">
            <label className="flex min-w-0 items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 accent-emerald-400"
              />
              Manter conectado
            </label>
            <Link
              href="/forgot"
              className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
            >
              Recuperar PIN
            </Link>
          </div>

          <button
            type="submit"
            disabled={submitting || cpf.length !== 11 || pin.length < 4}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            <LogIn className="h-4 w-4" />
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
