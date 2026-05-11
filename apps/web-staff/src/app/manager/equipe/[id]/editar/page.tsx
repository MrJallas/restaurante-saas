'use client';

// /manager/equipe/[id]/editar — Onda 2 (round 18). StaffForm mode=edit
// pré-carregado com dados reais via GET /staff/:id.

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ScreenManagerStaffForm,
  type StaffFormSeed,
  type StaffRole,
  type StaffShift,
} from '../../../../../screens/manager/ScreenManagerStaffForm';
import { manager, type StaffRosterEntry } from '../../../../../lib/api/manager';

const ROLE_TO_LABEL: Record<string, StaffRole> = {
  waiter: 'Garçom',
  cook: 'Cozinheiro',
  bartender: 'Bartender',
  cashier: 'Caixa',
  manager: 'Gerente',
  host: 'Garçom',
};

function staffInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function StaffEditInner() {
  const route = useParams<{ id: string }>();
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const slug =
    params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const staffId = route?.id ?? '';

  const [seed, setSeed] = useState<StaffFormSeed | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    manager(slug)
      .staffRoster.list()
      .then((rows) => {
        if (cancelled) return;
        const s: StaffRosterEntry | undefined = rows.find((r) => r.id === staffId);
        if (s) {
          setSeed({
            name: s.name,
            cpf: s.cpf ?? '',
            phone: s.phone ?? '',
            email: s.email ?? '',
            role: ROLE_TO_LABEL[s.role] ?? 'Garçom',
            shift: (s.default_shift as StaffShift) ?? 'Noite',
            avatarInit: staffInitials(s.name),
            createdAt: (s.created_at ?? '').slice(0, 10),
            active: s.is_active,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, staffId]);

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
    );
  }
  if (!seed) {
    return (
      <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', color: '#A12626' }}>
        Funcionário não encontrado.
      </div>
    );
  }

  return (
    <ScreenManagerStaffForm
      dark={dark}
      mode="edit"
      seed={seed}
      tenantSlug={slug}
      staffId={staffId}
    />
  );
}

export default function ManagerStaffEditPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
      }
    >
      <StaffEditInner />
    </Suspense>
  );
}
