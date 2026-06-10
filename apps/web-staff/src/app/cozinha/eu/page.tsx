'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  ChefHat,
  Clock,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { staffDelete, staffGet, staffPatch, staffPost } from '../../../lib/api';

interface KitchenOrder {
  id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  items: Array<{ id: string; name: string; quantity: number }>;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  default_shift?: string | null;
}

interface ShiftMember {
  assignment_id: string;
  staff_id: string;
  staff_name: string;
  staff_role: string;
  work_date: string;
  overtime_minutes: number;
}

interface Shift {
  id: string;
  label: string;
  range_label: string;
  time_start: string;
  time_end: string;
  sort_order: number;
  members: ShiftMember[];
}

const THEME_KEY = 'kitchen:theme';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function CookProfileInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug =
    params.get('tenant') ||
    params.get('slug') ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    'restaurant_dev';
  const cookId = params.get('cookId') || params.get('staffId') || '';

  const [dark, setDark] = useState(true);
  const [workDate, setWorkDate] = useState(todayISO());
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showTurn, setShowTurn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Tempo de preparo base da ETA do cliente (decisão Caleb 2026-06-10 Q9):
  // o líder configura aqui; o backend ajusta dinamicamente com a fila.
  const [etaMin, setEtaMin] = useState('');
  const [etaMax, setEtaMax] = useState('');
  const [etaCurrent, setEtaCurrent] = useState<{ min: number | null; max: number | null }>({
    min: null,
    max: null,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(THEME_KEY);
      if (raw === 'light') setDark(false);
      if (raw === 'dark') setDark(true);
      if (raw === 'auto' && window.matchMedia) {
        setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, staffRes, shiftRes, etaRes] = await Promise.allSettled([
        staffGet<{ orders: KitchenOrder[] }>(`/${tenantSlug}/kitchen/queue`),
        staffGet<{ staff: StaffMember[] }>(`/${tenantSlug}/staff?activeOnly=true`),
        staffGet<Shift[]>(`/${tenantSlug}/shifts?date=${workDate}`),
        staffGet<{ kitchenEtaMinMinutes: number | null; kitchenEtaMaxMinutes: number | null }>(
          `/${tenantSlug}/settings/kitchen-eta`,
        ),
      ]);
      if (queueRes.status === 'fulfilled') setOrders(queueRes.value.orders ?? []);
      if (staffRes.status === 'fulfilled') setStaff(staffRes.value.staff ?? []);
      if (shiftRes.status === 'fulfilled') {
        setShifts(shiftRes.value);
        setSelectedShiftId((prev) => prev || shiftRes.value[0]?.id || '');
      } else {
        setShifts([]);
      }
      if (etaRes.status === 'fulfilled') {
        setEtaCurrent({
          min: etaRes.value.kitchenEtaMinMinutes,
          max: etaRes.value.kitchenEtaMaxMinutes,
        });
        setEtaMin((prev) => prev || String(etaRes.value.kitchenEtaMinMinutes ?? 10));
        setEtaMax((prev) => prev || String(etaRes.value.kitchenEtaMaxMinutes ?? 16));
      }
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao carregar cozinha.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, workDate]);

  useEffect(() => {
    load();
  }, [load]);

  const kitchenStaff = staff.filter((s) => ['cook', 'kitchen'].includes(s.role));
  const stats = useMemo(() => {
    const entered = orders.length;
    const preparing = orders.filter((o) => ['received', 'open', 'confirmed', 'in_progress', 'preparing'].includes(o.status)).length;
    const ready = orders.filter((o) => o.status === 'ready').length;
    const inTransit = orders.filter((o) => o.status === 'in_transit').length;
    const out = ready + inTransit;
    const avgMinutes =
      orders.length === 0
        ? 0
        : Math.round(
            orders.reduce((sum, order) => {
              return sum + Math.max(0, Date.now() - new Date(order.created_at).getTime()) / 60000;
            }, 0) / orders.length,
          );
    const byHour = orders.reduce<Record<string, number>>((acc, order) => {
      const hour = new Date(order.created_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
      });
      acc[hour] = (acc[hour] ?? 0) + 1;
      return acc;
    }, {});
    return { entered, preparing, ready, inTransit, out, avgMinutes, byHour };
  }, [orders]);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 3200);
  };

  const addKitchenAssistant = async () => {
    if (!newName.trim() || !/^\d{4,6}$/.test(newPin)) {
      showMsg('Informe nome e PIN de 4 a 6 dígitos.');
      return;
    }
    setBusy(true);
    try {
      await staffPost(`/${tenantSlug}/staff`, {
        name: newName.trim(),
        role: 'cook',
        pin: newPin,
      });
      setNewName('');
      setNewPin('');
      await load();
      showMsg('Pessoa adicionada à cozinha.');
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Erro ao cadastrar.');
    } finally {
      setBusy(false);
    }
  };

  const addToShift = async () => {
    if (!selectedStaffId || !selectedShiftId) {
      showMsg('Escolha uma pessoa e um turno.');
      return;
    }
    setBusy(true);
    try {
      await staffPost(`/${tenantSlug}/shifts/assignments`, {
        shiftId: selectedShiftId,
        staffId: selectedStaffId,
        workDate,
      });
      await load();
      showMsg('Escala atualizada.');
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Erro ao escalar.');
    } finally {
      setBusy(false);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    setBusy(true);
    try {
      await staffDelete(`/${tenantSlug}/shifts/assignments/${assignmentId}`);
      await load();
      showMsg('Pessoa removida do turno.');
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Erro ao remover.');
    } finally {
      setBusy(false);
    }
  };

  const saveKitchenEta = async () => {
    const min = Number(etaMin);
    const max = Number(etaMax);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 120 || min > max) {
      showMsg('Tempo inválido: minutos inteiros entre 1 e 120, mínimo ≤ máximo.');
      return;
    }
    setBusy(true);
    try {
      await staffPatch(`/${tenantSlug}/settings/kitchen-eta`, {
        minMinutes: min,
        maxMinutes: max,
      });
      setEtaCurrent({ min, max });
      showMsg('Tempo de preparo salvo — a ETA do cliente já usa o novo valor.');
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Erro ao salvar tempo de preparo.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    try {
      window.sessionStorage.clear();
      window.localStorage.removeItem('staffId');
      window.localStorage.removeItem('staffRole');
      window.localStorage.removeItem('staffName');
    } catch {
      /* ignore */
    }
    router.push('/');
  };

  const page = dark ? 'bg-gray-950 text-white' : 'bg-zinc-50 text-zinc-950';
  const panel = dark ? 'border-white/10 bg-gray-900' : 'border-zinc-200 bg-white';
  const muted = dark ? 'text-white/45' : 'text-zinc-500';
  const input =
    dark
      ? 'border-white/10 bg-black/20 text-white placeholder:text-white/30'
      : 'border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400';

  return (
    <div className={`min-h-screen p-4 ${page}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/cozinha')}
            aria-label="Voltar"
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${panel}`}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="min-w-0 truncate text-2xl font-bold">
            <ChefHat className="mr-2 inline h-7 w-7 text-orange-400" />
            Cozinha — Gestão
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${panel}`}
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(`/cozinha/mensagens?tenant=${tenantSlug}${cookId ? `&cookId=${cookId}` : ''}`)
            }
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${panel}`}
            aria-label="Mensagens"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className={`rounded-xl border p-4 ${panel}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className={`text-xs font-black uppercase tracking-wide ${muted}`}>
                Turno da cozinha
              </div>
              <div className="mt-1 text-lg font-extrabold">Equipe e escala</div>
            </div>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-bold ${input}`}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}
            >
              <option value="">Pessoa da cozinha</option>
              {kitchenStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}
            >
              <option value="">Turno</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.label} · {shift.range_label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addToShift}
              disabled={busy || !selectedStaffId || !selectedShiftId}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Escalar
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {shifts.map((shift) => (
              <div key={shift.id} className={`rounded-xl border p-3 ${panel}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black">{shift.label}</div>
                    <div className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${muted}`}>
                      <Clock className="h-3 w-3" />
                      {shift.range_label}
                    </div>
                  </div>
                  <CalendarDays className="h-4 w-4 text-orange-400" />
                </div>
                <div className="mt-3 space-y-2">
                  {shift.members.length === 0 && (
                    <div className={`rounded-lg border border-dashed px-3 py-4 text-center text-xs ${muted}`}>
                      Sem escala
                    </div>
                  )}
                  {shift.members.map((member) => (
                    <div
                      key={member.assignment_id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                        dark ? 'border-white/10 bg-black/20' : 'border-zinc-100 bg-zinc-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{member.staff_name}</div>
                        <div className={`text-xs ${muted}`}>{member.staff_role}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAssignment(member.assignment_id)}
                        disabled={busy}
                        className="rounded-md p-1 text-red-400 hover:bg-red-500/10"
                        aria-label="Remover do turno"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {shifts.length === 0 && !loading && (
            <div className="mt-4 rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-3 py-2 text-sm font-semibold text-yellow-500">
              Escalas exigem login de gerente ou chefe com permissão de escala.
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className={`rounded-xl border p-4 ${panel}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className={`text-xs font-black uppercase tracking-wide ${muted}`}>
                  Equipe
                </div>
                <div className="mt-1 text-lg font-extrabold">{kitchenStaff.length} pessoas ativas</div>
              </div>
              <Users className="h-5 w-5 text-orange-400" />
            </div>
            <div className="space-y-2">
              {kitchenStaff.slice(0, 6).map((person) => (
                <div key={person.id} className={`rounded-lg border px-3 py-2 ${dark ? 'border-white/10' : 'border-zinc-100'}`}>
                  <div className="text-sm font-bold">{person.name}</div>
                  <div className={`text-xs ${muted}`}>{person.default_shift || 'Sem turno padrão'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={`rounded-xl border p-4 ${panel}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className={`text-xs font-black uppercase tracking-wide ${muted}`}>
                  Tempo de preparo · ETA do cliente
                </div>
                <div className="mt-1 text-lg font-extrabold">
                  {etaCurrent.min != null && etaCurrent.max != null
                    ? `${etaCurrent.min}–${etaCurrent.max} min`
                    : 'Padrão (10–16 min)'}
                </div>
              </div>
              <Clock className="h-5 w-5 text-orange-400" />
            </div>
            <p className={`mb-3 text-xs leading-relaxed ${muted}`}>
              Range base que o cliente vê. O sistema soma a fila de pedidos
              automaticamente (urgência &gt; VIP &gt; normal) e encolhe o tempo
              conforme o pedido avança.
            </p>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                value={etaMin}
                onChange={(e) => setEtaMin(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="Mín"
                inputMode="numeric"
                aria-label="Tempo mínimo de preparo em minutos"
                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}
              />
              <input
                value={etaMax}
                onChange={(e) => setEtaMax(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="Máx"
                inputMode="numeric"
                aria-label="Tempo máximo de preparo em minutos"
                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}
              />
              <button
                type="button"
                onClick={saveKitchenEta}
                disabled={busy}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-70"
              >
                Salvar
              </button>
            </div>
          </section>

          <section className={`rounded-xl border p-4 ${panel}`}>
            <div className={`mb-3 text-xs font-black uppercase tracking-wide ${muted}`}>
              Adicionar assistente/cozinheiro
            </div>
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome"
                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}
              />
              <input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="PIN"
                inputMode="numeric"
                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}
              />
              <button
                type="button"
                onClick={addKitchenAssistant}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-70"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </section>
        </aside>
      </div>

      <section className={`mt-4 rounded-xl border p-4 ${panel}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={`text-xs font-black uppercase tracking-wide ${muted}`}>
              Operação em tempo real
            </div>
            <div className="mt-1 text-lg font-extrabold">Turno atual</div>
          </div>
          <button
            type="button"
            onClick={() => setShowTurn((v) => !v)}
            className={`rounded-lg border px-4 py-2 text-sm font-black ${panel}`}
          >
            {showTurn ? 'Ocultar turno' : 'Mostrar turno'}
          </button>
        </div>
        {showTurn && (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              <StatCard dark={dark} label="Entraram" value={String(stats.entered)} />
              <StatCard dark={dark} label="Em preparo" value={String(stats.preparing)} />
              <StatCard dark={dark} label="Prontos" value={String(stats.ready)} />
              <StatCard dark={dark} label="Em trânsito" value={String(stats.inTransit)} />
              <StatCard dark={dark} label="Tempo médio" value={`${stats.avgMinutes} min`} />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-6">
              {Object.entries(stats.byHour).map(([hour, count]) => (
                <div key={hour} className={`rounded-lg border px-3 py-2 ${dark ? 'border-white/10 bg-black/20' : 'border-zinc-100 bg-zinc-50'}`}>
                  <div className={`text-xs font-black uppercase ${muted}`}>{hour}h</div>
                  <div className="mt-1 text-xl font-black">{count}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/20"
      >
        <LogOut className="h-4 w-4" />
        Sair
      </button>

      {message && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full px-4 py-3 text-sm font-semibold shadow-2xl ${
            dark ? 'bg-white text-zinc-950' : 'bg-zinc-950 text-white'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, dark }: { label: string; value: string; dark: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${dark ? 'border-white/10 bg-black/20' : 'border-zinc-100 bg-zinc-50'}`}>
      <div className={`text-[11px] font-bold uppercase tracking-[0.6px] ${dark ? 'text-white/40' : 'text-zinc-500'}`}>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-extrabold tracking-tight tabular-nums ${dark ? 'text-white' : 'text-zinc-950'}`}>
        {value}
      </div>
    </div>
  );
}

export default function CookProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <CookProfileInner />
    </Suspense>
  );
}
