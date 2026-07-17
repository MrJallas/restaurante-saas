'use client';

import { useEffect, useState } from 'react';
import { CircleOff, LogOut, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  defaultTenantSlug,
  homeForStaffRole,
  performStaffLogout,
  readStaffSession,
  type StaffSession,
} from '../../lib/api';
import { canAccessCashierSurface } from '../../lib/staff-access';

interface CashierUnavailablePanelProps {
  staffName: string;
  switchingProfile: boolean;
  onSwitchProfile: () => void;
}

export function CashierUnavailablePanel({
  staffName,
  switchingProfile,
  onSwitchProfile,
}: CashierUnavailablePanelProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
      <section className="w-full max-w-[520px] rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-300 text-zinc-950">
            <CircleOff className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Área do caixa
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              Caixa ainda não ativado
            </h1>
            <p className="mt-1 text-sm text-zinc-400">{staffName || 'Perfil de caixa'} · Caixa</p>
          </div>
        </div>

        <div className="space-y-4 text-sm leading-6 text-zinc-300">
          <p>
            Seu acesso está correto. A liquidação de caixa ainda não está ativada neste restaurante.
          </p>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300"
                aria-hidden="true"
              />
              <p>
                Esta tela não mostra valores e não permite operar pagamentos. O Pix do fluxo do
                cliente continua sendo apenas uma demonstração: ele não cobra nem confirma
                pagamentos.
              </p>
            </div>
          </div>
          <p className="text-zinc-400">
            Quando o funcionamento do caixa for definido, esta área poderá ser implementada sem
            liberar recursos do gerente para este perfil.
          </p>
        </div>

        <button
          type="button"
          onClick={onSwitchProfile}
          disabled={switchingProfile}
          className="mt-7 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {switchingProfile ? 'Saindo…' : 'Sair e trocar de perfil'}
        </button>
      </section>
    </main>
  );
}

export function CashierAccessGate() {
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [switchingProfile, setSwitchingProfile] = useState(false);

  useEffect(() => {
    const current = readStaffSession();
    if (!canAccessCashierSurface(current)) {
      router.replace(current ? homeForStaffRole(current.staffRole) : '/login');
      return;
    }
    setSession(current);
  }, [router]);

  const handleSwitchProfile = async () => {
    if (switchingProfile) return;
    setSwitchingProfile(true);
    await performStaffLogout(defaultTenantSlug());
    router.replace('/login');
    router.refresh();
  };

  if (!session) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50"
        aria-label="Verificando acesso ao caixa"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
      </main>
    );
  }

  return (
    <CashierUnavailablePanel
      staffName={session.staffName}
      switchingProfile={switchingProfile}
      onSwitchProfile={() => void handleSwitchProfile()}
    />
  );
}
