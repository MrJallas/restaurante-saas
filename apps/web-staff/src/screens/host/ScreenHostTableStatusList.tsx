'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useG, G_FONT, HSt } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';
import { listHostTables, type HostTableEntry } from '../../lib/api/host';
import { useStaffTheme } from '../../lib/theme';

type HostTableStatus = HostTableEntry['status'];

const TITLES: Record<HostTableStatus, { title: string; sub: string; empty: string }> = {
  alerta: {
    title: 'Atenção',
    sub: 'Mesas e clientes que precisam de ação',
    empty: 'Nada em atenção agora.',
  },
  liberada: {
    title: 'Liberadas',
    sub: 'Mesas com QR aberto aguardando chegada',
    empty: 'Nenhuma mesa liberada aguardando cliente.',
  },
  ocupada: {
    title: 'Em uso',
    sub: 'Mesas com sessão ativa no salão',
    empty: 'Nenhuma mesa em uso agora.',
  },
  livre: {
    title: 'Livres',
    sub: 'Mesas prontas para receber cliente',
    empty: 'Sem mesas livres no momento.',
  },
};

interface ScreenHostTableStatusListProps {
  tenantSlug: string;
  status: HostTableStatus;
  onBack?: () => void;
  onLiberate?: (tableNumber: number) => void;
  onTabChange?: (tab: string) => void;
}

export const ScreenHostTableStatusList: React.FC<ScreenHostTableStatusListProps> = ({
  tenantSlug,
  status,
  onBack,
  onLiberate,
  onTabChange,
}) => {
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [tables, setTables] = useState<HostTableEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await listHostTables(tenantSlug);
        if (alive) setTables(data);
      } catch {
        if (alive) setTables([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const tid = setInterval(load, 12_000);
    return () => {
      alive = false;
      clearInterval(tid);
    };
  }, [tenantSlug]);

  const visible = useMemo(
    () =>
      tables
        .filter((table) => table.status === status)
        .sort((a, b) => a.sector.localeCompare(b.sector) || a.number - b.number),
    [tables, status],
  );
  const copy = TITLES[status];

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: C.surface,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title={copy.title}
        sub={`${visible.length} ${visible.length === 1 ? 'mesa' : 'mesas'} · ${copy.sub}`}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 80px' }}>
        {loading ? (
          <div style={{ padding: 28, color: C.faint, fontSize: 12, textAlign: 'center' }}>
            Carregando...
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              marginTop: 12,
              padding: '32px 18px',
              borderRadius: 14,
              border: `1.5px dashed ${C.borderSoft}`,
              background: C.bg,
              color: C.mute,
              fontSize: 13,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            {copy.empty}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((table) => (
              <TableRow
                key={table.number}
                table={table}
                dark={dark}
                onLiberate={() => onLiberate?.(table.number)}
              />
            ))}
          </div>
        )}
      </div>

      <HBottomNav active="tables" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

function TableRow({
  table,
  dark,
  onLiberate,
}: {
  table: HostTableEntry;
  dark: boolean;
  onLiberate: () => void;
}) {
  const C = useG(dark);
  const st = HSt[table.status];
  const meta = [
    table.sector,
    `${table.capacity} ${table.capacity === 1 ? 'lugar' : 'lugares'}`,
    table.seats != null ? `${table.seats} pessoas` : null,
  ].filter(Boolean);
  const statusCopy =
    table.status === 'alerta'
      ? 'precisa de intervenção'
      : table.status === 'liberada'
        ? 'aguardando QR'
        : table.status === 'ocupada'
          ? 'sessão ativa'
          : 'pronta para liberar';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 14,
        background: C.bg,
        border: `${st.dashed ? '1.5px dashed' : '1.5px solid'} ${st.bd}`,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 12,
          background: st.bg,
          color: st.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: `1px solid ${st.bd}`,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 800 }}>{table.number}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: st.dot,
              animation: st.pulse ? 'gPulse 1.4s infinite' : 'none',
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>
            Mesa {table.number}
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 2 }}>
          {meta.join(' · ')}
        </div>
        <div style={{ fontSize: 11, color: st.fg, fontWeight: 700, marginTop: 3 }}>
          {statusCopy}
          {table.since ? ` · desde ${formatTime(table.since)}` : ''}
        </div>
      </div>
      {table.status === 'livre' ? (
        <button
          type="button"
          onClick={onLiberate}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 13px',
            borderRadius: 10,
            background: '#1E8C5A',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          Liberar {Icon.arrow(13)}
        </button>
      ) : (
        <span style={{ color: st.fg, flexShrink: 0 }}>{Icon.arrow(16)}</span>
      )}
    </div>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default ScreenHostTableStatusList;
