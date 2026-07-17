'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '../../lib/api';
import { listMyComplaints, type ComplaintRecord } from '../../lib/api/feedback';
import { useSession } from '../../hooks/useSession';
import { useRequireCustomerId } from '../../hooks/useRequireCustomerId';
import { AppShell } from '../../components/layout/AppShell';
import { PillButton } from '../../components/ui/PillButton';
import { shouldShowEmptyListState } from '../../lib/async-list-state';

interface ScreenCustomerComplaintsProps {
  slug: string;
}

const STATUS_LABEL: Record<string, string> = {
  created: 'Enviada',
  pending_review: 'Enviada',
  in_progress: 'Em atendimento',
  responded: 'Respondida',
  resolved: 'Resolvida',
  closed: 'Resolvida',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScreenCustomerComplaints({ slug }: ScreenCustomerComplaintsProps) {
  const session = useSession();
  const router = useRouter();
  const ready = useRequireCustomerId(slug);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
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
        const list = await listMyComplaints(slug, session.customerId);
        if (!cancelled) setComplaints(list);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiRequestError
            ? err.message
            : 'Não consegui carregar suas reclamações agora.';
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

  if (!ready) return null;

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel ?? ''}
      activeHref={`/${slug}/complaints`}
      onBack={() => router.push(`/${slug}/eu`)}
      showHamburger={false}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">Reclamações</h1>
        <p className="mb-5 text-[13px] leading-[1.5] text-mute">
          Histórico do atendimento e respostas da gerência.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]"
          >
            {error}
          </div>
        )}

        {loading && <div className="text-center text-[13px] text-mute">Carregando…</div>}

        {shouldShowEmptyListState(loading, error, complaints.length) && (
          <div className="rounded-[14px] border border-border-soft bg-surface px-4 py-10 text-center">
            <div className="mb-2 text-[15px] font-medium text-ink">Nenhuma reclamação por aqui</div>
            <div className="text-[13px] leading-[1.5] text-mute">
              Se algo sair errado, você fala direto com a gerência por aqui.
            </div>
          </div>
        )}

        {complaints.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {complaints.map((complaint) => (
              <button
                key={complaint.id}
                type="button"
                onClick={() => router.push(`/${slug}/complaints/${complaint.id}`)}
                className="rounded-[14px] border border-border-soft bg-bg p-3.5 text-left active:bg-surface"
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-faint">
                    {formatDate(complaint.submittedAt)}
                  </span>
                  <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
                    {STATUS_LABEL[complaint.status] ?? 'Enviada'}
                  </span>
                </div>
                <div className="line-clamp-2 text-[14px] leading-[1.4] text-ink">
                  {complaint.text}
                </div>
                {complaint.responseText && (
                  <div className="mt-2 line-clamp-1 text-[12px] text-mute">
                    Resposta: {complaint.responseText}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-7">
          <PillButton
            variant="filled"
            fullWidth
            onClick={() => router.push(`/${slug}/complaints/new`)}
          >
            Nova reclamação
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
