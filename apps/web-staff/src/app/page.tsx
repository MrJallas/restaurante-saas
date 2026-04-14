import Link from 'next/link';
import { ClipboardList, MonitorPlay } from 'lucide-react';

export default function StaffHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-bold text-white">Staff Panel</h1>
      <p className="text-slate-400">Selecione sua funcao:</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/garcom/pedidos"
          className="flex items-center gap-3 rounded-xl bg-staff-card p-6 transition-colors hover:bg-staff-card/80"
        >
          <ClipboardList className="h-8 w-8 text-staff-accent" />
          <div>
            <h2 className="font-semibold text-white">Garcom</h2>
            <p className="text-sm text-slate-400">Gerenciar pedidos das mesas</p>
          </div>
        </Link>
        <Link
          href="/cozinha"
          className="flex items-center gap-3 rounded-xl bg-staff-card p-6 transition-colors hover:bg-staff-card/80"
        >
          <MonitorPlay className="h-8 w-8 text-staff-warning" />
          <div>
            <h2 className="font-semibold text-white">Cozinha (KDS)</h2>
            <p className="text-sm text-slate-400">Painel de producao</p>
          </div>
        </Link>
      </div>
    </main>
  );
}
