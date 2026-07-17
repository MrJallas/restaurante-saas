'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { readStaffSession, type StaffSession } from '../../../lib/api';
import { canManageEstablishment } from '../../../lib/staff-access';
import { useStaffTheme } from '../../../lib/theme';
import { ScreenOwnerEstablishmentSettings } from '../../../screens/manager/ScreenOwnerEstablishmentSettings';

function OwnerEstablishmentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { dark } = useStaffTheme();
  const [session, setSession] = useState<StaffSession | null | undefined>(undefined);
  useEffect(() => setSession(readStaffSession()), []);
  const slug =
    params.get('slug') ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    'restaurant_dev';

  if (session === undefined) {
    return (
      <div role="status" style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
        Verificando acesso…
      </div>
    );
  }
  if (!canManageEstablishment(session)) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 20,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <section style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20 }}>Configuração exclusiva do dono</h1>
          <p style={{ color: '#6b6b6b', lineHeight: 1.5 }}>
            Gerentes continuam com o painel operacional, mas não podem alterar dados do
            estabelecimento.
          </p>
          <button
            type="button"
            onClick={() =>
              router.replace(`/manager/configuracoes?slug=${encodeURIComponent(slug)}`)
            }
            style={{
              minHeight: 44,
              border: 0,
              borderRadius: 10,
              padding: '10px 16px',
              background: '#111',
              color: '#fff',
              fontWeight: 750,
            }}
          >
            Voltar
          </button>
        </section>
      </main>
    );
  }
  return <ScreenOwnerEstablishmentSettings tenantSlug={slug} dark={dark} />;
}

export default function OwnerEstablishmentPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <OwnerEstablishmentInner />
    </Suspense>
  );
}
