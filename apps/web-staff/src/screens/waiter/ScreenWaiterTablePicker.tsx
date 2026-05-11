'use client';

// Picker · fallback manual quando o QR não está disponível.
// Lista mesas que o garçom JÁ atende + mesas livres com capacidade.
// Match com docs/design-canvas/handoff/garcom/garcom-screens-b.jsx ::
// ScreenWaiterTablePicker.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import {
  GAppHeader, GBottomNav, GIconBtn,
} from '../../components/waiter/Primitives';
import { listMyTables, type ActiveTableSummary } from '../../lib/api/waiter';

interface ScreenWaiterTablePickerProps {
  tenantSlug: string;
  onBack?: () => void;
  onPick?: (table: ActiveTableSummary) => void;
}

interface RowProps {
  table: ActiveTableSummary;
  mine?: boolean;
  onClick?: () => void;
  C: ReturnType<typeof useG>;
}

const TableRow: React.FC<RowProps> = ({ table, mine, onClick, C }) => {
  const tableNumber = parseInt(table.label.replace(/[^0-9]/g, ''), 10) || 0;
  const seats = table.party_size || 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderBottom: `1px solid ${C.borderFaint}`,
      }}
    >
      <div
        style={{
          width: 56, height: 56, borderRadius: 14,
          background: mine ? C.ink : C.surface,
          color: mine ? C.bg : C.ink,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600, opacity: 0.7 }}>
          Mesa
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1 }}>
          {String(tableNumber).padStart(2, '0')}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
          Mesa {String(tableNumber).padStart(2, '0')} · {seats || table.capacity} pessoa
          {(seats || table.capacity) > 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
          {mine
            ? `${seats} ocupando · ${Math.max(0, table.capacity - seats)} livre(s)`
            : `Capacidade ${table.capacity} · livre`}
        </div>
      </div>
      <span style={{ flexShrink: 0, color: C.mute }}>{Icon.arrow(14)}</span>
    </button>
  );
};

export const ScreenWaiterTablePicker: React.FC<ScreenWaiterTablePickerProps> = ({
  tenantSlug, onBack, onPick,
}) => {
  const dark = false;
  const C = useG(dark);
  const [tables, setTables] = useState<ActiveTableSummary[]>([]);

  useEffect(() => {
    let alive = true;
    listMyTables(tenantSlug)
      .then((t) => {
        if (alive) setTables(t);
      })
      .catch(() => {
        if (alive) setTables([]);
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug]);

  const myTables = tables.filter((t) => t.party_size > 0);
  const available = tables.filter((t) => t.party_size === 0);

  return (
    <div
      style={{
        width: '100%', height: '100vh', background: C.bg, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title="Escolher mesa"
        right={<GIconBtn dark={dark} icon={Icon.search(20)} ariaLabel="Buscar" />}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0 80px' }}>
        <div
          style={{
            padding: '14px 16px 8px',
            fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.ink, fontWeight: 700,
          }}
        >
          Atendendo atualmente
        </div>
        {myTables.length === 0 && (
          <div style={{ padding: '12px 16px', color: C.mute, fontSize: 13 }}>
            Nenhuma mesa aberta com você no momento.
          </div>
        )}
        {myTables.map((t) => (
          <TableRow key={t.id} C={C} table={t} mine onClick={() => onPick?.(t)} />
        ))}

        <div
          style={{
            padding: '20px 16px 8px',
            fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700,
          }}
        >
          Disponíveis
        </div>
        {available.length === 0 && (
          <div style={{ padding: '24px 16px', color: C.mute, fontSize: 13, textAlign: 'center' }}>
            Nenhuma mesa livre no momento.
          </div>
        )}
        {available.map((t) => (
          <TableRow key={t.id} C={C} table={t} onClick={() => onPick?.(t)} />
        ))}
      </div>

      <GBottomNav active="home" dark={dark} />
    </div>
  );
};

export default ScreenWaiterTablePicker;
