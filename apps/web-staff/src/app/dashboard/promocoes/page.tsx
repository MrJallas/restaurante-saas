'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, X } from 'lucide-react';
import { staffGet, staffPost, staffPatch, staffDelete } from '../../../lib/api';

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_cents: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

interface PromotionForm {
  title: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  minOrderCents: string;
  validFrom: string;
  validUntil: string;
}

const emptyForm: PromotionForm = {
  title: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  minOrderCents: '',
  validFrom: '',
  validUntil: '',
};

export default function PromocoesPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await staffGet<{ promotions: Promotion[] }>(`/${TENANT_SLUG}/promotions`);
      setPromotions(res.promotions || []);
    } catch {
      setPromotions([]);
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

  const openEdit = (p: Promotion) => {
    setEditingId(p.id);
    setForm({
      title: p.title,
      description: p.description || '',
      discountType: p.discount_type,
      discountValue: String(p.discount_value),
      minOrderCents: p.min_order_cents ? String(p.min_order_cents) : '',
      validFrom: p.valid_from ? p.valid_from.substring(0, 10) : '',
      validUntil: p.valid_until ? p.valid_until.substring(0, 10) : '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.title.trim()) {
      setError('Titulo obrigatorio.');
      return;
    }
    const discountValue = parseInt(form.discountValue);
    if (!discountValue || discountValue <= 0) {
      setError('Valor de desconto invalido.');
      return;
    }

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue,
      minOrderCents: form.minOrderCents ? parseInt(form.minOrderCents) : undefined,
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        await staffPatch(`/${TENANT_SLUG}/promotions/${editingId}`, payload);
      } else {
        await staffPost(`/${TENANT_SLUG}/promotions`, payload);
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: Promotion) => {
    try {
      await staffPatch(`/${TENANT_SLUG}/promotions/${p.id}`, { isActive: !p.is_active });
      await load();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta promocao?')) return;
    try {
      await staffDelete(`/${TENANT_SLUG}/promotions/${id}`);
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
            <Tag className="h-6 w-6 text-staff-accent" /> Promocoes
          </h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-staff-accent px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova Promocao
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-staff-accent border-t-transparent" />
          </div>
        ) : promotions.length === 0 ? (
          <div className="rounded-xl bg-staff-card p-12 text-center">
            <Tag className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-slate-400">Nenhuma promocao cadastrada.</p>
            <button
              onClick={openCreate}
              className="mt-4 rounded-lg bg-staff-accent/20 px-4 py-2 text-sm font-medium text-staff-accent hover:bg-staff-accent/30"
            >
              Criar primeira promocao
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-staff-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-3">Titulo</th>
                  <th className="px-4 py-3">Desconto</th>
                  <th className="px-4 py-3">Min. Pedido</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 text-white">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.title}</div>
                      {p.description && (
                        <div className="text-xs text-slate-400">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {p.discount_type === 'percentage'
                        ? `${p.discount_value}%`
                        : `R$ ${(p.discount_value / 100).toFixed(2).replace('.', ',')}`}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {p.min_order_cents
                        ? `R$ ${(p.min_order_cents / 100).toFixed(2).replace('.', ',')}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {p.valid_until
                        ? `ate ${new Date(p.valid_until).toLocaleDateString('pt-BR')}`
                        : 'Sem limite'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(p)}
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          p.is_active
                            ? 'bg-staff-success/20 text-staff-success'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {p.is_active ? 'Ativa' : 'Inativa'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl bg-staff-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Editar Promocao' : 'Nova Promocao'}
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
                <label className="mb-1 block text-xs text-slate-400">Titulo *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                  placeholder="Ex: Happy Hour"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Descricao</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                  rows={2}
                  placeholder="Detalhes da promocao"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Tipo *</label>
                  <select
                    value={form.discountType}
                    onChange={(e) =>
                      setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })
                    }
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                  >
                    <option value="percentage">Percentual (%)</option>
                    <option value="fixed">Valor fixo (centavos)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    Valor * {form.discountType === 'percentage' ? '(%)' : '(centavos)'}
                  </label>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                    placeholder={form.discountType === 'percentage' ? '10' : '500'}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Pedido minimo (centavos)
                </label>
                <input
                  type="number"
                  value={form.minOrderCents}
                  onChange={(e) => setForm({ ...form, minOrderCents: e.target.value })}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                  placeholder="Ex: 5000 (R$ 50,00)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Valida de</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Valida ate</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-white outline-none focus:bg-white/10"
                  />
                </div>
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
