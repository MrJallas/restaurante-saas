'use client';

// Cozinha · Eu — perfil simples do cozinheiro. Mantém a paleta dark do KDS
// pra continuidade visual com /cozinha (a tela é vista do mesmo display).

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChefHat, Clock, Volume2, MessageSquare, ArrowLeft, LogOut } from 'lucide-react';

function CookProfileInner() {
  const router = useRouter();
  const params = useSearchParams();
  const cookName = params.get('name') ?? 'Cozinheiro';
  const initials = (params.get('initials') ??
    cookName.split(' ').map((p) => p[0]).slice(0, 2).join('')).toUpperCase();
  const shift = params.get('shift') ?? '17:00 — 23:00';

  const handleLogout = () => {
    try {
      window.sessionStorage.clear();
      window.localStorage.removeItem('staffId');
      window.localStorage.removeItem('staffRole');
    } catch {
      /* ignore */
    }
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/cozinha')}
          aria-label="Voltar"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold text-white">
          <ChefHat className="mr-2 inline h-7 w-7 text-orange-400" />
          Cozinha — Perfil
        </h1>
      </div>

      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-white/10 bg-gray-900 p-6 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/20 text-2xl font-extrabold tracking-tight text-orange-300">
            {initials}
          </div>
          <div className="text-xl font-bold text-white">{cookName}</div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[1.4px] text-white/40">
            Cozinheiro
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-gray-900 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-white/40">
            Turno de hoje
          </div>
          <div className="mt-1 flex items-center gap-2 text-base font-bold text-white">
            <Clock className="h-4 w-4 text-yellow-400" />
            {shift}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatCard label="Pedidos hoje" value="—" />
          <StatCard label="Tempo médio" value="—" />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <ActionRow
            icon={<MessageSquare className="h-4 w-4" />}
            label="Mensagens"
            onClick={() => router.push('/waiter/mensagens')}
          />
          <ActionRow
            icon={<Volume2 className="h-4 w-4" />}
            label="Configurações de som"
            onClick={() => router.push('/cozinha')}
          />
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/20"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-white/40">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight text-white tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-gray-900 px-4 py-3 text-left text-white/90 hover:bg-gray-800"
    >
      <span className="text-orange-300">{icon}</span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="ml-auto text-white/30">›</span>
    </button>
  );
}

export default function CookProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <CookProfileInner />
    </Suspense>
  );
}
