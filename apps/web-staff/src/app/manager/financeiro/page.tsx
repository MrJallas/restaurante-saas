'use client';

// Manager · Financeiro — placeholder. Quebra o link 404 do MBottomNav.
// O módulo financeiro real depende de integração POS + payment provider
// (PIX/cartão) que está fora do escopo da stack atual.

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MAppHeader,
  MBottomNav,
  MSection,
} from '../../../components/manager';

function FinanceiroInner() {
  const C = useG(false);
  const router = useRouter();

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        <MAppHeader title="Financeiro" greetingName="Renata Albuquerque" bellBadge={0} />

        <MSection title="Em desenvolvimento">
          <div style={{ padding: '0 16px' }}>
            <div
              style={{
                padding: 18,
                borderRadius: 14,
                border: `1px dashed ${C.borderSoft}`,
                background: C.bg,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: C.surface,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.faint,
                }}
              >
                {Icon.receipt(22)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
                Painel financeiro chega em breve
              </div>
              <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>
                Faturamento por período, ticket médio, comparativo com semana anterior, breakdown por
                forma de pagamento e exportação. Depende da integração com o PSP (PIX / cartão).
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <PreviewBox label="Faturamento hoje" />
              <PreviewBox label="Ticket médio" />
              <PreviewBox label="Mesas servidas" />
              <PreviewBox label="Tempo de mesa" />
            </div>
          </div>
        </MSection>

        <div style={{ padding: '24px 16px 0' }}>
          <button
            type="button"
            onClick={() => router.push('/manager')}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              padding: '13px 16px',
              borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              background: 'transparent',
              color: C.ink,
              fontSize: 14,
              fontWeight: 700,
              textAlign: 'center',
              fontFamily: G_FONT,
            }}
          >
            Voltar ao Painel
          </button>
        </div>
      </div>

      <MBottomNav active="finance" onTo={(r) => router.push(r)} />
    </div>
  );
}

function PreviewBox({ label }: { label: string }) {
  const C = useG(false);
  return (
    <div
      aria-hidden="true"
      style={{
        padding: 14,
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        opacity: 0.55,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: C.faint, letterSpacing: -0.5 }}>
        —
      </div>
    </div>
  );
}

export default function ManagerFinanceiroPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <FinanceiroInner />
    </Suspense>
  );
}
