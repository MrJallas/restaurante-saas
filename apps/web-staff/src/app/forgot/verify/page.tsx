'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { defaultTenantSlug, staffAuthVerifyForgot } from '../../../lib/api';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export default function StaffForgotVerifyPage() {
  const router = useRouter();
  const tenantSlug = useMemo(() => defaultTenantSlug(), []);
  const [cpf, setCpf] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedCpf = window.sessionStorage.getItem('staffRecoveryCpf') ?? '';
    const devCode = window.sessionStorage.getItem('staffRecoveryDevCode') ?? '';
    setCpf(storedCpf);
    setCode(devCode);
    if (!storedCpf) router.replace('/forgot');
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await staffAuthVerifyForgot(tenantSlug, {
        cpf,
        code: onlyDigits(code),
      });
      window.sessionStorage.setItem('staffResetToken', result.resetToken);
      window.sessionStorage.removeItem('staffRecoveryDevCode');
      router.push('/forgot/reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar o código.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
      <section className="w-full max-w-[420px] rounded-lg border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/forgot"
            aria-label="Voltar"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400 text-zinc-950">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal text-white">Validar código</h1>
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
            <span className="mb-1 block text-sm font-medium text-zinc-200">Código</span>
            <input
              value={code}
              onChange={(event) => setCode(onlyDigits(event.target.value).slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-center font-mono text-lg tracking-[0.25em] text-white outline-none placeholder:text-zinc-600 focus:border-cyan-300"
              placeholder="000000"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            <ShieldCheck className="h-4 w-4" />
            {submitting ? 'Validando...' : 'Validar'}
          </button>
        </form>
      </section>
    </main>
  );
}
