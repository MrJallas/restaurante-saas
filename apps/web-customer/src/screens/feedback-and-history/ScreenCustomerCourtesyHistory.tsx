'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift } from 'lucide-react';
import { ApiRequestError } from '../../lib/api';
import { listCustomerCourtesyHistory } from '../../lib/api/courtesies';
import { useSession } from '../../hooks/useSession';
import { useRequireCustomerId } from '../../hooks/useRequireCustomerId';
import { AppShell } from '../../components/layout/AppShell';
import type { CustomerCourtesyHistoryDto } from '@restaurant/shared-types';

interface ScreenCustomerCourtesyHistoryProps {
  slug: string;
}

const MONTH_LABELS = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${MONTH_LABELS[d.getMonth()]} · ${hh}:${mm}`;
}

function formatMonthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_LABELS[d.getMonth()]} · ${d.getFullYear()}`;
}

function statusCopy(courtesy: CustomerCourtesyHistoryDto): string {
  if (courtesy.validInCurrentSession) return 'Disponível agora';
  if (courtesy.status === 'aceita') return 'Aceita';
  if (courtesy.status === 'recusada') return 'Recusada';
  return 'Indisponível';
}

function statusClass(courtesy: CustomerCourtesyHistoryDto): string {
  if (courtesy.validInCurrentSession || courtesy.status === 'aceita') {
    return 'border-success/30 bg-success/10 text-success';
  }
  if (courtesy.status === 'recusada') {
    return 'border-border-soft bg-surface text-mute';
  }
  return 'border-border-soft bg-bg text-faint';
}

export function ScreenCustomerCourtesyHistory({ slug }: ScreenCustomerCourtesyHistoryProps) {
  const session = useSession();
  const router = useRouter();
  const ready = useRequireCustomerId(slug);
  const [courtesies, setCourtesies] = useState<CustomerCourtesyHistoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!session.customerId) {
        setLoading(false);
        return;
      }
      try {
        const list = await listCustomerCourtesyHistory(slug);
        if (!cancelled) setCourtesies(list);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiRequestError
            ? err.message
            : 'Não consegui carregar suas cortesias agora.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, session.customerId]);

  const grouped = (() => {
    const map = new Map<string, CustomerCourtesyHistoryDto[]>();
    for (const courtesy of courtesies) {
      const d = new Date(courtesy.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      const arr = map.get(key) ?? [];
      arr.push(courtesy);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

  if (!ready) return null;

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      activeHref={`/${slug}/cortesias`}
      onBack={() => router.back()}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">Cortesias</h1>
        <p className="mb-5 text-[13px] leading-[1.5] text-mute">
          Histórico dos últimos 30 dias · válidas só na conta em que foram enviadas.
        </p>

        {error && (
          <div className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}

        {!loading && courtesies.length === 0 && (
          <div className="rounded-[14px] border border-border-soft bg-surface px-4 py-10 text-center">
            <div className="mb-2 text-[15px] font-medium text-ink">
              Nenhuma cortesia por aqui ainda
            </div>
            <div className="text-[13px] leading-[1.5] text-mute">
              As cortesias recebidas aparecem aqui por 30 dias antes de sumir.
            </div>
          </div>
        )}

        {loading && <div className="text-center text-[13px] text-mute">Carregando…</div>}

        {courtesies.length > 0 && (
          <div className="flex flex-col gap-5">
            {grouped.map(([key, items]) => (
              <div key={key} className="flex flex-col gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-faint">
                  {formatMonthLabel(items[0].createdAt)}
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((courtesy) => (
                    <article
                      key={courtesy.id}
                      data-testid="customer-courtesy-history-row"
                      className="rounded-[14px] border border-border-soft bg-bg p-3.5"
                    >
                      <div className="mb-2 flex items-start gap-3">
                        <div
                          aria-hidden
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning text-white"
                        >
                          <Gift size={16} strokeWidth={1.9} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-faint">
                                {formatDateTime(courtesy.createdAt)}
                              </div>
                              <h2 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-[1.25] tracking-[-0.008em] text-ink">
                                {courtesy.item}
                              </h2>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.9px] ${statusClass(courtesy)}`}
                            >
                              {statusCopy(courtesy)}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[1.1px] text-mute">
                            {courtesy.type} · sem cobrança
                            {typeof courtesy.tableNumber === 'number'
                              ? ` · mesa ${courtesy.tableNumber}`
                              : ''}
                          </div>
                        </div>
                      </div>

                      <p className="text-[12px] leading-[1.45] text-mute">
                        {courtesy.managerName?.trim() || 'Gerência'} enviou para esta mesa.
                      </p>
                      {courtesy.notes && (
                        <p className="mt-1 line-clamp-2 text-[12px] italic leading-[1.45] text-mute">
                          &ldquo;{courtesy.notes}&rdquo;
                        </p>
                      )}
                      <div className="mt-2 rounded-[10px] border border-border-soft bg-surface px-3 py-2 text-[11px] font-medium leading-[1.45] text-mute">
                        Válida só até o fechamento da conta em que foi enviada.
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
