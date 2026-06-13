'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Users, X } from 'lucide-react';
import { staffPost, staffPatch, staffDelete } from '../../../lib/api';
import { staffRosterApi } from '../../../lib/api/manager';

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';

interface StaffMember {
  id: string;
  name: string;
  role: 'waiter' | 'cook' | 'manager';
  is_active: boolean;
  created_at: string;
}

interface StaffForm {
  name: string;
  role: 'waiter' | 'cook' | 'manager';
  pin: string;
}

const emptyForm: StaffForm = { name: '', role: 'waiter', pin: '' };

const ROLE_LABELS: Record<string, string> = {
  waiter: 'Garcom',
  cook: 'Cozinheiro',
  manager: 'Gerente',
};

export default function FuncionariosPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const list = (await staffRosterApi(TENANT_SLUG).list()) as StaffMember[];
      setStaff(list);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (s: StaffMember) => {
    setEditingId(s.id);
    setForm({ name: s.name, role: s.role, pin: '' });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('Nome obrigatorio.');
      return;
    }
    if (!editingId && !/^\d{4,6}$/.test(form.pin)) {
      setError('PIN deve ter 4-6 digitos.');
      return;
    }
    if (editingId && form.pin && !/^\d{4,6}$/.test(form.pin)) {
      setError('PIN deve ter 4-6 digitos.');
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      role: form.role,
    };
    if (form.pin) payload.pin = form.pin;

    setSaving(true);
    try {
      if (editingId) {
        await staffPatch(`/${TENANT_SLUG}/staff/${editingId}`, payload);
      } else {
        await staffPost(`/${TENANT_SLUG}/staff`, payload);
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (s: StaffMember) => {
    try {
      await staffPatch(`/${TENANT_SLUG}/staff/${s.id}`, { isActive: !s.is_active });
      await load();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este funcionario?')) return;
    try {
      await staffDelete(`/${TENANT_SLUG}/staff/${id}`);
      await load();
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-staff-bg p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Users className="h-6 w-6 text-staff-accent" /> Funcionarios
          </h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-staff-accent px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo Funcionario
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-staff-accent border-t-transparent" />
          </div>
        ) : staff.length === 0 ? (
          <div className="rounded-xl bg-staff-card p-12 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-slate-400">Nenhum funcionario cadastrado.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-staff-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Cargo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 text-white">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-slate-300">{ROLE_LABELS[s.role] || s.role}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(s)}
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          s.is_active
                            ? 'bg-staff-success/20 text-staff-success'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {s.is_active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-staff-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Editar Funcionario' : 'Novo Funcionario'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Cargo *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as StaffForm['role'] })}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                >
                  <option value="waiter">Garcom</option>
                  <option value="cook">Cozinheiro</option>
                  <option value="manager">Gerente</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  PIN {editingId ? '(deixe vazio para manter)' : '* (4-6 digitos)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                />
              </div>

              {error && (
                <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg bg-staff-accent px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
