'use client';

// /trocar-pin — troca de PIN logado (pacote TROCAR-PIN, decisões Caleb
// 2026-07-04). Dois caminhos chegam aqui:
//   1. Voluntário: item "Trocar PIN" nos perfis (manager/waiter).
//   2. Forçado: login com PIN temporário (reset do gerente) devolve
//      mustChangePin=true + nextPath '/trocar-pin'.
// O POST vai pro proxy com o cookie httpOnly; o backend revoga TODAS as
// sessões e o proxy troca o cookie pelo token novo — o usuário segue
// logado aqui, mas qualquer outro device cai.

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import {
  defaultTenantSlug,
  homeForStaffRole,
  readStaffSession,
  staffAuthChangePin,
} from '../../lib/api';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function PinField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  show,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-200">{label}</span>
      <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 focus-within:border-emerald-400">
        <KeyRound className="h-4 w-4 text-zinc-500" />
        <input
          value={value}
          onChange={(event) => onChange(onlyDigits(event.target.value).slice(0, 6))}
          inputMode="numeric"
          autoComplete={autoComplete}
          type={show ? 'text' : 'password'}
          className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? `Ocultar ${label}` : `Mostrar ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function ChangePinInner() {
  const router = useRouter();
  const tenantSlug = useMemo(() => defaultTenantSlug(), []);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const confirmMismatch = confirmPin.length > 0 && confirmPin !== newPin;
  const canSubmit =
    currentPin.length >= 4 && newPin.length >= 4 && confirmPin === newPin && !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPin !== confirmPin) {
      setError('A confirmação não confere com o novo PIN.');
      return;
    }
    if (newPin === currentPin) {
      setError('O novo PIN precisa ser diferente do atual.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await staffAuthChangePin(tenantSlug, { currentPin, newPin });
      setSuccess(result.message_user || 'PIN atualizado.');
      const session = readStaffSession();
      const nextPath =
        result.nextPath && result.nextPath !== '/trocar-pin'
          ? result.nextPath
          : session
            ? homeForStaffRole(session.staffRole)
            : '/login';
      // Deixa o feedback visível um instante antes de voltar pro app.
      setTimeout(() => router.replace(nextPath), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível trocar o PIN.');
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
      <section className="w-full max-w-[420px] rounded-lg border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal text-white">Trocar PIN</h1>
            <p className="text-sm text-zinc-400">Equipe · {tenantSlug}</p>
          </div>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-zinc-400">
          Ao confirmar, todas as outras sessões da sua conta são desconectadas. Se você entrou com
          um PIN temporário do gerente, a troca é obrigatória.
        </p>

        {success && (
          <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            {success} Redirecionando…
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100"
          >
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <PinField
            label="PIN atual"
            value={currentPin}
            onChange={setCurrentPin}
            placeholder="PIN de hoje (ou temporário)"
            autoComplete="current-password"
            show={showPins}
            onToggleShow={() => setShowPins((v) => !v)}
          />
          <PinField
            label="Novo PIN"
            value={newPin}
            onChange={setNewPin}
            placeholder="4 a 6 dígitos"
            autoComplete="new-password"
            show={showPins}
            onToggleShow={() => setShowPins((v) => !v)}
          />
          <div>
            <PinField
              label="Confirmar novo PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              placeholder="Repita o novo PIN"
              autoComplete="new-password"
              show={showPins}
              onToggleShow={() => setShowPins((v) => !v)}
            />
            {confirmMismatch && (
              <p className="mt-1 text-xs text-red-300">A confirmação não confere.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            <ShieldCheck className="h-4 w-4" />
            {submitting ? 'Trocando…' : 'Trocar PIN'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function ChangePinPage() {
  return (
    <Suspense fallback={null}>
      <ChangePinInner />
    </Suspense>
  );
}
