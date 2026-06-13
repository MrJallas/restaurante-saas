'use client';

// Resolvedor de entrega pós scan/picker. Antes esta tela mostrava itens
// HARDCODED ("Risoto de camarão"…) e falhava sem orderId — mock que
// parecia ação final (violava a regra de CTA real do prompt 99). Agora:
//  - com `orderId` na query → redireciona pra /waiter/entrega/[orderId];
//  - com `table` → busca as entregas pendentes REAIS da mesa:
//    1 entrega → redireciona direto; várias → lista pra escolher;
//    nenhuma → estado vazio explícito.

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../../../components/waiter/tokens';
import { Icon } from '../../../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn } from '../../../../components/waiter/Primitives';
import { defaultTenantSlug } from '../../../../lib/api';
import { useStaffTheme } from '../../../../lib/theme';
import {
  listPendingDeliveries,
  type PendingDelivery,
} from '../../../../lib/api/waiter';

function matchesTable(d: PendingDelivery, tableRef: string): boolean {
  const ref = tableRef.trim().toLowerCase();
  if (!ref) return false;
  // Picker pode mandar o UUID da mesa quando table_code está vazio.
  if (d.table_id.toLowerCase() === ref) return true;
  if (d.table_code.toLowerCase() === ref || d.table_label.toLowerCase() === ref) return true;
  // Fallback numérico SÓ quando o ref é número puro — comparação de string
  // de dígitos falhava '1' vs '01' e cross-matchava códigos com grupos de
  // dígitos separados ('Z2-M1' → '21', code-review).
  if (!/^\d+$/.test(ref)) return false;
  const refNumber = Number(ref);
  const codeNumber = Number(d.table_code.replace(/[^0-9]/g, ''));
  const labelNumber = Number(d.table_label.replace(/[^0-9]/g, ''));
  return (
    (Number.isFinite(codeNumber) && codeNumber === refNumber) ||
    (Number.isFinite(labelNumber) && labelNumber === refNumber)
  );
}

function WaiterDeliveryConfirmPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const tenantSlug = params.get('tenant') ?? defaultTenantSlug();
  const tableRef = params.get('table') ?? '';
  const orderId = params.get('orderId') ?? '';

  const [matches, setMatches] = React.useState<PendingDelivery[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (orderId) {
      router.replace(`/waiter/entrega/${orderId}?tenant=${tenantSlug}`);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPendingDeliveries(tenantSlug);
        if (cancelled) return;
        const found = tableRef ? rows.filter((d) => matchesTable(d, tableRef)) : rows;
        if (found.length === 1) {
          router.replace(`/waiter/entrega/${found[0].order_id}?tenant=${tenantSlug}`);
          return;
        }
        setMatches(found);
      } catch (e) {
        console.error('[delivery-confirm] load failed', e);
        if (!cancelled) setError('Não foi possível buscar as entregas pendentes.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, tableRef, tenantSlug, router]);

  return (
    <div
      style={{
        height: '100dvh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.back()} ariaLabel="Voltar" />}
        title="Entrega"
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {error ? (
          <div
            role="alert"
            style={{
              padding: 24,
              borderRadius: 12,
              border: `1.5px solid ${C.danger}`,
              background: C.dangerBg,
              color: C.danger,
              fontSize: 13.5,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        ) : matches === null ? (
          <div
            style={{
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Buscando entregas pendentes...
          </div>
        ) : matches.length === 0 ? (
          <div
            style={{
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.mute,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Nenhuma entrega pendente
            {tableRef ? ` para a mesa ${tableRef}` : ''}. A cozinha ainda não chamou
            garçom para essa mesa.
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: C.mute,
                fontWeight: 700,
                marginBottom: 10,
                fontFamily: MONO_FONT,
              }}
            >
              Escolha a entrega
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {matches.map((d) => {
                const itemsCount = d.items.reduce((s, it) => s + it.quantity, 0);
                return (
                  <button
                    key={d.delivery_id}
                    type="button"
                    onClick={() =>
                      router.push(`/waiter/entrega/${d.order_id}?tenant=${tenantSlug}`)
                    }
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                      padding: 14,
                      borderRadius: 12,
                      border: `1px solid ${C.borderSoft}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>
                        {d.table_label}
                        {d.zone_name ? ` · ${d.zone_name}` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                        {itemsCount} {itemsCount === 1 ? 'item' : 'itens'} ·{' '}
                        {d.items.map((it) => `${it.quantity}× ${it.name}`).join(' · ')}
                      </div>
                    </div>
                    <span style={{ color: C.faint, flexShrink: 0 }}>{Icon.arrow(16)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div
        style={{
          borderTop: `1px solid ${C.borderFaint}`,
          padding: '12px 16px max(env(safe-area-inset-bottom), 14px)',
          background: C.bg,
          flexShrink: 0,
        }}
      >
        <GButton kind="secondary" dark={dark} full onClick={() => router.push(`/waiter?tenant=${tenantSlug}`)}>
          Voltar pra home
        </GButton>
      </div>
    </div>
  );
}

export default function WaiterDeliveryConfirmPage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterDeliveryConfirmPageInner />
    </React.Suspense>
  );
}
